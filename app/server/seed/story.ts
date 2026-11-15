// story.ts — bank "Soal Cerita Sehari-hari": soal Matematika & Bahasa
// Indonesia berbasis situasi nyata anak (belanja di warung, berbagi kue,
// antrean, dan sejenisnya). SEMUA SOAL ORISINAL, ditulis dari situasi
// sehari-hari. Jawaban dihitung manual saat penulisan; setiap soal memakai
// 1 poin (10 soal = 10 poin per latihan).
//
// Pemakaian: GET /api/story/:grade/:subject (tanpa jawaban) dan
// POST /api/quiz/submit kind = "story" (dinilai server seperti kuis lain).
// Latihan ini GRATIS untuk semua akun login (seperti Latihan Harian).

import type { GeneratedQuestion } from "./study.js";

export const STORY_SUBJECTS = ["Matematika", "B. Indonesia"] as const;

function pg(
  question: string,
  options: string[],
  answerIdx: number,
  discussion: string
): GeneratedQuestion {
  return { type: "pg", question, options, answer: options[answerIdx], discussion, points: 1 };
}

function isian(question: string, answer: string, discussion: string): GeneratedQuestion {
  return { type: "isian", question, options: null, answer, discussion, points: 1 };
}

/** Id stabil untuk satu set latihan cerita: story-1-matematika. */
export function storyRefId(grade: number, subject: string): string {
  const slug = subject === "Matematika" ? "matematika" : "bahasa-indonesia";
  return `story-${grade}-${slug}`;
}

export function parseStoryRef(refId: string): { grade: number; subject: string } | null {
  const m = /^story-([1-6])-(matematika|bahasa-indonesia)$/.exec(refId);
  if (!m) return null;
  return {
    grade: Number(m[1]),
    subject: m[2] === "matematika" ? "Matematika" : "B. Indonesia"
  };
}

export function storyQuestions(grade: number, subject: string): GeneratedQuestion[] {
  if (subject === "Matematika") return STORY_MTK[grade] ?? [];
  if (subject === "B. Indonesia") return STORY_BI[grade] ?? [];
  return [];
}

// ---------------------------------------------------------------------------
// Matematika — cerita dari kehidupan sehari-hari.
// ---------------------------------------------------------------------------

