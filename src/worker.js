/* turizm — API Worker: duyurular, bildirim abonelikleri, yönetici paneli.
   /api/* dışındaki her istek public/ klasöründeki statik dosyalara gider. */

import { hashPassword, verifyPassword, createSession, readSession, SESSION_SECONDS } from './auth.js';
import { broadcast, isPushEndpoint } from './push.js';
import { syncNews, SYNC_EVERY, FEED_SQL, FEEDS_SIGNATURE } from './news.js';

const COOKIE = 'turizm_sid';
const MAX_LOGIN_FAILS = 5;
// IP değiştirerek sınırı aşmaya karşı hesap (e-posta) başına da sınır.
// Meşru yöneticinin yanlış yazarak kilitlenmemesi için eşik daha yüksek.
const MAX_LOGIN_FAILS_EMAIL = 20;
const LOGIN_FAIL_WINDOW = 15 * 60;
// Abonelik sel saldırısına karşı IP başına sınır. Kampüs WiFi'sinde çok sayıda
// öğrenci tek IP'den geldiği için bir sınıfın aynı anda kurulumunu engellemeyecek kadar geniş.
const MAX_SUBSCRIBES = 50;
const SUBSCRIBE_WINDOW = 10 * 60;
// Kurulu uygulama açılış sinyali: cihaz başına günde bir kez gelir; aynı gerekçeyle geniş tutuldu
const MAX_PINGS = 100;
const PING_WINDOW = 10 * 60;
const DAY = 24 * 60 * 60;
// Kayıtlı olmayan e-postada da şifre doğrulama süresi harcansın diye sahte özet
// (kullanıcı tespitine yol açan zaman sızıntısını önler). Gerçek bir şifreyle eşleşmez.
const DUMMY_SALT = '00000000000000000000000000000000';
const DUMMY_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Kısa indirme bağlantısı (QR kod buraya yönlenir)
    if (url.pathname === '/indir' || url.pathname === '/indir/') return Response.redirect(url.origin + '/?indir', 302);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    try {
      return await route(request, env, url, ctx);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'Sunucu hatası' }, 500);
    }
  },

  // Saatlik zamanlayıcı: fakülte sitesinden yeni haberleri çek
  async scheduled(event, env, ctx) {
    ctx.waitUntil(syncNews(env).then(r => console.log('Haber senkronu', r)));
  }
};

// ── Yardımcılar ───────────────────────────────
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
  });
}

async function readJson(request) {
  if (!(request.headers.get('Content-Type') || '').includes('application/json')) {
    throw new HttpError(415, 'JSON bekleniyor');
  }
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Geçersiz JSON');
  }
}

function text(value, max, field) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) throw new HttpError(400, `${field} boş olamaz`);
  if (s.length > max) throw new HttpError(400, `${field} en fazla ${max} karakter olabilir`);
  return s;
}

// Boş bırakılabilen https bağlantısı
function optionalUrl(value, field) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) return null;
  let u;
  try { u = new URL(s); } catch { throw new HttpError(400, `${field} geçerli bir bağlantı değil`); }
  if (u.protocol !== 'https:') throw new HttpError(400, `${field} https:// ile başlamalı`);
  if (u.href.length > 1000) throw new HttpError(400, `${field} çok uzun`);
  return u.href;
}

function optionalText(value, max, field) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (s.length > max) throw new HttpError(400, `${field} en fazla ${max} karakter olabilir`);
  return s;
}

function newPassword(value) {
  const s = typeof value === 'string' ? value : '';
  if (s.length < 10) throw new HttpError(400, 'Şifre en az 10 karakter olmalı');
  if (s.length > 200) throw new HttpError(400, 'Şifre çok uzun');
  return s;
}

const sessionCookie = (value, maxAge) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

