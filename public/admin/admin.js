/* ADYÜ Mobil — Yönetici Paneli */

const $ = sel => document.querySelector(sel);
let me = null;

const MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

function formatDate(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${time}`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

async function api(path, { method, body } = {}) {
  const res = await fetch(path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/admin/login') showLogin();
  if (!res.ok) throw new Error(data.error || 'İşlem başarısız');
  return data;
}

// Form gönderimini ortak hâle getirir: butonu kilitler, mesajı gösterir
function handleForm(form, action) {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const msg = form.querySelector('.msg');
    btn.disabled = true;
    msg.className = 'msg';
    msg.textContent = '';
    try {
      const text = await action(Object.fromEntries(new FormData(form)), form);
      msg.className = 'msg ok';
      msg.textContent = text || 'Tamam';
    } catch (err) {
      msg.className = 'msg err';
      msg.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
}

function pushSummary(r) {
  if (!r.total) return 'Henüz bildirim açan kimse yok.';
  let s = `${r.sent} kişiye bildirim gitti`;
  if (r.failed) s += `, ${r.failed} başarısız`;
  if (r.removed) s += ` (${r.removed} geçersiz abonelik temizlendi)`;
  return s + '.';
}

// ── Görünümler ────────────────────────────────
function showLogin() {
  me = null;
  $('#panelView').hidden = true;
  $('#logoutBtn').hidden = true;
  $('#loginView').hidden = false;
  $('#whoami').textContent = 'Turizm Fakültesi';
}

async function showPanel(admin) {
  me = admin;
  $('#loginView').hidden = true;
  $('#panelView').hidden = false;
  $('#logoutBtn').hidden = false;
  $('#whoami').textContent = `${admin.name} · ${admin.role === 'super' ? 'Süper yönetici' : 'Yönetici'}`;
  $('#adminsCard').hidden = admin.role !== 'super';
  await Promise.all([refreshMe(), loadAnnouncements(), admin.role === 'super' ? loadAdmins() : null]);
}

async function refreshMe() {
  const data = await api('/api/admin/me');
  $('#subCount').textContent = `(${data.subscribers} abone)`;
}

async function loadAnnouncements() {
  const list = $('#annList');
  const items = await api('/api/announcements');
  if (!items.length) {
    list.replaceChildren(el('li', 'empty', 'Henüz duyuru yok.'));
    return;
  }
  list.replaceChildren(...items.map(a => {
    const li = el('li');
    const main = el('div', 'item-main');
    main.append(el('div', 'item-title', a.title), el('div', 'item-meta', `${a.author} · ${formatDate(a.created_at)}`));
    main.append(el('div', 'item-body', a.body));
    const edit = el('button', 'edit-btn', 'Düzenle');
    edit.type = 'button';
    edit.addEventListener('click', () => startEdit(a));
    const del = el('button', 'del-btn', 'Sil');
    del.type = 'button';
    del.addEventListener('click', async () => {
      if (!confirm(`"${a.title}" duyurusu silinsin mi?`)) return;
      del.disabled = true;
      try {
        await api(`/api/admin/announcements/${a.id}`, { method: 'DELETE' });
        if (editingId === a.id) stopEdit();
        await loadAnnouncements();
      } catch (err) {
        alert(err.message);
        del.disabled = false;
      }
    });
    const actions = el('div', 'item-actions');
    actions.append(edit, del);
    li.append(main, actions);
    return li;
  }));
}

// Duyuru düzenleme: "Yeni duyuru" formunu düzenleme moduna alır
let editingId = null;

function startEdit(a) {
  const form = $('#annForm');
  editingId = a.id;
  form.title.value = a.title;
  form.body.value = a.body;
  $('#annFormTitle').textContent = 'Duyuruyu düzenle';
  $('#annSubmit').textContent = 'Kaydet';
  $('#notifyRow').hidden = true;
  $('#annCancel').hidden = false;
  form.querySelector('.msg').textContent = '';
  $('#annCard').scrollIntoView({ behavior: 'smooth' });
  form.title.focus({ preventScroll: true });
}

function stopEdit() {
  const form = $('#annForm');
  editingId = null;
  form.reset();
  form.notify.checked = true;
  $('#annFormTitle').textContent = 'Yeni duyuru';
  $('#annSubmit').textContent = 'Yayınla';
  $('#notifyRow').hidden = false;
  $('#annCancel').hidden = true;
}

$('#annCancel').addEventListener('click', () => {
  stopEdit();
  $('#annForm').querySelector('.msg').textContent = '';
});

async function loadAdmins() {
  const admins = await api('/api/admin/admins');
  $('#adminList').replaceChildren(...admins.map(a => {
    const li = el('li');
    const main = el('div', 'item-main');
    const title = el('div', 'item-title', a.name);
    if (a.role === 'super') title.append(el('span', 'role', 'Süper'));
    main.append(title, el('div', 'item-meta', a.email));
    li.append(main);
    if (a.id !== me.id) {
      const del = el('button', 'del-btn', 'Yetkiyi kaldır');
      del.type = 'button';
      del.addEventListener('click', async () => {
        if (!confirm(`${a.name} (${a.email}) yönetici olmaktan çıkarılsın mı?`)) return;
        del.disabled = true;
        try {
          await api(`/api/admin/admins/${a.id}`, { method: 'DELETE' });
          await loadAdmins();
        } catch (err) {
          alert(err.message);
          del.disabled = false;
        }
      });
      li.append(del);
    }
    return li;
  }));
}

// ── Formlar ───────────────────────────────────
handleForm($('#loginForm'), async (data, form) => {
  const admin = await api('/api/admin/login', { body: data });
  form.reset();
  await showPanel(admin);
  return '';
});

handleForm($('#annForm'), async (data, form) => {
  if (editingId) {
    await api(`/api/admin/announcements/${editingId}`, { method: 'PUT', body: { title: data.title, body: data.body } });
    stopEdit();
    await loadAnnouncements();
    return 'Duyuru güncellendi.';
  }
  const res = await api('/api/admin/announcements', {
    body: { title: data.title, body: data.body, notify: data.notify === 'on' }
  });
  form.reset();
  form.notify.checked = true;
  await loadAnnouncements();
  return 'Duyuru yayınlandı.' + (res.push ? ' ' + pushSummary(res.push) : '');
});

handleForm($('#notifyForm'), async (data, form) => {
  const res = await api('/api/admin/notify', { body: data });
  form.reset();
  return pushSummary(res);
});

handleForm($('#adminForm'), async (data, form) => {
  await api('/api/admin/admins', { body: data });
  form.reset();
  await loadAdmins();
  return `${data.name} yönetici olarak eklendi. Giriş adresi: ${location.origin}/admin/`;
});

handleForm($('#passwordForm'), async (data, form) => {
  await api('/api/admin/password', { body: data });
  form.reset();
  return 'Şifreniz değiştirildi.';
});

$('#logoutBtn').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
  showLogin();
});

// ── Başlangıç ─────────────────────────────────
api('/api/admin/me').then(showPanel).catch(showLogin);
