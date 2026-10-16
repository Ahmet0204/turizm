/* turizm — API Worker: duyurular, bildirim abonelikleri, yönetici paneli.
   /api/* dışındaki her istek public/ klasöründeki statik dosyalara gider. */

import { hashPassword, verifyPassword, createSession, readSession, SESSION_SECONDS } from './auth.js';
import { broadcast, isPushEndpoint } from './push.js';

const COOKIE = 'turizm_sid';
const MAX_LOGIN_FAILS = 5;
const LOGIN_FAIL_WINDOW = 15 * 60;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    try {
      return await route(request, env, url);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'Sunucu hatası' }, 500);
    }
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

function newPassword(value) {
  const s = typeof value === 'string' ? value : '';
  if (s.length < 10) throw new HttpError(400, 'Şifre en az 10 karakter olmalı');
  if (s.length > 200) throw new HttpError(400, 'Şifre çok uzun');
  return s;
}

const sessionCookie = (value, maxAge) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

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
async function route(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  // Başka sitelerden gelen yazma isteklerini reddet
  const origin = request.headers.get('Origin');
  if (method !== 'GET' && origin && origin !== url.origin) throw new HttpError(403, 'İzin verilmeyen kaynak');

  // Herkese açık
  if (path === '/api/announcements' && method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT id, title, body, author, created_at FROM announcements ORDER BY id DESC LIMIT 50'
    ).all();
    return json(results);
  }

  if (path === '/api/push/key' && method === 'GET') return json({ key: env.VAPID_PUBLIC_KEY });

  if (path === '/api/push/subscribe' && method === 'POST') {
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
    return json({ ...publicAdmin(admin), subscribers: n });
  }

  if (path === '/api/admin/announcements' && method === 'POST') {
    const data = await readJson(request);
    const title = text(data.title, 120, 'Başlık');
    const body = text(data.body, 2000, 'Metin');
    const row = await env.DB.prepare(
      'INSERT INTO announcements (title, body, author) VALUES (?, ?, ?) RETURNING id'
    ).bind(title, body, admin.name).first();
    const push = data.notify ? await broadcast(env, { title, body: body.slice(0, 180), url: '/#duyurular' }) : null;
    return json({ id: row.id, push }, 201);
  }

  const annMatch = path.match(/^\/api\/admin\/announcements\/(\d+)$/);
  if (annMatch && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM announcements WHERE id = ?').bind(Number(annMatch[1])).run();
    return json({ ok: true });
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

  const fails = await env.DB.prepare('SELECT count, window_start FROM login_fails WHERE ip = ?').bind(ip).first();
  if (fails && now - fails.window_start < LOGIN_FAIL_WINDOW && fails.count >= MAX_LOGIN_FAILS) {
    throw new HttpError(429, 'Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin.');
  }

  const data = await readJson(request);
  const email = String(data.email || '').trim().toLowerCase();
  const admin = await env.DB.prepare('SELECT * FROM admins WHERE email = ?').bind(email).first();
  const ok = admin && await verifyPassword(String(data.password || ''), admin.pass_hash, admin.salt);

  if (!ok) {
    await env.DB.prepare(
      `INSERT INTO login_fails (ip, count, window_start) VALUES (?1, 1, ?2)
       ON CONFLICT(ip) DO UPDATE SET
         count = CASE WHEN ?2 - window_start >= ${LOGIN_FAIL_WINDOW} THEN 1 ELSE count + 1 END,
         window_start = CASE WHEN ?2 - window_start >= ${LOGIN_FAIL_WINDOW} THEN ?2 ELSE window_start END`
    ).bind(ip, now).run();
    throw new HttpError(401, 'E-posta veya şifre hatalı');
  }

  await env.DB.prepare('DELETE FROM login_fails WHERE ip = ?').bind(ip).run();
  const token = await createSession(env.SESSION_SECRET, admin);
  return json(publicAdmin(admin), 200, { 'Set-Cookie': sessionCookie(token, SESSION_SECONDS) });
}