// Duyuru ve mesaj türleri (tablo adları sabit; kullanıcıdan gelmez)
const POSTS = {
  announcements: { table: 'announcements', label: 'Duyuru', url: '/#duyurular', pushTitle: (a, t) => t },
  messages:      { table: 'messages',      label: 'Mesaj',  url: '/#mesajlar',  pushTitle: (a, t) => `${a}: ${t}` }
};

// Veritabanı güncellemesi henüz uygulanmamışsa (ör. messages tablosu yok) liste boş dönsün
function missingTable(err) {
  if (String(err).includes('no such table')) return { results: [] };
  throw err;
}

// Veritabanı güncellemesi (0004_stats) henüz uygulanmamışsa istatistikler sessizce atlansın
function missingStats(err) {
  if (/no such (table|column)/.test(String(err))) return null;
  throw err;
}

// ── Hız sınırı (login_fails tablosunu ortak kullanır; anahtar ör. 'login:<ip>', 'sub:<ip>') ──
async function rateLimited(env, key, max, windowSecs, now) {
  const row = await env.DB.prepare('SELECT count, window_start FROM login_fails WHERE ip = ?').bind(key).first();
  return !!(row && now - row.window_start < windowSecs && row.count >= max);
}

async function rateBump(env, key, windowSecs, now) {
  await env.DB.prepare(
    `INSERT INTO login_fails (ip, count, window_start) VALUES (?1, 1, ?2)
     ON CONFLICT(ip) DO UPDATE SET
       count = CASE WHEN ?2 - window_start >= ?3 THEN 1 ELSE count + 1 END,
       window_start = CASE WHEN ?2 - window_start >= ?3 THEN ?2 ELSE window_start END`
  ).bind(key, now, windowSecs).run();
}

async function hasTable(env, name) {
  return !!await env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").bind(name).first();
}

// Uygulamada görünecek gönderen adı; boşsa yöneticinin kendi adı
function senderName(value, admin) {
  return optionalText(value, 80, 'Gönderen adı') || admin.name;
}

const publicAdmin = a => ({ id: a.id, email: a.email, name: a.name, role: a.role });

async function currentAdmin(request, env) {
  const token = (request.headers.get('Cookie') || '')
    .split(/;\s*/)
    .find(c => c.startsWith(COOKIE + '='))
    ?.slice(COOKIE.length + 1);
  const session = await readSession(env.SESSION_SECRET, token);
  if (!session) return null;
  const admin = await env.DB.prepare('SELECT * FROM admins WHERE id = ?').bind(session.id).first();
  return admin && admin.pass_hash.startsWith(session.v) ? admin : null;
}

