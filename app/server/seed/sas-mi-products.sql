-- Katalog SAS MI Semester 1. Aman dijalankan ulang pada environment apa pun.
INSERT INTO products (id, title, jenjang, mapel, price, strikethrough_price, pages, cover_label, cover_color, badge, active, category, description, external_url, created_at) VALUES
  ('sas-mi-k1-s1', 'Paket SAS MI Kelas 1 Semester 1', 'MI', 'Mapel MI', 15000, 25000, 12, 'SAS MI 1', '#177245', 'BARU', 1, 'MI', 'Paket latihan SAS MI Kelas 1 Semester 1 untuk Al-Quran Hadis, Akidah Akhlak, Fikih, dan Bahasa Arab. Tersedia Paket 1-3 dalam PDF siap cetak serta DOCX yang dapat diedit.', 'https://drive.google.com/drive/folders/13Ak_jGYUeRvAttMlTiq_GeDTfC8Y36Lw', datetime('now')),
  ('sas-mi-k2-s1', 'Paket SAS MI Kelas 2 Semester 1', 'MI', 'Mapel MI', 15000, 25000, 12, 'SAS MI 2', '#2273d8', 'BARU', 1, 'MI', 'Paket latihan SAS MI Kelas 2 Semester 1: Al-Quran Hadis, Akidah Akhlak, Fikih, dan Bahasa Arab. Berisi 300 butir latihan, PDF siap cetak, dan DOCX yang dapat diedit.', 'https://drive.google.com/drive/folders/1MHlOJTujyC_d-lDsyWxj5a80d8nAGcor', datetime('now')),
  ('sas-mi-k3-s1', 'Paket SAS MI Kelas 3 Semester 1', 'MI', 'Mapel MI', 15000, 25000, 15, 'SAS MI 3', '#159a68', 'BARU', 1, 'MI', 'Paket latihan SAS MI Kelas 3 Semester 1 untuk 5 mapel: Al-Quran Hadis, Akidah Akhlak, Fikih, Bahasa Arab, dan SKI. Berisi 15 paket latihan, 450 butir, PDF siap cetak, serta DOCX editabel.', 'https://drive.google.com/drive/folders/1s6tv_s8Gww37A1joDB04HtEtQtwA833j', datetime('now')),
  ('sas-mi-k4-s1', 'Paket SAS MI Kelas 4 Semester 1', 'MI', 'Mapel MI', 15000, 25000, 15, 'SAS MI 4', '#f2b33d', 'BARU', 1, 'MI', 'Paket latihan SAS MI Kelas 4 Semester 1 untuk 5 mapel: Al-Quran Hadis, Akidah Akhlak, Fikih, Bahasa Arab, dan SKI. Berisi 15 paket latihan, 450 butir, PDF siap cetak, serta DOCX editabel.', 'https://drive.google.com/drive/folders/1JboqnFj-eZHDByTP51CNYIgSOfDVHhNz', datetime('now')),
  ('sas-mi-k5-s1', 'Paket SAS MI Kelas 5 Semester 1', 'MI', 'Mapel MI', 15000, 25000, 15, 'SAS MI 5', '#7c5cbf', 'BARU', 1, 'MI', 'Paket latihan SAS MI Kelas 5 Semester 1 untuk 5 mapel: Al-Quran Hadis, Akidah Akhlak, Fikih, Bahasa Arab, dan SKI. Berisi 15 paket latihan, 450 butir, PDF siap cetak, serta DOCX editabel.', 'https://drive.google.com/drive/folders/1E8odrfaAtssx-UzubZNzVRUKZGnUbuTg', datetime('now')),
  ('sas-mi-k6-s1', 'Paket SAS MI Kelas 6 Semester 1', 'MI', 'Mapel MI', 15000, 25000, 15, 'SAS MI 6', '#e05252', 'BARU', 1, 'MI', 'Paket latihan SAS MI Kelas 6 Semester 1 untuk 5 mapel: Al-Quran Hadis, Akidah Akhlak, Fikih, Bahasa Arab, dan SKI. Berisi 15 paket latihan, 450 butir, PDF siap cetak, serta DOCX editabel.', 'https://drive.google.com/drive/folders/1XZXDoWgnIa5mZs7fOjdARFoZPuowKIEN', datetime('now'))
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title, jenjang = excluded.jenjang, mapel = excluded.mapel,
  price = excluded.price, strikethrough_price = excluded.strikethrough_price,
  pages = excluded.pages, cover_label = excluded.cover_label, cover_color = excluded.cover_color,
  badge = excluded.badge, active = excluded.active, category = excluded.category,
  description = excluded.description, external_url = excluded.external_url;

DELETE FROM product_images WHERE product_id IN ('sas-mi-k1-s1', 'sas-mi-k2-s1', 'sas-mi-k3-s1', 'sas-mi-k4-s1', 'sas-mi-k5-s1', 'sas-mi-k6-s1');

INSERT INTO product_images (product_id, url, kind, created_at) VALUES
  ('sas-mi-k1-s1', '/products/sas-mi-k1-feature.jpg', 'feature', datetime('now')), ('sas-mi-k1-s1', '/products/sas-mi-k1-gallery-1.jpg', 'gallery', datetime('now')),
  ('sas-mi-k2-s1', '/products/sas-mi-k2-feature.jpg', 'feature', datetime('now')), ('sas-mi-k2-s1', '/products/sas-mi-k2-gallery-1.jpg', 'gallery', datetime('now')),
  ('sas-mi-k3-s1', '/products/sas-mi-k3-feature.jpg', 'feature', datetime('now')), ('sas-mi-k3-s1', '/products/sas-mi-k3-gallery-1.jpg', 'gallery', datetime('now')),
  ('sas-mi-k4-s1', '/products/sas-mi-k4-feature.jpg', 'feature', datetime('now')), ('sas-mi-k4-s1', '/products/sas-mi-k4-gallery-1.jpg', 'gallery', datetime('now')),
  ('sas-mi-k5-s1', '/products/sas-mi-k5-feature.jpg', 'feature', datetime('now')), ('sas-mi-k5-s1', '/products/sas-mi-k5-gallery-1.jpg', 'gallery', datetime('now')),
  ('sas-mi-k6-s1', '/products/sas-mi-k6-feature.jpg', 'feature', datetime('now')), ('sas-mi-k6-s1', '/products/sas-mi-k6-gallery-1.jpg', 'gallery', datetime('now'));
