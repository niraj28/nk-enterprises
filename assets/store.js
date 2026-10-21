/* GitHub Pages storefront: no credentials, order submission, or payment handling. */
(() => {
  'use strict';
  const config = window.NK_STORE;
  const products = config.products;
  const byId = new Map(products.map(p => [p.id, p]));
  const base = document.body.dataset.base || '';
  const isShop = document.body.dataset.page === 'shop';
  const $ = selector => document.querySelector(selector);
  const money = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const image = p => `${base}assets/products/${encodeURIComponent(p.image)}`;
  const heart = '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';
  const CART_KEY = 'nk-cart-v1', SAVED_KEY = 'nk-saved-v1';
  let storageWarning = false;
  function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
  function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { if (!storageWarning) { storageWarning = true; toast('Browser storage is unavailable. Your selections will last for this page only.'); } } }
  function normalizeCart(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([id, qty]) => byId.has(id) && Number.isInteger(qty) && qty > 0 && byId.get(id).stock > 0).map(([id, qty]) => [id, Math.min(qty, byId.get(id).stock, 99)]));
  }
  function normalizeSaved(value) { return new Set(Array.isArray(value) ? value.filter(id => typeof id === 'string' && byId.has(id)) : []); }
  let cart = normalizeCart(read(CART_KEY, {}));
  let saved = normalizeSaved(read(SAVED_KEY, []));
  let toastTimer, enquiry = '';
  function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4200); }
  const entries = () => Object.entries(cart).map(([id, qty]) => ({ p: byId.get(id), qty }));
  const subtotal = () => entries().reduce((total, { p, qty }) => total + p.price * qty, 0);
  function updateCount() { document.querySelectorAll('[data-cart-count]').forEach(el => { el.textContent = Object.values(cart).reduce((a, b) => a + b, 0); }); }
  function persistCart() { write(CART_KEY, cart); updateCount(); if ($('#cart-dialog').open) renderCart(); }
  function add(id) {
    const p = byId.get(id); if (!p || !p.stock) return;
    if ((cart[id] || 0) >= Math.min(p.stock, 99)) { toast('You have reached the available sample quantity.'); return; }
    cart[id] = (cart[id] || 0) + 1; persistCart(); toast(`${p.name} added to your bag.`);
  }
  const categories = [...new Set(products.map(p => p.category))];
  const params = new URLSearchParams(location.search);
  const initialCategory = categories.includes(params.get('category')) ? params.get('category') : 'All products';
  const state = { category: initialCategory, query: params.get('q') || '', sort: 'featured', max: 2000, available: false, saved: params.get('saved') === '1' };
  function filtered() {
    const query = state.query.trim().toLocaleLowerCase();
    let list = products.filter(p => (state.category === 'All products' || p.category === state.category) && p.price <= state.max && (!state.available || p.stock > 0) && (!state.saved || saved.has(p.id)) && `${p.name} ${p.category} ${p.color} ${p.summary} ${p.specs.join(' ')}`.toLocaleLowerCase().includes(query));
    if (state.sort === 'price-low') list.sort((a, b) => a.price - b.price);
    if (state.sort === 'price-high') list.sort((a, b) => b.price - a.price);
    if (state.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }
  function card(p) { return `<article class="product-card"><div class="product-image"><button class="product-open" data-product="${escape(p.id)}" aria-label="View ${escape(p.name)}"><img src="${image(p)}" width="400" height="360" alt="${escape(p.name)} sample illustration" loading="lazy"></button><span class="product-tag${p.festive && p.stock ? ' festive' : ''}">${p.stock ? (p.festive ? '🪔 DIWALI PICK' : 'SAMPLE PRODUCT') : 'UNAVAILABLE'}</span><button class="save-button" data-save="${escape(p.id)}" aria-label="Save ${escape(p.name)}" aria-pressed="${saved.has(p.id)}">${heart}</button></div><div class="product-meta"><span>${escape(p.category)}</span><span>${escape(p.color)}</span></div><h3><button class="product-name" data-product="${escape(p.id)}">${escape(p.name)}</button></h3><p>${escape(p.summary)}</p><div class="product-bottom"><span class="price">${money(p.price)}</span><button class="add-button" data-add="${escape(p.id)}" ${p.stock ? '' : 'disabled'}>${p.stock ? 'Add to bag +' : 'Unavailable'}</button></div></article>`; }
  function renderProducts() {
    const list = isShop ? filtered() : products.slice(0, 4);
    $('#product-grid').innerHTML = list.map(card).join('');
    $('#empty-results').hidden = list.length > 0;
    if (isShop) $('#results-count').textContent = `${list.length} ${list.length === 1 ? 'product' : 'products'}${state.saved ? ' saved' : ''}`;
  }
  function syncURL() {
    const query = new URLSearchParams();
    if (state.category !== 'All products') query.set('category', state.category);
    if (state.query) query.set('q', state.query);
    if (state.saved) query.set('saved', '1');
    history.replaceState(null, '', location.pathname + (query.size ? '?' + query.toString() : '') + location.hash);
  }
  function reset() {
    Object.assign(state, { category: 'All products', query: '', sort: 'featured', max: 2000, available: false, saved: false });
    $('#search').value = ''; $('#sort').value = 'featured'; $('#max-price').value = 2000; $('#price-label').textContent = money(2000); $('#in-stock').checked = false; $('#saved-only').checked = false;
    document.querySelector('input[name="category"][value="All products"]').checked = true;
    syncURL(); renderProducts();
  }
  if (isShop) {
    $('#category-filters').innerHTML = ['All products', ...categories].map(c => `<label class="check"><input type="radio" name="category" value="${escape(c)}" ${state.category === c ? 'checked' : ''}>${escape(c)}</label>`).join('');
    $('#search').value = state.query; $('#saved-only').checked = state.saved;
    $('#search').addEventListener('input', e => { state.query = e.target.value; syncURL(); renderProducts(); });
    $('#sort').addEventListener('change', e => { state.sort = e.target.value; renderProducts(); });
    $('#category-filters').addEventListener('change', e => { state.category = e.target.value; syncURL(); renderProducts(); });
    $('#max-price').addEventListener('input', e => { state.max = Number(e.target.value); $('#price-label').textContent = money(state.max); renderProducts(); });
    $('#in-stock').addEventListener('change', e => { state.available = e.target.checked; renderProducts(); });
    $('#saved-only').addEventListener('change', e => { state.saved = e.target.checked; syncURL(); renderProducts(); });
    $('#reset').addEventListener('click', reset); $('#empty-reset').addEventListener('click', reset);
  }
  function show(dialog) { if (!dialog.open) dialog.showModal(); }
  function productDetails(id) {
    const p = byId.get(id); if (!p) return;
    $('#product-detail').innerHTML = `<div class="detail-grid"><div class="detail-image"><img src="${image(p)}" width="400" height="360" alt="${escape(p.name)} sample illustration"></div><div><span class="eyebrow">${escape(p.category)} · SAMPLE PRODUCT</span><h2 id="product-title">${escape(p.name)}</h2><p>${escape(p.summary)}</p><span class="price">${money(p.price)}</span><p>Colour: ${escape(p.color)}</p><ul>${p.specs.map(s => `<li>${escape(s)}</li>`).join('')}</ul><button class="button primary" data-add="${escape(p.id)}" ${p.stock ? '' : 'disabled'}>${p.stock ? 'Add to bag +' : 'Currently unavailable'}</button><small>Illustrative specifications and price. Confirm actual stock, taxes, delivery and warranty with the store.</small></div></div>`;
    show($('#product-dialog'));
  }
  function renderCart() {
    const list = entries();
    $('#cart-content').innerHTML = list.length ? `${list.map(({ p, qty }) => `<article class="cart-row"><img src="${image(p)}" width="80" height="84" alt=""><div><h3>${escape(p.name)}</h3><p>${money(p.price)} each · ${escape(p.color)}</p><div class="cart-item-actions"><div class="quantity"><button data-quantity="${escape(p.id)}" data-delta="-1" aria-label="Decrease ${escape(p.name)} quantity" ${qty === 1 ? 'disabled' : ''}>−</button><span aria-label="Quantity">${qty}</span><button data-quantity="${escape(p.id)}" data-delta="1" aria-label="Increase ${escape(p.name)} quantity" ${qty >= Math.min(p.stock, 99) ? 'disabled' : ''}>+</button></div><button class="text-button" data-remove="${escape(p.id)}" aria-label="Remove ${escape(p.name)}">Remove</button></div></div></article>`).join('')}<div class="cart-total"><span>Sample subtotal</span><span>${money(subtotal())}</span></div><p class="fine">Delivery charges, taxes and final pricing to be confirmed with the store.</p><p class="cart-note">Preview collection. Preparing an enquiry does not place an order or reserve stock.</p><button class="button primary full" id="start-checkout">Order via WhatsApp →</button><button class="text-button full" data-close>Continue exploring</button>` : `<div class="empty-state"><h3>Your next favourite is out there.</h3><p>Add a few essentials to start your enquiry.</p><a class="button primary" href="${base}shop/">Explore electronics →</a></div>`;
  }
  function startCheckout() {
    if (!entries().length) return;
    $('#cart-dialog').close(); $('#product-dialog').close();
    $('#checkout-summary').innerHTML = entries().map(({ p, qty }) => `<div><span>${escape(p.name)} × ${qty}</span><span>${money(p.price * qty)}</span></div>`).join('') + `<div><span>Sample subtotal</span><span>${money(subtotal())}</span></div>`;
    $('#checkout-form').hidden = false; $('#enquiry-result').hidden = true; enquiry = ''; $('#enquiry-text').value = '';
    show($('#checkout-dialog'));
  }
  document.addEventListener('click', e => {
    const close = e.target.closest('[data-close]'); if (close) { close.closest('dialog').close(); return; }
    const addButton = e.target.closest('[data-add]'); if (addButton) { add(addButton.dataset.add); return; }
    const productButton = e.target.closest('[data-product]'); if (productButton) { productDetails(productButton.dataset.product); return; }
    const saveButton = e.target.closest('[data-save]');
    if (saveButton) {
      const id = saveButton.dataset.save; saved.has(id) ? saved.delete(id) : saved.add(id); write(SAVED_KEY, [...saved]);
      const stillVisible = !state.saved || saved.has(id);
      if (stillVisible) saveButton.setAttribute('aria-pressed', String(saved.has(id))); else renderProducts();
      toast(saved.has(id) ? 'Saved to your favourites.' : 'Removed from saved products.'); return;
    }
    const quantity = e.target.closest('[data-quantity]');
    if (quantity) {
      const id = quantity.dataset.quantity; if (!cart[id]) return;
      cart[id] = Math.max(1, Math.min(byId.get(id).stock, 99, cart[id] + Number(quantity.dataset.delta)));
      const delta = quantity.dataset.delta; persistCart();
      const replacement = document.querySelector(`[data-quantity="${id}"][data-delta="${delta}"]`);
      if (replacement && !replacement.disabled) replacement.focus(); else document.querySelector(`[data-remove="${id}"]`)?.focus();
      return;
    }
    const remove = e.target.closest('[data-remove]'); if (remove) { delete cart[remove.dataset.remove]; persistCart(); $('#cart-dialog .close-button').focus(); return; }
    if (e.target.closest('.cart-trigger')) { renderCart(); show($('#cart-dialog')); }
    if (e.target.closest('#start-checkout')) startCheckout();
  });
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', e => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  }));
  $('.mobile-toggle').addEventListener('click', e => { const button = e.currentTarget; const open = button.getAttribute('aria-expanded') !== 'true'; button.setAttribute('aria-expanded', String(open)); $('#mobile-menu').hidden = !open; });
  $('#checkout-form').addEventListener('submit', e => {
    e.preventDefault(); if (!entries().length) { $('#checkout-dialog').close(); toast('Your bag is empty. Add a product to prepare an enquiry.'); return; }
    const data = new FormData(e.currentTarget);
    const name = String(data.get('name')).trim(), phone = String(data.get('phone')).trim(), city = String(data.get('city')).trim();
    if (!name || !city || phone.replace(/\D/g, '').length < 7) { toast('Please enter your name, city, and a valid phone number.'); return; }
    enquiry = ['N.K.ENTERPRISES — WHATSAPP ORDER REQUEST', 'Please confirm availability and send me a final quote. Sample catalog — not a confirmed order.', '', `Name: ${name}`, `Phone: ${phone}`, `City: ${city}`, '', ...entries().map(({ p, qty }) => `${p.name} (${p.id}) — ${p.color}\n  Qty: ${qty} × ${money(p.price)} = ${money(p.price * qty)}`), '', `Sample subtotal: ${money(subtotal())}`, 'Final prices, taxes, stock, delivery, warranty and return terms require confirmation.', 'No payment has been made and no stock is reserved.', '', `Notes: ${String(data.get('notes')).trim() || 'None'}`].join('\n');
    $('#enquiry-text').value = enquiry; $('#checkout-form').hidden = true; $('#enquiry-result').hidden = false;
    const channel = String(config.salesWhatsApp || '');
    $('#whatsapp-enquiry').hidden = !/^\d{10,15}$/.test(channel);
    if (/^\d{10,15}$/.test(channel)) $('#whatsapp-enquiry').href = `https://wa.me/${channel}?text=${encodeURIComponent(enquiry)}`;
    ($('#whatsapp-enquiry').hidden ? $('#copy-enquiry') : $('#whatsapp-enquiry')).focus();
  });
  $('#copy-enquiry').addEventListener('click', async () => { try { await navigator.clipboard.writeText(enquiry); $('#copy-enquiry').textContent = 'Copied ✓'; setTimeout(() => { $('#copy-enquiry').textContent = 'Copy enquiry'; }, 3000); } catch { $('#enquiry-text').focus(); $('#enquiry-text').select(); toast('Select and copy the enquiry text using your device’s copy command.'); } });
  $('#download-enquiry').addEventListener('click', () => { if (!enquiry) return; const blob = new Blob([enquiry], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'nk-enterprises-enquiry.txt'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
  $('#edit-enquiry').addEventListener('click', () => { $('#checkout-form').hidden = false; $('#enquiry-result').hidden = true; $('#checkout-form input').focus(); });
  window.addEventListener('storage', e => {
    if (e.key === CART_KEY || e.key === null) { cart = normalizeCart(read(CART_KEY, {})); updateCount(); if ($('#cart-dialog').open) renderCart(); if ($('#checkout-dialog').open) { $('#checkout-dialog').close(); toast('Your bag changed in another tab. Review it before preparing an enquiry.'); } }
    if (e.key === SAVED_KEY || e.key === null) { saved = normalizeSaved(read(SAVED_KEY, [])); renderProducts(); }
  });
  // Preserve incoming links to the original LIC homepage sections.
  function legacyHash() { if (!isShop && ['#plans', '#cover', '#contact', '#festival'].includes(location.hash)) location.replace(`${base}insurance/${location.hash}`); }
  window.addEventListener('hashchange', legacyHash); legacyHash();
  updateCount(); renderProducts();
})();
