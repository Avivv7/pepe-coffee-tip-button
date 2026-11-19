// Panel der pepe.coffee-Erweiterung: eigene Seite der Erweiterung, im iframe über Reddit.
// Nicht verwahrend wie auf pepe.coffee: Der Wallet-Schlüssel wird hier im Browser aus deinem Passwort abgeleitet und
// öffnet den verschlüsselten Tresor vom Server. Signiert wird hier, der Server bekommt nur die fertige Transaktion.
// Signieren und QR-Code kommen aus denselben Bibliotheken wie auf pepe.coffee (lib/wallet-core.js, lib/qr-core.js).
import { loginToken, walletKey, openVault2 } from './lib/pwcrypto.js';

const W = globalThis.__pepeWalletCore;
const QR = globalThis.__pepeQR;
const SITE = 'https://pepe.coffee';
const params = new URLSearchParams(location.search);
const PLATFORMS = { reddit: 'Reddit', twitter: 'X', twitch: 'Twitch', kick: 'Kick', lichess: 'Lichess', github: 'GitHub', bitcointalk: 'Bitcointalk', medium: 'Medium', youtube: 'YouTube', rumble: 'Rumble', anilist: 'AniList', myanimelist: 'MyAnimeList', smogon: 'Smogon' };
const PLATFORM = params.get('p') in PLATFORMS ? params.get('p') : 'reddit';
const PLABEL = PLATFORMS[PLATFORM];
const NAME = (params.get('u') || '').slice(0, 40);
const SHOWN = PLATFORM === 'reddit' ? 'u/' + NAME : PLATFORM === 'twitter' ? '@' + NAME : NAME;
// Airdrop-Modus: die Namen der Kommentierenden kommen im #-Teil der Adresse (geht nie an einen Server)
const MODE = params.get('mode') === 'airdrop' ? 'airdrop' : 'tip';
let NAMES = [];
try { NAMES = (JSON.parse(decodeURIComponent(location.hash.slice(1)) || '[]') || []).filter((n) => typeof n === 'string').slice(0, 3000); } catch { NAMES = []; }
const KEY_TTL = 30 * 60 * 1000;     // wie auf pepe.coffee: 30 Minuten ohne Benutzung, dann wieder Passwort
const MSG_MAX = 140;
const app = document.getElementById('app');

// ---------------------------------------------------------------- Texte (Übersetzungen in _locales/<Sprache>/messages.json, Chrome wählt nach Browsersprache)
// t('schluessel', { name: wert }): {name} wird ersetzt. tl(...): wie t, aber <a1>Text</a1> wird zu einem Link; die Link-Bauer folgen als weitere Argumente.
function t(key, vars) {
  let m = ''; try { m = chrome.i18n.getMessage(key); } catch {}
  if (!m) m = key;
  return vars ? m.replace(/\{(\w+)\}/g, (x, n) => (n in vars ? String(vars[n]) : x)) : m;
}
function tl(key, vars, ...links) {
  const m = t(key, vars), out = []; let last = 0;
  m.replace(/<a(\d)>(.*?)<\/a\1>/g, (all, i, txt, off) => { if (off > last) out.push(m.slice(last, off)); out.push(links[i - 1](txt)); last = off + all.length; return all; });
  if (last < m.length) out.push(m.slice(last));
  return out;
}
try { document.title = t('panel_title'); document.documentElement.lang = chrome.i18n.getUILanguage(); } catch {}

const S = { profile: null, session: null, amount: '', wallet: null, view: 0, anon: false };

// ---------------------------------------------------------------- kleine Helfer
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'svg') el.innerHTML = v;            // nur feste, eigene Symbole
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c);
  return el;
}
const I = {
  close: '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  back: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  verified: `<svg class="check" viewBox="0 0 20 20" aria-label="${t('verified')}"><circle cx="10" cy="10" r="10" fill="#4d9855"/><path d="M6 10.3l2.6 2.6L14.2 7.3" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  lock: '<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="8" rx="2" fill="currentColor"/><path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  done: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M11 21l6 6 13-14" fill="none" stroke="#4d9855" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  coin: '<svg viewBox="147.96 230.57 130.59 130.58" aria-hidden="true"><path fill="#269b4d" d="M213.249,231.069c35.787,0,64.795,29.006,64.795,64.792s-29.008,64.791-64.795,64.791c-35.784,0-64.792-29.005-64.792-64.791S177.465,231.069,213.249,231.069z"/><path fill="#fff" d="M250.672,288.474c-1.369,8.362-5.259,14.067-11.672,17.127c-2.892,1.37-5.649,2.118-8.265,2.237c-3.513,0.141-8.683-0.346-15.509-1.459l-9.641-1.576l-4.516,27.632l-14.787-2.421l7.444-45.556l-7.593-1.243l1.519-9.293l7.594,1.243l3.001-18.389l23.728,3.875c8.959,1.469,14.762,2.794,17.406,3.971c4.589,2.056,7.871,5.325,9.835,9.816C251.038,278.602,251.518,283.279,250.672,288.474z M235.402,286.188c0.418-2.566,0.021-4.856-1.189-6.864c-1.21-2.009-3.042-3.455-5.5-4.336c-1.742-0.626-5.262-1.373-10.558-2.237l-7.143-1.167l-0.98,5.994l13.138,2.144l-1.519,9.298l-13.138-2.149l-0.898,5.499l8.093,1.32c4.33,0.707,7.319,1.038,8.967,1.002c3.534-0.073,6.247-1.101,8.142-3.078C234.179,290.191,235.044,288.38,235.402,286.188z"/></svg>',
};
const spinner = () => h('span', { class: 'spinner', 'aria-hidden': 'true' });
const note = (kind, ...kids) => h('p', { class: 'note note-' + kind, role: kind === 'err' ? 'alert' : null }, ...kids);
const ext = (href, text) => h('a', { href, target: '_blank', rel: 'noopener', text });
const fill = (el, ...kids) => el.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));
function busy(btn, text) { btn.disabled = true; btn.replaceChildren(spinner(), h('span', { text })); }
function show(...kids) {
  S.view++;
  app.replaceChildren(h('div', { class: 'view' }, h('button', { class: 'close', type: 'button', 'aria-label': t('close'), svg: I.close, onclick: close }), ...kids));
  const f = app.querySelector('[data-focus]'); if (f) f.focus({ preventScroll: true });
  return S.view;
}
const backBtn = (fn) => h('button', { class: 'back', type: 'button', svg: I.back, onclick: fn }, t('back'));
function close() { parent.postMessage({ pepecoffee: 'close' }, '*'); }
addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
new ResizeObserver(() => parent.postMessage({ pepecoffee: 'size', h: app.offsetHeight }, '*')).observe(app);

