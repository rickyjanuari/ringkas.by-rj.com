// seed/anbk.ts — Bank soal Simulasi ANBK Kelas 5 (ORISINAL).
//
// Dua simulasi, masing-masing 20 soal, 60 menit, product_id "k5":
//   - anbk-literasi : Literasi / membaca (2 teks bacaan orisinal)
//   - anbk-numerasi : Numerasi (soal kontekstual: belanja, jarak, waktu, data)
//
// SEMUA SOAL ORISINAL — ditulis dari nol untuk Ringkas, bukan salinan soal
// ANBK resmi. Gaya teman-belajar: kalimat pendek, satu ide per kalimat,
// tanpa nama tokoh, tanpa sapaan bergender.
//
// Komposisi per paket (20 soal, max_points 34):
//   PG 7 × 1 poin | PG kompleks 2 × 2 poin | B/S 5 × 1 poin |
//   Isian 3 × 1 poin | Uraian 2 × 5 poin | Menjodohkan 1 × 5 poin.
// Poin mengikuti konvensi simulasi Kelas 5 di API_CONTRACT.md
// (PG 1, PG kompleks 2, B/S 1, Menjodohkan 5, Isian 1, Uraian 5).
//
// VERIFIKASI KUNCI: semua kunci dihitung manual satu per satu saat
// penulisan (perkalian/pembagian/jarak/waktu dihitung ulang; pernyataan
// B/S diperiksa terhadap teks; kunci isian/uraian dicocokkan dengan teks
// atau hitungan). Lihat laporan akhir Worker A untuk rincian per soal.
//
// Teks bacaan disisipkan di awal tiap soal yang merujuk teks itu, karena
// runner simulasi menampilkan satu soal per layar — anak harus bisa
// membaca ulang teksnya di soal mana pun.
//
// Dipakai dua arah (keduanya TIDAK mengubah seed yang sudah ada):
//   1. Seed database baru — server/seed/seed.ts memanggil insertSimulation
//      untuk tiap entri ANBK_SIMULATIONS (lihat snippet wiring di laporan).
//   2. Migrasi 0012 untuk DB yang sudah ter-seed — SQL lengkap ada di
//      laporan akhir Worker A (dibangkitkan dari data ini, bukan diketik
//      ulang, supaya tidak ada selisih ketik).

import type { GeneratedQuestion } from "./study.js";

export interface AnbkSimulationSeed {
  id: string;
  product_id: string;
  subject: string;
  grade: number;
  paket: string;
  title: string;
  total_minutes: number;
  questions: GeneratedQuestion[];
}

/** Rentang id eksplisit untuk soal ANBK di migrasi 0012. Seed yang sudah
 *  ada memakai id 1–3396 (lihat server/seed/seed.sql), jadi 10000+ aman
 *  dari tabrakan dan dari id AUTOINCREMENT berikutnya. */
export const ANBK_QUESTION_ID_START = 10000;

// ---------------------------------------------------------------------------
// Pembantu lokal (cermin kecil helper di study.ts — berkas ini mandiri).
// ---------------------------------------------------------------------------

function pg(
  question: string,
  options: string[],
  answerIdx: number,
  discussion: string
): GeneratedQuestion {
  return { type: "pg", question, options, answer: options[answerIdx], discussion, points: 1 };
}

function pk(
  question: string,
  options: string[],
  correct: string[],
  discussion: string
): GeneratedQuestion {
  return { type: "pg_kompleks", question, options, answer: correct, discussion, points: 2 };
}

function bs(question: string, answer: "Benar" | "Salah", discussion: string): GeneratedQuestion {
  return { type: "bs", question, options: null, answer, discussion, points: 1 };
}

function isian(question: string, answer: string, discussion: string): GeneratedQuestion {
  return { type: "isian", question, options: null, answer, discussion, points: 1 };
}

function uraian(question: string, keywords: string[], discussion: string): GeneratedQuestion {
  return { type: "uraian", question, options: null, answer: keywords, discussion, points: 5 };
}

function mj(
  question: string,
  left: string[],
  right: string[],
  answer: Record<string, string>,
  discussion: string
): GeneratedQuestion {
  return {
    type: "menjodohkan",
    question,
    options: { left, right },
    answer,
    discussion,
    points: 5
  };
}

// ---------------------------------------------------------------------------
// LITERASI — Teks 1: Taman Baca di Gang Melati (~158 kata)
// ---------------------------------------------------------------------------

