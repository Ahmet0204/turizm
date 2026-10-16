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
}

function updateHeader(tabId) {
  const titles = {
    home:          'ADYÜ',
    obs:           'OBS',
    announcements: 'Duyurular',
    messages:      'Mesajlar'
  };
  const subtitles = {
    home:          'Adıyaman Üniversitesi',
    obs:           'Öğrenci Bilgi Sistemi',
    announcements: 'Fakülte Duyuruları',
    messages:      'Gelen Kutusu'
  };

  const titleEl = document.querySelector('.header-title');
  const subtitleEl = document.querySelector('.header-subtitle');

  if (titleEl) titleEl.textContent = titles[tabId] || 'ADYÜ';
  if (subtitleEl) subtitleEl.textContent = subtitles[tabId] || 'Adıyaman Üniversitesi';
}

// ── Tarih ─────────────────────────────────────
function updateDate() {
  const el = document.getElementById('welcomeDate');
  if (!el) return;
  const now = new Date();
  const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const months = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                  'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  el.innerHTML = `${days[now.getDay()]}<br>${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
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
