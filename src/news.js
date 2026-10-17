/* Haberler — Turizm Fakültesi sitesindeki duyurulardan otomatik çekme.
   Kaynak: https://turizm.adiyaman.edu.tr/tr/duyurular (sunucuda HTML olarak listelenir, RSS yok).
   Sitenin "haberler" sayfası üniversite genelindeki haberleri de içerdiği için kullanılmıyor. */

export const NEWS_SITE = 'https://turizm.adiyaman.edu.tr';
const LIST_PATH = '/tr/duyurular';
const LIST_PAGES = 2;          // her senkronda ilk 2 sayfa (~24 haber)
export const SYNC_EVERY = 3 * 3600; // istek anında yedek senkron aralığı (saniye)

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(s) {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

// Liste sayfasındaki <div class="list-item"> bloklarını ayrıştırır
export function parseNewsList(html) {
  const items = [];
  const re = /<div class="list-item">\s*<a[^>]*href="(\/tr\/duyurular\/(\d{4})\/(\d{2})\/(\d{2})\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  for (const m of html.matchAll(re)) {
    const [, href, y, mo, d, inner] = m;
    const title = decode(inner.match(/<span class="title">([\s\S]*?)<\/span>/)?.[1] || '');
    if (!title) continue;
    // Özetin sonundaki kategori etiketini (<span class="category">Genel</span>) at
    const summary = decode((inner.match(/<span class="summary">([\s\S]*?)<\/span>\s*$/)?.[1] || '')
      .replace(/<span class="category">[\s\S]*?<\/span>/g, ''));
    let image = inner.match(/<img[^>]*src="([^"]+)"/)?.[1] || null;
    if (image) {
      try {
        const u = new URL(encodeURI(decode(image)), NEWS_SITE);
        image = u.protocol === 'https:' && u.hostname.endsWith('adiyaman.edu.tr') ? u.href : null;
      } catch {
        image = null;
      }
    }
    // Saat bilgisi yok: Türkiye saatiyle öğlen 12:00 kabul edilir
    const published = Date.UTC(+y, +mo - 1, +d, 9) / 1000;
    items.push({ url: NEWS_SITE + href, title: title.slice(0, 300), summary: summary.slice(0, 600), image, published });
  }
  return items;
}

export async function syncNews(env) {
  const found = [];
  for (let page = 1; page <= LIST_PAGES; page++) {
    const res = await fetch(`${NEWS_SITE}${LIST_PATH}${page > 1 ? '?Page=' + page : ''}`, {
      headers: { 'User-Agent': 'TurizmFakultesiMobil/1.0 (+https://turizm.tokmak.workers.dev)' },
      cf: { cacheTtl: 600 }
    });
    if (!res.ok) throw new Error(`Duyuru sayfası ${page}: HTTP ${res.status}`);
    const items = parseNewsList(await res.text());
    found.push(...items);
    if (!items.length) break;
  }
  if (!found.length) throw new Error('Duyuru listesinde öğe bulunamadı (site yapısı değişmiş olabilir)');

  // Var olanlara dokunma: panelden yapılan düzenleme/gizleme korunur
  const stmt = env.DB.prepare(
    `INSERT INTO news (source, url, title, summary, image, published_at) VALUES ('site', ?, ?, ?, ?, ?)
     ON CONFLICT(url) DO NOTHING`
  );
  const results = await env.DB.batch([
    // Önceki sürümde "haberler" sayfasından çekilenleri temizle
    env.DB.prepare(`DELETE FROM news WHERE source = 'site' AND url NOT LIKE ?`).bind(NEWS_SITE + LIST_PATH + '/%'),
    ...found.map(n => stmt.bind(n.url, n.title, n.summary, n.image, n.published))
  ]);
  const added = results.slice(1).reduce((sum, r) => sum + (r.meta?.changes || 0), 0);

  await env.DB.prepare(
    `INSERT INTO meta (key, value) VALUES ('news_synced_at', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1`
  ).bind(String(Math.floor(Date.now() / 1000))).run();

  return { found: found.length, added };
}
