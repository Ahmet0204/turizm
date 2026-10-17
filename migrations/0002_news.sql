-- Haberler: fakülte sitesinden otomatik çekilenler (source = 'site') ve panelden eklenenler (source = 'manual')

CREATE TABLE news (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  source       TEXT    NOT NULL CHECK (source IN ('site', 'manual')),
  url          TEXT    UNIQUE,
  title        TEXT    NOT NULL,
  summary      TEXT    NOT NULL DEFAULT '',
  image        TEXT,
  author       TEXT,
  published_at INTEGER NOT NULL,
  hidden       INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX news_published ON news (hidden, published_at DESC);

-- Basit anahtar/değer: son senkron zamanı vb.
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
