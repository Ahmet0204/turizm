-- Mesajlar: yöneticilerin tüm öğrencilere gönderdiği, açılıp okunabilen iletiler.
-- author: uygulamada görünecek gönderen adı (ör. "Bölüm Başkanı", "Prof. Dr. ..."), yönetici belirler.

CREATE TABLE messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  author     TEXT    NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
