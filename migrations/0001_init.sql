-- turizm — ilk şema: yöneticiler, duyurular, push abonelikleri

CREATE TABLE admins (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  name       TEXT    NOT NULL,
  role       TEXT    NOT NULL DEFAULT 'admin' CHECK (role IN ('super', 'admin')),
  pass_hash  TEXT    NOT NULL,
  salt       TEXT    NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE announcements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  author     TEXT    NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE subscriptions (
  endpoint   TEXT    PRIMARY KEY,
  p256dh     TEXT    NOT NULL,
  auth       TEXT    NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Hatalı giriş denemeleri (IP başına, kaba kuvvet koruması)
CREATE TABLE login_fails (
  ip           TEXT    PRIMARY KEY,
  count        INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
