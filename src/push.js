/* turizm — Web Push gönderimi (RFC 8291 aes128gcm şifreleme + RFC 8292 VAPID) */

import { b64url } from './auth.js';

const enc = new TextEncoder();

// Abonelik uç noktası yalnızca bilinen push servislerine izin verilir
const PUSH_HOSTS = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'web.push.apple.com',
  'notify.windows.com'
];

export function isPushEndpoint(endpoint) {
  try {
    const { protocol, hostname } = new URL(endpoint);
    return protocol === 'https:' && PUSH_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

// ── Şifreleme ─────────────────────────────────
async function encrypt(sub, plaintext) {
  const uaPublic = b64url.decode(sub.p256dh);
  const authSecret = b64url.decode(sub.auth);

  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce }, key, concat(enc.encode(plaintext), new Uint8Array([2]))
  ));

  // Başlık: salt(16) | kayıt boyutu(4) | anahtar uzunluğu(1) | sunucu açık anahtarı(65)
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, ciphertext);
}

// ── VAPID ─────────────────────────────────────
let vapidKey;

async function vapidAuthorization(env, endpoint) {
  vapidKey ??= crypto.subtle.importKey(
    'jwk', JSON.parse(env.VAPID_PRIVATE_JWK), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );
  const part = obj => b64url.encode(enc.encode(JSON.stringify(obj)));
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: env.VAPID_SUBJECT
  })}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await vapidKey, enc.encode(unsigned));
  return `vapid t=${unsigned}.${b64url.encode(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}

async function sendOne(env, sub, message) {
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(env, sub.endpoint),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'normal'
    },
    body: await encrypt(sub, JSON.stringify(message))
  });
  return res.status;
}

// Abonelere gönderir (department verilirse yalnızca o bölümü seçenlere); süresi dolan abonelikleri (404/410) siler
export async function broadcast(env, message, department = null) {
  const { results } = await (department
    ? env.DB.prepare('SELECT endpoint, p256dh, auth FROM subscriptions WHERE department = ?').bind(department)
    : env.DB.prepare('SELECT endpoint, p256dh, auth FROM subscriptions')
  ).all();
  const gone = [];
  let sent = 0;

  // Workers aynı anda en fazla 6 dış bağlantı açar
  for (let i = 0; i < results.length; i += 6) {
    const batch = results.slice(i, i + 6);
    const statuses = await Promise.all(batch.map(s => sendOne(env, s, message).catch(() => 0)));
    statuses.forEach((status, j) => {
      if (status >= 200 && status < 300) sent++;
      else if (status === 404 || status === 410) gone.push(batch[j].endpoint);
    });
  }

  if (gone.length) {
    await env.DB.batch(gone.map(e => env.DB.prepare('DELETE FROM subscriptions WHERE endpoint = ?').bind(e)));
  }
  return { total: results.length, sent, failed: results.length - sent, removed: gone.length };
}
