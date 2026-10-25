-- Kullanım istatistikleri: kurulu uygulamayı açan cihazlar ve bildirimin iletildiği cihaz sayısı.
-- devices.id: cihazın kendi ürettiği rastgele kimlik (kişisel bilgi içermez). Günde en fazla bir kez güncellenir.

CREATE TABLE devices (
  id         TEXT    PRIMARY KEY,
  platform   TEXT    NOT NULL CHECK (platform IN ('ios', 'android', 'other')),
  first_seen INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- push_total: gönderim anındaki abone sayısı, push_sent: bildirimin teslim edildiği cihaz sayısı.
-- Bildirimsiz gönderilenlerde ikisi de boş kalır.
ALTER TABLE announcements ADD COLUMN push_sent  INTEGER;
ALTER TABLE announcements ADD COLUMN push_total INTEGER;
ALTER TABLE messages      ADD COLUMN push_sent  INTEGER;
ALTER TABLE messages      ADD COLUMN push_total INTEGER;
