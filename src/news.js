/* Haberler — Turizm Fakültesi sitesinden otomatik çekme (sunucuda HTML olarak listelenir, RSS yok).
   İki akış var; uygulamada ayrı sekmelerde gösterilir:
     uni     → /tr/haberler   (üniversite genelindeki haberler de burada yayımlanıyor)
     fakulte → /tr/duyurular  (fakültenin kendi duyuruları) */

export const NEWS_SITE = 'https://turizm.adiyaman.edu.tr';
export const FEEDS = { uni: '/tr/haberler', fakulte: '/tr/duyurular' };
const LIST_PAGES = 2;               // her senkronda akış başına ilk 2 sayfa (~24 öğe)
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

// Liste sayfasındaki <div class="list-item"> bloklarını ayrıştırır.
// Yalnızca bu sitenin listPath altındaki sayfaları alınır; başka birimlere bağlananlar atlanır.
export function parseNewsList(html, listPath) {
  const items = [];
  const re = /<div class="list-item">\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  for (const [, href, inner] of html.matchAll(re)) {
    const date = href.match(/^\/tr\/[a-z-]+\/(\d{4})\/(\d{2})\/(\d{2})\//);
    if (!date || !href.startsWith(listPath + '/')) continue;
    const [, y, mo, d] = date;

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

async function fetchFeed(listPath) {
  const found = [];
  for (let page = 1; page <= LIST_PAGES; page++) {
    const res = await fetch(`${NEWS_SITE}${listPath}${page > 1 ? '?Page=' + page : ''}`, {
      headers: { 'User-Agent': 'TurizmFakultesiMobil/1.0 (+https://turizm.tokmak.workers.dev)' },
      cf: { cacheTtl: 600 }
    });
    if (!res.ok) throw new Error(`${listPath} sayfa ${page}: HTTP ${res.status}`);
    const items = parseNewsList(await res.text(), listPath);
    found.push(...items);
    if (!items.length) break;
  }
  if (!found.length) throw new Error(`${listPath}: öğe bulunamadı (site yapısı değişmiş olabilir)`);
  return found;
}

export async function syncNews(env) {
  const found = [];
  const errors = [];
  for (const listPath of Object.values(FEEDS)) {
    try {
      found.push(...await fetchFeed(listPath));
    } catch (err) {
      errors.push(err.message);
    }
  }
  if (!found.length) throw new Error(errors.join('; '));

  // Var olanlara dokunma: panelden yapılan düzenleme/gizleme korunur
  const stmt = env.DB.prepare(
    `INSERT INTO news (source, url, title, summary, image, published_at) VALUES ('site', ?, ?, ?, ?, ?)
     ON CONFLICT(url) DO NOTHING`
  );
  const results = await env.DB.batch(found.map(n => stmt.bind(n.url, n.title, n.summary, n.image, n.published)));
  const added = results.reduce((sum, r) => sum + (r.meta?.changes || 0), 0);

  await env.DB.prepare(
    `INSERT INTO meta (key, value) VALUES ('news_synced_at', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1`
  ).bind(String(Math.floor(Date.now() / 1000))).run();

  return { found: found.length, added, errors };
}

// Siteden gelen öğenin hangi sekmeye ait olduğu bağlantısından anlaşılır; panelden eklenenler fakülte sekmesindedir
export const FEED_SQL =
  `CASE WHEN source = 'site' AND url LIKE '${NEWS_SITE}${FEEDS.uni}/%' THEN 'uni' ELSE 'fakulte' END`;
