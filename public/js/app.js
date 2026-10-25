/* ADYÜ Mobil PWA — app.js */

// ── Sekme Geçişi ─────────────────────────────
function switchTab(tabId) {
  // Panelleri gizle
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.remove('active');
  });

  // Nav öğelerini pasife al
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.remove('active');
  });

  // Hedef paneli göster
  const panel = document.getElementById('tab-' + tabId);
  if (panel) panel.classList.add('active');

  // Hedef nav öğesini aktif yap
  const navBtn = document.querySelector(`[data-tab="${tabId}"]`);
  if (navBtn) navBtn.classList.add('active');

  // Header başlığını güncelle
  updateHeader(tabId);

  if (tabId === 'announcements') markAnnouncementsSeen();
  if (tabId === 'messages') markMessagesSeen();
}

function updateHeader(tabId) {
  const titles = {
    home:          'Turizm Fakültesi',
    obs:           'OBS',
    announcements: 'Duyurular',
    messages:      'Mesajlar'
  };
  const subtitles = {
    home:          homeSubtitle(),
    obs:           'Öğrenci Bilgi Sistemi',
    announcements: 'Fakülte Duyuruları',
    messages:      'Gelen Kutusu'
  };

  const titleEl = document.querySelector('.header-title');
  const subtitleEl = document.querySelector('.header-subtitle');

  if (titleEl) titleEl.textContent = titles[tabId] || 'Turizm Fakültesi';
  if (subtitleEl) subtitleEl.textContent = subtitles[tabId] || homeSubtitle();
}

// ── Tarih ─────────────────────────────────────
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

// Ana sayfa başlığının alt satırı: "Öğrenci Portalı · 17 Ekim Cumartesi"
function homeSubtitle() {
  const now = new Date();
  return `Öğrenci Portalı · ${now.getDate()} ${MONTHS[now.getMonth()]} ${DAYS[now.getDay()]}`;
}

function updateDate() {
  if (document.getElementById('tab-home')?.classList.contains('active')) updateHeader('home');
}

