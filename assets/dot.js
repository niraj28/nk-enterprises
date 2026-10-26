/* Dot: the site's helper. Answers common questions from the site's own content
   and hands anything else to WhatsApp. Runs entirely in the browser: no AI service,
   no keys, nothing sent anywhere unless the visitor taps a WhatsApp link.

   To add an answer: add an entry to KB with words people might type (English,
   Hinglish or Hindi), a short reply, and optional buttons. */
(function () {
  'use strict';
  if (window.__dotLoaded) return; window.__dotLoaded = true;

  const WA = '919431487230';
  const wa = text => 'https://wa.me/' + WA + '?text=' + encodeURIComponent(text);
  const art = (file, label) => ({ label: label || 'Read the guide', href: '/blog/' + file });
  const CALL = { label: '📞 Call 9431487230', href: 'tel:+919431487230' };
  const WHATSAPP = (msg, label) => ({ label: label || '💬 WhatsApp Surendra ji', href: wa(msg || 'Namaste Surendra ji, I have a question about LIC.'), wa: true });

  const KB = [
    { id: 'greet', k: ['hi', 'hello', 'hey', 'hii', 'namaste', 'namaskar', 'pranam', 'good morning', 'good evening', 'नमस्ते'],
      a: 'Namaste! 🙏 I\'m Dot. I can help with LIC policies (premiums, claims, loans, nominee, tax) and with our Diwali lights. What would you like to know?' },
    { id: 'thanks', k: ['thank', 'thanks', 'thx', 'dhanyavad', 'dhanyawad', 'shukriya', 'धन्यवाद', 'ok thanks'],
      a: 'You\'re welcome! 😊 Anything else I can help with?' },
    { id: 'contact', k: ['call', 'phone', 'number', 'contact', 'baat', 'talk', 'surendra', 'agent', 'meet', 'office', 'mobile', 'whatsapp', 'human', 'person', 'बात'],
      a: 'You can reach Surendra Kumar, Authorised LIC Agent (agency code 1728/51D), directly:<br><b>9431487230</b> (phone &amp; WhatsApp)<br><b>8271254193</b> (phone)',
      b: [CALL, WHATSAPP()] },
    { id: 'cover', k: ['how much cover', 'kitna cover', 'cover', 'sum assured', 'calculator', 'calculate', 'estimate', 'how much insurance', 'kitna bima'],
      a: 'A common rule of thumb is life cover of about <b>10× your yearly income, plus your loans</b>. Try the free cover check with your own numbers. It takes 30 seconds.',
      b: [{ label: 'Open cover check', href: '/#cover' }] },
    { id: 'plans', k: ['plan', 'plans', 'policy lena', 'buy policy', 'new policy', 'best policy', 'best plan', 'which policy', 'pension', 'retirement', 'savings', 'investment', 'bima lena', 'बीमा'],
      a: 'Surendra ji helps with term insurance, child education &amp; marriage plans, retirement &amp; pension, savings &amp; endowment, and health cover. Which plan is right depends on your age, income and goals, so a quick chat with him is the best next step.',
      b: [{ label: 'See all plans', href: '/#plans' }, WHATSAPP('Namaste Surendra ji, I want to know which LIC plan suits me.', '💬 Ask which plan suits me')] },
    { id: 'term', k: ['term', 'endowment', 'difference', 'term vs', 'which is better', 'फर्क', 'टर्म'],
      a: '<b>Term insurance</b> gives high cover at a low premium but usually no money back. An <b>endowment plan</b> gives cover plus a lump sum at maturity, at a higher premium. Here\'s a simple comparison:',
      b: [art('term-vs-endowment.html', 'Read in English'), art('term-vs-endowment-hindi.html', 'हिंदी में पढ़ें')] },
    { id: 'missed', k: ['missed', 'miss', 'late', 'grace', 'lapse', 'lapsed', 'revive', 'revival', 'due date', 'overdue', 'kist', 'premium nahi', 'premium bhar', 'band ho gayi'],
      a: 'Don\'t worry. Most policies have a grace period of <b>15 days (monthly)</b> or <b>30 days (other modes)</b>. After that the policy lapses but can usually be revived. Details here, or send Surendra ji your policy number:',
      b: [art('missed-premium.html'), WHATSAPP('Namaste Surendra ji, my LIC premium is overdue. Please help. Policy number: ', '💬 Get help with my policy')] },
    { id: 'status', k: ['status', 'online', 'check policy', 'policy check', 'portal', 'app', 'customer portal', 'premium paid', 'receipt'],
      a: 'You can check your policy status online on LIC\'s customer portal or app. Here\'s a step-by-step guide:',
      b: [art('lic-policy-status-online.html')] },
    { id: 'death', k: ['death', 'died', 'passed away', 'expired', 'death claim', 'maut', 'nidhan', 'mrityu', 'मृत्यु', 'demise'],
      a: 'I\'m very sorry for your loss. 🙏 This checklist lists the documents usually needed for a death claim. Surendra ji will guide the family through every form and follow up until it\'s settled.',
      b: [art('lic-death-claim-documents.html', 'Open the checklist'), WHATSAPP('Namaste Surendra ji, we need help with an LIC death claim.', '💬 Ask for claim help')] },
    { id: 'maturity', k: ['maturity', 'matured', 'mature', 'maturity claim', 'paisa kab', 'money back', 'payout'],
      a: 'Here\'s how to get your maturity money on time: the intimation letter, documents, bank details and tax.',
      b: [art('lic-maturity-claim.html')] },
    { id: 'claim', k: ['claim', 'dawa', 'दावा'],
      a: 'Which kind of claim is it?',
      b: [art('lic-death-claim-documents.html', 'Death claim'), art('lic-maturity-claim.html', 'Maturity claim'), WHATSAPP('Namaste Surendra ji, I need help with an LIC claim.', '💬 Ask Surendra ji')] },
    { id: 'loan', k: ['loan', 'karz', 'karza', 'borrow', 'udhar', 'लोन'],
      a: 'Many LIC policies let you take a loan against them once they have a surrender value. Here\'s who can take one, how much, and how interest works:',
      b: [art('lic-policy-loan.html')] },
    { id: 'nominee', k: ['nominee', 'nomination', 'nominate', 'change name', 'naam badal', 'नॉमिनी'],
      a: 'You can update your nominee any time during the policy. This guide covers who can be a nominee and the mistakes that delay claims:',
      b: [art('change-nominee-lic-policy.html')] },
    { id: 'tax', k: ['tax', '80c', '10(10d)', '10 10d', '1010d', 'income tax', 'deduction', 'itr', 'tax free'],
      a: 'Premiums can qualify under <b>Section 80C</b> (old tax regime), and payouts can be tax-free under <b>10(10D)</b> if conditions are met. Simple explanation here:',
      b: [art('life-insurance-tax-benefits.html')] },
    { id: 'surrender', k: ['surrender', 'close policy', 'cancel', 'band karna', 'band kar', 'stop policy', 'exit'],
      a: 'Surrendering early often means getting back much less than you paid. Before deciding, read about the better options:',
      b: [art('surrender-or-continue-policy.html'), WHATSAPP('Namaste Surendra ji, I am thinking of surrendering my LIC policy. Can you advise?', '💬 Talk before surrendering')] },
    { id: 'paidup', k: ['paid up', 'paid-up', 'paidup', 'stopped paying', 'stop paying', 'reduced'],
      a: 'If you stop paying after the minimum years in your policy, it may continue with reduced cover. That\'s called paid-up value. Worked example here:',
      b: [art('paid-up-value-explained.html')] },
    { id: 'bond', k: ['bond', 'policy document', 'read policy', 'papers', 'schedule', 'free look', 'free-look'],
      a: 'Here\'s a section-by-section guide to your policy bond: the schedule, sum assured, nominee, riders and free-look period.',
      b: [art('how-to-read-policy-bond.html')] },
    { id: 'child', k: ['child', 'children', 'son', 'daughter', 'beta', 'beti', 'bachche', 'education', 'padhai', 'shaadi', 'marriage', 'बच्चे'],
      a: 'A child plan helps you save for studies or marriage. Look for a <b>premium waiver</b>, so the plan continues even if something happens to the parent. Guide:',
      b: [art('child-education-plan.html')] },
    { id: 'housewife', k: ['housewife', 'homemaker', 'wife', 'self employed', 'self-employed', 'business owner', 'shopkeeper', 'freelancer'],
      a: 'Homemakers and self-employed people need cover too. Here\'s how much makes sense and what papers to keep ready:',
      b: [art('term-insurance-housewives-self-employed.html')] },
    { id: 'lights', k: ['diwali', 'light', 'lights', 'jhalar', 'rice light', 'decoration', 'sajavat', 'sajawat', 'curtain', 'icicle', 'jhumar', 'diya', 'diye', 'candle', 'kandil', 'lantern', 'solar', 'strip', 'fairy', 'led', 'electronics', 'shop', 'दीवाली', 'दिवाली', 'लाइट'],
      a: '🪔 Our Diwali lights collection has 20 kinds, from rice lights (jhalar) to curtain lights, LED diyas, solar and smart strip lights. Pick a type:',
      b: [{ label: '✨ Rice & string', href: '/shop/?category=String%20%26%20rice%20lights#collection' }, { label: '🌟 Curtain & icicle', href: '/shop/?category=Curtain%20%26%20icicle%20lights#collection' }, { label: '🪔 Diyas & candles', href: '/shop/?category=Diyas%20%26%20candles#collection' }, { label: '🏡 Outdoor & solar', href: '/shop/?category=Outdoor%20%26%20solar#collection' }, { label: 'See all lights', href: '/shop/#collection' }] },
    { id: 'price', k: ['price', 'prices', 'rate', 'cost', 'kitne', 'kitna', 'kya daam', 'daam', 'sasta', 'cheap', 'discount', 'offer'],
      a: 'Diwali lights on the shop page start from about <b>₹149</b>. Shown prices are a guide, and the final price is confirmed on WhatsApp before you pay.',
      b: [{ label: 'Browse lights', href: '/shop/#collection' }, WHATSAPP('Namaste, please share prices for Diwali lights.', '💬 Ask for prices')] },
    { id: 'bulk', k: ['bulk', 'wholesale', 'society', 'office', 'temple', 'mandir', 'pandal', 'quantity', 'large order', 'thok'],
      a: 'Yes, bulk orders for societies, offices, shops and temples are welcome. Send the approximate quantity and Surendra ji\'s shop will share a quote.',
      b: [WHATSAPP('Namaste, I need a bulk Diwali lighting order for a (society / office / shop / temple). Approximate quantity: ', '💬 Bulk order on WhatsApp')] },
    { id: 'order', k: ['order', 'book', 'prebook', 'pre-book', 'buy lights', 'kharid', 'lena hai', 'reserve'],
      a: 'Add lights to your bag on the shop page and tap <b>Order via WhatsApp</b>, or simply message the shop. Stock is limited before Diwali.',
      b: [{ label: 'Go to shop', href: '/shop/#collection' }, WHATSAPP('Namaste, I want to pre-book Diwali lights. Please share what is available.', '💬 Pre-book on WhatsApp')] },
    { id: 'delivery', k: ['delivery', 'deliver', 'home delivery', 'pickup', 'pick up', 'address', 'location', 'where is', 'kahan', 'shop kahan', 'open', 'timing', 'time', 'closed', 'sunday'],
      a: 'For the shop address, opening hours and home delivery, please ask on WhatsApp and you\'ll get an exact answer.',
      b: [WHATSAPP('Namaste, please share the shop address, timings and whether home delivery is available.', '💬 Ask on WhatsApp')] },
    { id: 'payment', k: ['payment', 'pay', 'upi', 'gpay', 'phonepe', 'paytm', 'card payment', 'cash', 'emi'],
      a: 'There\'s no online payment on this website. Your order is confirmed on WhatsApp first, and payment options are shared there.',
      b: [WHATSAPP('Namaste, what payment options do you accept?', '💬 Ask about payment')] },
    { id: 'card', k: ['card', 'wish', 'wishes', 'greeting', 'festival card', 'diwali card', 'diwali wish', 'make card', 'photo card', 'durga', 'puja', 'chhath', 'bhai dooj', 'shubh'],
      a: 'Make a free festival wish card with your photo (Durga Puja, Diwali or Chhath) and share it on WhatsApp. Your photo stays on your phone.',
      b: [{ label: '🎉 Make my card', href: '/durga-puja/' }] },
    { id: 'privacy', k: ['privacy', 'data', 'safe', 'secure', 'cookies'],
      a: 'This chat runs only in your browser and nothing you type is stored or sent anywhere, unless you tap a WhatsApp button. Full details:',
      b: [{ label: 'Privacy policy', href: '/privacy.html' }] },
    { id: 'who', k: ['who are you', 'what are you', 'your name', 'dot', 'bot', 'ai', 'robot'],
      a: 'I\'m Dot, a small helper for this website. I know the site\'s guides and the Diwali shop. For anything personal about your policy, Surendra ji answers on WhatsApp.' }
  ];

  const STARTERS = [
    { label: '🪔 Diwali lights', q: 'diwali lights' },
    { label: '⏰ Missed premium', q: 'missed premium' },
    { label: '📄 Claim help', q: 'claim' },
    { label: '🧮 How much cover?', q: 'how much cover' },
    { label: '📞 Talk to Surendra ji', q: 'contact' }
  ];

  const norm = s => ' ' + String(s).toLowerCase().replace(/[^\p{L}\p{N}()]+/gu, ' ').replace(/\s+/g, ' ').trim() + ' ';
  function match(q) {
    const t = norm(q); let best = null, bestScore = 0;
    for (const e of KB) {
      let score = 0;
      for (const kw of e.k) {
        const k = norm(kw).trim();
        if (!k) continue;
        // Hindi: anywhere; short words: whole word only; longer words: word start (so "lights" matches "light")
        const hit = /[ऀ-ॿ]/.test(k) ? t.includes(k) : k.length <= 3 ? t.includes(' ' + k + ' ') : t.includes(' ' + k);
        if (hit) score += k.length > 4 ? 2 + k.split(' ').length : 1;
      }
      if (score > bestScore) { best = e; bestScore = score; }
    }
    return best;
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- styles ---------- */
  const css = `
  .dot-root{--dot-navy:#06275f;--dot-yellow:#ffc72c;--dot-ink:#18223a;--dot-soft:#eef3fb;--dot-line:#d6e0f0;font-family:"Hind","Segoe UI",system-ui,sans-serif;font-size:16px;line-height:1.5;color:var(--dot-ink)}
  .dot-root [hidden]{display:none!important}
  .dot-launch{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:calc(var(--dot-offset,20px) + env(safe-area-inset-bottom));z-index:60;width:62px;height:62px;border-radius:50%;border:0;cursor:pointer;background:radial-gradient(circle at 35% 30%,#ffe27a,var(--dot-yellow) 55%,#e9a800);box-shadow:0 10px 26px -8px rgba(6,39,95,.55),0 0 0 4px rgba(255,255,255,.9);display:grid;place-items:center;transition:transform .15s}
  .dot-launch:hover{transform:scale(1.06)}
  .dot-launch:focus-visible,.dot-panel button:focus-visible,.dot-panel a:focus-visible,.dot-panel input:focus-visible{outline:3px solid var(--dot-navy);outline-offset:2px}
  .dot-face{position:relative;width:30px;height:16px}
  .dot-face i{position:absolute;top:0;width:8px;height:10px;border-radius:50%;background:var(--dot-navy)}
  .dot-face i:first-child{left:4px}.dot-face i:last-child{right:4px}
  .dot-face b{position:absolute;left:9px;bottom:0;width:12px;height:5px;border:2.5px solid var(--dot-navy);border-top:0;border-radius:0 0 10px 10px}
  .dot-nudge{position:fixed;right:calc(max(16px,env(safe-area-inset-right)) + 72px);bottom:calc(var(--dot-offset,20px) + 12px + env(safe-area-inset-bottom));z-index:60;background:#fff;color:var(--dot-ink);border:1px solid var(--dot-line);border-radius:14px 14px 4px 14px;padding:8px 12px;font-size:14px;font-weight:600;box-shadow:0 10px 24px -12px rgba(0,0,0,.35);cursor:pointer;max-width:200px}
  .dot-panel{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:calc(var(--dot-offset,20px) + 74px + env(safe-area-inset-bottom));z-index:61;width:min(380px,calc(100vw - 32px));height:min(560px,calc(100vh - 140px));background:#fff;border-radius:20px;box-shadow:0 30px 60px -20px rgba(6,39,95,.55);display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--dot-line)}
  .dot-head{background:var(--dot-navy);color:#fff;padding:14px 16px;display:flex;align-items:center;gap:12px}
  .dot-head .dot-mini{width:36px;height:36px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#ffe27a,var(--dot-yellow) 60%);display:grid;place-items:center;flex:none}
  .dot-head .dot-mini .dot-face{transform:scale(.62)}
  .dot-head b{display:block;font-size:17px;line-height:1.2}.dot-head small{color:#c9d6f2;font-size:13px}
  .dot-close{margin-left:auto;background:rgba(255,255,255,.12);color:#fff;border:0;width:34px;height:34px;border-radius:50%;font-size:22px;line-height:1;cursor:pointer}
  .dot-log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:var(--dot-soft)}
  .dot-msg{max-width:88%;padding:10px 13px;border-radius:16px;font-size:15px;overflow-wrap:anywhere}
  .dot-msg.bot{background:#fff;border:1px solid var(--dot-line);border-bottom-left-radius:4px;align-self:flex-start}
  .dot-msg.me{background:var(--dot-navy);color:#fff;border-bottom-right-radius:4px;align-self:flex-end}
  .dot-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
  .dot-acts a,.dot-chip{display:inline-block;padding:6px 12px;border-radius:999px;font-size:14px;font-weight:600;text-decoration:none;border:1.5px solid var(--dot-navy);color:var(--dot-navy);background:#fff;cursor:pointer;line-height:1.3}
  .dot-acts a.wa{background:#18a34a;border-color:#18a34a;color:#fff}
  .dot-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 2px}
  .dot-typing{align-self:flex-start;background:#fff;border:1px solid var(--dot-line);border-radius:16px;padding:10px 14px;display:flex;gap:4px}
  .dot-typing span{width:6px;height:6px;border-radius:50%;background:#8a96b0;animation:dotb 1s infinite}
  .dot-typing span:nth-child(2){animation-delay:.15s}.dot-typing span:nth-child(3){animation-delay:.3s}
  @keyframes dotb{50%{transform:translateY(-4px);opacity:.5}}
  .dot-form{display:flex;gap:8px;padding:10px;border-top:1px solid var(--dot-line);background:#fff}
  .dot-form input{flex:1;min-width:0;border:1.5px solid var(--dot-line);border-radius:999px;padding:10px 14px;font:inherit;font-size:16px;color:var(--dot-ink)}
  .dot-form button{border:0;border-radius:999px;background:var(--dot-navy);color:#fff;font-weight:700;padding:0 16px;cursor:pointer;font-size:15px}
  .dot-foot{font-size:11px;color:#6b7690;text-align:center;padding:0 10px 8px;background:#fff}
  @media (max-width:600px){.dot-panel{right:8px;left:8px;width:auto;height:min(72vh,560px)}}
  @media (prefers-reduced-motion:reduce){.dot-launch{transition:none}.dot-typing span{animation:none}}
  `;

  /* ---------- build ---------- */
  function init() {
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
    const root = document.createElement('div'); root.className = 'dot-root';
    const face = '<span class="dot-face" aria-hidden="true"><i></i><i></i><b></b></span>';
    root.innerHTML = `
      <button class="dot-launch" type="button" aria-label="Chat with Dot, the site helper" aria-expanded="false" aria-controls="dot-panel">${face}</button>
      <div class="dot-nudge" hidden>Need help? Ask Dot 👋</div>
      <section class="dot-panel" id="dot-panel" role="dialog" aria-label="Dot helper" hidden>
        <div class="dot-head"><span class="dot-mini">${face}</span><span><b>Dot</b><small>Helper for LIC &amp; Diwali lights</small></span><button class="dot-close" type="button" aria-label="Close chat">×</button></div>
        <div class="dot-log" aria-live="polite"></div>
        <form class="dot-form"><input type="text" id="dot-input" placeholder="Type your question…" autocomplete="off" aria-label="Your question"><button type="submit">Send</button></form>
        <div class="dot-foot">Dot shares general information, not financial advice. Nothing you type is stored.</div>
      </section>`;
    document.body.appendChild(root);

    const $ = s => root.querySelector(s);
    const launch = $('.dot-launch'), panel = $('.dot-panel'), log = $('.dot-log'), input = $('#dot-input'), nudge = $('.dot-nudge');

    // Sit above the mobile Call/WhatsApp bar where a page has one
    function placeAboveBars() {
      const bar = document.querySelector('.callbar');
      const h = bar && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect().height : 0;
      root.style.setProperty('--dot-offset', (h ? h + 14 : 20) + 'px');
    }
    placeAboveBars(); addEventListener('resize', placeAboveBars);

    const store = { get() { try { return JSON.parse(sessionStorage.getItem('dot-log')) || []; } catch (e) { return []; } },
                    set(v) { try { sessionStorage.setItem('dot-log', JSON.stringify(v.slice(-30))); } catch (e) {} } };
    let history = store.get();

    function render(item) {
      const div = document.createElement('div');
      div.className = 'dot-msg ' + item.who;
      div.innerHTML = item.who === 'me' ? esc(item.text) : item.html + (item.b && item.b.length ? '<div class="dot-acts">' + item.b.map(x =>
        `<a href="${esc(x.href)}"${x.wa ? ' class="wa" target="_blank" rel="noopener"' : ''}>${esc(x.label)}</a>`).join('') + '</div>' : '');
      log.appendChild(div); log.scrollTop = log.scrollHeight;
    }
    function chips() {
      const old = log.querySelector('.dot-chips'); if (old) old.remove();
      const wrap = document.createElement('div'); wrap.className = 'dot-chips';
      wrap.innerHTML = STARTERS.map(s => `<button class="dot-chip" type="button" data-q="${esc(s.q)}">${esc(s.label)}</button>`).join('');
      log.appendChild(wrap); log.scrollTop = log.scrollHeight;
    }
    function botSay(html, b) { const item = { who: 'bot', html, b }; history.push(item); store.set(history); render(item); }

    function answer(q) {
      const e = match(q);
      if (e) return botSay(e.a, e.b);
      botSay('I don\'t know that one yet. 🙈 Surendra ji can answer it on WhatsApp. I\'ll send your question along:',
        [WHATSAPP('Namaste Surendra ji, I have a question: ' + q, '💬 Ask on WhatsApp'), { label: 'Browse insurance tips', href: '/blog/' }]);
    }
    function ask(q) {
      q = String(q).trim().slice(0, 300); if (!q) return;
      const item = { who: 'me', text: q }; history.push(item); store.set(history); render(item);
      const old = log.querySelector('.dot-chips'); if (old) old.remove();
      const typing = document.createElement('div'); typing.className = 'dot-typing'; typing.innerHTML = '<span></span><span></span><span></span>';
      log.appendChild(typing); log.scrollTop = log.scrollHeight;
      setTimeout(() => { typing.remove(); answer(q); chips(); }, 450);
    }

    function open() {
      panel.hidden = false; nudge.hidden = true; launch.setAttribute('aria-expanded', 'true');
      if (!log.children.length) {
        if (history.length) history.forEach(render);
        else botSay('Namaste! 🙏 I\'m <b>Dot</b>. Ask me about LIC premiums, claims, loans and tax, or about our Diwali lights. Tap a topic or type your question.');
        chips();
      }
      try { sessionStorage.setItem('dot-seen', '1'); } catch (e) {}
      setTimeout(() => input.focus(), 50);
    }
    function close() { panel.hidden = true; launch.setAttribute('aria-expanded', 'false'); launch.focus(); }

    launch.addEventListener('click', () => panel.hidden ? open() : close());
    nudge.addEventListener('click', open);
    $('.dot-close').addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) close(); });
    log.addEventListener('click', e => { const c = e.target.closest('.dot-chip'); if (c) ask(c.dataset.q); });
    $('.dot-form').addEventListener('submit', e => { e.preventDefault(); ask(input.value); input.value = ''; });

    // One gentle hint per visit, after a short while
    let seen = false; try { seen = sessionStorage.getItem('dot-seen') === '1'; } catch (e) {}
    if (!seen) setTimeout(() => { if (panel.hidden) { nudge.hidden = false; setTimeout(() => { nudge.hidden = true; }, 9000); } try { sessionStorage.setItem('dot-seen', '1'); } catch (e) {} }, 7000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