const STORY_MTK: Record<number, GeneratedQuestion[]> = {
  // Kelas 1 — bilangan sampai 10, tambah dan kurang.
  1: [
    pg(
      "Ibu membeli 3 apel di warung. Ayah membeli 4 apel. Berapa apel semuanya?",
      ["5 apel", "7 apel", "8 apel"],
      1,
      "3 apel ditambah 4 apel sama dengan 7 apel. Hitung pelan-pelan, ya: 3, 4, 5, 6, 7."
    ),
    pg(
      "Ada 8 kue di atas piring. 2 kue dimakan adik. Berapa kue yang tersisa?",
      ["5 kue", "6 kue", "7 kue"],
      1,
      "8 kue dikurangi 2 kue sama dengan 6 kue. Coba hitung mundur dari 8: 7, 6."
    ),
    pg(
      "Ada 5 anak antre membeli es. 2 anak di depan sudah pulang. Berapa anak yang masih antre?",
      ["2 anak", "3 anak", "7 anak"],
      1,
      "5 anak dikurangi 2 anak sama dengan 3 anak."
    ),
    pg(
      "Budi punya 4 mobil mainan. Temannya memberi 3 mobil lagi. Berapa mobil Budi sekarang?",
      ["6 mobil", "7 mobil", "8 mobil"],
      1,
      "4 ditambah 3 sama dengan 7. Hebat!"
    ),
    pg(
      "Di rak ada 6 buku. 1 buku dipinjam teman. Berapa buku yang tersisa di rak?",
      ["4 buku", "5 buku", "6 buku"],
      1,
      "6 buku dikurangi 1 buku sama dengan 5 buku."
    ),
    pg(
      "Sinta punya 2 pensil merah dan 5 pensil biru. Berapa pensil Sinta semuanya?",
      ["6 pensil", "7 pensil", "9 pensil"],
      1,
      "2 ditambah 5 sama dengan 7 pensil."
    ),
    pg(
      "Ada 9 balon di pesta. 4 balon meletus. Berapa balon yang tersisa?",
      ["4 balon", "5 balon", "6 balon"],
      1,
      "9 dikurangi 4 sama dengan 5 balon."
    ),
    pg(
      "Raka punya 10 kelereng. Ia memberi 3 kelereng ke adiknya. Berapa kelereng Raka sekarang?",
      ["6 kelereng", "7 kelereng", "8 kelereng"],
      1,
      "10 dikurangi 3 sama dengan 7 kelereng."
    ),
    pg(
      "Di keranjang ada 5 jeruk. Ibu menambah 2 jeruk lagi. Berapa jeruk di keranjang sekarang?",
      ["6 jeruk", "7 jeruk", "8 jeruk"],
      1,
      "5 ditambah 2 sama dengan 7 jeruk."
    ),
    isian(
      "Anak itu membawa 3 roti. Di jalan ia membeli 6 roti lagi. Berapa roti semuanya? Tulis angkanya.",
      "9",
      "3 roti ditambah 6 roti sama dengan 9 roti."
    )
  ],
  // Kelas 2 — bilangan sampai 100, tambah dan kurang dua angka.
  2: [
    pg(
      "Sinta menabung Rp20.000 di minggu pertama dan Rp15.000 di minggu kedua. Berapa tabungan Sinta?",
      ["Rp30.000", "Rp35.000", "Rp45.000"],
      1,
      "20.000 ditambah 15.000 sama dengan 35.000. Jadi tabungannya Rp35.000."
    ),
    pg(
      "Dodi punya 46 kelereng. Ia memberi 12 kelereng ke temannya. Berapa kelereng Dodi sekarang?",
      ["32 kelereng", "34 kelereng", "36 kelereng"],
      1,
      "46 dikurangi 12 sama dengan 34 kelereng."
    ),
    pg(
      "Satu kantong berisi 25 permen. Ibu membeli 2 kantong. Berapa permen semuanya?",
      ["45 permen", "50 permen", "75 permen"],
      1,
      "2 kantong kali 25 permen sama dengan 50 permen."
    ),
    pg(
      "Buku cerita itu 80 halaman. Rina sudah membaca 35 halaman. Berapa halaman yang belum dibaca?",
      ["40 halaman", "45 halaman", "55 halaman"],
      1,
      "80 dikurangi 35 sama dengan 45 halaman."
    ),
    pg(
      "Ada 64 orang antre di puskesmas. 20 orang sudah dilayani. Berapa orang yang masih menunggu?",
      ["42 orang", "44 orang", "84 orang"],
      1,
      "64 dikurangi 20 sama dengan 44 orang."
    ),
    isian(
      "Di kotak ada 58 pensil. Guru menambah 17 pensil lagi. Berapa pensil di kotak sekarang? Tulis angkanya.",
      "75",
      "58 ditambah 17 sama dengan 75 pensil."
    ),
    pg(
      "Di keranjang ada 90 apel. 27 apel sudah busuk dan dibuang. Berapa apel yang masih bagus?",
      ["60 apel", "63 apel", "67 apel"],
      1,
      "90 dikurangi 27 sama dengan 63 apel."
    ),
    pg(
      "Ibu membuat 3 loyang kue. Setiap loyang dipotong menjadi 12 potong. Berapa potong kue semuanya?",
      ["32 potong", "36 potong", "40 potong"],
      1,
      "3 kali 12 sama dengan 36 potong kue."
    ),
    pg(
      "Harga buku Rp12.000. Andi membayar dengan uang Rp20.000. Berapa kembaliannya?",
      ["Rp6.000", "Rp8.000", "Rp10.000"],
      1,
      "20.000 dikurangi 12.000 sama dengan 8.000. Kembaliannya Rp8.000."
    ),
    isian(
      "Di taman ada 100 bunga. 38 bunga sudah dipetik. Berapa bunga yang tersisa? Tulis angkanya.",
      "62",
      "100 dikurangi 38 sama dengan 62 bunga."
    )
  ],
  // Kelas 3 — perkalian dan pembagian dalam cerita.
  3: [
    pg(
      "Ada 6 kotak pensil. Setiap kotak berisi 8 pensil. Berapa pensil semuanya?",
      ["42 pensil", "48 pensil", "54 pensil"],
      1,
      "6 kali 8 sama dengan 48 pensil."
    ),
    pg(
      "Ibu membagi 56 kue ke 7 piring sama banyak. Berapa kue di setiap piring?",
      ["7 kue", "8 kue", "9 kue"],
      1,
      "56 dibagi 7 sama dengan 8 kue di setiap piring."
    ),
    pg(
      "Di aula ada 9 baris kursi. Setiap baris ada 6 kursi. Berapa kursi semuanya?",
      ["48 kursi", "54 kursi", "60 kursi"],
      1,
      "9 kali 6 sama dengan 54 kursi."
    ),
    pg(
      "4 anak masing-masing menabung Rp5.000. Berapa uang mereka jika digabung?",
      ["Rp15.000", "Rp20.000", "Rp25.000"],
      1,
      "4 kali 5.000 sama dengan 20.000."
    ),
    isian(
      "Di toko ada 7 rak buku. Setiap rak memuat 9 buku. Berapa buku semuanya? Tulis angkanya.",
      "63",
      "7 kali 9 sama dengan 63 buku."
    ),
    pg(
      "Paman membagi 72 jeruk ke 8 kantong sama banyak. Berapa jeruk di setiap kantong?",
      ["8 jeruk", "9 jeruk", "10 jeruk"],
      1,
      "72 dibagi 8 sama dengan 9 jeruk."
    ),
    pg(
      "Perpustakaan punya 5 rak. Setiap rak berisi 12 buku. Berapa buku semuanya?",
      ["55 buku", "60 buku", "65 buku"],
      1,
      "5 kali 12 sama dengan 60 buku."
    ),
    pg(
      "45 kelereng dibagikan kepada 5 anak sama banyak. Berapa kelereng yang diterima setiap anak?",
      ["8 kelereng", "9 kelereng", "10 kelereng"],
      1,
      "45 dibagi 5 sama dengan 9 kelereng."
    ),
    pg(
      "Satu bungkus berisi 7 roti. Ibu membeli 8 bungkus. Berapa roti semuanya?",
      ["49 roti", "56 roti", "63 roti"],
      1,
      "8 kali 7 sama dengan 56 roti."
    ),
    isian(
      "96 permen dibagi rata ke 8 anak. Berapa permen yang diterima setiap anak? Tulis angkanya.",
      "12",
      "96 dibagi 8 sama dengan 12 permen."
    )
  ],
  // Kelas 4 — bilangan besar, pecahan sederhana, dan uang.
  4: [
    pg(
      "Satu buku tulis harganya Rp7.500. Rudi membeli 3 buku. Berapa yang harus dibayar Rudi?",
      ["Rp21.500", "Rp22.500", "Rp25.000"],
      1,
      "3 kali 7.500 sama dengan 22.500."
    ),
    pg(
      "Ibu memotong kue menjadi 20 potong. Ayah makan setengahnya. Berapa potong yang dimakan Ayah?",
      ["8 potong", "10 potong", "12 potong"],
      1,
      "Setengah dari 20 adalah 10. Jadi Ayah makan 10 potong."
    ),
    pg(
      "Santi membawa uang Rp50.000. Ia membeli alat tulis seharga Rp32.500. Berapa sisa uang Santi?",
      ["Rp15.500", "Rp17.500", "Rp18.500"],
      1,
      "50.000 dikurangi 32.500 sama dengan 17.500."
    ),
    isian(
      "Satu kardus berisi 125 buku. Ada 4 kardus yang sama. Berapa buku semuanya? Tulis angkanya.",
      "500",
      "4 kali 125 sama dengan 500 buku."
    ),
    pg(
      "Satu botol berisi 1,5 liter air. Andi minum 3 botol. Berapa liter air yang diminum Andi?",
      ["3,5 liter", "4,5 liter", "5,5 liter"],
      1,
      "3 kali 1,5 sama dengan 4,5 liter."
    ),
    pg(
      "240 kelereng dibagikan sama rata ke 6 anak. Berapa kelereng yang diterima setiap anak?",
      ["36 kelereng", "40 kelereng", "48 kelereng"],
      1,
      "240 dibagi 6 sama dengan 40 kelereng."
    ),
    pg(
      "Kue dipotong menjadi 16 potong. Tiga perempatnya sudah dimakan. Berapa potong yang sudah dimakan?",
      ["10 potong", "12 potong", "14 potong"],
      1,
      "Tiga perempat dari 16 adalah 12. Caranya: 16 dibagi 4 sama dengan 4, lalu 4 kali 3 sama dengan 12."
    ),
    pg(
      "Jarak rumah ke sekolah 5 km. Jarak sekolah ke lapangan 3,5 km. Berapa jarak rumah ke lapangan lewat sekolah?",
      ["7,5 km", "8,5 km", "9,5 km"],
      1,
      "5 ditambah 3,5 sama dengan 8,5 km."
    ),
    isian(
      "Uang saku Budi Rp1.000. Ia memakai Rp375 untuk membeli pensil. Berapa sisa uangnya? Tulis angkanya (tanpa Rp).",
      "625",
      "1.000 dikurangi 375 sama dengan 625."
    ),
    pg(
      "Satu lusin pensil berisi 12 pensil. Ibu membeli 8 lusin untuk kelas. Berapa pensil semuanya?",
      ["84 pensil", "96 pensil", "108 pensil"],
      1,
      "8 kali 12 sama dengan 96 pensil."
    )
  ],
  // Kelas 5 — desimal, persen sederhana, waktu, dan rata-rata.
  5: [
    pg(
      "Rina membeli buku Rp12.500 dan penghapus Rp7.750. Berapa yang harus dibayar Rina?",
      ["Rp19.250", "Rp20.250", "Rp21.250"],
      1,
      "12.500 ditambah 7.750 sama dengan 20.250."
    ),
    pg(
      "Mainan seharga Rp40.000 mendapat diskon 10%. Berapa harga mainan setelah diskon?",
      ["Rp34.000", "Rp36.000", "Rp38.000"],
      1,
      "Diskon 10% dari 40.000 adalah 4.000. Jadi 40.000 dikurangi 4.000 sama dengan 36.000."
    ),
    isian(
      "Ibu membeli 2,5 kg gula dan 1,75 kg tepung. Berapa kg belanjaan Ibu semuanya? Tulis angkanya.",
      "4,25",
      "2,5 ditambah 1,75 sama dengan 4,25 kg."
    ),
    pg(
      "Bus berangkat pukul 07.15 dan tiba pukul 08.05. Berapa lama perjalanan bus itu?",
      ["40 menit", "50 menit", "60 menit"],
      1,
      "Dari 07.15 ke 08.05 adalah 50 menit."
    ),
    pg(
      "Andi minum 0,5 liter air pagi hari dan 0,25 liter siang hari. Berapa liter air yang diminum Andi?",
      ["0,65 liter", "0,75 liter", "0,85 liter"],
      1,
      "0,5 ditambah 0,25 sama dengan 0,75 liter."
    ),
    pg(
      "Nilai ulangan Dina adalah 80, 90, dan 70. Berapa rata-rata nilai Dina?",
      ["75", "80", "85"],
      1,
      "Jumlahnya 80 + 90 + 70 = 240. Dibagi 3 sama dengan 80."
    ),
    pg(
      "Ayah membawa uang Rp100.000. Ia membeli sayur seharga Rp67.500. Berapa sisa uang Ayah?",
      ["Rp30.500", "Rp32.500", "Rp33.500"],
      1,
      "100.000 dikurangi 67.500 sama dengan 32.500."
    ),
    pg(
      "Jarak dari rumah ke taman 2,4 km. Dari taman ke sekolah 1,6 km. Berapa jarak rumah ke sekolah lewat taman?",
      ["3,8 km", "4 km", "4,2 km"],
      1,
      "2,4 ditambah 1,6 sama dengan 4 km."
    ),
    isian(
      "15% dari 200 kelereng adalah berapa kelereng? Tulis angkanya.",
      "30",
      "15% dari 200 adalah 30. Caranya: 200 dibagi 100 sama dengan 2, lalu 2 kali 15 sama dengan 30."
    ),
    pg(
      "Ibu membuat 40 potong kue. Lima perdelapannya sudah dimakan. Berapa potong yang sudah dimakan?",
      ["20 potong", "25 potong", "30 potong"],
      1,
      "Lima perdelapan dari 40 adalah 25. Caranya: 40 dibagi 8 sama dengan 5, lalu 5 kali 5 sama dengan 25."
    )
  ],
  // Kelas 6 — rasio, persen, kecepatan, dan data.
  6: [
    pg(
      "Perbandingan buku dan pensil di tas adalah 3 : 2. Jumlah semuanya 30 buah. Berapa banyak buku?",
      ["12 buku", "18 buku", "20 buku"],
      1,
      "3 + 2 = 5 bagian. Satu bagian berisi 30 : 5 = 6 buah. Buku ada 3 bagian, jadi 3 × 6 = 18 buku."
    ),
    pg(
      "25% dari 240 siswa suka berenang. Berapa siswa yang suka berenang?",
      ["50 siswa", "60 siswa", "80 siswa"],
      1,
      "25% dari 240 adalah 60. Seperempat dari 240 adalah 60."
    ),
    isian(
      "Harga sebuah tas Rp50.000 naik 20%. Berapa harga tas sekarang? Tulis angkanya (tanpa Rp).",
      "60000",
      "Kenaikan 20% dari 50.000 adalah 10.000. Jadi 50.000 + 10.000 = 60.000."
    ),
    pg(
      "Sepeda motor menempuh 120 km dalam 2 jam. Berapa kecepatan rata-ratanya?",
      ["50 km/jam", "60 km/jam", "70 km/jam"],
      1,
      "120 dibagi 2 sama dengan 60 km/jam."
    ),
    pg(
      "Nilai empat kali kuis adalah 90, 80, 85, dan 95. Berapa rata-ratanya?",
      ["85", "87,5", "90"],
      1,
      "Jumlahnya 90 + 80 + 85 + 95 = 350. Dibagi 4 sama dengan 87,5."
    ),
    pg(
      "Sepatu seharga Rp150.000 mendapat diskon 20%. Berapa yang harus dibayar pembeli?",
      ["Rp110.000", "Rp120.000", "Rp130.000"],
      1,
      "Diskon 20% dari 150.000 adalah 30.000. Jadi 150.000 - 30.000 = 120.000."
    ),
    pg(
      "Perbandingan uang Sinta dan Dodi adalah 4 : 5. Jumlah uang mereka Rp45.000. Berapa uang Sinta?",
      ["Rp18.000", "Rp20.000", "Rp25.000"],
      1,
      "4 + 5 = 9 bagian. Satu bagian Rp45.000 : 9 = Rp5.000. Uang Sinta 4 × Rp5.000 = Rp20.000."
    ),
    isian(
      "Tiga perlima dari 100 buku sudah dibaca. Berapa buku yang sudah dibaca? Tulis angkanya.",
      "60",
      "Tiga perlima dari 100 adalah 60. Caranya: 100 : 5 = 20, lalu 20 × 3 = 60."
    ),
    pg(
      "Penjualan kue di warung selama tiga hari: 20, 25, dan 30 potong. Berapa potong kue yang terjual semuanya?",
      ["70 potong", "75 potong", "80 potong"],
      1,
      "20 + 25 + 30 = 75 potong."
    ),
    pg(
      "Modal dagang Rp80.000 mendapat untung 25%. Berapa rupiah untungnya?",
      ["Rp15.000", "Rp20.000", "Rp25.000"],
      1,
      "25% dari 80.000 adalah 20.000. Seperempat dari 80.000 adalah 20.000."
    )
  ]
};

