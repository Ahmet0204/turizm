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
}

function updateHeader(tabId) {
  const titles = {
    home:          'ADYÜ',
    obs:           'OBS',
    announcements: 'Duyurular',
    messages:      'Mesajlar'
  };
  const subtitles = {
    home:          'Turizm Fakültesi',
    obs:           'Öğrenci Bilgi Sistemi',
    announcements: 'Fakülte Duyuruları',
    messages:      'Gelen Kutusu'
  };

  const titleEl = document.querySelector('.header-title');
  const subtitleEl = document.querySelector('.header-subtitle');

  if (titleEl) titleEl.textContent = titles[tabId] || 'ADYÜ';
  if (subtitleEl) subtitleEl.textContent = subtitles[tabId] || 'Turizm Fakültesi';
}

// ── Tarih ─────────────────────────────────────
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

function updateDate() {
  const el = document.getElementById('welcomeDate');
  if (!el) return;
  const now = new Date();
  el.innerHTML = `${DAYS[now.getDay()]}<br>${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
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
document.getElementById('notifBtn')?.addEventListener('click', () => {
  switchTab('announcements');
});

// ── Haberler: Üniversiteden / Fakülteden sekmeleri ──
const NEWS_LIMIT = 6;
const FEED_KEY = 'turizm:duyuruSekmesi';
const FEED_LINKS = {
  uni:     'https://turizm.adiyaman.edu.tr/tr/haberler',
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
    const by = n.source === 'site' ? 'Turizm Fakültesi' : n.author || 'Turizm Fakültesi';
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

// ── Push Bildirim Aboneliği ───────────────────
const PUSH_STATES = {
  off:     { desc: 'Yeni duyurular yayınlandığında bildirim alın.', btn: 'Aç' },
  on:      { desc: 'Bildirimler açık. Yeni duyurular size iletilecek.', btn: 'Kapat', secondary: true },
  busy:    { desc: null, btn: '…', disabled: true },
  denied:  { desc: 'Bildirim izni engellenmiş. Tarayıcı ayarlarından bu siteye izin verin.', btn: null },
  error:   { desc: 'Bildirimler açılamadı. Lütfen tekrar deneyin.', btn: 'Tekrar dene' },
  ios:     { desc: 'iPhone’da bildirim almak için önce Paylaş → Ana Ekrana Ekle ile uygulamayı yükleyin, sonra oradan açın.', btn: null }
};

function setPushState(state) {
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
}

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
if ('serviceWorker' in navigator) {
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
initPush();

// Bildirime tıklayınca /#duyurular ile açılır
if (location.hash === '#duyurular') switchTab('announcements');

// Uygulamaya geri dönülünce duyuruları tazele
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    loadAnnouncements();
    loadNews();
  }
});
