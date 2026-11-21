-- Gambar pendukung soal dari naskah SAS. Disimpan sebagai JSON array URL
-- supaya satu soal dapat mempunyai lebih dari satu ilustrasi.
ALTER TABLE questions ADD COLUMN image_urls TEXT;