const TEKS_1 =
  "Di ujung Gang Melati ada sebuah rumah kecil. Rumah itu punya rak buku di teras. " +
  "Setiap sore, rak itu dibuka untuk anak-anak. Buku-buku di sana boleh dibaca gratis. " +
  "Ada buku cerita, buku gambar, dan buku pengetahuan. " +
  "Taman baca itu dibuat oleh warga. Mereka mengumpulkan buku bekas yang masih bagus. " +
  "Mereka juga membuat rak dari kayu bekas. Setiap minggu, ada yang datang membawa buku baru. " +
  "Anak-anak datang dari berbagai gang. Mereka membaca sambil duduk di tikar. " +
  "Kadang mereka membaca bersama. Kadang mereka bercerita tentang buku yang dibaca. " +
  "Suasana di sana tenang dan ramah. " +
  "Suatu hari, rak buku itu hampir kosong. Banyak buku dipinjam dan belum kembali. " +
  "Warga lalu membuat aturan baru. Buku boleh dipinjam paling lama satu minggu. " +
  "Nama peminjam ditulis di buku catatan. Sejak itu, buku-buku kembali tepat waktu. " +
  "Setiap bulan, warga mengadakan acara membaca bersama. Mereka memilih satu buku cerita. " +
  "Buku itu dibaca keras-keras secara bergiliran. Anak-anak mendengarkan dengan saksama. " +
  "Setelah itu, mereka menggambar tokoh kesukaan mereka.";

/** Tempel teks bacaan di depan soal, lalu soalnya. */
function teks1(soal: string): string {
  return `Bacalah teks berikut.\n\n${TEKS_1}\n\n${soal}`;
}

// ---------------------------------------------------------------------------
// LITERASI — Teks 2: Air Bersih untuk Semua (~152 kata)
// ---------------------------------------------------------------------------

const TEKS_2 =
  "Setiap pagi, warga Desa Sukamaju mengambil air di sumur umum. Sumur itu ada di tengah desa. " +
  "Airnya jernih dan dingin. Warga memakai air itu untuk minum, memasak, dan mandi. " +
  "Suatu musim kemarau, air sumur mulai surut. Warga harus antre lebih lama. " +
  "Ada yang datang sebelum matahari terbit. Ada yang pulang dengan ember setengah penuh. " +
  "Kepala desa mengajak warga berembuk. Mereka sepakat membuat dua sumur baru. " +
  "Mereka juga membuat aturan. Air untuk minum didahulukan. Air untuk menyiram tanaman dibatasi. " +
  "Warga bekerja bersama selama dua minggu. Mereka menggali tanah dan memasang pipa. " +
  "Setelah sumur baru selesai, air kembali cukup untuk semua. Warga belajar satu hal. " +
  "Air yang dijaga bersama akan cukup untuk bersama. " +
  "Warga juga menanam pohon di sekitar sumur. Akar pohon menjaga tanah tetap lembap. " +
  "Daun pohon memberi teduh saat antre. Setiap keluarga merawat satu pohon. " +
  "Mereka menyiram pohon itu setiap sore. Pohon itu tumbuh tinggi dari tahun ke tahun. " +
  "Warga senang melihatnya.";

function teks2(soal: string): string {
  return `Bacalah teks berikut.\n\n${TEKS_2}\n\n${soal}`;
}

// ---------------------------------------------------------------------------
// LITERASI — 20 soal (PG 7, PG kompleks 2, B/S 5, Isian 3, Uraian 2, MJ 1)
// ---------------------------------------------------------------------------

