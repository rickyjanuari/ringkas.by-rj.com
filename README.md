# ringkas.by-rj.com

**Ringkas** — Rangkuman Materi SD, SMP, SMA. Teman belajar anak yang mudah dipahami: rangkuman per bab, kuis, simulasi SAS/STS, flashcard, tracker belajar, dan worksheet.

> Repo ini berisi dokumentasi dan template email Ringkas, plus **aplikasi
> mandiri di `app/`** (SvelteKit + Hono + SQLite — pembangunan ulang orisinal
> dari spesifikasi aplikasi Ringkas, dibuat 2026-11-15). Aplikasi yang
> berjalan di hosting Muse (artifact `rangkuman-materi-app`) tetap terpisah:
> database dan akun di sana TIDAK ikut pindah — `app/` di-seed dari nol saat
> pertama dijalankan.

## Status

- Fokus sementara: **SD (Kelas 1–6)** — 13 produk di katalog pembeli (8 produk kelas + Matematika SD + Paket SAS per kelas 2–6 + Kumpulan Soal SAS & PAS Kelas 1). 38 produk SMP/SMA/TKA/UTBK/OSN disembunyikan sementara, bukan dihapus.
- Model bisnis: **beli per produk** (sekali bayar, Rp17–21 ribu) — bukan membership.
- Pembayaran: **KlikQRIS saja** (QRIS, bayar sekali per order).
- Email: **Resend** (paket gratis: 3.000 email/bulan, maks 100/hari), pengirim `halo@ringkas.by-rj.com` (domain `ringkas.by-rj.com` sudah verified).

## Fitur utama

- Katalog produk + pencarian pintar, detail produk, keranjang, checkout KlikQRIS, Pesanan Saya (struk PDF dari data asli).
- Ruang Belajar per produk: rangkuman per bab, kuis 10 soal, simulasi SAS per mapel (25/25/35/38/39/40 soal per Kelas 1–6), flashcard, rangkuman kilat, mode fokus.
- Latihan Harian 5 Menit, Misi & Stiker Digital, Kuis Suara (Bahasa Indonesia Kelas 1–2), Tracker & streak, Laporan Mingguan Orang Tua, Mode Orang Tua, Paket Guru/Kelas, Worksheet Printable, video per bab (iframe eksternal).
- Link eksternal produk (Google Drive / Canva / lainnya) — diisi admin per produk, hanya tampil untuk pembeli LUNAS.
- Nomor WhatsApp pembeli (opsional) + tombol "Kirim ke WhatsApp" di pesanan LUNAS (wa.me, pesan terisi otomatis berisi link produk).

## Isi repo

- `app/` — **aplikasi mandiri Ringkas** (SvelteKit + Hono + SQLite): katalog,
  auth, checkout KlikQRIS, Pesanan Saya + struk PDF, Ruang Belajar, simulasi
  SAS, tracker/streak, admin, Mode Orang Tua, Paket Guru/Kelas. Baca
  `app/README.md` untuk cara jalan, daftar env, dan status jujur v1
  (apa yang sudah jalan, apa yang masih stub — termasuk: pembayaran belum
  dites uang asli, email belum di-wire, konten Kelas 2–6 masih kerangka
  generator, hanya Kelas 1 ditulis penuh).
- `email-templates/` — 5 template email HTML Ringkas (selamat datang, QRIS menunggu bayar, pesanan lunas, pembayaran kedaluwarsa, laporan mingguan orang tua) + `README.md` berisi alur kirim dan variabel tiap template.
- `docs/resend-connector.md` — cara kerja konektor Resend (auth Bearer, endpoint, batas gratis, pemulihan error).
- `docs/` lainnya — catatan setup (ditambah seiring berjalan).

## Setup email (Resend)

1. Buat akun di [resend.com](https://resend.com) (gratis, tanpa kartu kredit).
2. Tambah domain `ringkas.by-rj.com` di Resend → Domains, pasang record DKIM + SPF (CNAME) di DNS.
3. Buat API key (permission **Sending access**), simpan di Secure Vault — **jangan pernah commit kunci ke repo ini**.
4. Kirim memakai helper `send_email.py` (ada di konektor, bukan di repo ini) dengan template di `email-templates/`.

## Keamanan — baca dulu

- **Jangan commit** API key Resend, API key / merchant ID KlikQRIS, password admin, token apa pun, atau file `.env` / database (`.db`). Lihat `.gitignore`.
- Semua kredensial tinggal di Secure Vault / server aplikasi, bukan di repo.
- Link produk eksternal (Drive/Canva) hanya dibagikan ke pembeli LUNAS lewat aplikasi dan email — jangan ditempel di repo publik ini.

## Domain & brand

- Aplikasi: `ringkas.by-rj.com` — logo: buku terbuka biru + centang kuning + daun hijau, wordmark "Ringkas" (tanpa subdomain di logo).
- Email pengirim: `halo@ringkas.by-rj.com`.