// ── Yönlendirme ───────────────────────────────
async function route(request, env, url, ctx) {
  const path = url.pathname;
  const method = request.method;

  // Başka sitelerden gelen yazma isteklerini reddet. Origin yoksa Referer'a düş;
  // ikisi de aynı kökenle eşleşmezse (ör. hiç yoksa) isteği reddet.
  if (method !== 'GET') {
    const origin = request.headers.get('Origin');
    const referer = request.headers.get('Referer');
    const sameOrigin = origin ? origin === url.origin
      : (referer ? referer.startsWith(url.origin + '/') : false);
    if (!sameOrigin) throw new HttpError(403, 'İzin verilmeyen kaynak');
  }

  // Herkese açık
  const publicPosts = path.match(/^\/api\/(announcements|messages)$/);
  if (publicPosts && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT id, title, body, author, created_at FROM ${POSTS[publicPosts[1]].table} ORDER BY id DESC LIMIT 50`
    ).all().catch(missingTable);
    return json(results);
  }

  if (path === '/api/news' && method === 'GET') {
    // Zamanlayıcı aksarsa yedek: son senkron eskiyse arka planda yenile
    // Kaynak listesi değiştiyse (yeni sürüm) de beklemeden yenile
    const { results: meta } = await env.DB.prepare(
      "SELECT key, value FROM meta WHERE key IN ('news_synced_at', 'news_feeds')"
    ).all();
    const last = meta.find(m => m.key === 'news_synced_at');
    const feeds = meta.find(m => m.key === 'news_feeds');
    if (!last || Date.now() / 1000 - Number(last.value) > SYNC_EVERY || feeds?.value !== FEEDS_SIGNATURE) {
      ctx.waitUntil(syncNews(env).catch(err => console.error('Haber senkronu', err)));
    }
    // Her sekme için en yeni 30 öğe
    const { results } = await env.DB.prepare(
      `SELECT id, source, feed, url, title, summary, image, author, published_at FROM (
         SELECT *, ${FEED_SQL} AS feed,
                ROW_NUMBER() OVER (PARTITION BY ${FEED_SQL} ORDER BY published_at DESC, id ASC) AS n
         FROM news WHERE hidden = 0
       ) WHERE n <= 30 ORDER BY published_at DESC, id ASC`
    ).all();
    return json(results);
  }

  if (path === '/api/push/key' && method === 'GET') return json({ key: env.VAPID_PUBLIC_KEY });

  if (path === '/api/push/subscribe' && method === 'POST') {
    const subIp = request.headers.get('CF-Connecting-IP') || 'bilinmiyor';
    const subNow = Math.floor(Date.now() / 1000);
    if (await rateLimited(env, 'sub:' + subIp, MAX_SUBSCRIBES, SUBSCRIBE_WINDOW, subNow)) {
      throw new HttpError(429, 'Çok fazla istek. Birazdan tekrar deneyin.');
    }
    await rateBump(env, 'sub:' + subIp, SUBSCRIBE_WINDOW, subNow);
    const { endpoint, keys } = await readJson(request);
    const valid = isPushEndpoint(endpoint) && endpoint.length <= 1000 &&
      typeof keys?.p256dh === 'string' && keys.p256dh.length <= 200 &&
      typeof keys?.auth === 'string' && keys.auth.length <= 100;
    if (!valid) throw new HttpError(400, 'Geçersiz abonelik');
    await env.DB.prepare(
      `INSERT INTO subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`
    ).bind(endpoint, keys.p256dh, keys.auth).run();
    return json({ ok: true });
  }

  // Kurulu uygulama açıldı: cihazı kaydet ya da son görülme zamanını güncelle
  if (path === '/api/app/ping' && method === 'POST') {
    const pingIp = request.headers.get('CF-Connecting-IP') || 'bilinmiyor';
    const now = Math.floor(Date.now() / 1000);
    if (await rateLimited(env, 'ping:' + pingIp, MAX_PINGS, PING_WINDOW, now)) {
      throw new HttpError(429, 'Çok fazla istek. Birazdan tekrar deneyin.');
    }
    await rateBump(env, 'ping:' + pingIp, PING_WINDOW, now);
    const { id, platform } = await readJson(request);
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id) || !['ios', 'android', 'other'].includes(platform)) {
      throw new HttpError(400, 'Geçersiz istek');
    }
    await env.DB.prepare(
      `INSERT INTO devices (id, platform, first_seen, last_seen) VALUES (?1, ?2, ?3, ?3)
       ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen, platform = excluded.platform`
    ).bind(id, platform, now).run().catch(missingStats);
    return json({ ok: true });
  }

  if (path === '/api/push/unsubscribe' && method === 'POST') {
    const { endpoint } = await readJson(request);
    await env.DB.prepare('DELETE FROM subscriptions WHERE endpoint = ?').bind(String(endpoint)).run();
    return json({ ok: true });
  }

  // Oturum sırrı tanımlı değilse yönetici uçları kapalı kalsın
  if (path.startsWith('/api/admin/') && !env.SESSION_SECRET) {
    throw new HttpError(503, 'Yönetici paneli henüz yapılandırılmadı');
  }

  // Yönetici — oturum gerektirmeyenler
  if (path === '/api/admin/login' && method === 'POST') return login(request, env);
  if (path === '/api/admin/logout' && method === 'POST') {
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
  }

  if (!path.startsWith('/api/admin/')) throw new HttpError(404, 'Bulunamadı');

  const admin = await currentAdmin(request, env);
  if (!admin) throw new HttpError(401, 'Giriş gerekli');

  if (path === '/api/admin/me' && method === 'GET') {
    const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM subscriptions').first();
    const now = Math.floor(Date.now() / 1000);
    const devices = await env.DB.prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(last_seen >= ?1), 0) AS active7,
              COALESCE(SUM(last_seen >= ?2), 0) AS active30,
              COALESCE(SUM(platform = 'ios'), 0) AS ios,
              COALESCE(SUM(platform = 'android'), 0) AS android
       FROM devices`
    ).bind(now - 7 * DAY, now - 30 * DAY).first().catch(missingStats);
    return json({ ...publicAdmin(admin), subscribers: n, devices });
  }

  // Duyurular ve mesajlar: aynı yapı, farklı tablo. Gönderen adını yönetici seçer.
  if (path === '/api/admin/senders' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT author FROM (
         SELECT author, created_at FROM announcements UNION ALL
         SELECT author, created_at FROM ${await hasTable(env, 'messages') ? 'messages' : 'announcements WHERE 0'} UNION ALL
         SELECT author, created_at FROM news WHERE source = 'manual' AND author IS NOT NULL
       ) GROUP BY author ORDER BY MAX(created_at) DESC LIMIT 30`
    ).all();
    const names = [admin.name, ...results.map(r => r.author)];
    return json([...new Set(names)]);
  }

  const postMatch = path.match(/^\/api\/admin\/(announcements|messages)(?:\/(\d+))?$/);
  if (postMatch) {
    const kind = POSTS[postMatch[1]];
    const id = postMatch[2] ? Number(postMatch[2]) : null;

    // Panel listesi: herkese açık listeye ek olarak bildirim sayılarını da içerir
    if (!id && method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT * FROM ${kind.table} ORDER BY id DESC LIMIT 50`
      ).all().catch(missingTable);
      return json(results);
    }

    if (!await hasTable(env, kind.table)) {
      throw new HttpError(503, 'Mesajlar henüz etkin değil: veritabanı güncellemesi (0003_messages) uygulanmalı');
    }

    if (!id && method === 'POST') {
      const data = await readJson(request);
      const title = text(data.title, 120, 'Başlık');
      const body = text(data.body, 2000, 'Metin');
      const author = senderName(data.sender, admin);
      const row = await env.DB.prepare(
        `INSERT INTO ${kind.table} (title, body, author) VALUES (?, ?, ?) RETURNING id`
      ).bind(title, body, author).first();
      const push = data.notify
        ? await broadcast(env, { title: kind.pushTitle(author, title), body: body.slice(0, 180), url: kind.url })
        : null;
      if (push) {
        await env.DB.prepare(`UPDATE ${kind.table} SET push_sent = ?, push_total = ? WHERE id = ?`)
          .bind(push.sent, push.total, row.id).run().catch(missingStats);
      }
      return json({ id: row.id, push }, 201);
    }

    if (id && method === 'PUT') {
      const data = await readJson(request);
      const row = await env.DB.prepare(
        `UPDATE ${kind.table} SET title = ?, body = ?, author = ? WHERE id = ? RETURNING id`
      ).bind(text(data.title, 120, 'Başlık'), text(data.body, 2000, 'Metin'), senderName(data.sender, admin), id).first();
      if (!row) throw new HttpError(404, `${kind.label} bulunamadı`);
      return json({ ok: true });
    }

    if (id && method === 'DELETE') {
      await env.DB.prepare(`DELETE FROM ${kind.table} WHERE id = ?`).bind(id).run();
      return json({ ok: true });
    }
  }

  // Haberler: panelden ekleme, düzenleme, gizleme; siteden elle senkron
  if (path === '/api/admin/news' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT id, source, ${FEED_SQL} AS feed, url, title, summary, image, author, published_at, hidden FROM news
       ORDER BY published_at DESC, id ASC LIMIT 150`
    ).all();
    const last = await env.DB.prepare("SELECT value FROM meta WHERE key = 'news_synced_at'").first();
    return json({ items: results, synced_at: last ? Number(last.value) : null });
  }

  if (path === '/api/admin/news' && method === 'POST') {
    const data = await readJson(request);
    const row = await env.DB.prepare(
      `INSERT INTO news (source, url, title, summary, image, author, published_at)
       VALUES ('manual', ?, ?, ?, ?, ?, unixepoch()) RETURNING id`
    ).bind(
      optionalUrl(data.url, 'Bağlantı'), text(data.title, 200, 'Başlık'),
      optionalText(data.summary, 600, 'Özet'), optionalUrl(data.image, 'Görsel'), senderName(data.sender, admin)
    ).first().catch(err => {
      if (String(err).includes('UNIQUE')) throw new HttpError(409, 'Bu bağlantıyla bir haber zaten var');
      throw err;
    });
    return json({ id: row.id }, 201);
  }

  if (path === '/api/admin/news/sync' && method === 'POST') {
    try {
      return json(await syncNews(env));
    } catch (err) {
      console.error(err);
      throw new HttpError(502, 'Fakülte sitesinden haberler alınamadı: ' + err.message);
    }
  }

  const newsMatch = path.match(/^\/api\/admin\/news\/(\d+)$/);
  if (newsMatch) {
    const id = Number(newsMatch[1]);
    const item = await env.DB.prepare('SELECT source FROM news WHERE id = ?').bind(id).first();
    if (!item) throw new HttpError(404, 'Haber bulunamadı');

    if (method === 'PUT') {
      const data = await readJson(request);
      if (typeof data.hidden === 'boolean') {
        await env.DB.prepare('UPDATE news SET hidden = ? WHERE id = ?').bind(data.hidden ? 1 : 0, id).run();
        return json({ ok: true });
      }
      // Siteden gelen haberin bağlantısı sabit kalır; tekrar eklenmeyi önleyen anahtar odur
      await env.DB.prepare(
        `UPDATE news SET title = ?1, summary = ?2, image = ?3,
           url = CASE WHEN source = 'site' THEN url ELSE ?4 END,
           author = CASE WHEN source = 'site' THEN author ELSE ?5 END
         WHERE id = ?6`
      ).bind(
        text(data.title, 200, 'Başlık'), optionalText(data.summary, 600, 'Özet'), optionalUrl(data.image, 'Görsel'),
        item.source === 'site' ? null : optionalUrl(data.url, 'Bağlantı'), senderName(data.sender, admin), id
      ).run().catch(err => {
        if (String(err).includes('UNIQUE')) throw new HttpError(409, 'Bu bağlantıyla bir haber zaten var');
        throw err;
      });
      return json({ ok: true });
    }

    // Siteden gelen haber silinirse bir sonraki senkronda geri gelir; bu yüzden gizlenir
    if (method === 'DELETE') {
      if (item.source === 'site') await env.DB.prepare('UPDATE news SET hidden = 1 WHERE id = ?').bind(id).run();
      else await env.DB.prepare('DELETE FROM news WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }
  }

  if (path === '/api/admin/notify' && method === 'POST') {
    const data = await readJson(request);
    return json(await broadcast(env, {
      title: text(data.title, 120, 'Başlık'),
      body: text(data.body, 300, 'Metin'),
      url: '/'
    }));
  }

  if (path === '/api/admin/password' && method === 'POST') {
    const data = await readJson(request);
    if (!await verifyPassword(String(data.current || ''), admin.pass_hash, admin.salt)) {
      throw new HttpError(400, 'Mevcut şifre yanlış');
    }
    const { hash, salt } = await hashPassword(newPassword(data.password));
    await env.DB.prepare('UPDATE admins SET pass_hash = ?, salt = ? WHERE id = ?').bind(hash, salt, admin.id).run();
    const token = await createSession(env.SESSION_SECRET, { id: admin.id, pass_hash: hash });
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(token, SESSION_SECONDS) });
  }

  // Yalnızca süper yönetici: yönetici ekle / sil
  if (path.startsWith('/api/admin/admins')) {
    if (admin.role !== 'super') throw new HttpError(403, 'Bu işlem için süper yönetici yetkisi gerekli');

    if (path === '/api/admin/admins' && method === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT id, email, name, role, created_at FROM admins ORDER BY id'
      ).all();
      return json(results);
    }

    if (path === '/api/admin/admins' && method === 'POST') {
      const data = await readJson(request);
      const email = text(data.email, 200, 'E-posta').toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Geçersiz e-posta');
      const name = text(data.name, 80, 'Ad');
      const role = data.role === 'super' ? 'super' : 'admin';
      const { hash, salt } = await hashPassword(newPassword(data.password));
      try {
        await env.DB.prepare(
          'INSERT INTO admins (email, name, role, pass_hash, salt) VALUES (?, ?, ?, ?, ?)'
        ).bind(email, name, role, hash, salt).run();
      } catch (err) {
        if (String(err).includes('UNIQUE')) throw new HttpError(409, 'Bu e-posta zaten kayıtlı');
        throw err;
      }
      return json({ ok: true }, 201);
    }

    const adminMatch = path.match(/^\/api\/admin\/admins\/(\d+)$/);
    if (adminMatch && method === 'DELETE') {
      const id = Number(adminMatch[1]);
      if (id === admin.id) throw new HttpError(400, 'Kendi hesabınızı silemezsiniz');
      await env.DB.prepare('DELETE FROM admins WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }
  }

  throw new HttpError(404, 'Bulunamadı');
}

// ── Giriş ─────────────────────────────────────
async function login(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'bilinmiyor';
  const now = Math.floor(Date.now() / 1000);

  if (await rateLimited(env, 'login:' + ip, MAX_LOGIN_FAILS, LOGIN_FAIL_WINDOW, now)) {
    throw new HttpError(429, 'Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin.');
  }

  const data = await readJson(request);
  const email = String(data.email || '').trim().toLowerCase();
  const emailKey = 'login:em:' + email;
  // Aynı hesaba farklı IP'lerden dağıtılmış denemeler de sınırlansın
  if (email && await rateLimited(env, emailKey, MAX_LOGIN_FAILS_EMAIL, LOGIN_FAIL_WINDOW, now)) {
    throw new HttpError(429, 'Bu hesap için çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin.');
  }

  const admin = await env.DB.prepare('SELECT * FROM admins WHERE email = ?').bind(email).first();
  // E-posta kayıtlı değilse de şifre doğrulaması çalıştırılır: yanıt süresi aynı kalsın,
  // böylece "bu e-posta kayıtlı mı" bilgisi zamanlamadan sızmasın.
  const ok = await verifyPassword(
    String(data.password || ''),
    admin ? admin.pass_hash : DUMMY_HASH,
    admin ? admin.salt : DUMMY_SALT
  ) && !!admin;

  if (!ok) {
    await rateBump(env, 'login:' + ip, LOGIN_FAIL_WINDOW, now);
    if (email) await rateBump(env, emailKey, LOGIN_FAIL_WINDOW, now);
    throw new HttpError(401, 'E-posta veya şifre hatalı');
  }

  await env.DB.batch([
    env.DB.prepare('DELETE FROM login_fails WHERE ip = ?').bind('login:' + ip),
    env.DB.prepare('DELETE FROM login_fails WHERE ip = ?').bind(emailKey)
  ]);
  const token = await createSession(env.SESSION_SECRET, admin);
  return json(publicAdmin(admin), 200, { 'Set-Cookie': sessionCookie(token, SESSION_SECONDS) });
}
