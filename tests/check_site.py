"""Dependency-free static regression checks. Run: python3 tests/check_site.py"""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import json
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
class Page(HTMLParser):
    def __init__(self, text):
        super().__init__(); self.links=[]; self.ids=set(); self.feed(text)
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if 'id' in attrs: self.ids.add(attrs['id'])
        for attr in ('href','src'):
            if attr in attrs: self.links.append(attrs[attr])

pages={p:Page(p.read_text()) for p in ROOT.rglob('*.html')}
errors=[]
for path,page in pages.items():
    for link in page.links:
        parsed=urlsplit(link)
        if parsed.scheme or parsed.netloc: continue
        target=(ROOT/parsed.path.lstrip('/') if parsed.path.startswith('/') else path.parent/unquote(parsed.path)).resolve() if parsed.path else path
        if target.is_dir(): target=target/'index.html'
        if not target.exists(): errors.append(f'{path.relative_to(ROOT)}: missing {link}')
        elif parsed.fragment and target in pages and unquote(parsed.fragment) not in pages[target].ids:
            if target==ROOT/'index.html' and parsed.fragment in ('cover','plans','contact','festival'): continue
            errors.append(f'{path.relative_to(ROOT)}: missing anchor {link}')
catalog=json.loads((ROOT/'assets/catalog.js').read_text().split('window.NK_STORE = ',1)[1].rstrip(';\n'))
products=catalog['products']; ids=[p['id'] for p in products]
assert len(ids)==len(set(ids)), 'Duplicate product IDs'
assert catalog['sampleCatalog'] is True
assert catalog['salesWhatsApp']=='919431487230', 'WhatsApp orders must use the existing website number'
for p in products:
    assert isinstance(p['price'],int) and p['price']>0
    assert isinstance(p['stock'],int) and p['stock']>=0
    assert (ROOT/'assets/products'/p['image']).is_file()
    ET.parse(ROOT/'assets/products'/p['image'])
ET.parse(ROOT/'sitemap.xml')
insurance=(ROOT/'insurance/index.html').read_text()
assert all(f'id="{anchor}"' in insurance for anchor in ('plans','cover','calc','contact','festival'))
assert '10 + loans - have' in insurance
assert 'sheetDownload' in (ROOT/'durga-puja/index.html').read_text()
assert len(list((ROOT/'blog').glob('*.html')))==15
if errors: raise SystemExit('\n'.join(errors))
print(f'PASS: {len(pages)} HTML pages, all local links/anchors, {len(products)} product records and assets, sitemap, LIC calculator and festival routes.')