const parseAmount = (s) => { try { const v = W.parsePep(String(s).trim().replace(',', '.')); return v >= W.PEP.DUST ? v : null; } catch { return null; } };
const pep = (sats) => W.fmtPep(sats);
const plain = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 8 });

async function copyText(text, btn) {
  try { await navigator.clipboard.writeText(text); }
  catch { const t = h('textarea', {}); t.value = text; document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); }
  if (btn) { const old = btn.textContent; btn.textContent = t('copied'); btn.classList.add('is-done'); setTimeout(() => { btn.textContent = old; btn.classList.remove('is-done'); }, 1400); }
}

// ---------------------------------------------------------------- Speicher (nur in der Erweiterung, für Reddit unsichtbar)
const store = {
  async get() { try { return (await chrome.storage.local.get('session')).session || null; } catch { return null; } },
  async set(s) { try { await chrome.storage.local.set({ session: s }); } catch {} },
  async clear() { try { await chrome.storage.local.remove('session'); } catch {} },
};
// Der Wallet-Schlüssel liegt als NICHT auslesbarer CryptoKey in IndexedDB der Erweiterung (wie unlock.js auf pepe.coffee)
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('pepe-ext', 1); r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function kv(mode, fn) { const db = await idb(); try { return await new Promise((res, rej) => { const t = db.transaction('k', mode), q = fn(t.objectStore('k')); t.oncomplete = () => res(q && q.result); t.onerror = t.onabort = () => rej(t.error); }); } finally { db.close(); } }
const keys = {
  async put(key, handle) { try { await kv('readwrite', (s) => s.put({ key, handle, at: Date.now() }, 'wallet')); } catch {} },
  async get(handle) {
    try {
      const r = await kv('readonly', (s) => s.get('wallet'));
      if (!r || r.handle !== handle || Date.now() - r.at > KEY_TTL) { await keys.clear(); return null; }
      await kv('readwrite', (s) => s.put({ ...r, at: Date.now() }, 'wallet'));
      return r.key;
    } catch { return null; }
  },
  async clear() { try { await kv('readwrite', (s) => s.delete('wallet')); } catch {} },
};

// ---------------------------------------------------------------- pepe.coffee
async function api(path, { method = 'GET', body, auth = false, widget } = {}) {
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (auth && S.session) headers['X-Ext-Token'] = S.session.token;
  if (widget) headers['X-Widget-Token'] = widget;
  let r;
  try { r = await fetch(SITE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, credentials: 'omit', cache: 'no-store' }); }
  catch { return { error: t('err_unreachable'), http: 0 }; }
  const j = await r.json().catch(() => ({}));
  if (!r.ok && !j.error) j.error = t('err_status', { status: r.status });
  j.http = r.status;   // eigenes Feld: "status" ist bei Zahlungsanfragen schon belegt (pending, seen …)
  return j;
}

// ---------------------------------------------------------------- Kopf
function who() {
  const p = S.profile;
  const av = h('div', { class: 'av' });
  if (p.avatar) av.append(h('img', { src: p.avatar, alt: '', referrerpolicy: 'no-referrer' })); else av.textContent = p.initial || '?';
  return h('div', { class: 'who' }, av, h('div', { class: 'who-t' },
    h('h1', {}, h('span', { text: p.name }), p.verified ? h('span', { svg: I.verified }) : null),
    h('p', { class: 'sub' }, SHOWN + ' · ', ext(p.url, 'pepe.coffee/' + p.handle))));
}
function foot() {
  if (S.session) return h('div', { class: 'foot' }, h('span', { class: 'brand', svg: I.coin }, h('span', { text: '@' + S.session.handle })), h('button', { type: 'button', onclick: logout, text: t('logout') }));
  return h('div', { class: 'foot' }, h('span', { class: 'brand', svg: I.coin }, h('span', { text: 'pepe.coffee' })), h('span', { text: t('foot_tagline') }));
}

// ---------------------------------------------------------------- Hauptansicht
let actions = null, chipsBox = null, msgBox = null, otherWrap = null, otherInput = null;

