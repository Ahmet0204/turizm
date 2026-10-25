/* Fakültenin aktif bölümleri. Anahtar veritabanında saklanır; slug fakülte sitesindeki adres parçasıdır
   (turizm.adiyaman.edu.tr/tr/bolumler/<slug>/duyurular). public/js/app.js içindeki DEPARTMENTS ile aynı tutulmalı. */

export const DEPARTMENTS = {
  isletme:    { name: 'Turizm İşletmeciliği',           slug: 'turizm-isletmeciligi' },
  gastronomi: { name: 'Gastronomi ve Mutfak Sanatları', slug: 'gastronomi-ve-mutfak-sanatlari' },
  rehberlik:  { name: 'Turizm Rehberliği',              slug: 'turizm-rehberligi' }
};

export const isDepartment = value => typeof value === 'string' && Object.hasOwn(DEPARTMENTS, value);
