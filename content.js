// pepe.coffee Tip Button – Content-Script für Reddit, X, Twitch, Kick, Lichess, GitHub, Bitcointalk, Medium, YouTube, Rumble, AniList, MyAnimeList und Smogon.
// Dieses Skript setzt nur die Tip-Knöpfe und öffnet das Panel. Das Panel selbst ist eine eigene Seite der Erweiterung
// (panel.html) in einem iframe: Die Sicherheitsregeln der Seiten erlauben das für Erweiterungsseiten, ihre Gestaltung
// wirkt nicht hinein, und ihre Skripte können Eingaben darin (Passwort) nicht lesen.
// Hinweis: Alle Seiten bauen ihr HTML immer wieder um. Jeder Knopf hat deshalb einen Rückfall, der ohne
// genaue Kenntnis des Aufbaus funktioniert (Autorenzeile → Anfang des Beitrags, Folgen-Knopf → schwebender Knopf).
(() => {
  'use strict';

  const seen = new WeakSet();
  let overlay = null, frame = null, lastFocus = null;

  const COIN = '<svg viewBox="147.96 230.57 130.59 130.58" width="15" height="15" aria-hidden="true"><path fill="#269b4d" d="M213.249,231.069c35.787,0,64.795,29.006,64.795,64.792s-29.008,64.791-64.795,64.791c-35.784,0-64.792-29.005-64.792-64.791S177.465,231.069,213.249,231.069z"/><path fill="#fff" d="M250.672,288.474c-1.369,8.362-5.259,14.067-11.672,17.127c-2.892,1.37-5.649,2.118-8.265,2.237c-3.513,0.141-8.683-0.346-15.509-1.459l-9.641-1.576l-4.516,27.632l-14.787-2.421l7.444-45.556l-7.593-1.243l1.519-9.293l7.594,1.243l3.001-18.389l23.728,3.875c8.959,1.469,14.762,2.794,17.406,3.971c4.589,2.056,7.871,5.325,9.835,9.816C251.038,278.602,251.518,283.279,250.672,288.474z M235.402,286.188c0.418-2.566,0.021-4.856-1.189-6.864c-1.21-2.009-3.042-3.455-5.5-4.336c-1.742-0.626-5.262-1.373-10.558-2.237l-7.143-1.167l-0.98,5.994l13.138,2.144l-1.519,9.298l-13.138-2.149l-0.898,5.499l8.093,1.32c4.33,0.707,7.319,1.038,8.967,1.002c3.534-0.073,6.247-1.101,8.142-3.078C234.179,290.191,235.044,288.38,235.402,286.188z"/></svg>';

  // Erlaubte Namen je Plattform (wie auf dem Server)
  const NAME_RE = {
    reddit: /^[A-Za-z0-9_-]{3,20}$/,
    twitter: /^[A-Za-z0-9_]{1,15}$/,
    twitch: /^[A-Za-z0-9_]{4,25}$/,
    kick: /^[A-Za-z0-9_-]{3,25}$/,
    lichess: /^[A-Za-z0-9][A-Za-z0-9_-]{0,28}[A-Za-z0-9]$/,
    github: /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/,
    bitcointalk: /^[A-Za-z0-9_.-]{1,25}$/,
    medium: /^[A-Za-z0-9][A-Za-z0-9._-]{0,29}$/,
    youtube: /^[A-Za-z0-9_.-]{3,30}$/,
    rumble: /^[A-Za-z0-9_-]{2,40}$/,
    anilist: /^[A-Za-z0-9_]{2,20}$/,
    myanimelist: /^[A-Za-z0-9_-]{2,16}$/,
    smogon: /^[A-Za-z0-9_.-]{1,30}$/,
  };
  const SKIP = new Set(['[deleted]', 'AutoModerator']);
  const validName = (platform, name) => typeof name === 'string' && NAME_RE[platform].test(name) && !SKIP.has(name);

  // ---------- Panel ----------
  function closePanel() {
    if (!overlay) return;
    const o = overlay; overlay = null; frame = null;
    o.classList.remove('is-open');
    setTimeout(() => o.remove(), 180);
    document.removeEventListener('keydown', onKey, true);
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }
  function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); closePanel(); } }

  // Nach einem Update oder Neuladen der Erweiterung bleibt auf schon offenen Seiten ein abgekoppeltes Skript zurück:
  // chrome.runtime ist dort leer. Statt eines Fehlers kommt dann ein Hinweis, die Seite neu zu laden.
  // Texte: Chrome liefert sie aus _locales/<Sprache>/messages.json nach der Browsersprache. Nach einem Update ist chrome.i18n weg
  // (abgekoppeltes Skript): dann gelten diese englischen Texte.
  const EN = {
    c_tip: 'Tip', c_tip_name: 'Tip {name}', c_tip_in: 'Tip {name} in Pepecoin', c_frame: 'Tip {name} with Pepecoin',
    c_airdrop_c: 'Airdrop to commenters', c_airdrop_r: 'Airdrop to repliers', c_airdrop_c_t: 'Airdrop to commenters with Pepecoin', c_airdrop_r_t: 'Airdrop to repliers with Pepecoin',
    c_toast: 'The pepe.coffee Tip Button was updated. Reload this page to tip.', c_reload: 'Reload', c_close: 'Close',
  };
  function tr(key, vars) {
    let m = ''; try { m = chrome.i18n.getMessage(key); } catch {}
    m = m || EN[key] || key;
    return vars ? m.replace(/\{(\w+)\}/g, (x, n) => (n in vars ? String(vars[n]) : x)) : m;
  }
  const alive = () => typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
  function staleNotice() {
    if (document.querySelector('.pepecoffee-toast')) return;
    const t = document.createElement('div'); t.className = 'pepecoffee-toast'; t.setAttribute('role', 'alert');
    const m = document.createElement('span'); m.textContent = tr('c_toast');
    const r = document.createElement('button'); r.type = 'button'; r.textContent = tr('c_reload'); r.addEventListener('click', () => location.reload());
    const x = document.createElement('button'); x.type = 'button'; x.className = 'pepecoffee-toast-x'; x.setAttribute('aria-label', tr('c_close')); x.textContent = '×'; x.addEventListener('click', () => t.remove());
    t.append(m, r, x); document.documentElement.appendChild(t); setTimeout(() => t.remove(), 12000);
  }

  function openPanel(platform, name, trigger, names) {
    if (!alive()) { staleNotice(); return; }
    if (overlay) closePanel();
    lastFocus = trigger;
    overlay = document.createElement('div');
    overlay.className = 'pepecoffee-overlay';
    frame = document.createElement('iframe');
    frame.className = 'pepecoffee-frame';
    frame.title = tr('c_frame', { name });
    frame.allow = 'clipboard-write';
    // Airdrop: die Namen kommen in den #-Teil (bleibt im Browser, wird nie an einen Server geschickt)
    frame.src = names
      ? chrome.runtime.getURL('panel.html') + '?mode=airdrop&p=' + platform + '#' + encodeURIComponent(JSON.stringify(names))
      : chrome.runtime.getURL('panel.html') + '?p=' + platform + '&u=' + encodeURIComponent(name);
    overlay.appendChild(frame);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closePanel(); });
    document.documentElement.appendChild(overlay);
    document.addEventListener('keydown', onKey, true);
    requestAnimationFrame(() => requestAnimationFrame(() => overlay && overlay.classList.add('is-open')));
    frame.addEventListener('load', () => frame && frame.focus());
  }

  // Nachrichten aus dem Panel: Höhe anpassen, schließen. Nur vom eigenen iframe annehmen.
  const PANEL_ORIGIN = new URL(chrome.runtime.getURL('')).origin;
  window.addEventListener('message', (e) => {
    if (!frame || e.source !== frame.contentWindow || e.origin !== PANEL_ORIGIN) return;
    const d = e.data || {};
    if (d.pepecoffee === 'size' && typeof d.h === 'number') frame.style.setProperty('height', Math.ceil(d.h) + 'px', 'important');
    if (d.pepecoffee === 'close') closePanel();
  });

  // ---------- Knopf ----------
  function makeButton(platform, name, kind, label = tr('c_tip')) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pepecoffee-tip-btn pepecoffee-tip-' + kind;
    b.title = tr('c_tip_in', { name });
    b.setAttribute('aria-label', tr('c_tip_in', { name }));
    b.dataset.pcName = name;
    b.innerHTML = COIN;
    const t = document.createElement('span'); t.textContent = label; b.appendChild(t);
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openPanel(platform, name, b); });
    // Die Seiten öffnen bei Klicks auf einen Beitrag den Beitrag selbst: nichts davon soll unseren Knopf erreichen
    ['mousedown', 'pointerdown', 'mouseup', 'auxclick', 'touchstart'].forEach((t) => b.addEventListener(t, (e) => e.stopPropagation(), { passive: true }));
    return b;
  }

  // ================================================================ Reddit
  // Neues Reddit: Web-Komponenten mit benannten Slots. Der Knopf kommt in die Zeile mit dem Autorennamen.
  function placeInSlot(host, btn, slots) {
    for (const s of slots) {
      const el = host.querySelector(':scope > [slot="' + s + '"]');
      if (el) { el.appendChild(btn); return; }
    }
    host.insertAdjacentElement('afterbegin', btn); // Rückfall: Standard-Slot, am Anfang des Beitrags
  }
  function redditScan() {
    document.querySelectorAll('shreddit-post[author], shreddit-comment[author]').forEach((el) => {
      if (seen.has(el)) return;
      const author = el.getAttribute('author');
      if (!validName('reddit', author)) return;
      seen.add(el);
      const post = el.tagName === 'SHREDDIT-POST';
      placeInSlot(el, makeButton('reddit', author, post ? 'post' : 'comment'), post ? ['credit-bar', 'post-credit-bar'] : ['commentMeta', 'comment-meta']);
    });
    // Altes Reddit: Posts und Kommentare sind gleich aufgebaut (.thing mit Linkleiste)
    document.querySelectorAll('.thing[data-author]').forEach((thing) => {
      if (seen.has(thing)) return;
      const author = thing.getAttribute('data-author');
      if (!validName('reddit', author)) return;
      const bar = thing.querySelector(':scope > .entry .flat-list.buttons');
      if (!bar) return;
      seen.add(thing);
      const li = document.createElement('li');
      li.appendChild(makeButton('reddit', author, 'old'));
      bar.appendChild(li);
    });
  }

  // ================================================================ X (Twitter)
  // Jeder Beitrag ist ein <article data-testid="tweet">. Der Name steht als Link "/name" im Kopf (User-Name),
  // der Knopf kommt in die Aktionsleiste (Antworten, Reposten, Gefällt mir …).
  function xAuthor(article) {
    const box = article.querySelector('[data-testid="User-Name"]');
    if (!box) return null;
    for (const a of box.querySelectorAll('a[href^="/"]')) {
      const m = (a.getAttribute('href') || '').match(/^\/([A-Za-z0-9_]{1,15})$/);
      if (m) return m[1];
    }
    return null;
  }
  function xScan() {
    document.querySelectorAll('article[data-testid="tweet"]').forEach((article) => {
      if (seen.has(article)) return;
      const name = xAuthor(article);
      if (!validName('twitter', name)) return;
      const bar = [...article.querySelectorAll('[role="group"]')].find((g) => g.querySelector('[data-testid="reply"], [data-testid="like"], [data-testid="unlike"]'));
      if (!bar) return; // noch nicht fertig geladen: beim nächsten Durchlauf
      seen.add(article);
      const slot = document.createElement('div');
      slot.className = 'pepecoffee-x-slot';
      slot.appendChild(makeButton('twitter', name, 'x'));
      bar.appendChild(slot);
    });
  }

  // ================================================================ Twitch und Kick: Kanalseiten
  // Der Kanal steht in der Adresse (twitch.tv/name, kick.com/name). Der Knopf kommt neben „Folgen“;
  // findet er den nicht, schwebt er unten links über der Seite.
  const RESERVED = {
    twitch: new Set(['directory', 'videos', 'settings', 'subscriptions', 'inventory', 'drops', 'wallet', 'p', 'search', 'downloads', 'jobs', 'turbo', 'prime',
      'store', 'friends', 'messages', 'login', 'signup', 'moderator', 'popout', 'bits', 'following', 'u', 'team', 'clips', 'clip', 'embed', 'broadcast', 'products', 'redeem', 'privacy', 'legal']),
    kick: new Set(['browse', 'categories', 'category', 'following', 'search', 'settings', 'dashboard', 'video', 'videos', 'clips', 'clip', 'transactions',
      'subscriptions', 'community-guidelines', 'terms-of-service', 'privacy-policy', 'dmca-policy', 'kick-partner-program', 'auth', 'login', 'signup',
      'popout', 'help', 'about', 'careers', 'contact', 'faq', 'mobile', 'download', 'legal', 'cookie-policy', 'creator-dashboard', 'stream-key', 'emotes']),
  };
  const FOLLOW_SEL = {
    twitch: '[data-a-target="follow-button"], [data-a-target="unfollow-button"]',
    kick: '[data-testid="follow-button"], [data-testid="unfollow-button"], [data-test="follow-button"]',
  };
  // „Folgen“-Knopf in den Sprachen der Erweiterung (Twitch und Kick richten sich nach der Browsersprache). Fehlt eine Schreibweise, schwebt der Knopf.
  const FOLLOW_TEXT = /^(follow|following|unfollow|folgen|gefolgt|entfolgen|seguir|siguiendo|dejar de seguir|seguindo|deixar de seguir|suivre|suivi|ne plus suivre|segui|seguito|smetti di seguire|takip et|takip ediliyor|takibi bırak|ikuti|mengikuti|diikuti|berhenti mengikuti|подписаться|вы подписаны|отписаться|theo dõi|đang theo dõi|bỏ theo dõi|关注|已关注|取消关注|フォロー|フォロー中|フォロー解除|팔로우|팔로잉|언팔로우)$/i;
  let chan = { name: null, btn: null, since: 0 };

  function channelFromUrl(platform) {
    const seg = location.pathname.split('/').filter(Boolean)[0] || '';
    if (!seg || RESERVED[platform].has(seg.toLowerCase())) return null;
    return validName(platform, seg) ? seg : null;
  }
  function findFollow(platform) {
    const direct = document.querySelector(FOLLOW_SEL[platform]);
    if (direct) return direct;
    for (const b of document.querySelectorAll('button')) {
      if (b.classList.contains('pepecoffee-tip-btn')) continue;
      if (FOLLOW_TEXT.test((b.textContent || '').trim()) && b.offsetParent !== null) return b;
    }
    return null;
  }
  function channelTick(platform) {
    const name = channelFromUrl(platform);
    if (name !== chan.name) { // anderer Kanal oder keine Kanalseite mehr
      if (chan.btn) chan.btn.remove();
      chan = { name, btn: null, since: Date.now() };
    }
    if (!name) return;
    const placed = chan.btn && document.contains(chan.btn);
    if (placed && !chan.btn.classList.contains('pepecoffee-float')) return; // sitzt an seinem Platz
    const follow = findFollow(platform);
    if (follow) {
      // Bis zum Element hochgehen, das in der Knopfzeile neben anderen steht, und den Knopf daneben setzen
      let anchor = follow;
      for (let i = 0; i < 5 && anchor.parentElement && anchor.parentElement.children.length === 1; i++) anchor = anchor.parentElement;
      if (chan.btn) chan.btn.remove();
      chan.btn = makeButton(platform, name, 'channel');
      anchor.insertAdjacentElement('afterend', chan.btn);
      return;
    }
    // Rückfall nach 2,5 s ohne „Folgen“-Knopf: schwebender Knopf
    if (!placed && Date.now() - chan.since > 2500) {
      chan.btn = makeButton(platform, name, 'float', tr('c_tip_name', { name }));
      chan.btn.classList.add('pepecoffee-float');
      document.documentElement.appendChild(chan.btn);
    }
  }

  // ================================================================ Lichess, GitHub, Bitcointalk, Medium, YouTube, Rumble, AniList, MyAnimeList, Smogon
  // Gemeinsamer Teil. Diese Seiten bauen ihr HTML ständig um (Uhren, Chat, Turbo-Navigation): darum alle 0,7 s nachsehen,
  // statt jede Änderung zu beobachten, und fehlende Knöpfe einfach wieder setzen.
  //
  // pageButton: EIN Knopf für „die Person dieser Seite“ (Profil oder Artikel). Er probiert seine Plätze der Reihe nach durch
  // ([Auswahl, Position, Art]); findet er keinen, schwebt er nach 2,5 s unten links. (Eine Auswahlliste mit Kommas würde das
  // erste Element im Dokument liefern, nicht das wichtigste: darum die Reihenfolge hier.)
  function pageButton(platform, name, spots) {
    if (name !== chan.name) { // andere Person oder keine passende Seite mehr
      if (chan.btn) chan.btn.remove();
      chan = { name, btn: null, since: Date.now() };
    }
    if (!name) return;
    const placed = chan.btn && document.contains(chan.btn);
    if (placed && !chan.btn.classList.contains('pepecoffee-float')) return; // sitzt an seinem Platz
    for (const [sel, pos, kind] of spots) {
      const el = document.querySelector(sel);
      if (!el) continue;
      if (chan.btn) chan.btn.remove();
      chan.btn = makeButton(platform, name, kind, kind === 'li' ? '' : tr('c_tip'));
      el.insertAdjacentElement(pos, chan.btn);
      return;
    }
    if (!placed && Date.now() - chan.since > 2500) {
      chan.btn = makeButton(platform, name, 'float', tr('c_tip_name', { name }));
      chan.btn.classList.add('pepecoffee-float');
      document.documentElement.appendChild(chan.btn);
    }
  }
  // nameButtons: ein kleiner Münzen-Knopf hinter jeden Namen, den namer() in den gefundenen Elementen erkennt.
  function nameButtons(platform, selector, namer, where) {
    document.querySelectorAll(selector).forEach((el) => {
      const name = namer(el);
      if (!name) return;
      const anchor = where ? where(el) : el;
      const next = anchor.nextElementSibling;
      if (next && next.classList.contains('pepecoffee-tip-btn')) { if (next.dataset.pcName === name) return; next.remove(); } // anderer Name an gleicher Stelle
      anchor.insertAdjacentElement('afterend', makeButton(platform, name, 'li', ''));
    });
  }
  const metaContent = (sel) => { const m = document.querySelector(sel); return m ? (m.content || '') : ''; };

  // ---------- Lichess: Namen sind überall Links /@/Name (Klasse user-link): Spiel, Chat, Forum, Profil
  const LI_PATH = /^\/@\/([A-Za-z0-9][A-Za-z0-9_-]{0,28}[A-Za-z0-9])(?:\/|$)/;
  const LI_SPOTS = [['.user-show .relation-actions', 'beforeend', 'channel'], ['.user-show .btn-rack', 'beforeend', 'channel'],
    ['.user-show__social', 'beforeend', 'channel'], ['.user-show h1', 'afterend', 'channel']];
  const liSelf = () => ((document.body && document.body.dataset.user) || '').toLowerCase(); // eigener Name: kein Knopf bei dir selbst
  function lichessName(a) {
    if (a.hostname !== location.hostname) return null;
    let path; try { path = decodeURIComponent(a.pathname); } catch { return null; }
    const m = path.match(LI_PATH);
    return m && validName('lichess', m[1]) && m[1].toLowerCase() !== liSelf() ? m[1] : null;
  }
  function lichessProfileName() {
    const m = location.pathname.match(/^\/@\/([^/]+)/);
    if (!m) return null;
    try { const n = decodeURIComponent(m[1]); return validName('lichess', n) && n.toLowerCase() !== liSelf() ? n : null; } catch { return null; }
  }
  const lichessTick = () => {
    pageButton('lichess', lichessProfileName(), LI_SPOTS);
    nameButtons('lichess', '.ruser a.user-link, .game__meta__players a.user-link, .mchat__messages a.user-link, .forum-post__metas a.user-link', lichessName);
  };

  // ---------- GitHub: Kommentare (Kopf mit a.author) und Profilseiten (Name steht im Meta-Tag profile:username)
  const ghSelf = () => metaContent('meta[name="user-login"]').toLowerCase();
  function githubAuthor(a) {
    if (a.hostname !== location.hostname) return null;
    const m = a.pathname.match(/^\/([^/]+)$/); // nur /name, nicht /apps/bot oder /org/repo
    const n = m && m[1];
    return n && validName('github', n) && n.toLowerCase() !== 'ghost' && n.toLowerCase() !== ghSelf() ? n : null;
  }
  function githubProfileName() {
    const seg = location.pathname.split('/').filter(Boolean);
    const n = metaContent('meta[property="profile:username"]'); // nur auf Profilseiten von Personen vorhanden (Organisationen haben es nicht)
    return seg.length === 1 && n && n.toLowerCase() === seg[0].toLowerCase() && validName('github', n) && n.toLowerCase() !== ghSelf() ? n : null;
  }
  const githubTick = () => {
    pageButton('github', githubProfileName(), [['.vcard-names-container', 'afterend', 'channel']]);
    nameButtons('github', '.timeline-comment-header a.author', githubAuthor, (a) => a.closest('strong') || a);
  };

  // ---------- Bitcointalk: Beiträge. Der Name steht als Text im Link (die Adresse enthält nur eine Nummer).
  // Namen mit Leerzeichen oder Sonderzeichen passen nicht in unsere Regel und bekommen (noch) keinen Knopf.
  const btName = (a) => { const n = (a.textContent || '').trim(); return validName('bitcointalk', n) ? n : null; };
  const bitcointalkTick = () => nameButtons('bitcointalk', 'td.poster_info > b > a[href*="action=profile"]', btName, (a) => a.parentElement);

  // ---------- Medium: Autor kommt aus dem Meta-Tag article:author (auf name.medium.com zeigt der Link nur auf „/“).
  // Profile liegen auf medium.com/@name oder name.medium.com. Der Knopf sitzt hinter dem Autorennamen im Artikel, auf Profilen schwebt er.
  const MEDIUM_NOT_USER = new Set(['www', 'help', 'blog', 'policy', 'about', 'jobs', 'api', 'cdn', 'miro']);
  function mediumNameFromUrl(u) {
    try {
      const x = new URL(u);
      if (x.hostname === 'medium.com' || x.hostname === 'www.medium.com') { const m = x.pathname.match(/^\/@([^/]+)/); return m ? decodeURIComponent(m[1]) : null; }
      const m = x.hostname.match(/^([a-z0-9_-]+)\.medium\.com$/i);
      return m && !MEDIUM_NOT_USER.has(m[1].toLowerCase()) ? m[1] : null;
    } catch { return null; }
  }
  function mediumTick() {
    const type = metaContent('meta[property="og:type"]');
    let name = type === 'article' ? mediumNameFromUrl(metaContent('meta[property="article:author"]')) : type === 'profile' ? mediumNameFromUrl(location.href) : null;
    if (name && !validName('medium', name)) name = null;
    pageButton('medium', name, type === 'article' ? [['[data-testid="authorName"]', 'afterend', 'li']] : []);
  }

  // ---------- YouTube: Der Name ist der Handle aus dem Link /@name (der angezeigte Name ist nicht eindeutig).
  // Videoseite: Kanal unter dem Video und Kommentare. Kanalseite: Kopfzeile. Ältere Adressen (/channel/…, /c/…) enthalten keinen Handle: kein Knopf.
  function youtubeHandle(a) {
    if (a.hostname !== location.hostname) return null;
    let path; try { path = decodeURIComponent(a.pathname); } catch { return null; }
    const m = path.match(/^\/@([^/]+)/);
    return m && validName('youtube', m[1]) ? m[1] : null;
  }
  function youtubeTick() {
    let name = null, spots = [];
    if (location.pathname === '/watch') {
      const a = document.querySelector('#owner ytd-channel-name a[href^="/@"]');
      name = a ? youtubeHandle(a) : null;
      spots = [['#owner ytd-channel-name', 'afterend', 'li']];
    } else if (/^\/@[^/]+/.test(location.pathname)) {
      try { const n = decodeURIComponent(location.pathname.split('/')[1].slice(1)); name = validName('youtube', n) ? n : null; } catch { name = null; }
      spots = [['yt-page-header-renderer h1', 'afterend', 'channel']];
    }
    pageButton('youtube', name, spots);
    nameButtons('youtube', 'ytd-comments ytd-comment-view-model a#author-text', youtubeHandle);
  }

  // ---------- Rumble: Kanäle /c/name, Benutzer /user/name (Kommentare verlinken auf /user/). Name = Teil nach /c/ bzw. /user/.
  function rumbleName(a) {
    if (a.hostname !== location.hostname) return null;
    const m = a.pathname.match(/^\/(?:c|user)\/([^/]+)\/?$/);
    return m && validName('rumble', m[1]) ? m[1] : null;
  }
  function rumbleTick() {
    let name = null, spots = [];
    const own = location.pathname.match(/^\/(?:c|user)\/([^/]+)/);
    if (own) { name = validName('rumble', own[1]) ? own[1] : null; spots = [['h1', 'afterend', 'channel']]; }
    else { // Videoseite: Kanal des Videos
      const a = document.querySelector('a.media-by--a[rel="author"]');
      name = a ? rumbleName(a) : null;
      spots = [['a.media-by--a[rel="author"]', 'afterend', 'li']];
    }
    pageButton('rumble', name, spots);
    nameButtons('rumble', 'a.comments-meta-author', rumbleName);
  }

  // ---------- AniList: Profile /user/Name, Namen in Aktivitäten, Forum und Kommentaren sind Links /user/Name mit dem Namen als Text.
  // (Avatar-Links haben keinen Text und bekommen darum keinen Knopf.)
  const linkName = (a, re, platform) => {
    if (a.hostname !== location.hostname || a.closest('header, nav')) return null;
    const m = a.pathname.match(re);
    const t = (a.textContent || '').trim();
    return m && validName(platform, m[1]) && t.toLowerCase() === m[1].toLowerCase() ? m[1] : null;
  };
  const anilistName = (a) => linkName(a, /^\/user\/([^/]+)\/?$/, 'anilist');
  function anilistTick() {
    const m = location.pathname.match(/^\/user\/([^/]+)/);
    pageButton('anilist', m && validName('anilist', m[1]) ? m[1] : null, [['.banner-content .actions', 'beforeend', 'channel'], ['.banner-content .name-wrapper', 'afterend', 'channel']]);
    nameButtons('anilist', 'a[href^="/user/"]', anilistName);
  }

  // ---------- MyAnimeList: Profile /profile/Name; Forum, Kommentare und Reviews verlinken Namen als Text (Erwähnungen mit @ gehören nicht dazu)
  const malName = (a) => linkName(a, /^\/profile\/([^/]+)\/?$/, 'myanimelist');
  function myanimelistTick() {
    const m = location.pathname.match(/^\/profile\/([^/]+)/);
    pageButton('myanimelist', m && validName('myanimelist', m[1]) ? m[1] : null, [['.user-profile .user-function', 'beforeend', 'channel']]);
    nameButtons('myanimelist', 'a[href*="/profile/"]', malName);
  }

  // ---------- Smogon (Forum-Software XenForo): Beitragsautoren. Der Name steht als Text im Link (die Adresse hat nur eine Kurzform mit Nummer).
  // Namen mit Leerzeichen oder Sonderzeichen passen nicht in unsere Regel und bekommen (noch) keinen Knopf.
  const smogonText = (el) => { const n = (el.textContent || '').trim(); return validName('smogon', n) ? n : null; };
  function smogonTick() {
    const h = document.querySelector('.memberHeader-name .username');
    pageButton('smogon', h && /^\/forums\/members\//.test(location.pathname) ? smogonText(h) : null, [['.memberHeader-name', 'afterend', 'channel']]);
    nameButtons('smogon', '.message-name a.username', smogonText);
  }

  // ================================================================ Airdrop an alle Kommentierenden
  // Auf einer Thread-Seite (Reddit: …/comments/…, X: …/status/…) gibt es einen Knopf „Airdrop to commenters“.
  // Er sammelt beim Klick die Namen aller Kommentare, die gerade auf der Seite geladen sind.
  let adBtn = null, adPath = null;
  function threadInfo() {
    const path = location.pathname;
    if (scan === redditScan && /\/comments\/[a-z0-9]+/i.test(path)) return { platform: 'reddit', label: tr('c_airdrop_c'), full: tr('c_airdrop_c_t') };
    const m = path.match(/^\/([A-Za-z0-9_]{1,15})\/status\/\d+/);
    if (scan === xScan && m) return { platform: 'twitter', label: tr('c_airdrop_r'), full: tr('c_airdrop_r_t'), op: m[1] };
    return null;
  }
  function collectNames(info) {
    const seen = new Map();
    const add = (n) => { if (validName(info.platform, n) && !seen.has(n.toLowerCase())) seen.set(n.toLowerCase(), n); };
    if (info.platform === 'reddit') {
      document.querySelectorAll('shreddit-comment[author]').forEach((c) => add(c.getAttribute('author')));
      document.querySelectorAll('.thing.comment[data-author]').forEach((c) => add(c.getAttribute('data-author')));
    } else {
      document.querySelectorAll('article[data-testid="tweet"]').forEach((a) => { const n = xAuthor(a); if (n && n.toLowerCase() !== info.op.toLowerCase()) add(n); });
    }
    return [...seen.values()];
  }
  function airdropTick() {
    const info = threadInfo();
    if (!info) { if (adBtn) { adBtn.remove(); adBtn = null; } adPath = null; return; }
    if (adBtn && document.contains(adBtn) && adPath === location.pathname) return;
    if (adBtn) adBtn.remove();
    adPath = location.pathname;
    adBtn = makeButton(info.platform, '', 'airdrop', info.label);
    adBtn.title = adBtn.ariaLabel = info.full;
    adBtn.setAttribute('aria-label', info.full);
    adBtn.removeAttribute('data-pc-name');
    // eigener Klick: alle Namen einsammeln statt nur einen
    const fresh = adBtn.cloneNode(true);
    fresh.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openPanel(info.platform, '', fresh, collectNames(info)); });
    ['mousedown', 'pointerdown', 'mouseup', 'auxclick', 'touchstart'].forEach((t) => fresh.addEventListener(t, (e) => e.stopPropagation(), { passive: true }));
    adBtn = fresh;
    // Neues Reddit: vor der Kommentarliste; altes Reddit: oben im Kommentarbereich; sonst (und bei X) schwebend
    const tree = document.querySelector('shreddit-comment-tree');
    const oldArea = document.querySelector('.commentarea');
    if (info.platform === 'reddit' && tree) { adBtn.classList.add('pepecoffee-airdrop-inline'); tree.insertAdjacentElement('beforebegin', adBtn); }
    else if (info.platform === 'reddit' && oldArea) { adBtn.classList.add('pepecoffee-airdrop-inline'); oldArea.insertAdjacentElement('afterbegin', adBtn); }
    else { adBtn.classList.add('pepecoffee-float'); document.documentElement.appendChild(adBtn); }
  }

  // ================================================================ Start
  const host = location.hostname.replace(/^(www|mobile)\./, '');
  let scan = null, tick = null;
  if (host === 'reddit.com' || host === 'old.reddit.com') scan = redditScan;
  else if (host === 'x.com' || host === 'twitter.com') scan = xScan;
  else if (host === 'twitch.tv') tick = () => channelTick('twitch');
  else if (host === 'kick.com') tick = () => channelTick('kick');
  else if (host === 'lichess.org') tick = lichessTick;
  else if (host === 'github.com') tick = githubTick;
  else if (host === 'bitcointalk.org') tick = bitcointalkTick;
  else if (host === 'youtube.com') tick = youtubeTick;
  else if (host === 'rumble.com') tick = rumbleTick;
  else if (host === 'anilist.co') tick = anilistTick;
  else if (host === 'myanimelist.net') tick = myanimelistTick;
  else if (host === 'smogon.com') tick = smogonTick;
  else if (host === 'medium.com' || host.endsWith('.medium.com')) tick = mediumTick;

  if (scan) {
    // Lange Threads und Timelines laden ständig nach: höchstens alle 250 ms neu suchen
    let queued = false;
    const queue = () => { if (queued) return; queued = true; setTimeout(() => { queued = false; scan(); }, 250); };
    scan();
    new MutationObserver(queue).observe(document.documentElement, { childList: true, subtree: true });
  }
  if (tick) { tick(); setInterval(tick, 700); }
  if (scan) { airdropTick(); setInterval(airdropTick, 800); }
})();