function renderMain() {
  const amounts = S.profile.amounts.slice(0, 3);
  if (!S.amount) S.amount = String(amounts[Math.min(1, amounts.length - 1)]);
  const isPreset = amounts.map(String).includes(S.amount);
  chipsBox = h('div', { class: 'chips', role: 'group', 'aria-label': t('amount') });
  chipsBox.style.gridTemplateColumns = `repeat(${amounts.length + 1}, 1fr)`;
  const pick = (val, other) => {
    for (const c of chipsBox.children) c.setAttribute('aria-pressed', String(c === (other ? chipsBox.lastChild : chipsBox.querySelector(`[data-v="${val}"]`))));
    otherWrap.hidden = !other;
    if (other) { S.amount = otherInput.value; otherInput.focus(); } else S.amount = String(val);
    updateActions();
  };
  for (const a of amounts) chipsBox.append(h('button', { class: 'chip', type: 'button', 'data-v': String(a), 'aria-pressed': String(isPreset && S.amount === String(a)), onclick: () => pick(a, false) }, plain(a), h('small', { text: 'PEP' })));
  chipsBox.append(h('button', { class: 'chip', type: 'button', 'aria-pressed': String(!isPreset), onclick: () => pick(null, true) }, t('other')));
  otherInput = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: t('amount'), 'aria-label': t('amount_pep'), maxlength: '18' });
  if (!isPreset) otherInput.value = S.amount;
  otherInput.addEventListener('input', () => { S.amount = otherInput.value; updateActions(); });
  otherWrap = h('div', { class: 'other', hidden: isPreset }, otherInput, h('span', { text: 'PEP' }));
  msgBox = h('textarea', { rows: '1', maxlength: String(MSG_MAX), placeholder: t('msg_ph'), 'aria-label': t('message') });
  msgBox.value = S.message || '';
  msgBox.addEventListener('input', () => { S.message = msgBox.value; msgBox.style.height = 'auto'; msgBox.style.height = Math.min(110, msgBox.scrollHeight + 3) + 'px'; });
  const anonBox = h('label', { class: 'anon' },
    h('input', { type: 'checkbox', checked: S.anon }),
    h('span', {}, h('b', { text: t('anon_title') }), h('small', { text: t('anon_sub') })));
  anonBox.querySelector('input').addEventListener('change', (e) => { S.anon = e.target.checked; });
  actions = h('div', {});
  show(who(), h('span', { class: 'label', text: t('send_tip') }), chipsBox, otherWrap, msgBox, anonBox, actions, foot());
  updateActions();
}

function updateActions() {
  if (!actions) return;
  const a = parseAmount(S.amount);
  const other = h('button', { class: 'btn btn-soft', type: 'button', onclick: payAnyWallet, disabled: !a }, t('pay_other'));
  const s = S.session, w = S.wallet;
  if (!s) {
    fill(actions, h('div', { class: 'stack' },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => renderLogin() }, h('span', { svg: I.coin, class: 'btn-coin' }), t('pay_pepe')),
      other),
      h('p', { class: 'secure' }, tl('new_here', null, (x) => ext(SITE + '/signup', x))));
    return;
  }
  if (!s.wallet) {
    fill(actions, note('info', ...tl('tip_one_click', null, (x) => ext(SITE + '/wallet/new', x))), h('div', { class: 'stack' }, other));
    return;
  }
  if (s.wallet.vault_v !== 2) {
    fill(actions, note('info', ...tl('old_pw_tip', null, (x) => ext(SITE + '/wallet', x))), h('div', { class: 'stack' }, other));
    return;
  }
  if (!w || w.state === 'loading') {
    const b = h('button', { class: 'btn btn-primary', type: 'button', disabled: true }); busy(b, t('opening_wallet'));
    fill(actions, h('div', { class: 'stack' }, b, other));
    return;
  }
  if (w.state === 'self') { fill(actions, note('info', t('own_page'))); return; }
  if (w.state === 'error') { fill(actions, note('err', w.error), h('div', { class: 'stack' }, other)); return; }
  // Bereit: ein Klick sendet
  const p = a ? plan(a) : null;
  const send = h('button', { class: 'btn btn-primary', type: 'button', onclick: (e) => onSend(e.currentTarget) });
  let warn = null;
  if (!a) { send.disabled = true; send.textContent = t('choose_amount'); }
  else if (p.missing !== undefined) { send.disabled = true; send.textContent = t('not_enough'); warn = note('warn', ...tl('not_enough_warn', { have: pep(w.have), amount: pep(a) }, (x) => ext(SITE + '/wallet', x))); }
  else if (p.tooBig) { send.disabled = true; send.textContent = t('too_big'); warn = note('warn', t('too_big_warn')); }
  else send.textContent = t('send_amount', { amount: pep(a) });
  const meta = h('div', { class: 'meta' }, h('span', {}, t('balance') + ' ', h('b', { text: pep(w.have) })), p && p.fee !== undefined ? h('span', {}, t('network_fee') + ' ', h('b', { text: pep(p.fee) })) : null);
  fill(actions, h('div', { class: 'stack' }, send), meta, warn, h('div', { class: 'stack' }, h('button', { class: 'textbtn', type: 'button', onclick: payAnyWallet, disabled: !a }, t('pay_other_instead'))));
}

function plan(amount) {
  const w = S.wallet, fpk = W.parsePep(String(S.profile.fee || '0.1'));
  let fee = W.feeFor(W.estimateSize(w.utxos.length, 2), fpk), change = w.have - amount - fee;
  const outs = [{ address: w.rcpt.address, value: amount }];
  if (change < W.PEP.DUST) {
    fee = W.feeFor(W.estimateSize(w.utxos.length, 1), fpk); change = w.have - amount - fee;
    if (change < 0n) return { missing: -change, fee };
    fee += change; change = 0n;
  }
  if (change > 0n) outs.push({ address: w.address, value: change });
  if (W.estimateSize(w.utxos.length, outs.length) > 100000) return { tooBig: true };
  return { amount, fee, outs, total: amount + fee };
}