// ---------------------------------------------------------------------------
// Bahasa Indonesia — cerita dan kalimat dari kehidupan sehari-hari.
// ---------------------------------------------------------------------------

const STORY_BI: Record<number, GeneratedQuestion[]> = {
  // Kelas 1 — huruf, kata benda, dan kalimat sederhana.
  1: [
    pg(
      "Kata 'apel' dimulai dengan huruf apa?",
      ["A", "B", "C"],
      0,
      "Apel dimulai dengan huruf A. Coba ucapkan: a-pel."
    ),
    pg(
      "Ibu membeli ... di warung. Kata yang tepat untuk melengkapi kalimat itu adalah ...",
      ["beras", "berlari", "biru"],
      0,
      "Beras adalah benda yang dibeli di warung. 'Berlari' adalah perbuatan, 'biru' adalah warna."
    ),
    pg(
      "Kalimat 'Aku suka apel.' terdiri dari berapa kata?",
      ["2 kata", "3 kata", "4 kata"],
      1,
      "Kata-katanya: Aku (1), suka (2), apel (3). Jadi ada 3 kata."
    ),
    pg(
      "Kata 'bola' huruf keduanya adalah ...",
      ["b", "o", "l"],
      1,
      "Huruf-huruf kata bola: b (1), o (2), l (3), a (4). Huruf kedua adalah o."
    ),
    isian(
      "Matahari terbit di ... hari. Tulis satu kata yang tepat.",
      "pagi",
      "Matahari terbit di pagi hari."
    ),
    pg(
      "Kucing itu ... di halaman. Kata yang tepat untuk melengkapi kalimat itu adalah ...",
      ["berlari", "meja", "merah"],
      0,
      "Kucing melakukan perbuatan berlari. 'Meja' adalah benda, 'merah' adalah warna."
    ),
    pg(
      "Kata 'meja' terdiri dari berapa suku kata?",
      ["1 suku kata", "2 suku kata", "3 suku kata"],
      1,
      "Me-ja: ada 2 suku kata."
    ),
    pg(
      "Kata 'ikan' huruf terakhirnya adalah ...",
      ["i", "a", "n"],
      2,
      "Huruf-huruf kata ikan: i, k, a, n. Huruf terakhir adalah n."
    ),
    isian(
      "Lawan kata 'besar' adalah ... Tulis satu kata.",
      "kecil",
      "Besar lawannya kecil."
    ),
    pg(
      "Aku ... ke sekolah setiap pagi. Kata yang tepat untuk melengkapi kalimat itu adalah ...",
      ["pergi", "tidur", "makan"],
      0,
      "Anak pergi ke sekolah setiap pagi."
    )
  ],
  // Kelas 2 — kalimat ajakan, tanda baca, dan kata kerja.
  2: [
    pg(
      "'Ayo, kita ... bersama!' Kata yang tepat untuk melengkapi kalimat ajakan itu adalah ...",
      ["belajar", "tidur", "marah"],
      0,
      "Ayo, kita belajar bersama! Itu ajakan yang baik."
    ),
    pg(
      "Kalimat 'Apa kabar ...' diakhiri tanda baca apa?",
      ["titik", "tanda tanya", "koma"],
      1,
      "Kalimat tanya diakhiri tanda tanya (?)."
    ),
    pg(
      "Ibu ... nasi di dapur. Kata yang tepat untuk melengkapi kalimat itu adalah ...",
      ["memasak", "meja", "cantik"],
      0,
      "Ibu memasak nasi di dapur. 'Memasak' adalah kata kerja."
    ),
    pg(
      "Kota tempat tinggal kakak bernama Bandung. Penulisan yang benar adalah ...",
      ["bandung", "Bandung", "BANDUNG"],
      1,
      "Nama kota ditulis dengan huruf kapital di awal: Bandung."
    ),
    isian(
      "Lawan kata 'rajin' adalah ... Tulis satu kata.",
      "malas",
      "Rajin lawannya malas."
    ),
    pg(
      "Bunga itu sangat ... Kata yang tepat untuk melengkapi kalimat itu adalah ...",
      ["indah", "berlari", "meja"],
      0,
      "Bunga itu sangat indah. 'Indah' adalah kata sifat."
    ),
    pg(
      "'Tolong ... pintu itu!' Kata yang tepat untuk melengkapi kalimat perintah itu adalah ...",
      ["tutup", "tidur", "buku"],
      0,
      "Tolong tutup pintu itu! Itu kalimat perintah yang sopan."
    ),
    pg(
      "Kata 'mereka' dipakai untuk menyebut ...",
      ["satu orang", "banyak orang", "sebuah benda"],
      1,
      "'Mereka' dipakai untuk menyebut banyak orang."
    ),
    isian(
      "Pagi hari matahari ... di timur. Tulis satu kata yang tepat.",
      "terbit",
      "Pagi hari matahari terbit di timur."
    ),
    pg(
      "Bangun pagi, ... gigi, lalu sarapan. Kata yang tepat untuk melengkapi kalimat itu adalah ...",
      ["gosok", "tidur", "bermain"],
      0,
      "Bangun pagi, gosok gigi, lalu sarapan. Itu urutan yang benar."
    )
  ],
  // Kelas 3 — huruf kapital, kata baku, sinonim, dan tanda seru.
  3: [
    pg(
      "Kakak tinggal di Jalan Merdeka. Penulisan nama jalan yang benar adalah ...",
      ["merdeka", "Merdeka", "MERDEKA"],
      1,
      "Nama jalan ditulis dengan huruf kapital di awal: Merdeka."
    ),
    pg(
      "Kata baku dari 'apotik' adalah ...",
      ["apotik", "apotek", "apothek"],
      1,
      "Kata baku yang benar adalah apotek."
    ),
    pg(
      "Kata 'bahagia' sama artinya dengan ...",
      ["sedih", "senang", "marah"],
      1,
      "Bahagia sama artinya dengan senang."
    ),
    pg(
      "Kalimat 'Jangan berlari di jalan ...' diakhiri tanda baca apa?",
      ["titik", "koma", "tanda seru"],
      2,
      "Kalimat larangan yang tegas diakhiri tanda seru (!)."
    ),
    isian(
      "Kata 'membaca' berawalan ... Tulis awalannya.",
      "me-",
      "Kata 'membaca' berasal dari kata dasar 'baca' dengan awalan me-."
    ),
    pg(
      "Lawan kata 'tinggi' adalah ...",
      ["rendah", "besar", "panjang"],
      0,
      "Tinggi lawannya rendah."
    ),
    pg(
      "Anak itu ... buku di perpustakaan. Kata yang tepat untuk melengkapi kalimat itu adalah ...",
      ["membaca", "buku", "biru"],
      0,
      "Anak itu membaca buku di perpustakaan."
    ),
    pg(
      "Kata dasar dari 'bermain' adalah ...",
      ["main", "bermain", "permainan"],
      0,
      "Kata dasar dari bermain adalah main."
    ),
    isian(
      "Ibu kota Indonesia adalah ... Tulis nama kotanya.",
      "Jakarta",
      "Ibu kota Indonesia adalah Jakarta."
    ),
    pg(
      "Karena hujan, ... Kata yang tepat untuk melanjutkan kalimat itu adalah ...",
      ["kami berteduh", "kami tidur siang", "kami bermain bola"],
      0,
      "Karena hujan, kami berteduh. Itu pilihan yang paling masuk akal."
    )
  ],
  // Kelas 4 — gagasan pokok, imbuhan, kata baku, dan antonim.
  4: [
    pg(
      "Bacaan tentang warga yang membersihkan selokan bersama-sama. Gagasan pokok bacaan itu adalah ...",
      ["Warga suka bermain bola", "Gotong royong membuat pekerjaan cepat selesai", "Selokan itu sangat dalam"],
      1,
      "Bacaan itu bercerita tentang warga bekerja bersama. Gagasan pokoknya: gotong royong membuat pekerjaan cepat selesai."
    ),
    pg(
      "Petani ... padi di sawah. Kata yang tepat untuk melengkapi kalimat itu adalah ...",
      ["menanam", "padi", "hijau"],
      0,
      "Petani menanam padi di sawah. 'Menanam' adalah kata kerja."
    ),
    pg(
      "Kata dasar dari 'penjual' adalah ...",
      ["jual", "penjual", "penjualan"],
      0,
      "Kata dasar dari penjual adalah jual."
    ),
    pg(
      "Kata baku dari 'praktek' adalah ...",
      ["praktek", "praktik", "pratek"],
      1,
      "Kata baku yang benar adalah praktik."
    ),
    isian(
      "Lawan kata 'hemat' adalah ... Tulis satu kata.",
      "boros",
      "Hemat lawannya boros."
    ),
    pg(
      "Kata 'cepat' sama artinya dengan ...",
      ["lambat", "gesit", "diam"],
      1,
      "Cepat sama artinya dengan gesit."
    ),
    pg(
      "'Mari kita jaga ... sekolah kita!' Kata yang tepat untuk melengkapi kalimat ajakan itu adalah ...",
      ["kebersihan", "kotoran", "sampah"],
      0,
      "Mari kita jaga kebersihan sekolah kita!"
    ),
    pg(
      "Tokoh utama dalam sebuah cerita adalah ...",
      ["tempat cerita berlangsung", "orang utama dalam cerita", "waktu cerita terjadi"],
      1,
      "Tokoh utama adalah orang utama dalam cerita."
    ),
    isian(
      "Tanda baca di akhir kalimat tanya adalah ... Tulis namanya.",
      "tanda tanya",
      "Kalimat tanya diakhiri tanda tanya (?)."
    ),
    pg(
      "Lawan kata 'maju' adalah ...",
      ["mundur", "cepat", "lari"],
      0,
      "Maju lawannya mundur."
    )
  ],
  // Kelas 5 — sinonim, antonim, kalimat efektif, dan unsur cerita.
  5: [
    pg(
      "Kata 'arif' sama artinya dengan ...",
      ["bodoh", "bijaksana", "sombong"],
      1,
      "Arif sama artinya dengan bijaksana."
    ),
    pg(
      "Lawan kata 'damai' adalah ...",
      ["tenang", "ribut", "sunyi"],
      1,
      "Damai lawannya ribut."
    ),
    pg(
      "Kalimat yang penulisannya benar adalah ...",
      ["Ibu membeli sayur di pasar.", "Ibu membeli sayur dipasar.", "Ibu membeli sayur di Pasar."],
      0,
      "'Di pasar' ditulis terpisah karena 'di' menunjukkan tempat, dan 'pasar' bukan nama tempat khusus."
    ),
    pg(
      "Amanat dalam sebuah cerita adalah ...",
      ["pesan cerita", "nama tokoh", "latar tempat"],
      0,
      "Amanat adalah pesan yang ingin disampaikan cerita itu."
    ),
    isian(
      "Kata 'keindahan' berawalan 'ke-' dan berakhiran ... Tulis akhirannya.",
      "-an",
      "Keindahan berasal dari kata 'indah' dengan awalan ke- dan akhiran -an."
    ),
    pg(
      "Peribahasa 'Rajin pangkal pandai' artinya ...",
      ["Orang rajin akan menjadi pandai", "Orang pandai pasti rajin", "Rajin itu melelahkan"],
      0,
      "Rajin pangkal pandai artinya orang yang rajin akan menjadi pandai."
    ),
    pg(
      "Kata baku dari 'sekedar' adalah ...",
      ["sekedar", "sekadar", "sekedarnya"],
      1,
      "Kata baku yang benar adalah sekadar."
    ),
    pg(
      "Teks yang menjelaskan langkah-langkah membuat sesuatu disebut teks ...",
      ["narasi", "prosedur", "deskripsi"],
      1,
      "Teks prosedur berisi langkah-langkah untuk membuat atau melakukan sesuatu."
    ),
    isian(
      "Lawan kata 'terang' adalah ... Tulis satu kata.",
      "gelap",
      "Terang lawannya gelap."
    ),
    pg(
      "Bacaan tentang sampah plastik yang menumpuk di sungai. Kesimpulan yang tepat adalah ...",
      ["Sampah plastik harus dikurangi", "Sungai itu tempat bermain", "Plastik itu ringan"],
      0,
      "Bacaan itu mengajak kita mengurangi sampah plastik."
    )
  ],
  // Kelas 6 — kesimpulan, peribahasa, jenis teks, dan makna kata.
  6: [
    pg(
      "Bacaan tentang anak yang menabung setiap minggu dan akhirnya bisa membeli buku. Kesimpulan bacaan itu adalah ...",
      ["Menabung itu membosankan", "Menabung sedikit demi sedikit itu baik", "Buku itu mahal"],
      1,
      "Bacaan itu menunjukkan menabung sedikit demi sedikit itu baik."
    ),
    pg(
      "Peribahasa 'Bersatu kita teguh' artinya ...",
      ["Bersatu membuat kita kuat", "Berpisah itu menyenangkan", "Teguh berarti keras kepala"],
      0,
      "Bersatu kita teguh artinya kalau kita bersatu, kita menjadi kuat."
    ),
    pg(
      "Kata baku dari 'analisa' adalah ...",
      ["analisa", "analisis", "analise"],
      1,
      "Kata baku yang benar adalah analisis."
    ),
    pg(
      "Teks yang menceritakan pengalaman seseorang disebut teks ...",
      ["narasi", "eksposisi", "argumentasi"],
      0,
      "Teks narasi menceritakan suatu kejadian atau pengalaman."
    ),
    isian(
      "Sinonim kata 'megah' adalah ... Tulis satu kata.",
      "agung",
      "Megah sama artinya dengan agung."
    ),
    pg(
      "Lawan kata 'setia' adalah ...",
      ["khianat", "jujur", "patuh"],
      0,
      "Setia lawannya khianat."
    ),
    pg(
      "Kalimat 'Karena hujan deras, pertandingan ditunda.' termasuk kalimat ...",
      ["kalimat tunggal", "kalimat majemuk", "kalimat perintah"],
      1,
      "Kalimat itu punya dua bagian yang berhubungan sebab-akibat, jadi kalimat majemuk."
    ),
    pg(
      "Amanat sebuah cerita adalah ...",
      ["pesan moral cerita", "judul cerita", "tokoh cerita"],
      0,
      "Amanat adalah pesan moral yang ingin disampaikan cerita itu."
    ),
    isian(
      "Teks yang berisi langkah-langkah disebut teks ... Tulis satu kata.",
      "prosedur",
      "Teks prosedur berisi langkah-langkah."
    ),
    pg(
      "Kata 'dermawan' artinya orang yang ...",
      ["suka memberi", "suka menyimpan", "suka berhemat"],
      0,
      "Dermawan artinya orang yang suka memberi."
    )
  ]
};