function formatDate(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// ── OBS Giriş ─────────────────────────────────
// Giriş üniversitenin OBS sayfasında yapılır (öğrenci no + şifre ya da e-Devlet);
// e-Devlet oturumu yalnızca obs.adiyaman.edu.tr için açıldığından uygulamanın içine alınamaz
const OBS_LOGIN_URL = 'https://obs.adiyaman.edu.tr/oibs/std/login.aspx';

function openOBSLogin() {
  window.open(OBS_LOGIN_URL, '_blank', 'noopener');
}

// Örnek: OBS bağlı duruma geç (geliştirme için)
function connectOBS() {
  const connectScreen = document.getElementById('obsConnectScreen');
  const dashboard = document.getElementById('obsDashboard');
  if (connectScreen) connectScreen.hidden = true;
  if (dashboard) dashboard.hidden = false;
}

// ── Dış Linkler ───────────────────────────────
function openUniversity() {
  window.open('https://www.adiyaman.edu.tr', '_blank');
}

function openTourismDept() {
  window.open('https://turizm.adiyaman.edu.tr', '_blank');
}

// ── Bildirim Butonu ───────────────────────────
// Zil: bildirimler kapalıysa açmayı önerir, açıksa duyurulara gider
document.getElementById('notifBtn')?.addEventListener('click', () => {
  if (pushState === 'off' || pushState === 'error') showPushPrompt();
  else switchTab('announcements');
});

// ── Haberler: Üniversiteden / Fakülteden sekmeleri ──
const NEWS_LIMIT = 6;
const FEED_KEY = 'turizm:duyuruSekmesi';
const FEED_LINKS = {
  uni:     'https://adiyaman.edu.tr/tr/duyurular',
  fakulte: 'https://turizm.adiyaman.edu.tr/tr/duyurular'
};
let newsItems = null;
let currentFeed = storageGet(FEED_KEY) === 'uni' ? 'uni' : 'fakulte';

async function loadNews() {
  const list = document.getElementById('newsList');
  if (!list) return;
  try {
    const res = await fetch('/api/news');
    if (!res.ok) throw new Error(res.status);
    newsItems = await res.json();
    renderNews();
  } catch {
    if (!newsItems) list.replaceChildren(el('div', 'ann-empty', 'Duyurular yüklenemedi. Bağlantınızı kontrol edin.'));
  }
}

function selectFeed(feed) {
  currentFeed = feed;
  storageSet(FEED_KEY, feed);
  renderNews();
}

function renderNews() {
  const list = document.getElementById('newsList');
  document.querySelectorAll('.seg-btn').forEach(btn => {
    const active = btn.dataset.feed === currentFeed;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  const more = document.getElementById('newsMore');
  more.href = FEED_LINKS[currentFeed];
  if (!newsItems) return;

  const items = newsItems.filter(n => (n.feed || 'fakulte') === currentFeed);
  more.hidden = !items.length;
  if (!items.length) {
    list.replaceChildren(el('div', 'ann-empty', 'Henüz duyuru yok.'));
    return;
  }
  list.replaceChildren(...items.slice(0, NEWS_LIMIT).map(n => {
    const card = el(n.url ? 'a' : 'div', 'news-card');
    if (n.url) {
      card.href = n.url;
      card.target = '_blank';
      card.rel = 'noopener';
    }
    if (n.image) {
      const img = el('img', 'news-img');
      img.src = n.image;
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('error', () => img.remove());
      card.append(img);
    }
    const body = el('div', 'news-body');
    body.append(el('div', 'news-title', n.title));
    if (n.summary) body.append(el('div', 'news-summary', n.summary));
    const by = n.source !== 'site' ? n.author || 'Turizm Fakültesi'
      : n.feed === 'uni' ? 'Adıyaman Üniversitesi' : 'Turizm Fakültesi';
    body.append(el('div', 'news-meta', `${by} · ${formatDate(n.published_at)}`));
    card.append(body);
    return card;
  }));
}

document.querySelectorAll('.seg-btn').forEach(btn => {
  btn.addEventListener('click', () => selectFeed(btn.dataset.feed));
});
renderNews();

// ── Duyurular ─────────────────────────────────
const LAST_SEEN_KEY = 'turizm:sonGorulenDuyuru';
let latestAnnouncementId = 0;

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* gizli sekme vb. */ }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// Metindeki http(s):// ve www. adreslerini tıklanabilir bağlantıya çevirir (HTML yorumlanmaz)
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;
function linkify(node, text) {
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    // Cümle sonundaki noktalama bağlantıya dahil olmasın
    const url = m[0].replace(/[.,;:!?)\]'"»]+$/, '');
    node.append(text.slice(last, m.index));
    const a = el('a', 'text-link', url);
    a.href = /^www\./i.test(url) ? 'https://' + url : url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    node.append(a);
    last = m.index + url.length;
  }
  node.append(text.slice(last));
  return node;
}

async function loadAnnouncements() {
  const list = document.getElementById('annList');
  if (!list) return;
  try {
    const res = await fetch('/api/announcements');
    if (!res.ok) throw new Error(res.status);
    renderAnnouncements(await res.json());
  } catch {
    list.replaceChildren(el('div', 'ann-empty', 'Duyurular yüklenemedi. Bağlantınızı kontrol edin.'));
  }
}

function renderAnnouncements(items) {
  const list = document.getElementById('annList');
  const lastSeen = Number(storageGet(LAST_SEEN_KEY) || 0);

  if (!items.length) {
    list.replaceChildren(el('div', 'ann-empty', 'Henüz duyuru yok.'));
    updateUnreadBadges(0);
    return;
  }

  list.replaceChildren(...items.map(a => {
    const unread = a.id > lastSeen;
    const item = el('div', 'ann-item' + (unread ? ' unread' : ''));
    const content = el('div', 'ann-content');
    const meta = el('div', 'ann-meta');
    meta.append(el('span', 'ann-author', a.author), el('span', 'ann-date', formatDate(a.created_at)));
    content.append(el('div', 'ann-title', a.title), linkify(el('div', 'ann-body'), a.body), meta);
    item.append(el('div', 'ann-dot' + (unread ? '' : ' read')), content);
    return item;
  }));

  latestAnnouncementId = items[0].id;
  if (document.getElementById('tab-announcements')?.classList.contains('active')) {
    markAnnouncementsSeen();
  } else {
    updateUnreadBadges(items.filter(a => a.id > lastSeen).length);
  }
}

function markAnnouncementsSeen() {
  if (latestAnnouncementId) storageSet(LAST_SEEN_KEY, String(latestAnnouncementId));
  updateUnreadBadges(0);
}

function updateUnreadBadges(count) {
  for (const id of ['annBadge', 'notifBadge']) {
    const badge = document.getElementById(id);
    if (!badge) continue;
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.hidden = count === 0;
  }
}

// ── Mesajlar ──────────────────────────────────
const MSG_SEEN_KEY = 'turizm:okunanMesajlar';
const AVATAR_COLORS = ['#00407A', '#005F96', '#0870B4', '#2E7D32', '#6A1B9A', '#AD5A00', '#00796B'];
let messages = [];

function readMessageIds() {
  try { return new Set(JSON.parse(storageGet(MSG_SEEN_KEY) || '[]')); } catch { return new Set(); }
}

function avatarFor(name, node) {
  // Unvanları atla: "Prof. Dr. Ahmet" → "A"
  const initials = name.replace(/^(?:(?:Prof|Doç|Dr|Öğr|Üyesi|Gör|Arş)\.?\s+)+/i, '').trim();
  node.textContent = (initials[0] || name[0] || '?').toLocaleUpperCase('tr');
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  node.style.background = AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function formatMessageTime(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  const now = new Date();
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const days = Math.round((new Date(now.toDateString()) - new Date(d.toDateString())) / 86400000);
  if (days === 0) return `Bugün ${time}`;
  if (days === 1) return `Dün ${time}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

async function loadMessages() {
  const list = document.getElementById('msgList');
  if (!list) return;
  try {
    const res = await fetch('/api/messages');
    if (!res.ok) throw new Error(res.status);
    messages = await res.json();
    renderMessages();
  } catch {
    if (!messages.length) list.replaceChildren(el('div', 'ann-empty', 'Mesajlar yüklenemedi. Bağlantınızı kontrol edin.'));
  }
}

function renderMessages() {
  const list = document.getElementById('msgList');
  const read = readMessageIds();
  updateMessageBadge(messages.filter(m => !read.has(m.id)).length);
  if (!messages.length) {
    list.replaceChildren(el('div', 'ann-empty', 'Henüz mesaj yok.'));
    return;
  }
  list.replaceChildren(...messages.map(m => {
    const unread = !read.has(m.id);
    const item = el('button', 'msg-item' + (unread ? ' unread' : ''));
    item.type = 'button';
    const avatar = el('div', 'msg-avatar');
    avatarFor(m.author, avatar);
    const content = el('div', 'msg-content');
    const header = el('div', 'msg-header');
    header.append(el('span', 'msg-sender', m.author), el('span', 'msg-time', formatMessageTime(m.created_at)));
    content.append(header, el('div', 'msg-subject', m.title), el('div', 'msg-preview', m.body.replace(/\s+/g, ' ')));
    item.append(avatar, content);
    if (unread) item.append(el('div', 'msg-unread-dot'));
    item.addEventListener('click', () => openMessage(m));
    return item;
  }));
}

function updateMessageBadge(count) {
  const badge = document.getElementById('msgBadge');
  if (!badge) return;
  badge.textContent = count > 9 ? '9+' : String(count);
  badge.hidden = count === 0;
}

function openMessage(m) {
  const read = readMessageIds();
  read.add(m.id);
  // Yalnızca hâlâ listede olan mesajların kaydını tut
  storageSet(MSG_SEEN_KEY, JSON.stringify([...read].filter(id => messages.some(x => x.id === id))));
  renderMessages();

  avatarFor(m.author, document.getElementById('msgSheetAvatar'));
  document.getElementById('msgSheetSender').textContent = m.author;
  document.getElementById('msgSheetDate').textContent =
    new Date(m.created_at * 1000).toLocaleString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  document.getElementById('msgSheetTitle').textContent = m.title;
  const msgText = document.getElementById('msgSheetText');
  msgText.replaceChildren();
  linkify(msgText, m.body);
  const sheet = document.getElementById('msgSheet');
  sheet.hidden = false;
  sheet.querySelector('.msg-sheet-body').scrollTop = 0;
  // Telefonun geri tuşu mesajı kapatsın
  if (!history.state?.msg) history.pushState({ msg: m.id }, '');
  document.getElementById('msgSheetBack').focus();
}

function closeMessage() {
  document.getElementById('msgSheet').hidden = true;
}

function markMessagesSeen() {
  // Mesaj sekmesine girmek okumak sayılmaz; rozet açılan mesajlarla azalır
}

document.getElementById('msgSheetBack')?.addEventListener('click', () => {
  if (history.state?.msg) history.back();
  else closeMessage();
});
window.addEventListener('popstate', closeMessage);

// ── Push Bildirim Aboneliği ───────────────────
const PUSH_STATES = {
  off:     { desc: 'Yeni duyurular yayınlandığında bildirim alın.', btn: 'Aç' },
  on:      { desc: 'Bildirimler açık. Yeni duyurular size iletilecek.', btn: 'Kapat', secondary: true },
  busy:    { desc: null, btn: '…', disabled: true },
  denied:  { desc: 'Bildirim izni engellenmiş. Tarayıcı ayarlarından bu siteye izin verin.', btn: null },
  error:   { desc: 'Bildirimler açılamadı. Lütfen tekrar deneyin.', btn: 'Tekrar dene' },
  ios:     { desc: 'iPhone’da bildirim almak için önce Paylaş → Ana Ekrana Ekle ile uygulamayı yükleyin, sonra oradan açın.', btn: null }
};

let pushState = null;

function setPushState(state) {
  pushState = state;
  const s = PUSH_STATES[state];
  const desc = document.getElementById('pushDesc');
  const btn = document.getElementById('pushBtn');
  if (s.desc) desc.textContent = s.desc;
  btn.hidden = !s.btn;
  btn.textContent = s.btn || '';
  btn.disabled = !!s.disabled;
  btn.classList.toggle('secondary', !!s.secondary);
}

function base64UrlToBytes(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - str.length % 4) % 4);
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

const postJson = data => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});

async function initPush() {
  const card = document.getElementById('pushCard');
  if (!card) return;

  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!supported) {
    // iOS Safari'de push yalnızca ana ekrana eklenmiş uygulamada vardır
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
      card.hidden = false;
      setPushState('ios');
    }
    return;
  }

  card.hidden = false;
  document.getElementById('pushBtn').addEventListener('click', togglePush);
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // İzin kaldırıldıysa eski abonelik işe yaramaz
  if (sub && Notification.permission !== 'granted') {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  // Sunucu aboneliği silmiş olabilir; her açılışta yeniden bildir
  if (sub) fetch('/api/push/subscribe', postJson(sub.toJSON())).catch(() => {});
  setPushState(Notification.permission === 'denied' ? 'denied' : sub ? 'on' : 'off');
  maybeAskForPush();
}

// İlk açılışta (ve "Şimdi değil" denirse bir hafta sonra) bildirimleri açmayı öner
// Tarayıcıda verilen 'Şimdi değil' kurulan uygulamanın ilk açılışını etkilemesin diye ayrı anahtar
const PUSH_ASKED_KEY = 'turizm:bildirimSoruldu:uygulama';
const PUSH_ASK_AGAIN = 7 * 86400 * 1000;

function maybeAskForPush() {
  if (!isStandalone) return; // yalnızca ana ekrana kurulan uygulamada sorulur
  if (pushState !== 'off' || Notification.permission !== 'default') return;
  const asked = Number(storageGet(PUSH_ASKED_KEY) || 0);
  if (Date.now() - asked < PUSH_ASK_AGAIN) return;
  setTimeout(showPushPrompt, 1200);
}

function showPushPrompt() {
  const prompt = document.getElementById('pushPrompt');
  if (!prompt || pushState !== 'off' && pushState !== 'error') return;
  prompt.hidden = false;
  document.getElementById('pushPromptYes').focus();
}

function hidePushPrompt() {
  document.getElementById('pushPrompt').hidden = true;
  storageSet(PUSH_ASKED_KEY, String(Date.now()));
}

document.getElementById('pushPromptYes')?.addEventListener('click', async () => {
  hidePushPrompt();
  await togglePush();
});
document.getElementById('pushPromptNo')?.addEventListener('click', hidePushPrompt);

async function togglePush() {
  setPushState('busy');
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();

    if (existing) {
      await fetch('/api/push/unsubscribe', postJson({ endpoint: existing.endpoint })).catch(() => {});
      await existing.unsubscribe();
      setPushState('off');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setPushState(permission === 'denied' ? 'denied' : 'off');
      return;
    }

    const { key } = await (await fetch('/api/push/key')).json();
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(key)
    });
    const res = await fetch('/api/push/subscribe', postJson(sub.toJSON()));
    if (!res.ok) {
      await sub.unsubscribe();
      throw new Error(res.status);
    }
    setPushState('on');
  } catch {
    setPushState('error');
  }
}

// ── PWA Yükleme ───────────────────────────────
// Tarayıcıda üst çubukta "Uygulamayı İndir" düğmesi; kurulan uygulamada görünmez.
// Bildirim izni yalnızca kurulan uygulamada sorulur.
const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/.test(navigator.userAgent);
const installBtn = document.getElementById('installBtn');
let installEvent = null;

function showInstallBtn(show) {
  installBtn.hidden = isStandalone || !show;
}

// Yükleme düğmesi olmayan tarayıcılarda nasıl yükleneceğini anlatır
function installSteps() {
  const ua = navigator.userAgent;
  const share = 'Paylaş (□↑)';
  if (!isIos) {
    return ['Tarayıcının menüsünü (⋮ veya ≡) açın.', '"Uygulamayı yükle" ya da "Ana ekrana ekle"yi seçin.',
      'WhatsApp veya Instagram içinden açtıysanız önce "Chrome\'da aç"ı seçin.'];
  }
  // Uygulama içi tarayıcılarda (Instagram, Facebook, Google uygulaması…) ana ekrana ekleme yok
  if (/Instagram|FBAN|FBAV|GSA\/|Line\//.test(ua)) {
    return ['Sağ üstteki menüden (⋯) "Safari\'de aç"ı seçin.', 'Açılan Safari sayfasında "İndir"e yeniden dokunun.'];
  }
  if (/CriOS/.test(ua)) return [`Adres çubuğunun sağındaki ${share} simgesine dokunun.`, '"Ana Ekrana Ekle"yi seçin.', '"Ekle"ye dokunun.'];
  if (/FxiOS|EdgiOS/.test(ua)) return ['Alttaki menü (≡ veya ⋯) düğmesine dokunun.', `${share}'ı seçin.`, '"Ana Ekrana Ekle"ye dokunun.'];
  // Safari 26 ile Paylaş düğmesi ⋯ menüsünün içine taşındı
  const safari = Number(ua.match(/Version\/(\d+)/)?.[1] || 0);
  return safari >= 26
    ? ['Adres çubuğunun yanındaki ⋯ düğmesine dokunun.', `${share}'ı seçin.`,
       'Listede "Ana Ekrana Ekle"yi bulun (gerekirse "Daha Fazla"ya dokunun).', '"Ekle"ye dokunun.']
    : [`Alttaki ${share} düğmesine dokunun.`, 'Aşağı kaydırıp "Ana Ekrana Ekle"yi seçin.', '"Ekle"ye dokunun.'];
}

function showInstallHelp() {
  const box = document.getElementById('installPromptText');
  const ol = el('ol', 'prompt-steps');
  ol.append(...installSteps().map(s => el('li', null, s)));
  box.replaceChildren(ol);
  if (isIos) box.append(el('p', 'prompt-note', 'Bildirimler iPhone\'da yalnızca ana ekrana eklenen uygulamada çalışır.'));
  openInstallPrompt('Tamam', false);
}

// okLabel: ana düğme; withCancel: "Şimdi değil" görünsün mü; action: ana düğmeye basınca
let installPromptAction = null;
function openInstallPrompt(okLabel, withCancel, action = null) {
  installPromptAction = action;
  document.getElementById('installPromptOk').textContent = okLabel;
  document.getElementById('installPromptNo').hidden = !withCancel;
  document.getElementById('installPrompt').hidden = false;
  document.getElementById('installPromptOk').focus();
}

async function runInstall() {
  const e = installEvent;
  installEvent = null;
  e.prompt();
  const choice = await e.userChoice.catch(() => null);
  if (choice?.outcome === 'accepted') showInstallBtn(false);
}

installBtn.addEventListener('click', () => installEvent ? runInstall() : showInstallHelp());

document.getElementById('installPromptOk').addEventListener('click', () => {
  document.getElementById('installPrompt').hidden = true;
  if (installPromptAction) installPromptAction();
});
document.getElementById('installPromptNo').addEventListener('click', () => {
  document.getElementById('installPrompt').hidden = true;
});

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); // Chrome'un küçük çubuğu yerine kendi düğmemiz
  installEvent = e;
  showInstallBtn(true);
});

