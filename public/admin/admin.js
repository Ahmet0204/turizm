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

// Metindeki http(s):// ve www. adreslerini tıklanabilir bağlantıya çevirir (uygulamadakiyle aynı)
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;
function linkify(node, text) {
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
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
  // Listeler bölüm adlarını kullandığı için önce bölüm bilgisi gelsin
  await refreshMe();
  if (admin.role !== 'super') $('#whoami').textContent = `${admin.name} · ${deptName(admin.department)} yöneticisi`;
  await Promise.all([loadPosts('announcements'), loadPosts('messages'), loadNews(), loadSenders(),
    admin.role === 'super' ? loadAdmins() : null]);
}

// ── Bölümler ──────────────────────────────────
// Süper yönetici hedefi seçer (boş = fakülte geneli); bölüm yöneticisinin hedefi kendi bölümüdür
let departments = {};
let subscribers = { total: 0, byDepartment: {} };
const deptName = key => key ? departments[key] || key : 'Fakülte geneli';

function option(value, label) {
  const o = el('option', null, label);
  o.value = value;
  return o;
}

function fillDepartmentSelects() {
  const super_ = me.role === 'super';
  document.querySelectorAll('.dept-select').forEach(sel => {
    const keep = sel.value;
    sel.replaceChildren(...(super_
      ? [option('', 'Fakülte geneli (tüm öğrenciler)'), ...Object.entries(departments).map(([k, n]) => option(k, n))]
      : [option(me.department || '', me.department ? deptName(me.department) : 'Hesabınıza bölüm atanmamış')]));
    if (super_) sel.value = keep;
    sel.disabled = !super_;
  });
  $('#adminDeptSelect').replaceChildren(...Object.entries(departments).map(([k, n]) => option(k, n)));
  updateSubCounts();
}

// "Bildirim olarak da gönder (N abone)": seçilen hedefe göre
function updateSubCounts() {
  document.querySelectorAll('.sub-count').forEach(n => {
    const d = n.closest('form').department.value;
    n.textContent = `(${d ? subscribers.byDepartment[d] || 0 : subscribers.total} abone)`;
  });
}

document.querySelectorAll('.dept-select').forEach(sel => sel.addEventListener('change', updateSubCounts));

async function refreshMe() {
  const data = await api('/api/admin/me');
  departments = data.departments || {};
  subscribers = { total: data.subscribers, byDepartment: data.subscribersByDepartment || {} };
  fillDepartmentSelects();
  const d = data.devices;
  const stat = (num, label) => {
    const box = el('div', 'stat');
    box.append(el('div', 'stat-num', String(num)), el('div', 'stat-label', label));
    return box;
  };
  $('#usageStats').replaceChildren(...(d
    ? [stat(d.total, `Kurulu uygulama (iPhone ${d.ios}, Android ${d.android})`), stat(d.active30, 'Son 30 günde açan'),
       stat(d.active7, 'Son 7 günde açan'), stat(data.subscribers, 'Bildirimi açık')]
    : [stat(data.subscribers, 'Bildirimi açık')]));
  // Bölümlere göre kurulu uygulama sayısı
  const byDept = d?.byDepartment || {};
  $('#usageDepts').textContent = d
    ? 'Bölümlere göre kurulu uygulama: ' + [...Object.keys(departments).map(k => `${departments[k]} ${byDept[k] || 0}`),
        `Bölüm seçmemiş ${byDept[''] || 0}`].join(' · ')
    : '';
}

function pushStat(a) {
  if (a.push_total == null) return '';
  return a.push_total ? ` · Bildirim: ${a.push_sent}/${a.push_total} cihaza iletildi` : ' · Bildirim: abone yoktu';
}

// ── Duyurular ve mesajlar: aynı form/liste yapısı ──
const POSTS = {
  announcements: { p: 'ann',  noun: 'duyuru', newTitle: 'Yeni duyuru', editTitle: 'Duyuruyu düzenle', submit: 'Yayınla', done: 'Duyuru yayınlandı.' },
  messages:      { p: 'msgs', noun: 'mesaj',  newTitle: 'Yeni mesaj',  editTitle: 'Mesajı düzenle',   submit: 'Gönder',  done: 'Mesaj gönderildi.' }
};
const editing = { announcements: null, messages: null };
const postForm = kind => $(`#${POSTS[kind].p}Form`);