// ---------------------------------------------------------------- Wallet
async function walletData() {
  const [lk, ut] = await Promise.all([api('/api/ext/wallet/lookup?q=' + encodeURIComponent(S.profile.handle), { auth: true }), api('/api/ext/wallet/utxo', { auth: true })]);
  if (lk.http === 401 || ut.http === 401) return { expired: true };
  if (!lk.found || !lk.page) return { state: 'error', error: lk.error || t('err_cant_receive') };
  if (lk.page.self) return { state: 'self' };
  if (ut.error) return { state: 'error', error: ut.error };
  const utxos = ut.utxos.map((u) => ({ txid: u.txid, vout: u.vout, value: BigInt(u.value) }));
  return { state: 'ready', utxos, have: utxos.reduce((x, u) => x + u.value, 0n), rcpt: lk, address: S.session.wallet.address };
}
async function loadWallet() {
  if (!S.session || !S.session.wallet || S.session.wallet.vault_v !== 2) { S.wallet = null; updateActions(); return; }
  S.wallet = { state: 'loading' }; updateActions();
  const d = await walletData();
  if (d.expired) return expireSession();
  S.wallet = d; updateActions();
}
function keyFromWif(wif) {
  const { priv, compressed } = W.wifToPriv(wif);
  const pub = W.secp.getPublicKey(priv, compressed);
  return { priv, pub, address: W.pubToAddress(pub) };
}

async function onSend(btn) {
  const a = parseAmount(S.amount); if (!a) return;
  busy(btn, t('sending'));
  const key = await keys.get(S.session.handle);
  if (!key) return showUnlock();
  sendWith(key, false);
}

function showUnlock(msg = '') {
  const a = parseAmount(S.amount);
  const pw = h('input', { type: 'password', autocomplete: 'current-password', placeholder: t('pw_ph'), 'aria-label': t('password'), spellcheck: 'false' });
  const go = h('button', { class: 'btn btn-primary', type: 'submit' }, t('unlock_send', { amount: pep(a) }));
  const form = h('form', { class: 'stack', novalidate: true }, pw, go);
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); if (!pw.value) { pw.focus(); return; }
    busy(go, t('unlocking'));
    let wk; try { wk = await walletKey(pw.value, S.session.salt); } catch { return showUnlock(t('err_prepare_pw')); }
    sendWith(wk, true);
  });
  fill(actions, note('info', t('locked_info')), form, msg ? note('err', msg) : null,
    h('div', { class: 'stack' }, h('button', { class: 'textbtn', type: 'button', onclick: () => updateActions() }, t('cancel'))));
  pw.focus();
}

async function sendWith(wk, typed) {
  const fail = (msg) => { updateActions(); actions.append(note('err', msg)); };
  const v = await api('/api/ext/wallet/vault', { auth: true });
  if (v.http === 401) return expireSession();
  if (v.error) return fail(v.error);
  if (!v.vault || v.vault.v !== 2) return fail(t('err_open_wallet'));
  let k;
  try { k = keyFromWif(await openVault2(v.vault, wk)); if (k.address !== v.address) throw new Error('mismatch'); }
  catch { await keys.clear(); return showUnlock(typed ? t('err_wrong_pw') : ''); }
  await keys.put(wk, S.session.handle);
  // Frisch nachsehen: Guthaben und Empfänger-Adresse können sich seit dem Öffnen geändert haben
  const d = await walletData();
  if (d.expired) return expireSession();
  if (d.state !== 'ready') { S.wallet = d; return updateActions(); }
  S.wallet = d;
  const a = parseAmount(S.amount), p = a && plan(a);
  if (!p || !p.outs) return updateActions();
  let tx;
  try { tx = W.signTx(d.utxos.map((u) => ({ ...u, priv: k.priv, pub: k.pub })), p.outs); }
  catch (e) { return fail(t('err_pay_prepare', { msg: e.message })); }
  finally { k.priv.fill(0); }
  const j = await api('/api/ext/wallet/send', { method: 'POST', auth: true, body: { hex: tx.hex, to: d.rcpt.address, handle: d.rcpt.page.handle, message: (S.message || '').trim().slice(0, MSG_MAX), anon: !!S.anon } });
  if (j.http === 401) return expireSession();
  if (!j.ok) return fail(j.error || t('err_pay_send'));
  showDone(p.amount, S.profile.explorer + j.txid);
}