window.addEventListener('appinstalled', () => {
  installEvent = null;
  showInstallBtn(false);
});

// Kurulu uygulama sayımı: cihaz rastgele bir kimlik üretir, günde en fazla bir kez "açıldım" bildirir
function pingInstall() {
  if (!isStandalone) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem('turizm_ping') === today) return;
    let id = localStorage.getItem('turizm_device');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('turizm_device', id);
    }
    const platform = isIos ? 'ios' : isAndroid ? 'android' : 'other';
    fetch('/api/app/ping', postJson({ id, platform }))
      .then(res => { if (res.ok) localStorage.setItem('turizm_ping', today); })
      .catch(() => {});
  } catch {
    // Depolama kapalıysa sayım yapılmaz
  }
}

// iPhone'da ve yükleme sinyali vermeyen Android tarayıcılarında düğme tarif gösterir
if (isIos) showInstallBtn(true);
if (isAndroid && !isStandalone) {
  (async () => {
    try {
      // manifest'teki related_applications sayesinde kurulu uygulama burada görünür
      if (navigator.getInstalledRelatedApps && (await navigator.getInstalledRelatedApps()).length) return;
    } catch { /* desteklenmiyor */ }
    showInstallBtn(true);
  })();
}

// /indir bağlantısı (QR kod): yükleme penceresi doğrudan açılır.
// Tarayıcılar kurulumu ancak bir dokunuşla başlatır, bu yüzden tek düğmeli pencere gösterilir.
async function openInstallSheet() {
  if (!installEvent && !isIos) {
    // Chrome'un yükleme sinyalini kısa süre bekle
    await new Promise(resolve => {
      const t = setTimeout(resolve, 3000);
      window.addEventListener('beforeinstallprompt', () => { clearTimeout(t); resolve(); }, { once: true });
    });
    if (!installEvent) {
      try {
        if (navigator.getInstalledRelatedApps && (await navigator.getInstalledRelatedApps()).length) {
          document.getElementById('installPromptText').textContent =
            'Uygulama bu telefonda zaten yüklü. Ana ekranınızdaki Turizm Fakültesi simgesinden açabilirsiniz.';
          return openInstallPrompt('Tamam', false);
        }
      } catch { /* desteklenmiyor */ }
    }
  }
  if (!installEvent) return showInstallHelp();
  document.getElementById('installPromptText').textContent =
    'Duyurulara, mesajlara ve OBS\'ye ana ekranınızdan tek dokunuşla ulaşın; yeni duyurularda bildirim alın.';
  openInstallPrompt('Yükle', true, () => installEvent && runInstall());
}

if (new URLSearchParams(location.search).has('indir')) {
  history.replaceState(null, '', '/');
  if (!isStandalone) openInstallSheet();
}

if ('serviceWorker' in navigator) {
  // Sayfalar her açılışta sunucudan alındığı için yeni sürümde yenilemeye gerek yok
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW yoksa sessizce devam et
    });
  });
}

// ── Başlangıç ─────────────────────────────────
updateDate();
loadNews();
loadAnnouncements();
loadMessages();
initPush();
pingInstall();

// Bildirime tıklayınca /#duyurular ile açılır
if (location.hash === '#duyurular') switchTab('announcements');
if (location.hash === '#mesajlar') switchTab('messages');

// Uygulamaya geri dönülünce duyuruları tazele
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    loadAnnouncements();
    loadNews();
    loadMessages();
  }
});
