# N.K.Enterprises website

Electronics storefront and website for **Surendra Kumar, Authorised LIC Agent**. It's plain HTML and CSS, with no build step and nothing to install.

## What's where

| File | Page |
|---|---|
| `index.html` | Combined electronics and LIC homepage |
| `insurance/index.html` | Original LIC homepage: plans, calculator and contact |
| `durga-puja/index.html` | Festival wish card maker (photo + name → share on WhatsApp) |
| `blog/index.html` | List of insurance tips |
| `blog/*.html` | One file per article |
| `privacy.html` | Privacy policy (required by Google AdSense) |
| `404.html` | "Page not found" page |
| `assets/style.css` | Colours, fonts and layout for every page |
| `assets/` | LIC logo and Surendra Kumar's photo |
| `ads.txt` | Tells advertisers this site's AdSense account (pub-6116067692659093) |

## Editing

- **Change text:** open the `.html` file, edit the words between the tags, and save.
- **Change the phone number:** search all files for `9431487230` and replace it.
- **Add a blog post:** copy `blog/term-vs-endowment.html` to a new file name and change the title, description and article text. Then add a card for it at the top of the list in `blog/index.html`, and a `<url>` line for it in `sitemap.xml`.

Live site: **https://digitallifenotes.blog/** (DNS is managed in WordPress.com → Domains → digitallifenotes.blog → DNS records).
- The header and footer are repeated in every page. If you change them, change them everywhere.
- After editing `assets/style.css`, bump the version in every page (`style.css?v=3` → `?v=4`) so visitors get the new styles straight away.

## Deploying

Every push to the `main` branch publishes the site automatically with GitHub Pages:

```bash
git add -A
git commit -m "Describe your change"
git push
```

The live site updates in about a minute.

### Connecting your own domain

1. Buy a domain (for example `nkenterprises.in`).
2. In the repo on GitHub, go to **Settings → Pages → Custom domain** and enter it. GitHub creates a `CNAME` file.
3. At your domain registrar, add these DNS records:
   - Four `A` records for `@`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - One `CNAME` record for `www` pointing to `niraj28.github.io`
4. Back in **Settings → Pages**, tick **Enforce HTTPS** once it's available.

## Google AdSense

The AdSense script is already in the `<head>` of every page, and `ads.txt` is in place.

1. Connect your own domain first. AdSense doesn't approve `github.io` addresses.
2. In AdSense, add the site with your domain and request a review.
3. Keep adding helpful articles. A site with 15–20 good posts is much more likely to be approved.
4. After approval, use **Auto ads** in AdSense. To keep ads off the homepage, add it as an excluded page under **Ads → By site → Edit → Page exclusions**.

## Electronics storefront (October 2026)

The homepage now connects the electronics store and existing LIC services. The original homepage is preserved at `insurance/index.html`, including its calculator and contact options. Existing homepage links to `#plans`, `#cover`, `#festival` and `#contact` redirect there. Blog pages and the festival card maker remain available and link to the store.

| File | Purpose |
|---|---|
| `index.html` | Combined homepage and featured products |
| `shop/index.html` | Full catalog, filters, search, sorting and saved items |
| `insurance/index.html` | Original LIC homepage and calculator |
| `assets/catalog.js` | Editable sample product data and optional enquiry channel |
| `assets/store.js` | Product dialogs, cart, saved items and enquiry checkout |
| `assets/store.css` | Responsive store theme, independent of existing LIC styles |
| `assets/products/*.svg` | Original lightweight product illustrations |
| `tests/check_site.py` | Local link, asset, catalog and legacy-route checks |

### Preview and validate

No installation or build is needed. From the repository directory:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173/`. Run static checks with `python3 tests/check_site.py`.

### Catalog and enquiries

The twelve products are fictional samples. Prices, specifications, availability and illustrations are explicitly marked as examples. Edit `assets/catalog.js` to replace them with verified products. Keep IDs stable, use integer rupee prices and nonnegative integer stock quantities, and put product illustrations/photos in `assets/products/`. The price filter currently spans ₹0–₹60,000; update its range in `shop/index.html` and the corresponding defaults in `store.js` when adding higher-priced products. Bump the asset query versions in both storefront pages after changes.

Customers can browse, filter by category/price/availability, search features, sort, save favourites, adjust bag quantities, and prepare an enquiry. Cart and saved product IDs persist in local storage. Customer details stay in page memory and are never saved to local storage or submitted to a server. Downloads and clipboard copies contain the details the customer enters. Cart quantities are checked against sample stock on load, and changes synchronize between tabs.

WhatsApp order requests are enabled using the existing website number, **+91 9431487230** (`salesWhatsApp: "919431487230"`). Customers choose “Order via WhatsApp”, enter their details, review the request, and use “Continue to WhatsApp” to open a prefilled message. It includes product IDs/names, colours, quantities, unit prices, sample subtotal, customer contact details, city and notes. The customer taps Send in WhatsApp; the website never sends automatically or claims the store has confirmed an order. Copy/download remain available as fallbacks. The bag remains intact so a failed or cancelled WhatsApp handoff does not lose the selection. The store confirms actual stock, final pricing, payment and delivery in the conversation. To change the recipient, update `salesWhatsApp` (country code and digits only) plus the displayed contact/privacy copy.

Before real sales, replace sample data and copy, verify the sales channel, and publish actual shipping, tax, warranty and return terms. Real payment processing, authenticated order history, admin inventory and confirmed orders require a secure backend or commerce provider; never put secret keys or payment credentials in these static files. The sample flag records catalog status but does not automatically remove preview copy: review both storefront HTML files and enquiry wording before launch.

### Browser verification

Check desktop and mobile layouts, filter empty states, unavailable products, saved-item persistence, cart quantity limits/removal, empty cart, checkout validation, copy/download, and legacy LIC/festival navigation. The storefront uses native dialog focus trapping, keyboard controls, reduced-motion support, system fonts and local SVG assets. It introduces no third-party requests. Existing insurance/blog pages retain their original fonts and advertising configuration.

### Moving between store and insurance

A shared sticky switch appears above the header on the homepage, shop, LIC page, insurance articles, privacy page and festival card maker. “Main homepage” always returns to the root. “Electronics” opens the catalog and “LIC services” opens the insurance homepage in the same tab. The active section is highlighted (lime for electronics, yellow for LIC) and exposed through `aria-current="location"`; shared privacy/festival pages leave both unselected. The switch is visible on mobile without opening a menu. Styles live in `assets/navigation.css`. Keep the switch markup consistent when adding a page.