// ---------------------------------------------------------------- Anmelden
function renderLogin(msg = '', idVal = '') {
  const id = h('input', { type: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', id: 'f-id', 'data-focus': !idVal });
  id.value = idVal;
  const pw = h('input', { type: 'password', autocomplete: 'current-password', id: 'f-pw' });
  const go = h('button', { class: 'btn btn-primary', type: 'submit' }, t('login'));
  const err = msg ? note('err', msg) : h('p', { hidden: true });
  const form = h('form', { novalidate: true },
    h('div', { class: 'field' }, h('label', { for: 'f-id', text: t('name_or_email') }), id),
    h('div', { class: 'field' }, h('label', { for: 'f-pw', text: t('password') }), pw),
    err, h('div', { class: 'stack' }, go));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = id.value.trim().toLowerCase();
    if (!name || !pw.value) { (name ? pw : id).focus(); return; }
    busy(go, t('logging_in'));
    const fail = (t) => renderLogin(t, id.value);
    const salt = await api('/api/ext/salt?id=' + encodeURIComponent(name));
    if (salt.error) return fail(salt.error);
    let tok, wk;
    try { [tok, wk] = await Promise.all([loginToken(pw.value, salt.salt), walletKey(pw.value, salt.salt)]); }
    catch { return fail(t('err_prepare_pw')); }
    const body = { id: name, password_tok: tok, auth_salt: salt.salt };
    if (salt.v !== 1) body.password = pw.value;   // ältere Konten: einmalig wie beim Website-Login, danach nie wieder
    const r = await api('/api/ext/login', { method: 'POST', body });
    if (r.error) return fail(r.error);
    S.session = { token: r.token, handle: r.handle, name: r.name, salt: r.salt, v: r.v, wallet: r.wallet };
    await store.set(S.session);
    if (r.wallet) await keys.put(wk, r.handle);
    afterLogin();
  });
  show(backBtn(loginBack),
    h('h2', { class: 'title', text: t('login_title') }),
    h('p', { class: 'lead', text: MODE === 'airdrop' ? t('login_lead_airdrop') : t('login_lead_tip') }),
    form,
    h('p', { class: 'secure', svg: I.lock }, h('span', { text: t('pw_secure') })),
    h('p', { class: 'secure' }, tl('no_account', null, (x) => ext(SITE + '/signup', x))));
  if (idVal) pw.focus();
}
function afterLogin() { if (MODE === 'airdrop') airdropLoad(); else { renderMain(); loadWallet(); } }
function loginBack() { if (MODE === 'airdrop') close(); else renderMain(); }
async function expireSession() {
  await store.clear(); await keys.clear(); S.session = null; S.wallet = null;
  renderLogin(t('login_again'));
}
async function logout() {
  api('/api/ext/logout', { method: 'POST', auth: true });
  await store.clear(); await keys.clear(); S.session = null; S.wallet = null;
  if (MODE === 'airdrop') renderLogin(); else renderMain();
}

// ---------------------------------------------------------------- Mit einer anderen Wallet bezahlen
async function payAnyWallet(e) {
  const a = parseAmount(S.amount); if (!a) return;
  const btn = e && e.currentTarget; if (btn && btn.classList.contains('btn')) busy(btn, t('one_moment'));
  const tk = await api('/api/ext/token');
  const r = tk.error ? tk : await api('/api/intent', { method: 'POST', widget: tk.token, body: { handle: S.profile.handle, amount: S.amount.trim().replace(',', '.'), name: S.anon ? '' : (S.session ? S.session.name : ''), message: (S.message || '').trim().slice(0, MSG_MAX) } });
  if (r.error) { updateActions(); actions.append(note('err', r.error)); return; }
  renderPay(r);
}
async function renderPay(intent) {
  const qr = h('div', { class: 'qr', 'aria-label': t('qr_aria'), role: 'img' });
  try { qr.innerHTML = await QR.toString(intent.uri, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } }); } catch { qr.hidden = true; }
  const cAmt = h('button', { class: 'copy', type: 'button', onclick: (e) => copyText(intent.amount_text, e.currentTarget) }, t('copy'));
  const cAdr = h('button', { class: 'copy', type: 'button', onclick: (e) => copyText(intent.address, e.currentTarget) }, t('copy'));
  const status = h('p', { class: 'status' }, h('span', { class: 'dot' }), h('span', { text: t('waiting') }));
  const id = show(backBtn(() => renderMain()),
    h('h2', { class: 'title', text: t('send_exactly') }),
    h('p', { class: 'pay-amt' }, h('b', { text: intent.amount_text }), h('span', { text: 'PEP' })),
    h('p', { class: 'pay-why', text: t('pay_why') }),
    qr,
    h('div', { class: 'copyrow' }, h('div', { style: 'flex:1;min-width:0' }, h('span', { class: 'k', text: t('amount') }), h('code', { text: intent.amount_text + ' PEP' })), cAmt),
    h('div', { class: 'copyrow' }, h('div', { style: 'flex:1;min-width:0' }, h('span', { class: 'k', text: t('to_address') }), h('code', { text: intent.address })), cAdr),
    h('div', { class: 'stack' }, h('a', { class: 'btn btn-soft', href: intent.uri, target: '_blank', rel: 'noopener' }, t('open_wallet_app'))),
    status);
  const started = Date.now();
  const poll = async () => {
    if (S.view !== id) return;
    const s = await api('/api/intent/' + intent.id);
    if (S.view !== id) return;
    if (s.status === 'seen' || s.status === 'confirmed') return showDone(BigInt(intent.amount), s.tx_url);
    if (s.status === 'expired' || Date.now() - started > (intent.expires_in || 3600) * 1000) {
      fill(status, h('span', { text: t('expired') + ' ' }), h('button', { class: 'textbtn', type: 'button', onclick: () => renderMain() }, t('start_again')));
      return;
    }
    setTimeout(poll, 4000);
  };
  setTimeout(poll, 4000);
}

// ---------------------------------------------------------------- Danke
function showDone(amount, txUrl) {
  const p = S.profile;
  if (window.pepeCelebrate) window.pepeCelebrate();
  show(h('div', { class: 'done' },
    h('div', { class: 'done-mark', svg: I.done }),
    h('h2', { text: t('thanks') }),
    h('p', { text: t('thanks_body', { amount: pep(amount), name: p.name }) }),
    p.thanks ? h('blockquote', {}, h('span', { text: '“' + p.thanks + '”' }), h('small', { text: '— ' + p.name })) : null,
    h('div', { class: 'stack' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: close, 'data-focus': true }, t('done')),
      txUrl ? h('p', { class: 'secure' }, ext(txUrl, t('view_tx'))) : null)));
}