const LITERASI_QUESTIONS: GeneratedQuestion[] = [
  pg(
    teks1("Di mana letak taman baca itu?"),
    ["Di ujung Gang Melati", "Di tengah pasar", "Di dekat sekolah", "Di tepi sungai"],
    0,
    "Teks menulis taman baca itu ada di ujung Gang Melati."
  ),
  pg(
    teks1("Buku apa saja yang ada di taman baca itu?"),
    [
      "Buku cerita, buku gambar, dan buku pengetahuan",
      "Buku pelajaran dan buku ujian",
      "Buku resep dan buku lagu",
      "Buku komik saja"
    ],
    0,
    "Teks menyebut tiga jenis buku: buku cerita, buku gambar, dan buku pengetahuan."
  ),
  pg(
    teks1("Siapa yang membuat taman baca itu?"),
    ["Warga", "Kepala desa", "Guru sekolah", "Pedagang buku"],
    0,
    "Teks menulis taman baca itu dibuat oleh warga."
  ),
  bs(
    teks1("Rak buku di taman baca dibuat dari kayu baru yang dibeli di toko."),
    "Salah",
    "Salah. Rak itu dibuat dari kayu bekas, bukan kayu baru dari toko."
  ),
  bs(
    teks1("Buku di taman baca boleh dibaca gratis."),
    "Benar",
    "Benar. Teks menulis buku-buku di sana boleh dibaca gratis."
  ),
  pg(
    teks1("Mengapa rak buku itu hampir kosong suatu hari?"),
    [
      "Banyak buku dipinjam dan belum kembali",
      "Buku-buku rusak karena hujan",
      "Rak buku pindah tempat",
      "Buku-buku dibuang warga"
    ],
    0,
    "Teks menulis banyak buku dipinjam dan belum kembali, sehingga rak hampir kosong."
  ),
  isian(
    teks1("Buku boleh dipinjam paling lama ... minggu."),
    "satu",
    "Teks menulis buku boleh dipinjam paling lama satu minggu."
  ),
  pk(
    teks1("Apa saja yang dilakukan anak-anak di taman baca itu? Boleh pilih lebih dari satu jawaban."),
    [
      "Membaca buku",
      "Bercerita tentang buku yang dibaca",
      "Membeli buku baru",
      "Menjual buku bekas",
      "Duduk di tikar sambil membaca"
    ],
    ["Membaca buku", "Bercerita tentang buku yang dibaca", "Duduk di tikar sambil membaca"],
    "Teks menulis anak-anak membaca, duduk di tikar, dan bercerita tentang buku yang dibaca. Tidak ada yang membeli atau menjual buku."
  ),
  mj(
    teks1("Pasangkan setiap kata di kiri dengan penjelasan yang tepat di kanan."),
    ["Rak buku", "Tikar", "Buku catatan", "Kayu bekas", "Satu minggu"],
    [
      "Bahan untuk membuat rak",
      "Tempat menulis nama peminjam",
      "Lama waktu meminjam buku",
      "Tempat menyimpan buku",
      "Alas untuk duduk membaca"
    ],
    { "0": "d", "1": "e", "2": "b", "3": "a", "4": "c" },
    "Rak buku menyimpan buku, tikar alas untuk duduk, buku catatan mencatat nama peminjam, kayu bekas bahan rak, dan satu minggu adalah lama waktu meminjam."
  ),
  uraian(
    teks1("Mengapa warga membuat aturan meminjam buku? Jelaskan dengan bahasamu sendiri."),
    ["dipinjam", "kembali", "tepat waktu"],
    "Aturan dibuat karena banyak buku dipinjam dan belum kembali, sehingga rak hampir kosong. Dengan aturan, buku yang dipinjam kembali tepat waktu."
  ),
  pg(
    teks2("Dari mana warga Desa Sukamaju mengambil air setiap pagi?"),
    ["Sumur umum", "Sungai", "Kolam ikan", "Tangki air"],
    0,
    "Teks menulis warga mengambil air di sumur umum."
  ),
  pg(
    teks2("Apa yang terjadi pada musim kemarau?"),
    [
      "Air sumur mulai surut",
      "Air sumur menjadi asin",
      "Sumur tertutup lumpur",
      "Sumur pindah tempat"
    ],
    0,
    "Teks menulis pada musim kemarau air sumur mulai surut."
  ),
  bs(
    teks2("Warga memakai air sumur untuk minum, memasak, dan mandi."),
    "Benar",
    "Benar. Teks menulis air itu dipakai untuk minum, memasak, dan mandi."
  ),
  bs(
    teks2("Air untuk menyiram tanaman didahulukan daripada air untuk minum."),
    "Salah",
    "Salah. Teks menulis air untuk minum didahulukan, sedangkan air untuk menyiram tanaman dibatasi."
  ),
  isian(
    teks2("Warga bekerja bersama selama ... minggu untuk membuat sumur baru."),
    "dua",
    "Teks menulis warga bekerja bersama selama dua minggu."
  ),
  pg(
    teks2("Apa yang disepakati warga saat berembuk?"),
    [
      "Membuat dua sumur baru",
      "Menutup sumur lama",
      "Membeli air dari desa lain",
      "Melarang warga mengambil air"
    ],
    0,
    "Teks menulis warga sepakat membuat dua sumur baru."
  ),
  pk(
    teks2("Manakah yang termasuk cara warga menjaga air tetap cukup? Boleh pilih lebih dari satu jawaban."),
    [
      "Membuat sumur baru",
      "Mendahulukan air untuk minum",
      "Membatasi air untuk menyiram tanaman",
      "Mengambil air sebanyak-banyaknya",
      "Membuang air yang tersisa"
    ],
    [
      "Membuat sumur baru",
      "Mendahulukan air untuk minum",
      "Membatasi air untuk menyiram tanaman"
    ],
    "Teks menulis warga membuat dua sumur baru, mendahulukan air untuk minum, dan membatasi air untuk menyiram tanaman."
  ),
  isian(
    teks2("Setelah sumur baru selesai, air kembali ... untuk semua."),
    "cukup",
    "Teks menulis setelah sumur baru selesai, air kembali cukup untuk semua."
  ),
  bs(
    teks2("Warga membuat sumur baru sendirian tanpa bantuan kepala desa."),
    "Salah",
    "Salah. Kepala desa mengajak warga berembuk, lalu warga bekerja bersama membuat sumur baru."
  ),
  uraian(
    teks2("Apa pelajaran yang didapat warga dari pengalaman menjaga air sumur? Jelaskan dengan bahasamu sendiri."),
    ["dijaga", "bersama", "cukup"],
    "Warga belajar bahwa air yang dijaga bersama akan cukup untuk bersama."
  )
];

