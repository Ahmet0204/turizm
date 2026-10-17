/* Haberler — ADYÜ sitelerinden otomatik çekme (sayfalar sunucuda HTML olarak listelenir, RSS yok).
   İki akış var; uygulamada ayrı sekmelerde gösterilir:
     uni     → https://adiyaman.edu.tr/tr/duyurular         (üniversitenin tüm birimlerinin duyuruları)
     fakulte → https://turizm.adiyaman.edu.tr/tr/duyurular  (fakültenin kendi duyuruları) */

const FACULTY_ORIGIN = 'https://turizm.adiyaman.edu.tr';
export const FEEDS = {
  uni:     { list: 'https://adiyaman.edu.tr/tr/duyurular', accept: u => u.hostname.endsWith('adiyaman.edu.tr') },
  fakulte: { list: FACULTY_ORIGIN + '/tr/duyurular',      accept: u => u.origin === FACULTY_ORIGIN }
};
const LIST_PAGES = 2;               // her senkronda akış başına ilk 2 sayfa (~24 öğe)
export const SYNC_EVERY = 3 * 3600; // istek anında yedek senkron aralığı (saniye)

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const MONTHS = { oca: 1, şub: 2, mar: 3, nis: 4, may: 5, haz: 6, tem: 7, ağu: 8, eyl: 9, eki: 10, kas: 11, ara: 12 };

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

// Liste sayfasındaki tarih kutusu (16 / Eki. / 2026); okunamazsa bağlantıdaki /YYYY/MM/DD/ kullanılır
function itemDate(inner, url) {
  const day = +decode(inner.match(/<span class="day">([\s\S]*?)<\/span>/)?.[1] || '');
  const mon = MONTHS[decode(inner.match(/<span class="month">([\s\S]*?)<\/span>/)?.[1] || '').toLocaleLowerCase('tr').slice(0, 3)];
  const year = +decode(inner.match(/<span\s+class="year">([\s\S]*?)<\/span>/)?.[1] || '');
  let parts = day && mon && year ? [year, mon, day] : null;
  if (!parts) {
    const m = url.pathname.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
    if (m) parts = [+m[1], +m[2], +m[3]];
  }
  // Saat bilgisi yok: Türkiye saatiyle öğlen 12:00 kabul edilir
  return parts ? Date.UTC(parts[0], parts[1] - 1, parts[2], 9) / 1000 : Math.floor(Date.now() / 1000);
}

// Liste sayfasındaki <div class="list-item"> bloklarını ayrıştırır
export function parseNewsList(html, feed) {
  const { list, accept } = FEEDS[feed];
  const items = [];
  const re = /<div class="list-item">\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  for (const [, href, inner] of html.matchAll(re)) {
    let url;
    try { url = new URL(decode(href), list); } catch { continue; }
    if (url.protocol !== 'https:' || !accept(url) || !/\/duyurular\/\d{4}\//.test(url.pathname)) continue;

    const title = decode(inner.match(/<span class="title">([\s\S]*?)<\/span>/)?.[1] || '');
    if (!title) continue;
    // Özetin sonundaki kategori etiketini (<span class="category">Genel</span>) at
    const summary = decode((inner.match(/<span class="summary">([\s\S]*?)<\/span>\s*$/)?.[1] || '')
      .replace(/<span class="category">[\s\S]*?<\/span>/g, ''));

    let image = inner.match(/<img[^>]*src="([^"]+)"/)?.[1] || null;
    if (image) {
      try {
        const u = new URL(encodeURI(decode(image)), list);
        image = u.protocol === 'https:' && u.hostname.endsWith('adiyaman.edu.tr') ? u.href : null;
      } catch {
        image = null;
      }
    }
    items.push({ url: url.href, title: title.slice(0, 300), summary: summary.slice(0, 600), image, published: itemDate(inner, url) });
  }
  return items;
}

async function fetchFeed(feed) {
  const found = [];
  for (let page = 1; page <= LIST_PAGES; page++) {
    const res = await fetch(`${FEEDS[feed].list}${page > 1 ? '?Page=' + page : ''}`, {
      headers: { 'User-Agent': 'TurizmFakultesiMobil/1.0 (+https://turizm.tokmak.workers.dev)' },
      cf: { cacheTtl: 600 }
    });
    if (!res.ok) throw new Error(`${FEEDS[feed].list} sayfa ${page}: HTTP ${res.status}`);
    const items = parseNewsList(await res.text(), feed);
    found.push(...items);
    if (!items.length) break;
  }
  if (!found.length) throw new Error(`${FEEDS[feed].list}: öğe bulunamadı (site yapısı değişmiş olabilir)`);
  return found;
}

export async function syncNews(env) {
  const found = [];
  const errors = [];
  for (const feed of Object.keys(FEEDS)) {
    try {
      found.push(...await fetchFeed(feed));
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
  const results = await env.DB.batch([
    // Önceki sürümlerde fakültenin "haberler" sayfasından çekilenleri temizle
    env.DB.prepare(`DELETE FROM news WHERE source = 'site' AND url LIKE ?`).bind(FACULTY_ORIGIN + '/tr/haberler/%'),
    ...found.map(n => stmt.bind(n.url, n.title, n.summary, n.image, n.published))
  ]);
  const added = results.slice(1).reduce((sum, r) => sum + (r.meta?.changes || 0), 0);

  await env.DB.prepare(
    `INSERT INTO meta (key, value) VALUES ('news_synced_at', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1`
  ).bind(String(Math.floor(Date.now() / 1000))).run();

  return { found: found.length, added, errors };
}

// Sekme bağlantıdan anlaşılır: fakülte sitesi ve panelden eklenenler "fakulte", diğer ADYÜ birimleri "uni"
export const FEED_SQL =
  `CASE WHEN source = 'site' AND url NOT LIKE '${FACULTY_ORIGIN}/%' THEN 'uni' ELSE 'fakulte' END`;