// ---------------------------------------------------------------- Nicht auf pepe.coffee / keine Adresse
function renderNotFound() {
  const msg = `Hey ${SHOWN}! I wanted to tip you in Pepecoin. Create a free page on pepe.coffee and add your ${PLABEL} name, then anyone can tip you right here on ${PLABEL}: ${SITE}`;
  let primary = null;
  if (PLATFORM === 'reddit') primary = h('a', { class: 'btn btn-primary', href: 'https://www.reddit.com/message/compose/?to=' + encodeURIComponent(NAME) + '&subject=' + encodeURIComponent('A Pepecoin tip for you') + '&message=' + encodeURIComponent(msg), target: '_blank', rel: 'noopener' }, t('nf_invite_reddit'));
  if (PLATFORM === 'twitter') primary = h('a', { class: 'btn btn-primary', href: 'https://x.com/intent/post?text=' + encodeURIComponent(msg), target: '_blank', rel: 'noopener' }, t('nf_invite_x'));
  if (PLATFORM === 'lichess') primary = h('a', { class: 'btn btn-primary', href: 'https://lichess.org/inbox/new?user=' + encodeURIComponent(NAME), target: '_blank', rel: 'noopener' }, t('nf_msg_lichess'));
  const copy = h('button', { class: primary ? 'btn btn-soft' : 'btn btn-primary', type: 'button', onclick: (e) => copyText(msg, e.currentTarget) }, t('nf_copy'));
  const lead = PLATFORM === 'twitch' || PLATFORM === 'kick'
    ? t('nf_lead_chat', { platform: PLABEL })
    : PLATFORM === 'lichess'
      ? t('nf_lead_msg', { platform: PLABEL })
      : t('nf_lead', { platform: PLABEL });
  show(h('div', { class: 'who' }, h('div', { class: 'av', text: NAME.slice(0, 1).toUpperCase() }), h('div', { class: 'who-t' }, h('h1', {}, h('span', { text: SHOWN })), h('p', { class: 'sub', text: t('nf_not_yet') }))),
    h('p', { class: 'lead', style: 'text-align:left;margin-bottom:6px', text: lead }),
    h('div', { class: 'stack' }, primary, copy),
    foot());
}
function renderNoAddress() {
  show(who(), note('info', t('no_address', { name: S.profile.name })), foot());
}

// ---------------------------------------------------------------- Airdrop an alle Kommentierenden
// Ablauf: Namen aus dem Thread → pepe.coffee sagt, wer eine Seite hat → Betrag wählen → Übersicht → EINE Transaktion
// mit einem Ausgang pro Person (signiert hier im Panel, wie beim Trinkgeld).
const AD = { found: [], missing: 0, total: 0, self: false, mode: 'each', value: '10', message: '', box: null, explorer: 'https://pepeblocks.com/tx/', fee: '0.1' };
const AD_INVITE = PLATFORM === 'twitter'
  ? 'I’m airdropping some Pepecoin to everyone here who has a pepe.coffee page 🐸 No page yet? Create one for free at https://pepe.coffee and add your X name, then you can get tips right here on X.'
  : 'I’m airdropping some Pepecoin to everyone in this thread who has a pepe.coffee page 🐸 No page yet? Create one for free at https://pepe.coffee and add your Reddit name, then you can get tips right here on Reddit.';