// ---------------------------------------------------------------------------
// NUMERASI — 20 soal (PG 7, PG kompleks 2, B/S 5, Isian 3, Uraian 2, MJ 1)
// Semua hitungan diverifikasi manual (lihat catatan per soal).
// ---------------------------------------------------------------------------

const NUMERASI_QUESTIONS: GeneratedQuestion[] = [
  pg(
    "Sebuah toko menjual pensil Rp2.000,00 per buah. Berapa harga 5 pensil?",
    ["Rp8.000,00", "Rp10.000,00", "Rp12.000,00", "Rp7.000,00"],
    1,
    "5 × Rp2.000,00 = Rp10.000,00."
  ),
  pg(
    "Jarak rumah ke sekolah 2 km. Jarak sekolah ke lapangan 1 km. Berapa jarak rumah ke lapangan lewat sekolah?",
    ["1 km", "2 km", "3 km", "4 km"],
    2,
    "2 km + 1 km = 3 km."
  ),
  pg(
    "Sebuah bus berangkat pukul 07.00 dan tiba pukul 09.30. Berapa lama perjalanan bus itu?",
    ["1 jam 30 menit", "2 jam", "2 jam 30 menit", "3 jam"],
    2,
    "Dari 07.00 ke 09.30 adalah 2 jam 30 menit."
  ),
  bs("12 + 8 = 20.", "Benar", "Benar. 12 + 8 = 20."),
  bs("Setengah dari 50 adalah 20.", "Salah", "Salah. Setengah dari 50 adalah 25."),
  pg(
    "Sebuah kantong berisi 24 kelereng. Kelereng itu dibagi sama rata ke 4 anak. Berapa kelereng yang diterima tiap anak?",
    ["4", "6", "8", "12"],
    1,
    "24 : 4 = 6. Tiap anak menerima 6 kelereng."
  ),
  isian(
    "Harga sebuah buku Rp7.500,00. Uang yang dibayar Rp10.000,00. Kembaliannya ... rupiah.",
    "2500",
    "Rp10.000,00 − Rp7.500,00 = Rp2.500,00. Kembaliannya 2500 rupiah."
  ),
  pk(
    "Manakah bilangan yang habis dibagi 3? Boleh pilih lebih dari satu jawaban.",
    ["12", "15", "20", "21", "25"],
    ["12", "15", "21"],
    "12 : 3 = 4, 15 : 3 = 5, dan 21 : 3 = 7. Sedangkan 20 dan 25 tidak habis dibagi 3."
  ),
  mj(
    "Pasangkan setiap hitungan di kiri dengan hasil yang tepat di kanan.",
    ["6 × 7", "72 : 8", "15 + 9", "30 − 14", "5 × 9"],
    ["24", "45", "9", "42", "16"],
    { "0": "d", "1": "c", "2": "a", "3": "e", "4": "b" },
    "6 × 7 = 42, 72 : 8 = 9, 15 + 9 = 24, 30 − 14 = 16, dan 5 × 9 = 45."
  ),
  uraian(
    "Sebuah kelas punya 30 siswa. Setiap siswa membawa 2 buku. Berapa jumlah buku seluruhnya? Jelaskan caramu menghitung.",
    ["60", "30", "2"],
    "30 × 2 = 60. Jumlah buku seluruhnya 60 buku."
  ),
  pg(
    "Jumlah pengunjung perpustakaan: Senin 20 orang, Selasa 25 orang, Rabu 15 orang, Kamis 30 orang. Pada hari apa pengunjung paling banyak?",
    ["Senin", "Selasa", "Rabu", "Kamis"],
    3,
    "Kamis paling banyak: 30 orang. Selasa 25, Senin 20, Rabu 15."
  ),
  pg(
    "Sebuah persegi panjang panjangnya 8 cm dan lebarnya 5 cm. Berapa kelilingnya?",
    ["13 cm", "26 cm", "40 cm", "20 cm"],
    1,
    "Keliling = 2 × (8 + 5) = 2 × 13 = 26 cm."
  ),
  bs("Segitiga punya 3 sisi.", "Benar", "Benar. Segitiga punya 3 sisi."),
  bs("1 jam = 100 menit.", "Salah", "Salah. 1 jam = 60 menit."),
  isian("Bilangan setelah 199 adalah ....", "200", "Setelah 199 adalah 200."),
  pg(
    "Ibu membeli 3 kg gula. Setiap kg harganya Rp15.000,00. Berapa yang harus dibayar ibu?",
    ["Rp30.000,00", "Rp45.000,00", "Rp18.000,00", "Rp50.000,00"],
    1,
    "3 × Rp15.000,00 = Rp45.000,00."
  ),
  pk(
    "Manakah yang merupakan bangun datar dengan 4 sisi? Boleh pilih lebih dari satu jawaban.",
    ["Persegi", "Persegi panjang", "Segitiga", "Jajar genjang", "Lingkaran"],
    ["Persegi", "Persegi panjang", "Jajar genjang"],
    "Persegi, persegi panjang, dan jajar genjang masing-masing punya 4 sisi. Segitiga punya 3 sisi, lingkaran tidak punya sisi lurus."
  ),
  isian("3 jam = ... menit.", "180", "1 jam = 60 menit, jadi 3 × 60 = 180 menit."),
  bs("Hasil dari 100 − 45 adalah 65.", "Salah", "Salah. 100 − 45 = 55."),
  uraian(
    "Sebuah toko menjual 4 kotak pensil. Setiap kotak berisi 12 pensil. Berapa pensil seluruhnya? Jelaskan caramu menghitung.",
    ["48", "12", "4"],
    "4 × 12 = 48. Pensil seluruhnya 48 pensil."
  )
];