async function loadPosts(kind) {
  const k = POSTS[kind];
  const list = $(`#${k.p}List`);
  const items = await api(`/api/admin/${kind}`);
  if (!items.length) {
    list.replaceChildren(el('li', 'empty', `Henüz ${k.noun} yok.`));
    return;
  }
  list.replaceChildren(...items.map(a => {
    const li = el('li');
    const main = el('div', 'item-main');
    const title = el('div', 'item-title', a.title);
    if (me.role === 'super') title.append(el('span', 'role' + (a.department ? '' : ' muted-role'), deptName(a.department)));
    main.append(title, el('div', 'item-meta', `${a.author} · ${formatDate(a.created_at)}${pushStat(a)}`));
    main.append(linkify(el('div', 'item-body'), a.body));
    const edit = el('button', 'edit-btn', 'Düzenle');
    edit.type = 'button';
    edit.addEventListener('click', () => startPostEdit(kind, a));
    const del = el('button', 'del-btn', 'Sil');
    del.type = 'button';
    del.addEventListener('click', async () => {
      if (!confirm(`"${a.title}" ${k.noun} silinsin mi?`)) return;
      del.disabled = true;
      try {
        await api(`/api/admin/${kind}/${a.id}`, { method: 'DELETE' });
        if (editing[kind] === a.id) stopPostEdit(kind);
        await loadPosts(kind);
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

// Düzenleme: "Yeni …" formunu düzenleme moduna alır
function startPostEdit(kind, a) {
  const k = POSTS[kind];
  const form = postForm(kind);
  editing[kind] = a.id;
  if (me.role === 'super') form.department.value = a.department || '';
  form.sender.value = a.author;
  form.title.value = a.title;
  form.body.value = a.body;
  $(`#${k.p}FormTitle`).textContent = k.editTitle;
  $(`#${k.p}Submit`).textContent = 'Kaydet';
  $(`#${k.p}NotifyRow`).hidden = true;
  $(`#${k.p}Cancel`).hidden = false;
  form.querySelector('.msg').textContent = '';
  $(`#${k.p}Card`).scrollIntoView({ behavior: 'smooth' });
  form.title.focus({ preventScroll: true });
}

function stopPostEdit(kind) {
  const k = POSTS[kind];
  const form = postForm(kind);
  editing[kind] = null;
  form.reset();
  form.notify.checked = true;
  $(`#${k.p}FormTitle`).textContent = k.newTitle;
  $(`#${k.p}Submit`).textContent = k.submit;
  $(`#${k.p}NotifyRow`).hidden = false;
  $(`#${k.p}Cancel`).hidden = true;
  updateSubCounts();
}

for (const kind of Object.keys(POSTS)) {
  $(`#${POSTS[kind].p}Cancel`).addEventListener('click', () => {
    stopPostEdit(kind);
    postForm(kind).querySelector('.msg').textContent = '';
  });

  handleForm(postForm(kind), async data => {
    const body = { department: data.department, sender: data.sender, title: data.title, body: data.body };
    if (editing[kind]) {
      await api(`/api/admin/${kind}/${editing[kind]}`, { method: 'PUT', body });
      stopPostEdit(kind);
      await Promise.all([loadPosts(kind), loadSenders()]);
      return 'Kaydedildi.';
    }
    const res = await api(`/api/admin/${kind}`, { body: { ...body, notify: data.notify === 'on' } });
    stopPostEdit(kind);
    await Promise.all([loadPosts(kind), loadSenders()]);
    return POSTS[kind].done + (res.push ? ' ' + pushSummary(res.push) : '');
  });
}

// Gönderen adı önerileri
async function loadSenders() {
  const names = await api('/api/admin/senders');
  $('#senderList').replaceChildren(...names.map(n => {
    const o = document.createElement('option');
    o.value = n;
    return o;
  }));
}

async function loadAdmins() {
  const admins = await api('/api/admin/admins');
  $('#adminList').replaceChildren(...admins.map(a => {
    const li = el('li');
    const main = el('div', 'item-main');
    const title = el('div', 'item-title', a.name);
    if (a.role === 'super') title.append(el('span', 'role', 'Süper'));
    main.append(title, el('div', 'item-meta', a.role === 'super' ? a.email : `${a.email} · ${deptName(a.department)}`));
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

// ── Haberler ──────────────────────────────────
let editingNewsId = null;

async function loadNews() {
  const { items, synced_at } = await api('/api/admin/news');
  $('#newsSynced').textContent = synced_at ? `Son çekme: ${formatDate(synced_at)}` : 'Henüz siteden çekilmedi';
  const list = $('#newsList');
  if (!items.length) {
    list.replaceChildren(el('li', 'empty', 'Henüz haber yok.'));
    return;
  }
  list.replaceChildren(...items.map(n => {
    const li = el('li', n.hidden ? 'is-hidden' : '');
    const main = el('div', 'item-main');
    const title = el('div', 'item-title', n.title);
    title.append(el('span', 'role', n.feed === 'uni' ? 'Üniversite' : departments[n.feed] || 'Fakülte'));
    if (n.source !== 'site') title.append(el('span', 'role muted-role', 'Panel'));
    if (n.hidden) title.append(el('span', 'role muted-role', 'Gizli'));
    main.append(title, el('div', 'item-meta', `${n.source === 'site' ? 'Fakülte sitesi' : n.author} · ${formatDate(n.published_at)}`));

    const actions = el('div', 'item-actions');
    const edit = el('button', 'edit-btn', 'Düzenle');
    edit.type = 'button';
    edit.addEventListener('click', () => startNewsEdit(n));
    actions.append(edit);

    const btn = (label, className, confirmText, request) => {
      const b = el('button', className, label);
      b.type = 'button';
      b.addEventListener('click', async () => {
        if (confirmText && !confirm(confirmText)) return;
        b.disabled = true;
        try {
          await api(`/api/admin/news/${n.id}`, request);
          if (editingNewsId === n.id) stopNewsEdit();
          await loadNews();
        } catch (err) {
          alert(err.message);
          b.disabled = false;
        }
      });
      return b;
    };
    if (n.source === 'site') {
      actions.append(n.hidden
        ? btn('Göster', 'edit-btn', null, { method: 'PUT', body: { hidden: false } })
        : btn('Gizle', 'del-btn', `"${n.title}" uygulamada gizlensin mi?`, { method: 'PUT', body: { hidden: true } }));
    } else {
      actions.append(btn('Sil', 'del-btn', `"${n.title}" haberi silinsin mi?`, { method: 'DELETE' }));
    }
    li.append(main, actions);
    return li;
  }));
}

function startNewsEdit(n) {
  const form = $('#newsForm');
  editingNewsId = n.id;
  // Siteden gelen haberin sekmesi bağlantısından belirlenir, değiştirilemez
  form.department.value = departments[n.feed] ? n.feed : '';
  form.department.disabled = me.role !== 'super' || n.source === 'site';
  form.sender.value = n.source === 'site' ? '' : n.author || '';
  form.sender.disabled = n.source === 'site';
  form.title.value = n.title;
  form.summary.value = n.summary || '';
  form.url.value = n.url || '';
  form.url.disabled = n.source === 'site'; // siteden gelen haberin bağlantısı değiştirilemez
  form.image.value = n.image || '';
  $('#newsFormTitle').textContent = 'Haberi düzenle';
  $('#newsSubmit').textContent = 'Kaydet';
  $('#newsCancel').hidden = false;
  form.querySelector('.msg').textContent = '';
  $('#newsCard').scrollIntoView({ behavior: 'smooth' });
  form.title.focus({ preventScroll: true });
}

function stopNewsEdit() {
  editingNewsId = null;
  $('#newsForm').reset();
  $('#newsForm').url.disabled = false;
  $('#newsForm').sender.disabled = false;
  $('#newsForm').department.disabled = me.role !== 'super';
  $('#newsFormTitle').textContent = 'Haber ekle';
  $('#newsSubmit').textContent = 'Ekle';
  $('#newsCancel').hidden = true;
}

$('#newsCancel').addEventListener('click', () => {
  stopNewsEdit();
  $('#newsForm').querySelector('.msg').textContent = '';
});

$('#newsSyncBtn').addEventListener('click', async () => {
  const b = $('#newsSyncBtn');
  const msg = $('#newsSyncMsg');
  b.disabled = true;
  msg.className = 'msg';
  msg.textContent = 'Çekiliyor…';
  try {
    const r = await api('/api/admin/news/sync', { method: 'POST' });
    msg.className = 'msg ok';
    msg.textContent = `Sitede ${r.found} haber bulundu, ${r.added} yeni haber eklendi.`;
    await loadNews();
  } catch (err) {
    msg.className = 'msg err';
    msg.textContent = err.message;
  } finally {
    b.disabled = false;
  }
});

handleForm($('#newsForm'), async data => {
  if (editingNewsId) {
    await api(`/api/admin/news/${editingNewsId}`, { method: 'PUT', body: data });
    stopNewsEdit();
    await loadNews();
    return 'Haber güncellendi.';
  }
  await api('/api/admin/news', { body: data });
  stopNewsEdit();
  await Promise.all([loadNews(), loadSenders()]);
  return 'Haber eklendi.';
});

// ── Formlar ───────────────────────────────────
handleForm($('#loginForm'), async (data, form) => {
  const admin = await api('/api/admin/login', { body: data });
  form.reset();
  await showPanel(admin);
  return '';
});

handleForm($('#notifyForm'), async (data, form) => {
  const res = await api('/api/admin/notify', { body: data });
  form.reset();
  return pushSummary(res);
});

// Süper yöneticinin bölümü olmaz
const toggleAdminDept = () => { $('#adminDeptRow').hidden = $('#adminForm').role.value === 'super'; };
$('#adminForm').role.addEventListener('change', toggleAdminDept);

handleForm($('#adminForm'), async (data, form) => {
  await api('/api/admin/admins', { body: data });
  form.reset();
  toggleAdminDept();
  await loadAdmins();
  return `${data.name} ${data.role === 'super' ? 'süper yönetici' : deptName(data.department) + ' yöneticisi'} olarak eklendi. Giriş adresi: ${location.origin}/admin/`;
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