function adHead(sub) {
  return [h('h2', { class: 'title ad-title' }, h('span', { class: 'btn-coin ad-coin', svg: I.coin }), t('ad_title')), sub ? h('p', { class: 'lead', text: sub }) : null];
}
async function airdropStart() {
  S.session = await store.get();
  if (!S.session) return renderLogin();
  const me = await api('/api/ext/me', { auth: true });
  if (me.http === 401) return expireSession();
  if (!me.error) { S.session = { ...S.session, ...me }; store.set(S.session); }
  airdropLoad();
}
async function airdropLoad() {
  const s = S.session;
  if (!s.wallet) { show(...adHead(), note('info', ...tl('ad_no_wallet', null, (x) => ext(SITE + '/wallet/new', x))), foot()); return; }
  if (s.wallet.vault_v !== 2) { show(...adHead(), note('info', ...tl('ad_old_pw', null, (x) => ext(SITE + '/wallet', x))), foot()); return; }
  if (!NAMES.length) { show(...adHead(), note('info', t('ad_no_names')), foot()); return; }
  show(...adHead(t('ad_checking', { n: NAMES.length })), h('div', { class: 'loading' }, spinner()));
  const [lk, ut] = await Promise.all([api('/api/ext/airdrop/lookup', { method: 'POST', auth: true, body: { platform: PLATFORM, names: NAMES } }), api('/api/ext/wallet/utxo', { auth: true })]);
  if (lk.http === 401 || ut.http === 401) return expireSession();
  if (lk.error || ut.error) { show(...adHead(), note('err', lk.error || ut.error), h('div', { class: 'stack' }, h('button', { class: 'btn btn-soft', type: 'button', onclick: airdropLoad }, t('try_again')))); return; }
  AD.found = lk.found.map((r) => ({ ...r, on: true })); AD.missing = lk.missing; AD.total = lk.total; AD.self = lk.self; AD.over = lk.over || 0; AD.max = lk.max || 2000;
  if (lk.explorer) AD.explorer = lk.explorer; if (lk.fee) AD.fee = lk.fee;
  const utxos = ut.utxos.map((u) => ({ txid: u.txid, vout: u.vout, value: BigInt(u.value) }));
  S.wallet = { utxos, have: utxos.reduce((x, u) => x + u.value, 0n), address: s.wallet.address };
  renderAirdrop();
}
function adPlan() {
  const rc = AD.found.filter((r) => r.on), n = rc.length;
  if (!n) return { err: 'pick' };
  const v = parseAmount(AD.value);
  if (!v) return { err: 'enter' };
  const each = AD.mode === 'each' ? v : v / BigInt(n);
  if (each < W.PEP.DUST) return { err: 'small' };
  const total = each * BigInt(n), w = S.wallet, fpk = W.parsePep(String(AD.fee));
  const outs = rc.map((r) => ({ address: r.address, value: each }));
  let fee = W.feeFor(W.estimateSize(w.utxos.length, n + 1), fpk), change = w.have - total - fee;
  if (change < W.PEP.DUST) {
    fee = W.feeFor(W.estimateSize(w.utxos.length, n), fpk); change = w.have - total - fee;
    if (change < 0n) return { missing: -change, each, total, fee, n };
    fee += change; change = 0n;
  }
  if (change > 0n) outs.push({ address: w.address, value: change });
  if (W.estimateSize(w.utxos.length, outs.length) > 100000) return { err: 'big' };
  return { each, total, fee, outs, n, rc };
}
function renderAirdrop() {
  const nf = AD.found.length;
  const num = (x) => x.toLocaleString('en-US');
  const lead = AD.over
    ? t('ad_lead_over', { n: num(nf + AD.over), total: num(AD.total) })
    : nf
      ? t(nf === 1 ? 'ad_lead_one' : 'ad_lead_many', { n: num(nf), total: num(AD.total) })
      : t('ad_lead_none', { total: num(AD.total) });
  const capNote = AD.over ? note('info', t('ad_cap', { max: num(AD.max), n: num(nf), over: num(AD.over) })) : null;
  const invite = AD.missing ? h('div', { class: 'ad-invite' }, h('span', { text: AD.missing === 1 ? t('ad_missing_one') : t('ad_missing_many', { n: AD.missing }) }),
    h('button', { class: 'copy', type: 'button', onclick: (e) => copyText(AD_INVITE, e.currentTarget) }, t('ad_copy_invite'))) : null;
  if (!nf) { show(...adHead(lead), invite, foot()); return; }
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': t('ad_split_aria') });
  const setMode = (m) => { AD.mode = m; for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.m === m)); unit.textContent = m === 'each' ? t('pep_each') : t('pep_total'); adUpdate(); };
  seg.append(h('button', { type: 'button', 'data-m': 'each', 'aria-pressed': String(AD.mode === 'each'), onclick: () => setMode('each') }, t('ad_same')),
    h('button', { type: 'button', 'data-m': 'total', 'aria-pressed': String(AD.mode === 'total'), onclick: () => setMode('total') }, t('ad_split')));
  const amt = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-label': t('amount'), maxlength: '18' }); amt.value = AD.value;
  amt.addEventListener('input', () => { AD.value = amt.value; adUpdate(); });
  const unit = h('span', { text: AD.mode === 'each' ? t('pep_each') : t('pep_total') });
  const msg = h('textarea', { rows: '1', maxlength: String(MSG_MAX), placeholder: t('ad_msg_ph'), 'aria-label': t('message') }); msg.value = AD.message;
  msg.addEventListener('input', () => { AD.message = msg.value; });
  const list = h('ul', { class: 'ad-list' }, AD.found.map((r) => {
    const cb = h('input', { type: 'checkbox', checked: r.on, 'aria-label': t('ad_include', { name: r.display }) });
    cb.addEventListener('change', () => { r.on = cb.checked; adUpdate(); });
    return h('li', {}, h('label', {}, cb, h('span', { class: 'ad-n', text: r.display }), r.verified ? h('span', { svg: I.verified }) : null, h('span', { class: 'ad-u', text: (PLATFORM === 'reddit' ? 'u/' : '@') + r.name })));
  }));
  const det = h('details', { class: 'ad-det' }, h('summary', {}, h('span', { class: 'ad-sum-t' }), h('span', { class: 'ad-sum-c', text: t('show') })), list);
  det.addEventListener('toggle', () => { det.querySelector('.ad-sum-c').textContent = det.open ? t('hide') : t('show'); });
  AD.box = h('div', {});
  show(...adHead(lead), capNote, seg, h('div', { class: 'other ad-amt' }, amt, unit), msg, det, AD.box,
    h('p', { class: 'secure', text: t('ad_only_loaded') }), invite, foot());
  adUpdate();
}
function adUpdate() {
  if (!AD.box) return;
  const det = app.querySelector('.ad-sum-t'), on = AD.found.filter((r) => r.on).length;
  if (det) det.textContent = t('ad_selected', { on: on.toLocaleString('en-US'), all: AD.found.length.toLocaleString('en-US') });
  const p = adPlan(), w = S.wallet;
  const send = h('button', { class: 'btn btn-primary', type: 'button', onclick: (e) => adSend(e.currentTarget) });
  let info = null;
  if (p.err) { send.disabled = true; send.textContent = p.err === 'pick' ? t('ad_pick_btn') : t('choose_amount'); if (p.err === 'small' || p.err === 'big') info = note('warn', t(p.err === 'small' ? 'ad_too_small' : 'ad_too_many')); }
  else if (p.missing !== undefined) { send.disabled = true; send.textContent = t('not_enough'); info = note('warn', ...tl('ad_needs', { need: pep(p.total + p.fee), have: pep(w.have) }, (x) => ext(SITE + '/wallet', x))); }
  else send.textContent = t(p.n === 1 ? 'ad_send_one' : 'ad_send_many', { total: pep(p.total), n: p.n.toLocaleString('en-US') });
  const sum = p.err ? null : h('div', { class: 'ad-sumbox' },
    h('div', {}, h('span', { text: `${p.n.toLocaleString('en-US')} × ${pep(p.each)}` }), h('b', { text: pep(p.total) })),
    h('div', {}, h('span', { text: t('network_fee') }), h('b', { text: pep(p.fee) })),
    h('div', { class: 'ad-bal' }, h('span', { text: t('your_balance') }), h('b', { text: pep(w.have) })));
  fill(AD.box, sum, info, h('div', { class: 'stack' }, send));
}
async function adSend(btn) {
  if (!adPlan().outs) return;
  busy(btn, t('sending'));
  const key = await keys.get(S.session.handle);
  if (!key) return adUnlock();
  adSendWith(key, false);
}
function adUnlock(msg = '') {
  const p = adPlan();
  const pw = h('input', { type: 'password', autocomplete: 'current-password', placeholder: t('pw_ph'), 'aria-label': t('password'), spellcheck: 'false' });
  const go = h('button', { class: 'btn btn-primary', type: 'submit' }, t('unlock_send', { amount: p.total ? pep(p.total) : '' }).trim());
  const form = h('form', { class: 'stack', novalidate: true }, pw, go);
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); if (!pw.value) { pw.focus(); return; }
    busy(go, t('unlocking'));
    let wk; try { wk = await walletKey(pw.value, S.session.salt); } catch { return adUnlock(t('err_prepare_pw')); }
    adSendWith(wk, true);
  });
  fill(AD.box, note('info', t('locked_info')), form, msg ? note('err', msg) : null,
    h('div', { class: 'stack' }, h('button', { class: 'textbtn', type: 'button', onclick: adUpdate }, t('cancel'))));
  pw.focus();
}
async function adSendWith(wk, typed) {
  const fail = (m) => { adUpdate(); AD.box.append(note('err', m)); };
  const v = await api('/api/ext/wallet/vault', { auth: true });
  if (v.http === 401) return expireSession();
  if (v.error) return fail(v.error);
  let k;
  try { k = keyFromWif(await openVault2(v.vault, wk)); if (k.address !== v.address) throw new Error('mismatch'); }
  catch { await keys.clear(); return adUnlock(typed ? t('err_wrong_pw') : ''); }
  await keys.put(wk, S.session.handle);
  const ut = await api('/api/ext/wallet/utxo', { auth: true });
  if (ut.http === 401) return expireSession();
  if (ut.error) return fail(ut.error);
  const utxos = ut.utxos.map((u) => ({ txid: u.txid, vout: u.vout, value: BigInt(u.value) }));
  S.wallet = { utxos, have: utxos.reduce((x, u) => x + u.value, 0n), address: S.session.wallet.address };
  const p = adPlan();
  if (!p.outs) return adUpdate();
  let tx;
  try { tx = W.signTx(utxos.map((u) => ({ ...u, priv: k.priv, pub: k.pub })), p.outs); }
  catch (e) { return fail(t('err_ad_prepare', { msg: e.message })); }
  finally { k.priv.fill(0); }
  const j = await api('/api/ext/wallet/send-many', { method: 'POST', auth: true, body: { hex: tx.hex, recipients: p.rc.map((r) => ({ handle: r.handle, address: r.address })), message: (AD.message || '').trim().slice(0, MSG_MAX) } });
  if (j.http === 401) return expireSession();
  if (j.changed) { fail(j.error); AD.box.append(h('div', { class: 'stack' }, h('button', { class: 'btn btn-soft', type: 'button', onclick: airdropLoad }, t('ad_check_again')))); return; }
  if (!j.ok) return fail(j.error || t('err_ad_send'));
  if (window.pepeCelebrate) window.pepeCelebrate();
  show(h('div', { class: 'done' },
    h('div', { class: 'done-mark', svg: I.done }),
    h('h2', { text: t('ad_sent') }),
    h('p', { text: t(p.n === 1 ? 'ad_done_one' : 'ad_done_many', { n: p.n.toLocaleString('en-US'), each: pep(p.each), total: pep(p.total) }) }),
    AD.missing ? h('div', { class: 'ad-invite' }, h('span', { text: t('ad_tell_others') }), h('button', { class: 'copy', type: 'button', onclick: (e) => copyText(AD_INVITE, e.currentTarget) }, t('ad_copy_invite'))) : null,
    h('div', { class: 'stack' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: close, 'data-focus': true }, t('done')),
      h('p', { class: 'secure' }, ext(AD.explorer + j.txid, t('view_tx'))))));
}

// ---------------------------------------------------------------- Start
(async () => {
  if (MODE === 'airdrop' && W) return airdropStart();
  if (!NAME || !W || !QR) { show(note('err', t('err_reload'))); return; }
  const [prof, sess] = await Promise.all([api('/api/ext/profile/' + PLATFORM + '/' + encodeURIComponent(NAME)), store.get()]);
  if (prof.error) { show(note('err', prof.error), h('div', { class: 'stack' }, h('button', { class: 'btn btn-soft', type: 'button', onclick: () => location.reload() }, t('try_again')))); return; }
  S.profile = prof;
  if (!prof.found) return renderNotFound();
  if (!prof.has_address) return renderNoAddress();
  S.session = sess;
  renderMain();
  if (!sess) return;
  const me = await api('/api/ext/me', { auth: true });
  if (me.http === 401) { await store.clear(); await keys.clear(); S.session = null; S.wallet = null; renderMain(); return; }
  if (!me.error) { S.session = { ...sess, ...me }; store.set(S.session); }
  loadWallet();
})();