// ---------------------------------------------------------------------------
// Daftar simulasi
// ---------------------------------------------------------------------------

export const ANBK_SIMULATIONS: AnbkSimulationSeed[] = [
  {
    id: "anbk-literasi",
    product_id: "k5",
    subject: "Literasi",
    grade: 5,
    paket: "ANBK",
    title: "Simulasi ANBK Literasi Kelas 5",
    total_minutes: 60,
    questions: LITERASI_QUESTIONS
  },
  {
    id: "anbk-numerasi",
    product_id: "k5",
    subject: "Numerasi",
    grade: 5,
    paket: "ANBK",
    title: "Simulasi ANBK Numerasi Kelas 5",
    total_minutes: 60,
    questions: NUMERASI_QUESTIONS
  }
];

/** Jumlah soal per tipe per paket — dipakai verifikasi (uji tsx). */
export function anbkTypeCounts(simId: string): Record<string, number> {
  const sim = ANBK_SIMULATIONS.find((s) => s.id === simId);
  const out: Record<string, number> = {};
  for (const q of sim?.questions ?? []) out[q.type] = (out[q.type] ?? 0) + 1;
  return out;
}

/** Total poin per paket (harus 34 untuk keduanya). */
export function anbkMaxPoints(simId: string): number {
  const sim = ANBK_SIMULATIONS.find((s) => s.id === simId);
  return (sim?.questions ?? []).reduce((sum, q) => sum + q.points, 0);
}
