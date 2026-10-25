-- Bölümler (src/departments.js): öğrenci bölümünü seçer, yönetici yalnızca kendi bölümüne gönderir.
-- department: bölüm anahtarı (isletme, gastronomi, rehberlik); boş = fakülte geneli / bölüm seçilmemiş.
-- Süper yöneticinin bölümü yoktur, her yere gönderebilir.

ALTER TABLE admins        ADD COLUMN department TEXT;
ALTER TABLE announcements ADD COLUMN department TEXT;
ALTER TABLE messages      ADD COLUMN department TEXT;
ALTER TABLE news          ADD COLUMN department TEXT;
ALTER TABLE subscriptions ADD COLUMN department TEXT;
ALTER TABLE devices       ADD COLUMN department TEXT;
