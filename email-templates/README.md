# Email Ringkas via Resend (gratis)

Template email transaksional Ringkas + cara kirimnya lewat Resend.
Provider: **Resend** — paket gratis: **3.000 email/bulan, maks 100 email/hari**, tanpa kartu kredit.
API: `POST https://api.resend.com/emails` dengan header `Authorization: Bearer <API key>`.

## Template (di `templates/`, HTML responsif, tema Ringkas: biru #2273d8, kuning #ffc531, hijau #159a68)

| # | File | Dipakai saat | Subject | Variabel utama |
|---|------|--------------|---------|----------------|
| 1 | `01-selamat-datang.html` | Akun baru terdaftar | Selamat datang di Ringkas! | `nama`, `email`, `url_katalog`, `url_aplikasi` |
| 2 | `02-pesanan-menunggu-bayar.html` | Checkout berhasil, QRIS dibuat | Pesananmu menunggu pembayaran — {{order_id}} | `nama`, `email`, `order_id`, `produk`, `harga`, `kode_unik`, `total`, `batas_bayar`, `url_pesanan` |
| 3 | `03-pesanan-lunas.html` | Webhook/polling KlikQRIS PAID | Pembayaran lunas — {{produk}} sudah terbuka! | `nama`, `email`, `order_id`, `produk`, `tanggal_bayar`, `total`, `url_belajar`, `url_struk`, `url_produk` (link eksternal produk: Google Drive/Canva/lainnya, diisi admin per produk; kalau produk tidak punya link eksternal, isi dengan `url_belajar`) |
| 4 | `04-pembayaran-kedaluwarsa.html` | QRIS kedaluwarsa / order batal | Pembayaranmu kedaluwarsa — {{order_id}} | `nama`, `email`, `order_id`, `produk`, `total`, `batas_bayar`, `url_katalog` |
| 5 | `05-laporan-mingguan-orang-tua.html` | Laporan mingguan (Mode Orang Tua) | Laporan belajar mingguan {{nama_anak}} | `nama_orang_tua`, `email`, `nama_anak`, `periode_minggu`, `bab_selesai`, `streak_hari`, `rata_simulasi`, `pencapaian_1`, `pencapaian_2`, `bab_lemah`, `target_harian`, `url_laporan` |

Semua data di atas **diisi dari data asli**: order dari database Ringkas + total KlikQRIS (`total_amount`, sudah termasuk kode unik). Jangan pernah mengisi angka contoh ke template yang dikirim ke pembeli.

## Pengirim (from)

- **Sebelum domain diverifikasi:** hanya bisa kirim dari `onboarding@resend.dev`, dan hanya **ke alamat email akun Resend** (untuk uji coba).
- **Setelah domain diverifikasi:** kirim dari `halo@ringkas.by-rj.com`. Domain `ringkas.by-rj.com` sudah **verified** di Resend (2026-11-15, DKIM + 2 SPF CNAME terverifikasi). Domain induk `by-rj.com` masih **pending** (DKIM/SPF belum terverifikasi, hanya MX inbound yang verified) — jangan pakai pengirim `@by-rj.com` dulu.

## Alur di aplikasi Ringkas (yang harus disambungkan sesudah kunci tersimpan)

1. `register` → kirim template 1.
2. `checkout` (QRIS dibuat) → kirim template 2.
3. Webhook KlikQRIS / polling `checkPaymentStatus` berubah PENDING → PAID → kirim template 3 (sekali saja, idempotent per `order_id` — sama seperti fulfillment order).
4. QRIS kedaluwarsa → kirim template 4.
5. Cron mingguan → kirim template 5 ke orang tua yang mengaktifkan laporan (data sama seperti Laporan Mingguan di aplikasi).

## Kirim manual (setelah konektor `custom.resend` tersimpan)

Helper di `../custom-connectors/custom.resend/bin/send_email.py` — pakai konektor, kunci tidak pernah tertulis di file:

```bash
python3 ~/workspace/custom-connectors/custom.resend/bin/send_email.py \
  --to pembeli@example.com \
  --from "Ringkas <halo@by-rj.com>" \
  --subject "Pembayaran lunas — ..." \
  --template ~/workspace/ringkas-email/templates/03-pesanan-lunas.html \
  --vars '{"nama":"Ricky","order_id":"RM-...","produk":"...","tanggal_bayar":"...","total":"Rp29.331","url_belajar":"...","url_struk":"...","email":"pembeli@example.com"}'
```

Resend mengembalikan `{"id": "..."}` per email. Simpan `id` itu bersama `order_id` supaya pengiriman bisa dilacak dan tidak ganda.

## Batas gratis — yang perlu diingat

- 100/hari: di hari ramai (mis. sehari sebelum SAS) kiriman bisa mentok; email lunas harus didahulukan dari laporan mingguan.
- Setiap penerima (To/CC/BCC) dihitung 1 email.
- Log Resend hanya tersimpan 30 hari.
- Pencapaian: semua template di-render lokal dulu (placeholder terisi) sebelum dikirim — jangan kirim template dengan `{{...}}` yang masih kosong.
