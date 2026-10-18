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
function openOBSLogin() {
  // İleride WebView veya scraping ile entegre edilecek
  alert('E-Devlet giriş entegrasyonu yakında aktif olacak.');
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
    content.append(el('div', 'ann-title', a.title), el('div', 'ann-body', a.body), meta);
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
  document.getElementById('msgSheetText').textContent = m.body;
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
const PUSH_ASKED_KEY = 'turizm:bildirimSoruldu';
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
  if (!document.getElementById('installPrompt').hidden) return; // önce yükleme önerisi kapansın
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
// Tarayıcıdan açılınca "Uygulamayı yükleyin" önerisi; bildirim izni kurulan uygulamada sorulur.
// "Şimdi değil" denirse 7 gün sonra yeniden sorulur.
const INSTALL_ASKED_KEY = 'turizm:yuklemeSoruldu';
const INSTALL_ASK_AGAIN = 7 * 86400 * 1000;
const INSTALL_WAIT = 4000; // Chrome'un yükleme sinyali için beklenen süre
const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/.test(navigator.userAgent);
const installRecentlyAsked = () => Date.now() - Number(storageGet(INSTALL_ASKED_KEY) || 0) < INSTALL_ASK_AGAIN;
let installEvent = null;
// Öneri gösterildi ya da gerekmediği anlaşıldı
let installCheckDone = isStandalone || installRecentlyAsked() || !(isAndroid || isIos);

function finishInstallCheck() {
  installCheckDone = true;
}

function showInstallPrompt() {
  const prompt = document.getElementById('installPrompt');
  if (isStandalone || !prompt.hidden) return;
  if (installRecentlyAsked()) return finishInstallCheck();
  document.getElementById('pushPrompt').hidden = true; // ikisi üst üste açılmasın
  if (!installEvent) {
    // Yükleme düğmesi yok: tarayıcının menüsü tarif edilir
    document.getElementById('installPromptText').textContent = isIos
      ? 'Alttaki Paylaş düğmesine (kare ve yukarı ok) dokunun, ardından "Ana Ekrana Ekle"yi seçin. ' +
        'Bildirimler iPhone\'da yalnızca ana ekrana eklenen uygulamada çalışır.'
      : 'Tarayıcının menüsünü (⋮ veya ≡) açıp "Uygulamayı yükle" ya da "Ana ekrana ekle"yi seçin. ' +
        'WhatsApp veya Instagram içinden açtıysanız önce "Chrome\'da aç"ı seçin.';
    document.getElementById('installPromptYes').textContent = 'Tamam';
  }
  prompt.hidden = false;
  document.getElementById('installPromptYes').focus();
}

function hideInstallPrompt() {
  document.getElementById('installPrompt').hidden = true;
  storageSet(INSTALL_ASKED_KEY, String(Date.now()));
  finishInstallCheck();
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); // Chrome'un küçük çubuğu yerine kendi önerimizi göster
  installEvent = e;
  showInstallPrompt();
});

window.addEventListener('appinstalled', () => {
  installEvent = null;
  document.getElementById('installPrompt').hidden = true;
  finishInstallCheck();
});

document.getElementById('installPromptYes').addEventListener('click', async () => {
  const e = installEvent;
  installEvent = null;
  hideInstallPrompt();
  if (e) {
    e.prompt();
    await e.userChoice.catch(() => {});
  }
});
document.getElementById('installPromptNo').addEventListener('click', hideInstallPrompt);

// Yükleme sinyali gelmezse: iPhone'da ya da kurulu olmayan Android'de menü tarifini göster
if (!installCheckDone) {
  setTimeout(async () => {
    if (installEvent) return;
    try {
      // manifest'teki related_applications sayesinde kurulu uygulama burada görünür
      if (isAndroid && navigator.getInstalledRelatedApps && (await navigator.getInstalledRelatedApps()).length) {
        return finishInstallCheck();
      }
    } catch { /* desteklenmiyor */ }
    showInstallPrompt();
  }, isIos ? 1200 : INSTALL_WAIT);
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
