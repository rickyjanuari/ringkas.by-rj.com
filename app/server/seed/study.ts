// ---------------------------------------------------------------------------
// study.ts — bank soal + generator simulasi + konten bab Ringkas.
//
// SEMUA KONTEN ORISINAL, ditulis dari pengetahuan Kurikulum Merdeka.
// Tidak ada teks yang disalin dari buku mana pun.
//
// KEJUJURAN KONTEN (sesuai API_CONTRACT.md):
// - Kelas 1: bab ditulis PENUH dan benar (Semester 1 Kurikulum Merdeka).
// - Kelas 2–6: bab berupa KERANGKA dari generator topik — judul dan rangkuman
//   singkat yang benar topiknya, dengan poin, kartu, dan kuis yang digenerasi
//   dari templat. Bukan ditulis penuh per bab.
// - Simulasi: soal Matematika digenerasi aritmetika deterministik; mapel lain
//   memakai bank soal + varian dari soal bab (kuis bab, kartu, dan bank
//   pernyataan). Paket A dan Paket B memakai irisan soal yang berbeda:
//   pool soal diurutkan deterministik per (mapel, kelas), Paket A memakai
//   irisan pertama, Paket B irisan kedua — jadi soalnya berbeda.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Util deterministik (tanpa Math.random — hasil seed harus stabil)
// ---------------------------------------------------------------------------
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ---------------------------------------------------------------------------
// Tipe ekspor wajib (API_CONTRACT.md)
// ---------------------------------------------------------------------------
export interface GeneratedQuestion {
  type: "pg" | "pg_kompleks" | "bs" | "menjodohkan" | "isian" | "uraian";
  question: string;
  options: string[] | { left: string[]; right: string[] } | null;
  answer: string | string[] | Record<string, string>;
  discussion: string;
  points: number;
}

export interface ChapterSeed {
  id: string;
  product_id: string;
  title: string;
  subject: string;
  grade: number;
  semester: number;
  summary: string;
  points: string[];
  focus_text: string;
  sort_order: number;
  flashcards: { front: string; back: string }[];
  quiz: GeneratedQuestion[];
  /** Video pendek vertikal bawaan (9:16) — URL atau path relatif situs. */
  short_url?: string | null;
  short_duration?: string | null;
}

// ---------------------------------------------------------------------------
// Pembantu pembuat soal
// ---------------------------------------------------------------------------
function pg(
  question: string,
  options: string[],
  answerIdx: number,
  discussion: string,
  points = 1
): GeneratedQuestion {
  return { type: "pg", question, options, answer: options[answerIdx], discussion, points };
}

function bs(question: string, answer: "Benar" | "Salah", discussion: string): GeneratedQuestion {
  return { type: "bs", question, options: null, answer, discussion, points: 1 };
}

function isian(question: string, answer: string, discussion: string): GeneratedQuestion {
  return { type: "isian", question, options: null, answer, discussion, points: 1 };
}

function uraian(question: string, keywords: string[], discussion: string, points: number): GeneratedQuestion {
  return { type: "uraian", question, options: null, answer: keywords, discussion, points };
}

// Satu set menjodohkan dari 5 pasangan [kiri, kanan]; sisi kanan diacak.
function menjodohkan(pairs: [string, string][], seedText: string, discussion: string): GeneratedQuestion {
  const rng = mulberry32(hashStr(seedText));
  const left = pairs.map((p) => p[0]);
  const rightShuffled = shuffle(pairs.map((p) => p[1]), rng);
  const answer: Record<string, string> = {};
  const letters = ["a", "b", "c", "d", "e"];
  pairs.forEach((p, i) => {
    answer[String(i)] = letters[rightShuffled.indexOf(p[1])];
  });
  return {
    type: "menjodohkan",
    question: "Pasangkan setiap pernyataan di kiri dengan jawaban yang tepat di kanan.",
    options: { left, right: rightShuffled },
    answer,
    discussion,
    points: 5,
  };
}

// ---------------------------------------------------------------------------
// Data bab Kelas 1 (ditulis penuh). Format ringkas:
// [id, judul, mapel, ringkasan, poin[], teksFokus, kartu[depan,belakang]x5,
//  kuisTulis[soal, opsi[3], indeksBenar, pembahasan]x5]
// 5 soal kuis sisanya diturunkan otomatis dari kartu (lihat buildK1Chapter).
// ---------------------------------------------------------------------------
type K1Row = [
  id: string,
  title: string,
  subject: string,
  summary: string,
  points: string[],
  focus: string,
  fc: [string, string][],
  quiz: [string, string[], number, string][]
];

const K1_ROWS: K1Row[] = [
  // ---------------- Matematika ----------------
  [
    "k1-mtk-bilang", "Membilang sampai 10", "Matematika",
    "Kamu belajar membilang benda satu sampai sepuluh. Bilangan membantu kita tahu ada berapa benda. Ayo hitung pelan-pelan, satu demi satu.",
    [
      "Bilangan 1 sampai 10 diurutkan: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10.",
      "Membilang artinya menghitung benda satu demi satu.",
      "Setiap bilangan punya lambang, misalnya 3 dibaca tiga.",
      "Dua kelompok benda bisa dibandingkan: lebih banyak, lebih sedikit, atau sama banyak.",
      "Bilangan sesudah 5 adalah 6, dan bilangan sebelum 5 adalah 4.",
      "Membilang bisa memakai jari, benda, atau gambar.",
    ],
    "Teman-teman, coba lihat sekelilingmu. Ada berapa pensil di mejamu? Ada berapa kursi di kelasmu? Semua bisa dihitung dengan bilangan. Bilangan 1 sampai 10 adalah teman pertama kita dalam berhitung. Saat membilang, sentuh bendanya satu demi satu sambil menyebut bilangannya. Jangan terburu-buru, ya. Kalau kamu sudah bisa membilang sampai 10 tanpa terlewat, kamu hebat!",
    [
      ["Bilangan sesudah 3", "4"],
      ["Bilangan sebelum 7", "6"],
      ["Tiga apel ditambah satu apel", "4 apel"],
      ["Lambang bilangan delapan", "8"],
      ["Lima kelereng", "lima"],
    ],
    [
      ["Ada 4 pensil. Ibu memberi 2 pensil lagi. Berapa pensil sekarang?", ["5", "6", "7"], 1, "4 ditambah 2 sama dengan 6. Hitung pelan-pelan: 4, 5, 6."],
      ["Bilangan manakah yang paling besar?", ["7", "9", "4"], 1, "9 lebih besar dari 7 dan 4. Ingat urutannya: 7, 8, 9, 10."],
      ["Bilangan delapan ditulis dengan angka ...", ["8", "7", "9"], 0, "Delapan ditulis 8."],
      ["Urutan bilangan yang benar adalah ...", ["1, 3, 2, 4", "1, 2, 3, 4", "4, 3, 2, 1"], 1, "Bilangan diurutkan dari kecil ke besar: 1, 2, 3, 4."],
      ["Berapa bilangan antara 5 dan 7?", ["4", "6", "8"], 1, "Antara 5 dan 7 adalah 6."],
    ],
  ],
  [
    "k1-mtk-tambah", "Penjumlahan sampai 10", "Matematika",
    "Penjumlahan artinya menggabungkan dua kelompok benda. Hasilnya disebut jumlah. Kamu bisa memakai jari atau benda untuk menghitung.",
    [
      "Penjumlahan memakai tanda tambah (+).",
      "2 + 3 = 5 dibaca dua ditambah tiga sama dengan lima.",
      "Urutan bilangan yang ditambah tidak mengubah hasil: 2 + 3 sama dengan 3 + 2.",
      "Hasil penjumlahan dua bilangan di bab ini tidak lebih dari 10.",
      "Benda atau jari membantu menghitung penjumlahan.",
      "Soal cerita penjumlahan biasanya memakai kata ditambah, diberi lagi, atau semuanya.",
    ],
    "Bayangkan kamu punya 3 apel, lalu temanmu memberimu 2 apel lagi. Sekarang apelmu ada 5. Itulah penjumlahan: menggabungkan menjadi satu kelompok yang lebih besar. Tanda tambah (+) seperti salib kecil. Coba hitung dengan jarimu: angkat 3 jari, lalu tambah 2 jari. Ada berapa semuanya? Lima! Kalau sudah lancar sampai 10, coba soal cerita sederhana di rumah.",
    [
      ["2 + 3", "5"],
      ["4 + 4", "8"],
      ["1 + 9", "10"],
      ["Tanda tambah", "+"],
      ["5 + 0", "5"],
    ],
    [
      ["Berapa hasil 3 + 2?", ["4", "5", "6"], 1, "3 ditambah 2 sama dengan 5."],
      ["Andi punya 6 kelereng. Beni memberinya 3 kelereng. Berapa kelereng Andi sekarang?", ["8", "9", "10"], 1, "6 + 3 = 9."],
      ["Pasangan bilangan yang jumlahnya 10 adalah ...", ["4 dan 5", "6 dan 4", "7 dan 2"], 1, "6 + 4 = 10."],
      ["5 + 5 = ...", ["9", "10", "11"], 1, "5 + 5 = 10."],
      ["Manakah kalimat penjumlahan yang benar?", ["2 + 2 = 5", "3 + 4 = 7", "1 + 1 = 3"], 1, "3 + 4 = 7. Dua kalimat lain salah, coba hitung lagi."],
    ],
  ],
  [
    "k1-mtk-kurang", "Pengurangan sampai 10", "Matematika",
    "Pengurangan artinya mengambil sebagian benda dari satu kelompok. Hasilnya disebut selisih. Sisanya pasti lebih sedikit dari semula.",
    [
      "Pengurangan memakai tanda kurang (−).",
      "5 − 2 = 3 dibaca lima dikurangi dua sama dengan tiga.",
      "Pengurangan terjadi saat benda diambil, dimakan, atau diberikan.",
      "Hasil pengurangan selalu lebih kecil dari bilangan mula-mula.",
      "Jari dan benda membantu menghitung pengurangan.",
      "Soal cerita pengurangan biasanya memakai kata diambil, dimakan, atau sisa.",
    ],
    "Kamu punya 7 permen, lalu kamu makan 2 permen. Berapa sisanya? Lima permen. Itulah pengurangan: ada benda yang berkurang. Tanda kurang (−) seperti garis pendek. Coba dengan jarimu: angkat 7 jari, lalu lipat 2 jari. Berapa jari yang masih tegak? Lima. Hati-hati, bilangan yang dikurangi harus lebih besar atau sama dengan pengurangnya, ya.",
    [
      ["5 − 2", "3"],
      ["9 − 4", "5"],
      ["7 − 7", "0"],
      ["Tanda kurang", "−"],
      ["10 − 3", "7"],
    ],
    [
      ["Berapa hasil 6 − 2?", ["3", "4", "5"], 1, "6 dikurangi 2 sama dengan 4."],
      ["Sinta punya 8 buku. Ia memberikan 3 buku kepada temannya. Berapa buku Sinta sekarang?", ["4", "5", "6"], 1, "8 − 3 = 5."],
      ["10 − 6 = ...", ["3", "4", "5"], 1, "10 − 6 = 4."],
      ["Manakah kalimat pengurangan yang benar?", ["7 − 2 = 4", "9 − 3 = 6", "5 − 1 = 3"], 1, "9 − 3 = 6. Dua kalimat lain salah, coba hitung lagi."],
      ["Ada 9 burung di pohon. Terbang 5 burung. Berapa burung yang tinggal?", ["3", "4", "5"], 1, "9 − 5 = 4."],
    ],
  ],
  [
    "k1-mtk-bentuk", "Mengenal Bentuk", "Matematika",
    "Di sekeliling kita ada banyak bentuk. Lingkaran, segitiga, segiempat, dan persegi panjang bisa kamu temukan pada benda sehari-hari.",
    [
      "Lingkaran tidak punya sudut dan sisinya melengkung, seperti roda dan jam dinding.",
      "Segitiga punya 3 sisi dan 3 sudut, seperti potongan pizza.",
      "Segiempat punya 4 sisi, misalnya persegi.",
      "Persegi panjang punya 4 sisi, sisi yang berhadapan sama panjang, seperti pintu dan buku.",
      "Bentuk yang sama bisa berbeda ukuran dan warna.",
      "Benda di sekitar kita terdiri dari gabungan beberapa bentuk.",
    ],
    "Coba perhatikan benda di sekelilingmu. Jam dinding bentuknya lingkaran. Atap rumah bentuknya segitiga. Papan tulis bentuknya persegi panjang. Setiap bentuk punya ciri sendiri: hitung sisinya, hitung sudutnya. Lingkaran istimewa karena tidak punya sudut sama sekali. Kalau kamu bisa menyebutkan bentuk benda-benda di rumah, kamu sudah pandai mengenal bentuk!",
    [
      ["Bentuk roda sepeda", "lingkaran"],
      ["Bentuk dengan 3 sisi", "segitiga"],
      ["Bentuk pintu", "persegi panjang"],
      ["Bentuk dengan 4 sisi sama panjang", "persegi"],
      ["Lingkaran mempunyai sudut", "tidak punya sudut"],
    ],
    [
      ["Benda manakah yang berbentuk lingkaran?", ["Buku", "Jam dinding", "Pintu"], 1, "Jam dinding berbentuk lingkaran."],
      ["Berapa sisi segitiga?", ["2", "3", "4"], 1, "Segitiga punya 3 sisi dan 3 sudut."],
      ["Persegi panjang mempunyai ...", ["3 sisi", "4 sisi", "tidak punya sisi"], 1, "Persegi panjang punya 4 sisi."],
      ["Bentuk manakah yang tidak punya sudut?", ["Segitiga", "Persegi", "Lingkaran"], 2, "Lingkaran tidak punya sudut karena sisinya melengkung."],
      ["Buku tulis berbentuk ...", ["lingkaran", "segitiga", "persegi panjang"], 2, "Buku tulis berbentuk persegi panjang."],
    ],
  ],
  [
    "k1-mtk-bilang11", "Bilangan 11 sampai 20", "Matematika",
    "Setelah sampai 10, kita lanjut membilang sampai 20. Bilangan 11 sampai 20 terdiri dari satu puluhan dan beberapa satuan.",
    [
      "Bilangan 11 dibaca sebelas, 12 dua belas, 13 tiga belas, sampai 20 dua puluh.",
      "11 sama dengan 10 + 1, 15 sama dengan 10 + 5, 20 sama dengan 10 + 10.",
      "Setiap bilangan 11 sampai 20 punya 1 puluhan dan beberapa satuan.",
      "13 terdiri dari 1 puluhan dan 3 satuan.",
      "Urutan bilangan 11 sampai 20 dari kecil ke besar: 11, 12, 13, 14, 15, 16, 17, 18, 19, 20.",
      "Membandingkan bilangan: 17 lebih besar dari 14, 12 lebih kecil dari 19.",
    ],
    "Sepuluh jari tanganmu sudah habis dipakai, tapi bilangan masih berlanjut! Setelah 10 ada 11, 12, 13, sampai 20. Bayangkan satu kotak berisi 10 kelereng, lalu tambah beberapa kelereng di luar kotak. Itulah bilangan belasan: satu puluhan ditambah satuan. Bilangan 14 artinya 1 puluhan dan 4 satuan. Coba hitung benda di rumah sampai 20, pelan-pelan saja.",
    [
      ["11 + 0", "11"],
      ["Bilangan 15", "lima belas"],
      ["13 = 10 + ...", "3"],
      ["Bilangan sesudah 19", "20"],
      ["1 puluhan dan 7 satuan", "17"],
    ],
    [
      ["Bilangan dua belas ditulis ...", ["11", "12", "21"], 1, "Dua belas ditulis 12."],
      ["14 terdiri dari ...", ["1 puluhan dan 4 satuan", "4 puluhan dan 1 satuan", "14 satuan"], 0, "14 = 10 + 4, jadi 1 puluhan dan 4 satuan."],
      ["Bilangan manakah yang paling besar?", ["13", "18", "15"], 1, "18 paling besar di antara 13, 15, dan 18."],
      ["10 + 6 = ...", ["15", "16", "17"], 1, "10 + 6 = 16."],
      ["Urutan bilangan dari kecil ke besar yang benar adalah ...", ["11, 13, 12", "12, 13, 14", "15, 14, 13"], 1, "12, 13, 14 sudah berurutan dari kecil ke besar."],
    ],
  ],
  // ---------------- B. Indonesia ----------------
  [
    "k1-bi-bunyi", "Bunyi Apa", "B. Indonesia",
    "Semua benda bisa berbunyi. Kamu belajar mendengarkan bunyi, mengenal suku kata ba, bi, bu, be, bo, dan huruf B.",
    [
      "Cerita Bola Boni bercerita tentang Boni dan bolanya yang berbunyi.",
      "Suku kata ba, bi, bu, be, bo semuanya memakai huruf B.",
      "Huruf B besar untuk nama orang, huruf b kecil untuk kata biasa.",
      "Bunyi ada yang pelan dan ada yang keras.",
      "Kartu nama berisi nama kita sendiri.",
      "Mendengarkan dengan baik membantu kita memahami cerita.",
    ],
    "Tutup matamu sebentar. Apa yang kamu dengar? Bunyi jam, bunyi langkah, atau bunyi angin? Setiap benda bisa berbunyi. Dalam cerita Bola Boni, Boni bermain bola yang mengeluarkan bunyi. Dari kata bola kita belajar suku kata ba, bi, bu, be, bo. Coba ucapkan: ba-bi-bu-be-bo. Lalu tulis huruf B di udara dengan jarimu. Seru, kan?",
    [
      ["Bola Boni", "cerita tentang Boni dan bola"],
      ["Suku kata dari kata bola", "bo-la"],
      ["Huruf pertama kata bola", "B"],
      ["Bunyi jam dinding", "tik-tok"],
      ["Kartu nama berisi", "nama kita"],
    ],
    [
      ["Kata manakah yang memakai suku kata bo?", ["Buku", "Bola", "Batu"], 1, "Bo-la memakai suku kata bo."],
      ["Huruf B besar dipakai untuk ...", ["nama benda biasa", "nama orang", "semua kata"], 1, "Nama orang memakai huruf besar, misalnya Boni."],
      ["Bunyi yang pelan adalah ...", ["bunyi petir", "bunyi jam dinding", "bunyi guntur"], 1, "Bunyi jam dinding pelan, sedangkan petir dan guntur keras."],
      ["Suku kata yang benar dari kata bibi adalah ...", ["bi-bi", "ba-bi", "bu-bi"], 0, "Bi-bi: bibi."],
      ["Kartu nama dipakai untuk ...", ["bermain bola", "memperkenalkan nama kita", "mendengarkan bunyi"], 1, "Kartu nama berisi nama kita, dipakai saat berkenalan."],
    ],
  ],
  [
    "k1-bi-bermain", "Ayo, Bermain", "B. Indonesia",
    "Bermain itu seru bila aman dan tertib. Kamu belajar suku kata h dan c, tanda tanya, dan tanda seru.",
    [
      "Suku kata dengan huruf h: ha, hi, hu, he, ho.",
      "Suku kata dengan huruf c: ca, ci, cu, ce, co.",
      "Tanda tanya (?) dipakai pada kalimat yang bertanya.",
      "Tanda seru (!) dipakai pada kalimat yang berseru atau gembira.",
      "Bermain yang aman: bergiliran, tidak mendorong, dan memakai alat dengan benar.",
      "Setelah bermain, alat dirapikan kembali.",
    ],
    "Bermain bersama teman itu menyenangkan. Tapi ada aturannya, supaya semua aman dan senang. Bergiliran saat memakai ayunan, tidak mendorong teman, dan merapikan mainan setelah selesai. Sambil bermain, kita juga belajar bahasa: huruf h berbunyi ha-hi-hu-he-ho, huruf c berbunyi ca-ci-cu-ce-co. Kalimat bertanya diakhiri tanda tanya (?), kalimat berseru diakhiri tanda seru (!).",
    [
      ["Suku kata dari kata hati", "ha-ti"],
      ["Tanda untuk kalimat bertanya", "?"],
      ["Tanda untuk kalimat berseru", "!"],
      ["Bermain yang aman", "bergiliran"],
      ["Suku kata dari kata cucu", "cu-cu"],
    ],
    [
      ["Kalimat manakah yang memakai tanda tanya?", ["Ayo bermain!", "Siapa namamu?", "Aku senang."], 1, "Kalimat bertanya memakai tanda tanya (?)."],
      ["Kalimat manakah yang memakai tanda seru?", ["Di mana bolanya?", "Hore, kita menang!", "Itu bola Boni."], 1, "Kalimat berseru memakai tanda seru (!)."],
      ["Kata manakah yang memakai suku kata ha?", ["Hati", "Cari", "Bola"], 0, "Ha-ti memakai suku kata ha."],
      ["Saat bermain ayunan, sikap yang benar adalah ...", ["mendorong teman", "bergiliran", "berebut"], 1, "Bermain yang aman berarti bergiliran."],
      ["Setelah bermain, yang harus dilakukan adalah ...", ["meninggalkan mainan", "merapikan mainan", "membuang mainan"], 1, "Mainan dirapikan kembali setelah bermain."],
    ],
  ],
  [
    "k1-bi-kuman", "Awas Kuman", "B. Indonesia",
    "Kuman itu kecil sekali sampai tidak terlihat, tapi bisa membuat kita sakit. Kamu belajar suku kata ka, ki, ku, ke, ko, dan cara menjaga kebersihan.",
    [
      "Suku kata dengan huruf k: ka, ki, ku, ke, ko.",
      "Kuman adalah makhluk sangat kecil yang bisa membuat sakit.",
      "Kuman berpindah lewat tangan yang kotor.",
      "Mencuci tangan dengan sabun membunuh kuman.",
      "Makanan yang bersih dan tertutup lebih aman dimakan.",
      "Menutup mulut saat batuk dan bersin mencegah kuman menyebar.",
    ],
    "Kuman tidak bisa dilihat dengan mata, tapi ia ada di mana-mana, terutama di tangan yang kotor. Kalau tangan kotor menyentuh makanan lalu makanan itu dimakan, kuman bisa masuk ke tubuh dan membuat kita sakit. Karena itu kita mencuci tangan dengan sabun sebelum makan dan sesudah dari toilet. Ingat suku kata ka-ki-ku-ke-ko, dan ingat juga: tangan bersih, tubuh sehat!",
    [
      ["Suku kata dari kata kuda", "ku-da"],
      ["Kuman membuat kita", "sakit"],
      ["Cara membunuh kuman di tangan", "cuci tangan pakai sabun"],
      ["Kuman berpindah lewat", "tangan kotor"],
      ["Saat batuk sebaiknya", "menutup mulut"],
    ],
    [
      ["Kata manakah yang memakai suku kata ku?", ["Kaki", "Kuda", "Kita"], 1, "Ku-da memakai suku kata ku."],
      ["Kapan kita harus mencuci tangan?", ["sebelum makan", "sesudah bermain saja", "tidak perlu"], 0, "Cuci tangan sebelum makan dan sesudah dari toilet."],
      ["Kuman bisa membuat kita ...", ["sehat", "kuat", "sakit"], 2, "Kuman yang masuk ke tubuh bisa membuat sakit."],
      ["Sikap yang benar saat bersin adalah ...", ["membuka mulut lebar", "menutup mulut", "bersin ke arah teman"], 1, "Tutup mulut saat bersin agar kuman tidak menyebar."],
      ["Makanan yang aman dimakan adalah makanan yang ...", ["jatuh di lantai", "bersih dan tertutup", "dipegang tangan kotor"], 1, "Makanan bersih dan tertutup lebih aman."],
    ],
  ],
  [
    "k1-bi-bisa", "Aku Bisa", "B. Indonesia",
    "Kamu pasti bisa melakukan banyak hal sendiri. Cerita Caca Bisa mengajarkan kita berani mencoba, dan kita belajar suku kata la, li, lu, le, lo.",
    [
      "Suku kata dengan huruf l: la, li, lu, le, lo.",
      "Cerita Caca Bisa bercerita tentang Caca yang berani mencoba.",
      "Setiap anak bisa melakukan sesuatu, misalnya melompat, berlari, dan menggambar.",
      "Gerak ada bermacam-macam: melompat, berlari, berjalan, dan memanjat.",
      "Berani mencoba membuat kita belajar hal baru.",
      "Kalau gagal, kita coba lagi sampai bisa.",
    ],
    "Caca awalnya takut mencoba. Tapi ia berani mencoba, gagal, lalu mencoba lagi, sampai akhirnya bisa! Kamu juga begitu. Mungkin melompat tinggi, berlari cepat, atau menggambar rumah. Semua diawali dari berani mencoba. Sambil belajar, ingat suku kata la-li-lu-le-lo: la seperti pada kata lalu, li seperti pada kata lilin. Apa yang bisa kamu lakukan hari ini? Coba ceritakan!",
    [
      ["Suku kata dari kata lalu", "la-lu"],
      ["Caca Bisa bercerita tentang", "Caca yang berani mencoba"],
      ["Gerak meloncat memakai", "kaki"],
      ["Kalau gagal, kita", "coba lagi"],
      ["Suku kata dari kata lilin", "li-lin"],
    ],
    [
      ["Kata manakah yang memakai suku kata lo?", ["Lalu", "Lomba", "Lilin"], 1, "Lom-ba memakai suku kata lo."],
      ["Caca akhirnya bisa karena ia ...", ["menyerah", "berani mencoba", "takut mencoba"], 1, "Caca berani mencoba sampai bisa."],
      ["Contoh gerak yang bisa dilakukan anak adalah ...", ["duduk diam saja", "melompat dan berlari", "tidur terus"], 1, "Melompat dan berlari adalah contoh gerak."],
      ["Kalau gagal saat mencoba, sikap yang baik adalah ...", ["menangis dan berhenti", "mencoba lagi", "menyalahkan teman"], 1, "Gagal itu biasa. Coba lagi sampai bisa."],
      ["Suku kata li terdapat pada kata ...", ["lalu", "lilin", "lomba"], 1, "Li-lin memakai suku kata li."],
    ],
  ],
  // ---------------- IPAS ----------------
  [
    "k1-ipas-tubuh", "Bagian Tubuh dan Pancaindra", "IPAS",
    "Tubuh kita punya banyak bagian dan lima pancaindra. Setiap pancaindra punya tugas sendiri untuk mengenal dunia.",
    [
      "Bagian tubuh: kepala, badan, tangan, dan kaki.",
      "Mata dipakai untuk melihat.",
      "Telinga dipakai untuk mendengar.",
      "Hidung dipakai untuk mencium bau.",
      "Lidah dipakai untuk mengecap rasa.",
      "Kulit dipakai untuk meraba.",
    ],
    "Tubuh kita seperti tim yang hebat. Mata melihat langit biru, telinga mendengar burung bernyanyi, hidung mencium bau masakan, lidah merasakan manisnya buah, dan kulit merasakan hangatnya matahari. Kelima pancaindra itu bekerja sama supaya kita mengenal dunia. Rawat tubuhmu: makan yang bergizi, tidur cukup, dan jangan memasukkan benda ke telinga atau hidung, ya.",
    [
      ["Mata untuk", "melihat"],
      ["Telinga untuk", "mendengar"],
      ["Hidung untuk", "mencium bau"],
      ["Lidah untuk", "mengecap rasa"],
      ["Kulit untuk", "meraba"],
    ],
    [
      ["Pancaindra yang dipakai untuk melihat adalah ...", ["telinga", "mata", "hidung"], 1, "Mata dipakai untuk melihat."],
      ["Kita mengecap rasa manis dengan ...", ["kulit", "lidah", "mata"], 1, "Lidah dipakai untuk mengecap rasa."],
      ["Bunyi didengar oleh ...", ["hidung", "telinga", "lidah"], 1, "Telinga dipakai untuk mendengar."],
      ["Bagian tubuh yang dipakai untuk berjalan adalah ...", ["tangan", "kepala", "kaki"], 2, "Kaki dipakai untuk berjalan."],
      ["Pancaindra kita ada ...", ["tiga", "lima", "sepuluh"], 1, "Pancaindra ada lima: mata, telinga, hidung, lidah, kulit."],
    ],
  ],
  [
    "k1-ipas-benda", "Benda di Sekitarku", "IPAS",
    "Di sekitar kita ada benda hidup dan benda tak hidup. Benda hidup tumbuh dan bergerak, benda tak hidup tidak tumbuh.",
    [
      "Benda hidup contohnya manusia, hewan, dan tumbuhan.",
      "Benda hidup bisa tumbuh, bernapas, dan bergerak.",
      "Benda tak hidup contohnya meja, kursi, batu, dan buku.",
      "Benda tak hidup tidak tumbuh dan tidak bernapas.",
      "Tumbuhan butuh air dan cahaya matahari untuk tumbuh.",
      "Benda di kelas dan di rumah punya guna masing-masing.",
    ],
    "Lihat tanaman di pot: ia tumbuh makin tinggi karena disiram dan kena matahari. Itulah benda hidup. Sekarang lihat mejamu: ia tidak tumbuh dan tidak bernapas. Itulah benda tak hidup. Manusia, hewan, dan tumbuhan adalah benda hidup karena mereka tumbuh, bernapas, dan bergerak. Benda di sekitarmu, dari buku sampai batu, masing-masing punya guna. Ayo sebutkan 3 benda hidup dan 3 benda tak hidup di rumahmu!",
    [
      ["Contoh benda hidup", "kucing"],
      ["Contoh benda tak hidup", "meja"],
      ["Tumbuhan butuh", "air dan cahaya matahari"],
      ["Benda hidup bisa", "tumbuh dan bergerak"],
      ["Buku termasuk benda", "tak hidup"],
    ],
    [
      ["Manakah yang termasuk benda hidup?", ["Meja", "Kucing", "Batu"], 1, "Kucing hidup: tumbuh, bernapas, bergerak."],
      ["Manakah yang termasuk benda tak hidup?", ["Pohon", "Buku", "Burung"], 1, "Buku tidak tumbuh dan tidak bernapas."],
      ["Tumbuhan tumbuh karena mendapat ...", ["air dan cahaya matahari", "meja dan kursi", "baju dan sepatu"], 0, "Tumbuhan butuh air dan cahaya matahari."],
      ["Benda hidup bisa ...", ["tumbuh", "berkarat", "pecah"], 0, "Benda hidup tumbuh, bernapas, dan bergerak."],
      ["Manusia termasuk benda ...", ["tak hidup", "hidup", "mati"], 1, "Manusia adalah benda hidup."],
    ],
  ],
  // ---------------- Pancasila ----------------
  [
    "k1-pancasila-teman", "Aku dan Teman-Temanku", "Pancasila",
    "Setiap anak berbeda-beda, dan perbedaan itu indah. Kita belajar berkenalan dengan sopan, menghargai teman, dan merawat diri sendiri.",
    [
      "Berkenalan yang sopan: menyebut nama dan menyapa dengan ramah.",
      "Setiap teman berbeda, misalnya rambut, kulit, dan kesukaan.",
      "Perbedaan harus dihargai, bukan diejek.",
      "Merawat tubuh: mandi, gosok gigi, dan memakai pakaian bersih.",
      "Anak mandiri melakukan sendiri hal-hal sederhana, seperti memakai sepatu.",
      "Bermain bersama harus rukun dan bergiliran.",
    ],
    "Hai, teman-teman! Siapa namamu? Di kelas ada banyak teman dengan wajah, rambut, dan kesukaan yang berbeda. Ada yang suka menggambar, ada yang suka berlari. Perbedaan itu membuat kelas kita seru. Yang penting, kita saling menghargai dan tidak mengejek. Kita juga belajar mandiri: mandi sendiri, memakai sepatu sendiri, dan merapikan tas sendiri. Kamu pasti bisa!",
    [
      ["Berkenalan yang sopan", "menyebut nama dengan ramah"],
      ["Perbedaan teman harus", "dihargai"],
      ["Merawat tubuh", "mandi dan gosok gigi"],
      ["Anak mandiri", "memakai sepatu sendiri"],
      ["Bermain bersama harus", "rukun"],
    ],
    [
      ["Saat berkenalan, sikap yang sopan adalah ...", ["menyebut nama dengan ramah", "menertawakan nama teman", "diam saja"], 0, "Berkenalan dengan sopan: sapa dan sebut nama dengan ramah."],
      ["Teman kita berbeda-beda. Sikap yang benar adalah ...", ["mengejek perbedaan", "menghargai perbedaan", "tidak mau berteman"], 1, "Perbedaan harus dihargai."],
      ["Contoh merawat tubuh adalah ...", ["mandi dan gosok gigi", "tidak pernah mandi", "memakai baju kotor"], 0, "Mandi dan gosok gigi menjaga tubuh tetap sehat."],
      ["Anak mandiri bisa ...", ["memakai sepatu sendiri", "meminta orang lain mengerjakan semua", "tidak mau mencoba"], 0, "Anak mandiri melakukan hal sederhana sendiri."],
      ["Saat bermain bersama, kita harus ...", ["berebut mainan", "rukun dan bergiliran", "mendorong teman"], 1, "Bermain bersama harus rukun dan bergiliran."],
    ],
  ],
  [
    "k1-pancasila-aturan", "Aku Patuh pada Aturan", "Pancasila",
    "Aturan ada supaya hidup kita tertib dan aman. Ada aturan di rumah, di sekolah, dan saat makan. Anak yang patuh aturan disayang semua orang.",
    [
      "Aturan di rumah contohnya merapikan mainan dan tidur tepat waktu.",
      "Aturan di sekolah contohnya datang tepat waktu dan mendengarkan guru.",
      "Makan dengan tenang: duduk, tidak berlari, dan menghabiskan makanan.",
      "Jadwal harian membantu kita tahu apa yang dilakukan setiap waktu.",
      "Aturan membuat hidup aman dan tertib.",
      "Melanggar aturan bisa membahayakan diri sendiri dan orang lain.",
    ],
    "Setiap tempat punya aturan. Di rumah, kita merapikan mainan dan tidur tepat waktu. Di sekolah, kita datang tepat waktu dan mendengarkan guru. Saat makan, kita duduk tenang dan tidak berlarian. Aturan mungkin terasa membatasi, tapi sebenarnya aturan melindungi kita. Bayangkan kalau semua orang berlari di kelas — pasti tidak aman! Jadi, patuh pada aturan itu hebat.",
    [
      ["Aturan di rumah", "merapikan mainan"],
      ["Aturan di sekolah", "datang tepat waktu"],
      ["Makan dengan tenang", "duduk dan tidak berlari"],
      ["Jadwal harian membantu", "mengatur waktu"],
      ["Aturan membuat hidup", "aman dan tertib"],
    ],
    [
      ["Contoh aturan di rumah adalah ...", ["merapikan mainan", "membuang sampah sembarangan", "tidur larut malam"], 0, "Merapikan mainan adalah aturan di rumah."],
      ["Saat makan, sikap yang benar adalah ...", ["berlari-lari", "duduk dengan tenang", "berteriak"], 1, "Makan dengan tenang dan duduk."],
      ["Aturan di sekolah contohnya ...", ["datang tepat waktu", "pulang seenaknya", "tidak mendengarkan guru"], 0, "Datang tepat waktu adalah aturan di sekolah."],
      ["Jadwal harian berguna untuk ...", ["mengatur waktu", "membuat kita bingung", "tidak ada gunanya"], 0, "Jadwal harian membantu mengatur waktu."],
      ["Mengapa kita patuh pada aturan?", ["supaya hidup aman dan tertib", "supaya dimarahi", "tidak ada alasannya"], 0, "Aturan membuat hidup aman dan tertib."],
    ],
  ],
  // ---------------- B. Inggris ----------------
  [
    "k1-bing-salam", "Salam dan Perkenalan", "B. Inggris",
    "Hello! Kamu belajar menyapa dan berkenalan dalam bahasa Inggris. Good morning, what's your name? Ayo jawab dengan percaya diri.",
    [
      "Hello artinya halo.",
      "Good morning artinya selamat pagi.",
      "Good afternoon artinya selamat siang atau sore.",
      "What's your name? artinya siapa namamu?",
      "My name is ... artinya namaku ...",
      "Nice to meet you artinya senang berkenalan denganmu.",
    ],
    "Hello, friends! Pagi ini kita belajar menyapa dalam bahasa Inggris. Good morning berarti selamat pagi. Kalau seseorang bertanya What's your name?, jawab dengan My name is ... lalu sebutkan namamu. Setelah berkenalan, ucapkan Nice to meet you, senang berkenalan denganmu. Coba latih dengan teman sebangkumu, ya!",
    [
      ["Hello", "halo"],
      ["Good morning", "selamat pagi"],
      ["What's your name?", "siapa namamu?"],
      ["My name is ...", "namaku ..."],
      ["Nice to meet you", "senang berkenalan denganmu"],
    ],
    [
      ["Good morning artinya ...", ["selamat malam", "selamat pagi", "sampai jumpa"], 1, "Good morning = selamat pagi."],
      ["Untuk bertanya nama dalam bahasa Inggris, kita berkata ...", ["Hello!", "What's your name?", "Nice to meet you."], 1, "What's your name? artinya siapa namamu?"],
      ["My name is Sinta artinya ...", ["namaku Sinta", "selamat pagi Sinta", "sampai jumpa Sinta"], 0, "My name is ... artinya namaku ..."],
      ["Hello artinya ...", ["selamat tinggal", "halo", "terima kasih"], 1, "Hello = halo."],
      ["Setelah berkenalan, kita bisa berkata ...", ["Good night.", "Nice to meet you.", "Good bye?"], 1, "Nice to meet you = senang berkenalan denganmu."],
    ],
  ],
  [
    "k1-bing-angka", "Angka dan Warna", "B. Inggris",
    "One, two, three! Kamu belajar bilangan 1 sampai 10 dan warna dalam bahasa Inggris. Red, blue, yellow — warna apa kesukaanmu?",
    [
      "Bilangan 1 sampai 10: one, two, three, four, five, six, seven, eight, nine, ten.",
      "Red artinya merah.",
      "Blue artinya biru.",
      "Yellow artinya kuning.",
      "Green artinya hijau.",
      "What color is it? artinya warna apa itu?",
    ],
    "Let's count! One, two, three, four, five — sampai ten. Sekarang warna: red untuk merah, blue untuk biru, yellow untuk kuning, green untuk hijau. Coba lihat bajumu: what color is it? Warna apa itu? Kalau merah, jawab: It is red. Belajar bahasa Inggris itu seperti bermain: dengarkan, tirukan, lalu ucapkan sendiri.",
    [
      ["One", "satu"],
      ["Five", "lima"],
      ["Red", "merah"],
      ["Blue", "biru"],
      ["Yellow", "kuning"],
    ],
    [
      ["Three artinya ...", ["satu", "dua", "tiga"], 2, "Three = tiga."],
      ["Warna merah dalam bahasa Inggris adalah ...", ["blue", "red", "green"], 1, "Red = merah."],
      ["Ten artinya ...", ["sepuluh", "sembilan", "delapan"], 0, "Ten = sepuluh."],
      ["Blue artinya ...", ["kuning", "hijau", "biru"], 2, "Blue = biru."],
      ["What color is it? artinya ...", ["berapa jumlahnya?", "warna apa itu?", "apa namamu?"], 1, "What color is it? = warna apa itu?"],
    ],
  ],
  [
    "k1-bing-kelas", "Benda di Kelas", "B. Inggris",
    "Look around! Di kelas ada banyak benda. Kamu belajar nama benda dalam bahasa Inggris: book, pencil, bag, chair, dan table.",
    [
      "Book artinya buku.",
      "Pencil artinya pensil.",
      "Bag artinya tas.",
      "Chair artinya kursi.",
      "Table artinya meja.",
      "This is a book artinya ini sebuah buku.",
    ],
    "Look around your classroom! Ada book di atas table, ada pencil di dalam bag, dan ada chair untuk duduk. Coba tunjuk bendanya sambil menyebut namanya dalam bahasa Inggris: This is a book. Ini sebuah buku. This is a pencil. Ini sebuah pensil. Sekarang giliranmu: sebutkan 3 benda di kelasmu dalam bahasa Inggris!",
    [
      ["Book", "buku"],
      ["Pencil", "pensil"],
      ["Bag", "tas"],
      ["Chair", "kursi"],
      ["Table", "meja"],
    ],
    [
      ["Pencil artinya ...", ["buku", "tas", "pensil"], 2, "Pencil = pensil."],
      ["Benda untuk duduk disebut ...", ["table", "chair", "bag"], 1, "Chair = kursi."],
      ["Book artinya ...", ["buku", "meja", "tas"], 0, "Book = buku."],
      ["This is a book artinya ...", ["itu sebuah tas", "ini sebuah buku", "ini sebuah pensil"], 1, "This is a book = ini sebuah buku."],
      ["Table artinya ...", ["kursi", "meja", "buku"], 1, "Table = meja."],
    ],
  ],
  // ---------------- PJOK ----------------
  [
    "k1-pjok-nonlok", "Gerak Non-Lokomotor", "PJOK",
    "Gerak non-lokomotor adalah gerak yang dilakukan di tempat, tanpa berpindah. Contohnya membungkuk, memutar badan, dan mengayun lengan.",
    [
      "Gerak non-lokomotor dilakukan di tempat, tanpa berpindah.",
      "Membungkuk adalah contoh gerak non-lokomotor.",
      "Memutar badan dan pinggang adalah gerak non-lokomotor.",
      "Mengayun lengan ke depan dan ke belakang adalah gerak non-lokomotor.",
      "Menekuk lutut dan mengangkat tangan juga gerak non-lokomotor.",
      "Pemanasan dengan gerak non-lokomotor membuat tubuh siap berolahraga.",
    ],
    "Tahukah kamu, ada gerak yang dilakukan tanpa berpindah tempat? Itulah gerak non-lokomotor. Coba berdiri di tempatmu: membungkuk seperti mengambil benda, memutar badan ke kiri dan ke kanan, lalu mengayun lenganmu. Kaki tidak berpindah, tapi tubuhmu tetap bergerak! Gerak ini bagus untuk pemanasan sebelum olahraga. Lakukan pelan-pelan dan hati-hati, ya.",
    [
      ["Gerak non-lokomotor", "gerak di tempat"],
      ["Membungkuk", "gerak non-lokomotor"],
      ["Memutar badan", "gerak non-lokomotor"],
      ["Mengayun lengan", "gerak non-lokomotor"],
      ["Menekuk lutut", "gerak non-lokomotor"],
    ],
    [
      ["Gerak non-lokomotor adalah gerak yang ...", ["berpindah tempat", "dilakukan di tempat", "berlari jauh"], 1, "Non-lokomotor = gerak di tempat."],
      ["Contoh gerak non-lokomotor adalah ...", ["berlari", "membungkuk", "melompat jauh"], 1, "Membungkuk dilakukan di tempat."],
      ["Memutar badan termasuk gerak ...", ["lokomotor", "non-lokomotor", "manipulatif"], 1, "Memutar badan adalah gerak non-lokomotor."],
      ["Mengayun lengan dilakukan ...", ["sambil berlari", "di tempat", "sambil melompat"], 1, "Mengayun lengan adalah gerak di tempat."],
      ["Sebelum olahraga, pemanasan yang baik adalah ...", ["langsung berlari kencang", "gerak non-lokomotor pelan-pelan", "duduk diam"], 1, "Pemanasan dengan gerak non-lokomotor menyiapkan tubuh."],
    ],
  ],
  [
    "k1-pjok-lok", "Gerak Lokomotor", "PJOK",
    "Gerak lokomotor adalah gerak yang membuat tubuh berpindah tempat. Berjalan, berlari, melompat, merangkak, dan berguling adalah contohnya.",
    [
      "Gerak lokomotor membuat tubuh berpindah tempat.",
      "Berjalan adalah gerak lokomotor yang paling pelan.",
      "Berlari lebih cepat dari berjalan.",
      "Melompat memakai dua kaki, mendarat dengan lutut sedikit ditekuk.",
      "Merangkak memakai tangan dan kaki.",
      "Berguling dilakukan dengan badan digulingkan ke samping, di tempat yang aman.",
    ],
    "Ayo bergerak! Berjalan pelan seperti sedang jalan-jalan, lalu berlari kecil seperti dikejar kupu-kupu. Gerak yang membuatmu berpindah tempat disebut gerak lokomotor. Melompat seperti katak, merangkak seperti bayi, dan berguling seperti bola di atas matras. Ingat: lakukan di tempat yang aman dan rata, dan jangan lupa pemanasan dulu!",
    [
      ["Gerak lokomotor", "gerak berpindah tempat"],
      ["Berjalan", "gerak lokomotor"],
      ["Berlari", "gerak lokomotor"],
      ["Melompat", "gerak lokomotor"],
      ["Merangkak", "gerak lokomotor"],
    ],
    [
      ["Gerak lokomotor adalah gerak yang ...", ["dilakukan di tempat", "membuat tubuh berpindah tempat", "tidak bergerak sama sekali"], 1, "Lokomotor = gerak berpindah tempat."],
      ["Contoh gerak lokomotor adalah ...", ["membungkuk", "berlari", "memutar badan"], 1, "Berlari membuat tubuh berpindah tempat."],
      ["Gerak yang lebih cepat dari berjalan adalah ...", ["merangkak", "berlari", "membungkuk"], 1, "Berlari lebih cepat dari berjalan."],
      ["Melompat sebaiknya mendarat dengan ...", ["lutut lurus kaku", "lutut sedikit ditekuk", "satu kaki saja"], 1, "Mendarat dengan lutut sedikit ditekuk supaya aman."],
      ["Merangkak memakai ...", ["tangan dan kaki", "kepala saja", "punggung"], 0, "Merangkak memakai tangan dan kaki."],
    ],
  ],
  [
    "k1-pjok-manip", "Gerak Manipulatif", "PJOK",
    "Gerak manipulatif adalah gerak mengendalikan benda, misalnya melempar, menangkap, menendang, dan memantulkan bola.",
    [
      "Gerak manipulatif memakai benda, misalnya bola.",
      "Melempar bola adalah gerak manipulatif.",
      "Menangkap bola melatih mata dan tangan bekerja sama.",
      "Menendang bola memakai kaki.",
      "Memantulkan bola dilakukan dengan telapak tangan.",
      "Bermain bola melatih kerja sama dengan teman.",
    ],
    "Pernah bermain lempar tangkap bola? Saat kamu melempar, menangkap, menendang, atau memantulkan bola, itulah gerak manipulatif: gerak yang mengendalikan benda. Mata melihat bola, tangan atau kaki menggerakkannya. Mulailah dengan bola yang ringan dan besar, lempar pelan-pelan ke temanmu, dan tangkap dengan dua tangan. Kalau bola jatuh, tidak apa-apa — ambil lagi dan coba lagi!",
    [
      ["Melempar bola", "gerak manipulatif"],
      ["Menangkap bola", "gerak manipulatif"],
      ["Menendang bola", "gerak manipulatif"],
      ["Memantulkan bola", "gerak manipulatif"],
      ["Menggiring bola memakai", "kaki"],
    ],
    [
      ["Gerak manipulatif adalah gerak yang ...", ["diam di tempat", "mengendalikan benda", "tidak memakai alat"], 1, "Manipulatif = gerak mengendalikan benda."],
      ["Contoh gerak manipulatif adalah ...", ["berjalan", "melempar bola", "membungkuk"], 1, "Melempar bola memakai benda (bola)."],
      ["Menendang bola memakai ...", ["tangan", "kaki", "kepala"], 1, "Menendang memakai kaki."],
      ["Menangkap bola melatih ...", ["mata dan tangan bekerja sama", "tidur", "duduk diam"], 0, "Menangkap melatih mata dan tangan bekerja sama."],
      ["Memantulkan bola dilakukan dengan ...", ["kaki", "telapak tangan", "siku"], 1, "Bola dipantulkan dengan telapak tangan."],
    ],
  ],
  // ---------------- PAI ----------------
  [
    "k1-pai-quran", "Aku Cinta Al-Qur'an", "PAI",
    "Al-Qur'an adalah kitab suci umat Islam. Kita belajar huruf hijaiah, harakat, dan Surah Al-Fatihah, surah pembuka Al-Qur'an.",
    [
      "Huruf hijaiah ada 28, dari alif sampai ya.",
      "Harakat fathah berbunyi a, kasrah berbunyi i, dammah berbunyi u.",
      "Ba dengan fathah dibaca ba, kasrah dibaca bi, dammah dibaca bu.",
      "Surah Al-Fatihah adalah surah pertama dalam Al-Qur'an.",
      "Surah Al-Fatihah terdiri dari 7 ayat.",
      "Membaca Al-Qur'an dimulai dengan membaca basmalah.",
    ],
    "Al-Qur'an adalah kitab suci yang diturunkan kepada Nabi Muhammad. Hurufnya disebut huruf hijaiah, ada 28 huruf dari alif sampai ya. Setiap huruf bisa berbunyi a, i, atau u tergantung harakatnya: fathah berbunyi a, kasrah berbunyi i, dammah berbunyi u. Surah pertama yang kita hafal adalah Al-Fatihah, surah pembuka yang terdiri dari 7 ayat. Yuk, belajar membacanya pelan-pelan bersama guru dan orang tuamu.",
    [
      ["Huruf hijaiah ada", "28 huruf"],
      ["Fathah berbunyi", "a"],
      ["Kasrah berbunyi", "i"],
      ["Dammah berbunyi", "u"],
      ["Al-Fatihah terdiri dari", "7 ayat"],
    ],
    [
      ["Huruf hijaiah berjumlah ...", ["25", "28", "30"], 1, "Huruf hijaiah ada 28."],
      ["Harakat fathah berbunyi ...", ["i", "u", "a"], 2, "Fathah berbunyi a."],
      ["Surah Al-Fatihah adalah surah ...", ["terakhir", "pertama", "kedua"], 1, "Al-Fatihah adalah surah pertama, surah pembuka."],
      ["Surah Al-Fatihah terdiri dari ...", ["5 ayat", "7 ayat", "10 ayat"], 1, "Al-Fatihah terdiri dari 7 ayat."],
      ["Ba dengan dammah dibaca ...", ["ba", "bi", "bu"], 2, "Dammah berbunyi u, jadi ba dibaca bu."],
    ],
  ],
  [
    "k1-pai-iman", "Mengenal Rukun Iman", "PAI",
    "Rukun iman ada enam. Beriman artinya percaya dengan sepenuh hati kepada Allah, malaikat, kitab, rasul, hari akhir, serta qada dan qadar.",
    [
      "Rukun iman ada 6.",
      "Iman kepada Allah: percaya Allah itu ada dan Maha Esa.",
      "Iman kepada malaikat: percaya malaikat utusan Allah.",
      "Iman kepada kitab: percaya kitab-kitab Allah, termasuk Al-Qur'an.",
      "Iman kepada rasul: percaya para rasul utusan Allah.",
      "Iman kepada hari akhir serta qada dan qadar Allah.",
    ],
    "Iman artinya percaya. Ada enam hal yang wajib kita percayai, disebut rukun iman. Pertama, percaya kepada Allah. Kedua, percaya kepada malaikat. Ketiga, percaya kepada kitab-kitab Allah. Keempat, percaya kepada para rasul. Kelima, percaya kepada hari akhir. Keenam, percaya kepada qada dan qadar Allah. Enam rukun iman ini adalah dasar keimanan kita. Hafalkan dengan lagu atau tepuk tangan supaya mudah diingat!",
    [
      ["Rukun iman ada", "enam"],
      ["Iman kepada Allah artinya", "percaya Allah itu ada"],
      ["Malaikat adalah", "utusan Allah"],
      ["Kitab suci umat Islam", "Al-Qur'an"],
      ["Rasul adalah", "utusan Allah"],
    ],
    [
      ["Rukun iman berjumlah ...", ["lima", "enam", "tujuh"], 1, "Rukun iman ada enam."],
      ["Iman kepada Allah artinya percaya bahwa Allah ...", ["tidak ada", "itu ada dan Maha Esa", "punya teman"], 1, "Iman kepada Allah: percaya Allah itu ada dan Maha Esa."],
      ["Kitab suci umat Islam adalah ...", ["Al-Qur'an", "Injil saja", "Taurat saja"], 0, "Al-Qur'an adalah kitab suci umat Islam."],
      ["Malaikat adalah ...", ["utusan Allah", "manusia biasa", "hewan"], 0, "Malaikat adalah utusan Allah."],
      ["Rukun iman yang keenam adalah iman kepada ...", ["malaikat", "hari akhir dan qada qadar", "kitab"], 1, "Rukun iman keenam: hari akhir serta qada dan qadar."],
    ],
  ],
  [
    "k1-pai-basmalah", "Basmalah dan Hamdalah", "PAI",
    "Basmalah dibaca sebelum memulai kegiatan yang baik, hamdalah dibaca sesudahnya. Keduanya mengajarkan kita selalu mengingat Allah.",
    [
      "Basmalah dibaca sebelum memulai kegiatan yang baik.",
      "Basmalah artinya dengan menyebut nama Allah yang Maha Pengasih lagi Maha Penyayang.",
      "Hamdalah dibaca sesudah selesai melakukan kegiatan.",
      "Hamdalah artinya segala puji bagi Allah.",
      "Membaca basmalah membuat kegiatan kita diberkahi.",
      "Membaca hamdalah adalah tanda bersyukur kepada Allah.",
    ],
    "Sebelum makan, sebelum belajar, sebelum bermain — kita membaca basmalah: bismillahirrahmanirrahim, dengan menyebut nama Allah yang Maha Pengasih lagi Maha Penyayang. Sesudah makan, sesudah belajar, sesudah selesai bermain — kita membaca hamdalah: alhamdulillah, segala puji bagi Allah. Dua kalimat pendek ini membuat semua kegiatan kita menjadi ibadah. Jangan lupa dibaca setiap hari, ya!",
    [
      ["Basmalah dibaca", "sebelum kegiatan"],
      ["Hamdalah dibaca", "sesudah kegiatan"],
      ["Basmalah artinya", "dengan menyebut nama Allah"],
      ["Hamdalah artinya", "segala puji bagi Allah"],
      ["Membaca hamdalah tanda", "bersyukur"],
    ],
    [
      ["Basmalah dibaca ...", ["sesudah kegiatan", "sebelum kegiatan", "saat tidur saja"], 1, "Basmalah dibaca sebelum memulai kegiatan yang baik."],
      ["Hamdalah dibaca ...", ["sebelum kegiatan", "sesudah kegiatan", "tidak pernah"], 1, "Hamdalah dibaca sesudah selesai kegiatan."],
      ["Hamdalah artinya ...", ["dengan menyebut nama Allah", "segala puji bagi Allah", "selamat jalan"], 1, "Hamdalah: segala puji bagi Allah."],
      ["Sebelum makan, kita membaca ...", ["hamdalah", "basmalah", "syahadat"], 1, "Sebelum makan kita membaca basmalah."],
      ["Membaca hamdalah adalah tanda kita ...", ["bersyukur", "marah", "sedih"], 0, "Hamdalah adalah tanda bersyukur kepada Allah."],
    ],
  ],
  [
    "k1-pai-islam", "Mengenal Rukun Islam", "PAI",
    "Rukun Islam ada lima: syahadat, salat, zakat, puasa, dan haji. Rukun Islam adalah dasar amalan seorang muslim.",
    [
      "Rukun Islam ada 5.",
      "Syahadat: bersaksi tiada Tuhan selain Allah dan Muhammad utusan Allah.",
      "Salat: salat lima waktu setiap hari.",
      "Zakat: memberikan sebagian harta kepada yang berhak.",
      "Puasa: menahan makan dan minum di bulan Ramadan.",
      "Haji: pergi ke Mekah bagi yang mampu.",
    ],
    "Rukun Islam ada lima, seperti lima tiang yang menyangga sebuah rumah. Pertama syahadat, dua kalimat kesaksian. Kedua salat lima waktu. Ketiga zakat. Keempat puasa di bulan Ramadan. Kelima haji ke Mekah bagi yang mampu. Kelima rukun ini adalah dasar amalan kita sebagai muslim. Hafalkan urutannya: syahadat, salat, zakat, puasa, haji.",
    [
      ["Rukun Islam ada", "lima"],
      ["Rukun Islam pertama", "syahadat"],
      ["Salat dilakukan", "lima waktu"],
      ["Puasa di bulan", "Ramadan"],
      ["Haji pergi ke", "Mekah"],
    ],
    [
      ["Rukun Islam berjumlah ...", ["empat", "lima", "enam"], 1, "Rukun Islam ada lima."],
      ["Rukun Islam yang pertama adalah ...", ["salat", "syahadat", "puasa"], 1, "Rukun Islam pertama adalah syahadat."],
      ["Salat dilakukan sebanyak ...", ["tiga waktu", "lima waktu", "tujuh waktu"], 1, "Salat lima waktu setiap hari."],
      ["Puasa dilakukan di bulan ...", ["Ramadan", "Syawal", "Muharam"], 0, "Puasa di bulan Ramadan."],
      ["Haji dilakukan di kota ...", ["Madinah", "Mekah", "Jakarta"], 1, "Haji pergi ke Mekah."],
    ],
  ],
  [
    "k1-pai-nabi", "Nabi dan Rasul Panutanku", "PAI",
    "Nabi dan rasul berjumlah 25. Mereka adalah teladan kita. Nabi Muhammad adalah nabi dan rasul terakhir yang harus kita teladani.",
    [
      "Nabi dan rasul berjumlah 25.",
      "Nabi Muhammad adalah nabi dan rasul terakhir.",
      "Nabi memiliki sifat jujur, dapat dipercaya, dan penyayang.",
      "Rasul Ulul Azmi adalah rasul yang sangat sabar dan tabah.",
      "Mukjizat adalah kejadian luar biasa dari Allah untuk para nabi.",
      "Kita meneladani Nabi Muhammad dengan hidup sederhana dan jujur.",
    ],
    "Ada 25 nabi dan rasul yang wajib kita ketahui namanya, dari Nabi Adam sampai Nabi Muhammad. Nabi Muhammad adalah nabi terakhir dan teladan terbaik bagi kita semua. Beliau jujur, dapat dipercaya, penyayang, dan hidup sederhana. Kita meneladaninya dengan berkata jujur, menyayangi teman, dan tidak berlebih-lebihan. Siapa nabi yang kamu ketahui namanya? Coba sebutkan bersama-sama!",
    [
      ["Nabi dan rasul ada", "25"],
      ["Nabi terakhir", "Muhammad"],
      ["Sifat nabi", "jujur dan dapat dipercaya"],
      ["Nabi Muhammad teladan", "terbaik"],
      ["Hidup sederhana", "teladan Nabi Muhammad"],
    ],
    [
      ["Nabi dan rasul berjumlah ...", ["20", "25", "30"], 1, "Nabi dan rasul ada 25."],
      ["Nabi dan rasul terakhir adalah ...", ["Nabi Adam", "Nabi Musa", "Nabi Muhammad"], 2, "Nabi Muhammad adalah nabi dan rasul terakhir."],
      ["Sifat Nabi Muhammad adalah ...", ["pembohong", "jujur dan dapat dipercaya", "sombong"], 1, "Nabi Muhammad jujur dan dapat dipercaya."],
      ["Nabi pertama adalah ...", ["Nabi Adam", "Nabi Nuh", "Nabi Ibrahim"], 0, "Nabi Adam adalah nabi pertama."],
      ["Meneladani Nabi Muhammad berarti ...", ["hidup sederhana dan jujur", "hidup boros", "berbohong"], 0, "Kita meneladani Nabi Muhammad dengan hidup sederhana dan jujur."],
    ],
  ],
  // ---------------- Seni Rupa ----------------
  [
    "k1-seni-media", "Eksplorasi Media Berkarya", "Seni Rupa",
    "Berkarya seni itu seru! Kamu belajar memakai pensil, krayon, gunting, dan lem dengan aman, lalu membuat kolase dari kertas warna.",
    [
      "Alat berkarya: pensil, krayon, cat, gunting, dan lem.",
      "Pensil dipakai untuk menggambar garis dan bentuk.",
      "Krayon dipakai untuk mewarnai gambar.",
      "Gunting dipakai memotong kertas dengan hati-hati.",
      "Lem dipakai untuk menempel potongan kertas.",
      "Kolase adalah karya dari potongan-potongan kertas yang ditempel.",
    ],
    "Pegang pensilmu, ayo menggambar! Garis lurus, garis lengkung, lalu bentuk lingkaran dan segitiga. Setelah gambar jadi, warnai dengan krayon. Hati-hati memakai gunting: pegang gagangnya, potong pelan-pelan, dan jangan mengarahkan gunting ke teman. Tempel potongan kertas warna dengan lem, dan jadilah kolase yang indah. Setelah berkarya, rapikan alatmu, ya!",
    [
      ["Pensil untuk", "menggambar"],
      ["Krayon untuk", "mewarnai"],
      ["Gunting untuk", "memotong kertas"],
      ["Lem untuk", "menempel"],
      ["Kolase dari", "potongan kertas"],
    ],
    [
      ["Alat untuk menggambar adalah ...", ["gunting", "pensil", "lem"], 1, "Pensil dipakai untuk menggambar."],
      ["Krayon dipakai untuk ...", ["memotong", "mewarnai", "menempel"], 1, "Krayon dipakai untuk mewarnai."],
      ["Saat memakai gunting, kita harus ...", ["berlari", "berhati-hati", "mengarahkannya ke teman"], 1, "Gunting dipakai dengan hati-hati."],
      ["Kolase dibuat dari ...", ["cat saja", "potongan kertas yang ditempel", "air"], 1, "Kolase adalah potongan kertas yang ditempel."],
      ["Lem dipakai untuk ...", ["menggambar", "menempel", "memotong"], 1, "Lem dipakai untuk menempel."],
    ],
  ],
  [
    "k1-seni-amati", "Menceritakan Hasil Pengamatan", "Seni Rupa",
    "Coba amati benda di sekitarmu. Setiap benda punya garis, bentuk, dan warna. Kamu bisa bercerita tentang apa yang kamu lihat.",
    [
      "Unsur rupa ada tiga: garis, bentuk, dan warna.",
      "Garis ada yang lurus, lengkung, dan zigzag.",
      "Bentuk ada yang berupa lingkaran, segitiga, dan segiempat.",
      "Warna dasar: merah, kuning, dan biru.",
      "Mencampur dua warna bisa menghasilkan warna baru.",
      "Menceritakan hasil pengamatan berarti menyampaikan apa yang dilihat.",
    ],
    "Lihat bunga di halaman: batangnya garis lurus, kelopaknya bentuk lingkaran, warnanya merah dan kuning. Itulah tiga unsur rupa: garis, bentuk, dan warna. Garis bisa lurus seperti penggaris, lengkung seperti pelangi, atau zigzag seperti petir. Warna merah dicampur kuning menjadi jingga. Coba amati satu benda, lalu ceritakan garis, bentuk, dan warnanya kepada temanmu!",
    [
      ["Unsur rupa ada", "tiga"],
      ["Garis lurus seperti", "penggaris"],
      ["Garis lengkung seperti", "pelangi"],
      ["Warna dasar", "merah, kuning, biru"],
      ["Merah + kuning", "jingga"],
    ],
    [
      ["Unsur rupa ada ...", ["dua", "tiga", "lima"], 1, "Unsur rupa: garis, bentuk, dan warna."],
      ["Garis yang melengkung seperti pelangi disebut garis ...", ["lurus", "lengkung", "zigzag"], 1, "Garis lengkung seperti pelangi."],
      ["Bentuk roda adalah ...", ["segitiga", "lingkaran", "segiempat"], 1, "Roda berbentuk lingkaran."],
      ["Warna dasar adalah ...", ["merah, kuning, biru", "jingga, ungu, hijau", "hitam, putih, cokelat"], 0, "Warna dasar: merah, kuning, biru."],
      ["Merah dicampur kuning menjadi warna ...", ["hijau", "ungu", "jingga"], 2, "Merah + kuning = jingga."],
    ],
  ],
];

// ---------------------------------------------------------------------------
// Builder bab Kelas 1: 5 soal tulis + 5 soal turunan dari kartu = 10 soal.
// Soal turunan memakai jawaban kartu sebagai kunci dan jawaban kartu lain
// sebagai pengecoh — jadi kuis selalu konsisten dengan kartu bab itu.
// ---------------------------------------------------------------------------
function buildK1Chapter(row: K1Row, sortOrder: number): ChapterSeed {
  const [id, title, subject, summary, points, focus, fc, quiz] = row;
  const flashcards = fc.map(([front, back]) => ({ front, back }));
  const rng = mulberry32(hashStr(id));
  const written = quiz.map(([q, opts, idx, d]) => pg(q, opts, idx, d));
  const fromCards: GeneratedQuestion[] = flashcards.map((card, i) => {
    const others = flashcards.filter((_, j) => j !== i).map((c) => c.back);
    const distractors = shuffle(others, mulberry32(hashStr(id + ":fc" + i))).slice(0, 2);
    const options = shuffle([card.back, ...distractors], rng);
    const question = card.front.endsWith("?") ? card.front : `${card.front} adalah ...?`;
    return pg(question, options, options.indexOf(card.back), `Jawabannya ${card.back}. Coba ingat lagi kartu bab ini, ya.`);
  });
  // Video pendek vertikal bawaan (dibangun sebagai halaman statis di
  // app/static/shorts/) — hanya dua bab ini yang sudah punya videonya;
  // bab lain diisi admin lewat tab "Video per Bab".
  const SHORTS: Record<string, { url: string; duration: string }> = {
    "k1-mtk-bilang": { url: "/shorts/membilang-10.html", duration: "1 menit" },
    "k1-mtk-tambah": { url: "/shorts/penjumlahan-10.html", duration: "1 menit" }
  };
  return {
    id,
    product_id: "k1",
    title,
    subject,
    grade: 1,
    semester: 1,
    summary,
    points,
    focus_text: focus,
    sort_order: sortOrder,
    flashcards,
    quiz: [...written, ...fromCards],
    short_url: SHORTS[id]?.url ?? null,
    short_duration: SHORTS[id]?.duration ?? null
  };
}

const K1_CHAPTERS: ChapterSeed[] = K1_ROWS.map((row, i) => buildK1Chapter(row, i));

// ---------------------------------------------------------------------------
// Kerangka bab Kelas 2–6 (GENERATOR — judul + rangkuman singkat yang benar
// topiknya; poin, kartu, dan kuis digenerasi dari templat, bukan ditulis penuh).
// ---------------------------------------------------------------------------
const SUBJECTS_8 = [
  "Matematika",
  "B. Indonesia",
  "IPAS",
  "Pancasila",
  "B. Inggris",
  "PJOK",
  "PAI",
  "Seni Rupa",
] as const;

type TopicDef = [title: string, summary: string];

const TOPICS: Record<number, Record<string, TopicDef[]>> = {
  2: {
    Matematika: [
      ["Bilangan sampai 100", "Kamu belajar membilang, membaca, dan menulis bilangan sampai 100. Bilangan dua angka terdiri dari puluhan dan satuan."],
      ["Penjumlahan dan Pengurangan sampai 100", "Kamu belajar menambah dan mengurangi bilangan sampai 100 dengan cara bersusun dan cara panjang."],
      ["Perkalian dan Pembagian", "Perkalian adalah penjumlahan berulang. Pembagian adalah kebalikan dari perkalian."],
    ],
    "B. Indonesia": [
      ["Huruf dan Kata", "Kamu belajar membaca dan menulis huruf, suku kata, dan kata sederhana dengan benar."],
      ["Kalimat Sederhana", "Kamu belajar menyusun kata menjadi kalimat sederhana yang runtut dan mudah dipahami."],
      ["Cerita Pendek", "Kamu belajar membaca cerita pendek dan menjawab pertanyaan tentang isi cerita."],
    ],
    IPAS: [
      ["Makhluk Hidup", "Manusia, hewan, dan tumbuhan adalah makhluk hidup. Mereka tumbuh, bernapas, dan berkembang biak."],
      ["Benda dan Sifatnya", "Benda di sekitar kita punya sifat berbeda: keras, lunak, ringan, berat, kasar, dan halus."],
      ["Lingkungan Sekitar", "Lingkungan tempat kita tinggal perlu dijaga kebersihannya agar sehat dan nyaman."],
    ],
    Pancasila: [
      ["Aturan di Rumah dan Sekolah", "Aturan membuat hidup tertib. Kamu belajar aturan di rumah dan di sekolah serta akibat bila melanggarnya."],
      ["Menghargai Perbedaan", "Setiap orang berbeda suku, agama, dan kesukaan. Perbedaan harus dihargai."],
      ["Gotong Royong", "Gotong royong artinya bekerja sama. Pekerjaan berat menjadi ringan bila dikerjakan bersama."],
    ],
    "B. Inggris": [
      ["My Family", "Kamu belajar menyebut anggota keluarga dalam bahasa Inggris: father, mother, brother, sister."],
      ["Animals", "Kamu belajar nama hewan dalam bahasa Inggris: cat, dog, bird, fish, dan lainnya."],
      ["My School", "Kamu belajar nama benda dan ruangan di sekolah dalam bahasa Inggris."],
    ],
    PJOK: [
      ["Gerak Dasar Lokomotor", "Kamu melatih gerak dasar berpindah tempat: berjalan, berlari, melompat, dan meloncat dengan benar."],
      ["Gerak Dasar Non-Lokomotor", "Kamu melatih gerak di tempat: membungkuk, memutar, mengayun, dan menekuk."],
      ["Permainan Bola Kecil", "Kamu belajar melempar, menangkap, dan memukul bola kecil dalam permainan sederhana."],
    ],
    PAI: [
      ["Membaca Al-Qur'an", "Kamu belajar membaca huruf hijaiah bersambung dan surah-surah pendek dengan tartil."],
      ["Asmaul Husna", "Kamu mengenal nama-nama baik Allah, di antaranya Ar-Rahman dan Ar-Rahim."],
      ["Nabi Muhammad Teladanku", "Kamu belajar meneladani Nabi Muhammad: jujur, amanah, dan penyayang."],
    ],
    "Seni Rupa": [
      ["Menggambar dengan Garis", "Kamu menggambar memakai berbagai garis: lurus, lengkung, zigzag, dan bergelombang."],
      ["Warna dan Bentuk", "Kamu mengenal warna primer dan sekunder serta bentuk-bentuk dasar dalam karya."],
      ["Kolase dan Kerajinan", "Kamu membuat kolase dan kerajinan sederhana dari bahan di sekitar."],
    ],
  },
  3: {
    Matematika: [
      ["Bilangan sampai 1.000", "Kamu belajar bilangan sampai 1.000, nilai tempat ratusan, puluhan, dan satuan."],
      ["Perkalian dan Pembagian", "Kamu belajar perkalian dan pembagian bilangan sampai 100 dengan cara yang sistematis."],
      ["Pecahan Sederhana", "Kamu mengenal pecahan sederhana seperti setengah, sepertiga, dan seperempat."],
    ],
    "B. Indonesia": [
      ["Membaca Teks Pendek", "Kamu belajar membaca teks pendek dengan lancar dan menemukan informasi penting di dalamnya."],
      ["Menulis Paragraf Sederhana", "Kamu belajar menulis paragraf sederhana dengan kalimat yang runtut."],
      ["Puisi Anak", "Kamu belajar membaca dan memahami puisi anak yang bahasanya indah."],
    ],
    IPAS: [
      ["Makhluk Hidup dan Lingkungannya", "Makhluk hidup saling membutuhkan dan berinteraksi dengan lingkungannya."],
      ["Benda dan Sifatnya", "Benda punya wujud padat, cair, dan gas, serta sifat yang berbeda-beda."],
      ["Energi dan Perubahannya", "Energi ada dalam banyak bentuk dan dapat berubah dari satu bentuk ke bentuk lain."],
    ],
    Pancasila: [
      ["Lambang Negara Garuda Pancasila", "Kamu mengenal Garuda Pancasila, lambang negara, dan makna sila-silanya."],
      ["Aturan di Masyarakat", "Aturan di masyarakat menjaga ketertiban dan keamanan bersama."],
      ["Keragaman Budaya Indonesia", "Indonesia kaya budaya: bahasa, pakaian, makanan, dan tarian daerah."],
    ],
    "B. Inggris": [
      ["My Daily Activities", "Kamu belajar bercerita tentang kegiatan sehari-hari dalam bahasa Inggris."],
      ["Food and Drinks", "Kamu belajar nama makanan dan minuman dalam bahasa Inggris."],
      ["My Hobbies", "Kamu belajar menyebut hobi dalam bahasa Inggris: reading, drawing, swimming."],
    ],
    PJOK: [
      ["Gerak Lokomotor Lanjutan", "Kamu melatih kombinasi gerak lokomotor dalam permainan dan olahraga sederhana."],
      ["Permainan Bola Besar", "Kamu belajar dasar sepak bola dan bola basket mini."],
      ["Kebugaran Jasmani", "Kamu belajar latihan kebugaran sederhana: lari, lompat, dan peregangan."],
    ],
    PAI: [
      ["Al-Qur'an dan Tajwid Dasar", "Kamu belajar membaca Al-Qur'an dengan tajwid dasar dan surah-surah pendek."],
      ["Salat Lima Waktu", "Kamu belajar nama, waktu, dan rakaat salat lima waktu."],
      ["Kisah Nabi dan Rasul", "Kamu belajar kisah para nabi dan rasul serta teladan dari kehidupan mereka."],
    ],
    "Seni Rupa": [
      ["Unsur Seni Rupa", "Kamu mengenal unsur seni rupa: garis, bentuk, warna, dan tekstur."],
      ["Karya Dua Dimensi", "Kamu membuat karya dua dimensi: menggambar dan mewarnai."],
      ["Karya Tiga Dimensi", "Kamu membuat karya tiga dimensi dari tanah liat, kertas, dan bahan bekas."],
    ],
  },
  4: {
    Matematika: [
      ["Bilangan Cacah sampai 10.000", "Kamu belajar bilangan sampai 10.000, nilai tempat, dan cara membandingkannya."],
      ["Pecahan", "Kamu belajar pecahan senilai, membandingkan pecahan, dan pecahan campuran."],
      ["Bangun Datar", "Kamu belajar sifat bangun datar: persegi, persegi panjang, segitiga, dan lingkaran."],
    ],
    "B. Indonesia": [
      ["Teks Deskripsi", "Kamu belajar membaca dan menulis teks yang menggambarkan suatu tempat, benda, atau orang."],
      ["Teks Narasi", "Kamu belajar membaca dan menulis cerita dengan urutan peristiwa yang jelas."],
      ["Membaca Intensif", "Kamu belajar membaca dengan saksama untuk menemukan gagasan pokok dan rincian."],
    ],
    IPAS: [
      ["Tumbuhan dan Fungsinya", "Kamu belajar bagian tumbuhan dan fungsinya: akar, batang, daun, bunga, dan buah."],
      ["Gaya dan Gerak", "Gaya dapat mengubah gerak benda. Kamu belajar gaya dorong, tarik, dan gesek."],
      ["Sumber Energi", "Kamu belajar sumber energi di sekitar kita dan cara menghematnya."],
    ],
    Pancasila: [
      ["Pancasila dan UUD 1945", "Kamu belajar Pancasila sebagai dasar negara dan UUD 1945 sebagai konstitusi."],
      ["Bhinneka Tunggal Ika", "Berbeda-beda tetapi tetap satu: semboyan yang mempersatukan bangsa Indonesia."],
      ["NKRI", "Kamu belajar tentang Negara Kesatuan Republik Indonesia dan wilayahnya."],
    ],
    "B. Inggris": [
      ["My Family and Friends", "Kamu belajar bercerita tentang keluarga dan teman dalam bahasa Inggris."],
      ["My School Life", "Kamu belajar bercerita tentang kehidupan sekolah dalam bahasa Inggris."],
      ["Animals Around Us", "Kamu belajar nama dan ciri hewan di sekitar kita dalam bahasa Inggris."],
    ],
    PJOK: [
      ["Atletik Dasar", "Kamu belajar dasar atletik: lari, lompat, dan lempar."],
      ["Permainan Bola Voli Mini", "Kamu belajar passing dan servis dalam bola voli mini."],
      ["Senam Kebugaran", "Kamu belajar gerakan senam kebugaran jasmani."],
    ],
    PAI: [
      ["Membaca Al-Qur'an dengan Tajwid", "Kamu belajar membaca Al-Qur'an dengan tajwid yang benar."],
      ["Rukun Islam dan Iman", "Kamu memperdalam rukun Islam dan rukun iman serta maknanya."],
      ["Akhlak Terpuji", "Kamu belajar akhlak terpuji: jujur, amanah, dan tolong-menolong."],
    ],
    "Seni Rupa": [
      ["Menggambar Perspektif", "Kamu belajar menggambar dengan kesan jauh dan dekat."],
      ["Seni Musik Ritme", "Kamu belajar pola ritme dan memainkan alat musik ritmis."],
      ["Seni Tari Daerah", "Kamu mengenal tari daerah dan gerak dasarnya."],
    ],
  },
  5: {
    Matematika: [
      ["Bilangan sampai 100.000", "Kamu belajar bilangan sampai 100.000, nilai tempat, dan pembulatan."],
      ["Operasi Hitung Campuran", "Kamu belajar mengerjakan penjumlahan, pengurangan, perkalian, dan pembagian dalam satu soal."],
      ["Bangun Ruang", "Kamu belajar bangun ruang: kubus, balok, prisma, dan tabung."],
    ],
    "B. Indonesia": [
      ["Teks Eksposisi", "Kamu belajar membaca dan menulis teks yang menjelaskan suatu gagasan dengan alasan."],
      ["Teks Prosedur", "Kamu belajar membaca dan menulis teks langkah-langkah melakukan sesuatu."],
      ["Pantun dan Syair", "Kamu belajar pantun dan syair, puisi lama yang punya rima dan isi."],
    ],
    IPAS: [
      ["Sistem Pencernaan Manusia", "Kamu belajar organ pencernaan manusia dan cara menjaga kesehatannya."],
      ["Ekosistem", "Kamu belajar hubungan makhluk hidup dengan lingkungannya dalam sebuah ekosistem."],
      ["Sumber Daya Alam", "Kamu belajar sumber daya alam Indonesia dan cara memanfaatkannya dengan bijak."],
    ],
    Pancasila: [
      ["Nilai-Nilai Pancasila", "Kamu belajar nilai setiap sila Pancasila dalam kehidupan sehari-hari."],
      ["Demokrasi di Sekolah", "Kamu belajar musyawarah dan pemilihan ketua kelas secara demokratis."],
      ["Kerja Sama dan Musyawarah", "Kerja sama dan musyawarah menyelesaikan masalah bersama dengan adil."],
    ],
    "B. Inggris": [
      ["My Daily Routines", "Kamu belajar bercerita tentang rutinitas harian dalam bahasa Inggris."],
      ["Healthy Habits", "Kamu belajar kebiasaan sehat dalam bahasa Inggris."],
      ["My Neighborhood", "Kamu belajar menyebut tempat di sekitar rumah dalam bahasa Inggris."],
    ],
    PJOK: [
      ["Permainan Bola Basket Mini", "Kamu belajar dribble, passing, dan shooting dalam bola basket mini."],
      ["Atletik Lanjutan", "Kamu melatih lari jarak pendek, lompat jauh, dan lempar dengan teknik yang benar."],
      ["Pola Hidup Sehat", "Kamu belajar pola hidup sehat: makan bergizi, olahraga, dan tidur cukup."],
    ],
    PAI: [
      ["Al-Qur'an dan Hadis", "Kamu belajar membaca Al-Qur'an dan memahami hadis-hadis pendek."],
      ["Ibadah Salat dan Puasa", "Kamu memperdalam ibadah salat dan puasa serta hikmahnya."],
      ["Kisah Para Nabi", "Kamu belajar kisah para nabi dan teladan kesabaran mereka."],
    ],
    "Seni Rupa": [
      ["Seni Rupa Terapan", "Kamu membuat karya seni yang berguna sehari-hari, misalnya tas dan tempat pensil."],
      ["Musik Ansambel", "Kamu bermain musik bersama dalam ansambel sederhana."],
      ["Tari Kreasi Daerah", "Kamu belajar tari kreasi dari daerah dan menampilkan geraknya."],
    ],
  },
  6: {
    Matematika: [
      ["Bilangan Bulat", "Kamu belajar bilangan bulat positif dan negatif serta garis bilangannya."],
      ["Bangun Ruang", "Kamu belajar volume bangun ruang: kubus, balok, prisma, dan tabung."],
      ["Statistika Sederhana", "Kamu belajar membaca diagram batang dan lingkaran serta menghitung rata-rata."],
    ],
    "B. Indonesia": [
      ["Teks Laporan", "Kamu belajar membaca dan menulis teks laporan hasil pengamatan."],
      ["Teks Pidato", "Kamu belajar menyusun dan menyampaikan pidato singkat."],
      ["Membaca Kritis", "Kamu belajar menilai isi bacaan dan membedakan fakta dengan opini."],
    ],
    IPAS: [
      ["Sistem Tata Surya", "Kamu belajar planet-planet dalam tata surya dan gerakannya."],
      ["Listrik dan Magnet", "Kamu belajar listrik statis dan dinamis serta sifat magnet."],
      ["Perubahan Wujud Benda", "Kamu belajar perubahan wujud benda: mencair, membeku, menguap, dan mengembun."],
    ],
    Pancasila: [
      ["Konstitusi dan Lembaga Negara", "Kamu belajar UUD 1945 dan lembaga-lembaga negara Indonesia."],
      ["Hak dan Kewajiban Warga", "Setiap warga negara punya hak dan kewajiban yang harus seimbang."],
      ["Persatuan dalam Keberagaman", "Keberagaman suku, agama, dan budaya memperkuat persatuan Indonesia."],
    ],
    "B. Inggris": [
      ["My Future Dreams", "Kamu belajar bercerita tentang cita-cita dalam bahasa Inggris."],
      ["Travel and Places", "Kamu belajar nama tempat dan kegiatan bepergian dalam bahasa Inggris."],
      ["Science and Technology", "Kamu belajar kosakata sains dan teknologi dalam bahasa Inggris."],
    ],
    PJOK: [
      ["Permainan Bola Sepak Mini", "Kamu belajar passing, dribble, dan shooting dalam sepak bola mini."],
      ["Kebugaran dan Kesehatan", "Kamu belajar menjaga kebugaran dan kesehatan tubuh."],
      ["Pertolongan Pertama", "Kamu belajar pertolongan pertama sederhana saat teman terluka ringan."],
    ],
    PAI: [
      ["Akhlak Mulia", "Kamu belajar akhlak mulia: jujur, sabar, dan rendah hati."],
      ["Sejarah Peradaban Islam", "Kamu belajar sejarah singkat peradaban Islam dan tokoh-tokohnya."],
      ["Ibadah dan Muamalah", "Kamu belajar ibadah dan hubungan baik dengan sesama manusia."],
    ],
    "Seni Rupa": [
      ["Apresiasi Seni Rupa", "Kamu belajar mengamati dan menilai karya seni rupa."],
      ["Berkarya Seni Musik", "Kamu berkarya musik dengan alat musik melodis sederhana."],
      ["Pementasan Seni", "Kamu menampilkan karya seni dalam pementasan kelas."],
    ],
  },
};

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .slice(0, 40);
}

// Kuis generator per bab (KERANGKA): memakai templat per mapel + hitungan
// Matematika deterministik. Tiap soal tetap punya pembahasan teman-belajar.
function generatedChapterQuiz(subject: string, grade: number, title: string, seedText: string): GeneratedQuestion[] {
  const rng = mulberry32(hashStr(seedText));
  const out: GeneratedQuestion[] = [];
  if (subject === "Matematika") {
    for (let i = 0; i < 10; i++) {
      out.push(mathPg(grade, hashStr(seedText + ":q" + i)));
    }
    return out;
  }
  const templates: [string, string[], number][] = [
    [`Manakah yang berkaitan dengan "${title}"?`, [title, "Topik yang tidak berhubungan", "Hal yang berbeda sama sekali"], 0],
    [`Apa yang kamu pelajari di bab "${title}"?`, [`Materi tentang ${title}`, "Materi yang sama sekali lain", "Tidak ada materi"], 0],
    [`Manakah sikap yang tepat saat mempelajari "${title}"?`, ["Memperhatikan dengan saksama", "Mengabaikan penjelasan guru", "Bermain sendiri"], 0],
    [`Mengapa bab "${title}" penting dipelajari?`, [`Karena berhubungan dengan kehidupan sehari-hari`, "Karena tidak ada gunanya", "Karena hanya untuk ujian"], 0],
    [`Apa langkah pertama memahami "${title}"?`, ["Membaca rangkuman dengan saksama", "Langsung menutup buku", "Menebak-nebak saja"], 0],
    [`Manakah contoh yang sesuai dengan "${title}"?`, [`Contoh yang dijelaskan di bab ini`, "Contoh dari bab yang lain", "Contoh yang salah"], 0],
    [`Bagaimana cara mengingat materi "${title}"?`, ["Mengulang dan berlatih soal", "Tidak pernah mengulang", "Menghafal tanpa memahami"], 0],
    [`Apa yang harus dilakukan setelah membaca bab "${title}"?`, ["Mengerjakan latihan soal", "Melupakan begitu saja", "Menyimpan buku tanpa dibaca"], 0],
    [`Manakah pernyataan yang benar tentang "${title}"?`, [`Sesuai dengan rangkuman bab ini`, "Bertentangan dengan rangkuman", "Tidak ada hubungannya"], 0],
    [`Dengan siapa kamu bisa mendiskusikan "${title}"?`, ["Guru dan teman sekelas", "Tidak dengan siapa pun", "Dengan orang yang tidak tahu"], 0],
  ];
  const picked = shuffle(templates, rng).slice(0, 10);
  for (const [q, opts, idx] of picked) {
    const shuffled = shuffle(opts, rng);
    const answer = opts[idx];
    out.push(pg(q, shuffled, shuffled.indexOf(answer), `Jawaban yang tepat sesuai rangkuman bab "${title}". Baca lagi rangkuman bab ini, ya.`));
  }
  return out;
}

function generatedChapter(productId: string, grade: number, subject: string, def: TopicDef, sortOrder: number): ChapterSeed {
  const [title, summary] = def;
  const id = `${productId}-${slug(subject)}-${slug(title)}`;
  const flashcards = [
    { front: `Topik bab ini`, back: title },
    { front: `Apa yang dipelajari di bab ini?`, back: summary },
    { front: `Sebutkan satu hal tentang ${title}`, back: `Materi tentang ${title}` },
    { front: `Mengapa ${title} penting?`, back: "Berhubungan dengan kehidupan sehari-hari" },
    { front: `Langkah belajar ${title}`, back: "Baca rangkuman, lalu kerjakan latihan" },
  ];
  const points = [
    `Memahami materi ${title}.`,
    `Menyebutkan contoh yang berkaitan dengan ${title}.`,
    `Menjelaskan ${title} dengan kata sendiri.`,
    `Mengerjakan latihan tentang ${title}.`,
    `Menghubungkan ${title} dengan kehidupan sehari-hari.`,
  ];
  return {
    id,
    product_id: productId,
    title,
    subject,
    grade,
    semester: 1,
    summary,
    points,
    focus_text: `Pada bab ini kamu belajar tentang ${title}. ${summary} Baca rangkuman dengan pelan-pelan, perhatikan contohnya, lalu coba kerjakan latihan soal di bawah ini. Kalau ada yang belum dipahami, tanyakan kepada guru atau orang tuamu. Ingat, setiap bab adalah satu langkah kecil menuju kamu yang lebih pandai!`,
    sort_order: sortOrder,
    flashcards,
    quiz: generatedChapterQuiz(subject, grade, title, id),
  };
}

const GENERATED_CHAPTERS: ChapterSeed[] = (() => {
  const out: ChapterSeed[] = [];
  for (const grade of [2, 3, 4, 5, 6]) {
    const productId = `k${grade}`;
    let sort = 0;
    for (const subject of SUBJECTS_8) {
      for (const def of TOPICS[grade][subject]) {
        out.push(generatedChapter(productId, grade, subject, def, sort++));
      }
    }
  }
  return out;
})();

// ---------------------------------------------------------------------------
// Dua bab ringkas (ditulis singkat, bukan generator) untuk produk mtk-sd.
// ---------------------------------------------------------------------------
const MTK_SD_CHAPTERS: ChapterSeed[] = [
  {
    id: "mtk-sd-bilang",
    product_id: "mtk-sd",
    title: "Bilangan dan Operasi Hitung",
    subject: "Matematika",
    grade: 1,
    semester: 1,
    summary: "Bilangan dari satuan sampai ratusan ribu, serta operasi tambah, kurang, kali, dan bagi. Kuasai nilai tempat dan urutan pengerjaan.",
    points: [
      "Nilai tempat: satuan, puluhan, ratusan, ribuan, dan seterusnya.",
      "Penjumlahan dan pengurangan dikerjakan dari kanan (satuan) ke kiri.",
      "Perkalian adalah penjumlahan berulang; pembagian adalah kebalikannya.",
      "Operasi campuran: kerjakan perkalian dan pembagian dulu, baru tambah dan kurang.",
      "Pecahan sederhana: setengah, sepertiga, seperempat.",
    ],
    focus_text: "Semua materi Matematika SD berawal dari bilangan. Pahami dulu nilai tempat: angka 5 pada 52 bernilai 50 karena berada di tempat puluhan. Setelah itu operasi hitung menjadi mudah: tambah dan kurang dari kanan, kali dan bagi sebelum tambah dan kurang bila ada dalam satu soal. Latihan sedikit-sedikit setiap hari lebih baik daripada belajar banyak sekaligus.",
    sort_order: 0,
    flashcards: [
      { front: "Nilai angka 5 pada 52", back: "50 (puluhan)" },
      { front: "7 × 8", back: "56" },
      { front: "Operasi yang dikerjakan dulu", back: "kali dan bagi" },
      { front: "Setengah dari 10", back: "5" },
      { front: "100 : 4", back: "25" },
    ],
    quiz: [
      pg("Berapa nilai angka 7 pada 75?", ["7", "70", "75"], 1, "Angka 7 di tempat puluhan, nilainya 70."),
      pg("Berapa hasil 8 × 6?", ["46", "48", "54"], 1, "8 × 6 = 48."),
      pg("Dalam soal 3 + 4 × 2, operasi apa yang dikerjakan dulu?", ["3 + 4", "4 × 2", "semuanya sekaligus"], 1, "Perkalian dikerjakan sebelum penjumlahan."),
      pg("Berapa hasil 100 : 5?", ["15", "20", "25"], 1, "100 : 5 = 20."),
      pg("Setengah dari 14 adalah ...", ["6", "7", "8"], 1, "Setengah dari 14 adalah 7."),
      pg("Berapa 250 + 150?", ["350", "400", "450"], 1, "250 + 150 = 400."),
      pg("Bilangan 1.000 dibaca ...", ["seratus", "seribu", "sepuluh ribu"], 1, "1.000 dibaca seribu."),
      pg("Berapa 9 × 9?", ["72", "81", "90"], 1, "9 × 9 = 81."),
      pg("Seperempat dari 20 adalah ...", ["4", "5", "6"], 1, "Seperempat dari 20 adalah 5."),
      pg("10 × 10 = ...", ["10", "100", "1.000"], 1, "10 × 10 = 100."),
    ],
  },
  {
    id: "mtk-sd-bangun",
    product_id: "mtk-sd",
    title: "Bangun Datar, Bangun Ruang, dan Pengukuran",
    subject: "Matematika",
    grade: 1,
    semester: 1,
    summary: "Ciri bangun datar dan bangun ruang, keliling dan luas, serta satuan panjang, berat, dan waktu yang dipakai sehari-hari.",
    points: [
      "Persegi: 4 sisi sama panjang; persegi panjang: sisi berhadapan sama panjang.",
      "Keliling persegi = 4 × sisi; luas persegi = sisi × sisi.",
      "Kubus dan balok adalah bangun ruang dengan sisi datar.",
      "Satuan panjang: km, m, cm; 1 m = 100 cm.",
      "Satuan berat: kg dan gram; 1 kg = 1.000 gram.",
    ],
    focus_text: "Bangun ada di mana-mana: papan tulis berbentuk persegi panjang, dadu berbentuk kubus. Untuk bangun datar, yang penting adalah sisi dan sudutnya. Keliling adalah panjang semua sisi dijumlahkan, sedangkan luas adalah isi permukaannya. Untuk pengukuran, hafalkan tangga satuan: 1 meter sama dengan 100 sentimeter, 1 kilogram sama dengan 1.000 gram.",
    sort_order: 1,
    flashcards: [
      { front: "Sisi persegi", back: "4 sisi sama panjang" },
      { front: "Keliling persegi sisi 5 cm", back: "20 cm" },
      { front: "1 m = ... cm", back: "100 cm" },
      { front: "1 kg = ... gram", back: "1.000 gram" },
      { front: "Bangun ruang dari dadu", back: "kubus" },
    ],
    quiz: [
      pg("Berapa sisi persegi panjang?", ["3", "4", "5"], 1, "Persegi panjang punya 4 sisi."),
      pg("Keliling persegi dengan sisi 6 cm adalah ...", ["12 cm", "24 cm", "36 cm"], 1, "Keliling = 4 × 6 = 24 cm."),
      pg("Luas persegi dengan sisi 5 cm adalah ...", ["20 cm²", "25 cm²", "30 cm²"], 1, "Luas = 5 × 5 = 25 cm²."),
      pg("1 meter sama dengan ...", ["10 cm", "100 cm", "1.000 cm"], 1, "1 m = 100 cm."),
      pg("Dadu berbentuk ...", ["balok", "kubus", "tabung"], 1, "Dadu berbentuk kubus."),
      pg("1 kg sama dengan ...", ["100 gram", "1.000 gram", "10 gram"], 1, "1 kg = 1.000 gram."),
      pg("Bangun yang sisinya berupa lingkaran adalah ...", ["tabung", "kubus", "balok"], 0, "Tabung punya sisi lingkaran (alas dan tutup)."),
      pg("Berapa menit dalam 2 jam?", ["60 menit", "120 menit", "200 menit"], 1, "1 jam = 60 menit, jadi 2 jam = 120 menit."),
      pg("Segitiga mempunyai sudut sebanyak ...", ["2", "3", "4"], 1, "Segitiga punya 3 sudut."),
      pg("Luas persegi panjang 4 cm × 3 cm adalah ...", ["7 cm²", "12 cm²", "14 cm²"], 1, "Luas = panjang × lebar = 4 × 3 = 12 cm²."),
    ],
  },
];

export const CHAPTERS: ChapterSeed[] = [...K1_CHAPTERS, ...GENERATED_CHAPTERS, ...MTK_SD_CHAPTERS];

// Mapel simulasi per kelas + slug untuk id simulasi.
export const SIM_SUBJECTS: Record<number, string[]> = {
  1: ["Matematika", "B. Indonesia", "Pancasila", "B. Inggris", "PJOK", "PAI", "Seni Rupa"],
  2: ["Matematika", "B. Indonesia", "IPAS", "Pancasila", "B. Inggris", "PJOK", "PAI", "Seni Rupa"],
  3: ["Matematika", "B. Indonesia", "IPAS", "Pancasila", "B. Inggris", "PJOK", "PAI", "Seni Rupa"],
  4: ["Matematika", "B. Indonesia", "IPAS", "Pancasila", "B. Inggris", "PJOK", "PAI", "Seni Rupa"],
  5: ["Matematika", "B. Indonesia", "IPAS", "Pancasila", "B. Inggris", "PJOK", "PAI", "Seni Rupa"],
  6: ["Matematika", "B. Indonesia", "IPAS", "Pancasila", "B. Inggris", "PJOK", "PAI", "Seni Rupa"],
};

export const SUBJECT_SLUG: Record<string, string> = {
  Matematika: "mtk",
  "B. Indonesia": "bind",
  IPAS: "ipas",
  Pancasila: "pancasila",
  "B. Inggris": "bing",
  PJOK: "pjok",
  PAI: "pai",
  "Seni Rupa": "seni",
};

// ---------------------------------------------------------------------------
// Generator soal Matematika (aritmetika deterministik, cocok dengan kelas)
// ---------------------------------------------------------------------------
function mathPg(grade: number, seedNum: number): GeneratedQuestion {
  const rng = mulberry32(seedNum);
  const ri = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
  let a = 0;
  let b = 0;
  let op = "+";
  let answer = 0;
  let question = "";
  if (grade <= 1) {
    op = pick(["+", "+" , "-"], rng);
    if (op === "+") { a = ri(1, 9); b = ri(1, 10 - a); answer = a + b; }
    else { a = ri(2, 10); b = ri(1, a); answer = a - b; }
  } else if (grade === 2) {
    op = pick(["+", "-", "×"], rng);
    if (op === "+") { a = ri(10, 90); b = ri(1, 100 - a); answer = a + b; }
    else if (op === "-") { a = ri(20, 100); b = ri(1, a); answer = a - b; }
    else { a = ri(2, 5); b = ri(2, 9); answer = a * b; }
  } else if (grade === 3) {
    op = pick(["+", "-", "×", "÷"], rng);
    if (op === "+") { a = ri(100, 900); b = ri(10, 999 - a); answer = a + b; }
    else if (op === "-") { a = ri(100, 999); b = ri(10, a); answer = a - b; }
    else if (op === "×") { a = ri(2, 9); b = ri(2, 9); answer = a * b; }
    else { b = ri(2, 9); answer = ri(2, 9); a = b * answer; }
  } else if (grade === 4) {
    op = pick(["+", "-", "×", "÷"], rng);
    if (op === "+") { a = ri(1000, 9000); b = ri(100, 9999 - a); answer = a + b; }
    else if (op === "-") { a = ri(1000, 9999); b = ri(100, a); answer = a - b; }
    else if (op === "×") { a = ri(11, 99); b = ri(2, 9); answer = a * b; }
    else { b = ri(3, 12); answer = ri(11, 99); a = b * answer; }
  } else if (grade === 5) {
    op = pick(["+", "-", "×", "÷"], rng);
    if (op === "+") { a = ri(1000, 90000); b = ri(100, 99999 - a); answer = a + b; }
    else if (op === "-") { a = ri(10000, 99999); b = ri(1000, a); answer = a - b; }
    else if (op === "×") { a = ri(12, 99); b = ri(11, 99); answer = a * b; }
    else { b = ri(4, 25); answer = ri(12, 99); a = b * answer; }
  } else {
    op = pick(["+", "-", "×", "÷"], rng);
    if (op === "+") { a = ri(10000, 900000); b = ri(1000, 999999 - a); answer = a + b; }
    else if (op === "-") { a = ri(100000, 999999); b = ri(10000, a); answer = a - b; }
    else if (op === "×") { a = ri(101, 999); b = ri(2, 9); answer = a * b; }
    else { b = ri(5, 25); answer = ri(101, 999); a = b * answer; }
  }
  const symbol = op === "×" ? "×" : op === "÷" ? ":" : op;
  const stems = [
    `Berapa hasil dari ${a} ${symbol} ${b}?`,
    `${a} ${symbol} ${b} = ...`,
    `Hitunglah: ${a} ${symbol} ${b}.`,
  ];
  const wordStems =
    op === "+"
      ? [`Kamu punya ${a} kelereng. Kamu mendapat ${b} kelereng lagi. Berapa kelerengmu sekarang?`]
      : op === "-"
        ? [`Kamu punya ${a} permen. Kamu memberi ${b} permen kepada temanmu. Berapa permenmu sekarang?`]
        : op === "×"
          ? [`Satu kotak berisi ${a} pensil. Ada ${b} kotak yang sama. Berapa pensil semuanya?`]
          : [`${a} permen dibagikan sama banyak kepada ${b} anak. Berapa permen yang diterima setiap anak?`];
  question = rng() < 0.5 ? pick(stems, rng) : pick(wordStems, rng);
  const distract = new Set<number>();
  for (const d of [answer + 1, answer - 1, answer + 2, answer - 2, answer + 10, answer - 10, answer * 2]) {
    if (d !== answer && d >= 0) distract.add(d);
    if (distract.size >= 3) break;
  }
  const options = shuffle([String(answer), ...[...distract].slice(0, 3).map(String)], rng);
  const disc =
    op === "+"
      ? `${a} + ${b} = ${answer}. Hitung pelan-pelan dari bilangan yang lebih besar, ya.`
      : op === "-"
        ? `${a} − ${b} = ${answer}.`
        : op === "×"
          ? `${a} × ${b} = ${answer}. Perkalian adalah penjumlahan berulang.`
          : `${a} : ${b} = ${answer}. Pembagian adalah kebalikan dari perkalian.`;
  return pg(question, options, options.indexOf(String(answer)), disc);
}

// ---------------------------------------------------------------------------
// Bank soal per mapel (dipakai bersama semua kelas; BUTIR BERSAMA —
// soal-soal ini benar untuk kelas 1–6, tingkat kesulitannya campuran).
// Format: [soal, benar?, pembahasan] / [soal, jawaban, pembahasan] /
// [soal, kataKunci[], pembahasan] / [soal, opsi[3], indeksBenar, pembahasan]
// Elemen ke-5 pada PG ekstra = kelas minimum (untuk materi yang baru muncul
// di kelas atas, mis. Garuda Pancasila yang bukan materi SAS Kelas 1 Smt 1).
// ---------------------------------------------------------------------------
type BsTuple = [string, boolean, string];
type IsianTuple = [string, string, string];
type UraianTuple = [string, string[], string];
type PgTuple = [string, string[], number, string, (number | undefined)?];

const BS_BANK: Record<string, BsTuple[]> = {
  Matematika: [
    ["7 + 3 = 10.", true, "7 + 3 = 10."],
    ["5 − 2 = 4.", false, "5 − 2 = 3, bukan 4."],
    ["Segitiga mempunyai 3 sisi.", true, "Segitiga punya 3 sisi dan 3 sudut."],
    ["Lingkaran mempunyai 4 sudut.", false, "Lingkaran tidak punya sudut."],
    ["10 lebih besar dari 9.", true, "10 sesudah 9, jadi lebih besar."],
    ["2 × 5 = 12.", false, "2 × 5 = 10."],
    ["Bilangan genap adalah bilangan yang habis dibagi 2.", true, "Contoh: 2, 4, 6, 8, 10."],
    ["100 : 4 = 20.", false, "100 : 4 = 25."],
    ["Persegi mempunyai 4 sisi sama panjang.", true, "Itulah ciri persegi."],
    ["1 jam = 100 menit.", false, "1 jam = 60 menit."],
    ["Setengah dari 8 adalah 4.", true, "8 : 2 = 4."],
    ["15 − 7 = 9.", false, "15 − 7 = 8."],
  ],
  "B. Indonesia": [
    ["Huruf pertama kata 'Bola' adalah B.", true, "Bola diawali huruf B."],
    ["Tanda tanya dipakai pada kalimat yang bertanya.", true, "Kalimat bertanya diakhiri tanda tanya (?)."],
    ["Kalimat berseru diakhiri tanda titik.", false, "Kalimat berseru diakhiri tanda seru (!)."],
    ["Kata 'kuda' memakai suku kata ku.", true, "Ku-da memakai suku kata ku."],
    ["Kartu nama berisi nama kita.", true, "Kartu nama dipakai saat berkenalan."],
    ["Kuman bisa dilihat dengan mata telanjang.", false, "Kuman sangat kecil, tidak terlihat."],
    ["Mencuci tangan mencegah kuman masuk ke tubuh.", true, "Sabun membunuh kuman di tangan."],
    ["Berani mencoba membuat kita belajar hal baru.", true, "Berani mencoba adalah awal bisa."],
    ["Suku kata 'la' ada pada kata 'lilin'.", false, "Lilin memakai suku kata li."],
    ["Bermain yang aman dilakukan dengan bergiliran.", true, "Bergiliran membuat semua anak aman."],
    ["Membaca harus selalu dilakukan dengan suara keras.", false, "Membaca bisa pelan atau nyaring."],
    ["Kalimat berita diakhiri tanda titik.", true, "Kalimat berita memakai tanda titik (.)."],
  ],
  IPAS: [
    ["Mata dipakai untuk melihat.", true, "Mata adalah pancaindra untuk melihat."],
    ["Telinga dipakai untuk mencium bau.", false, "Hidung yang dipakai untuk mencium bau."],
    ["Tumbuhan butuh air dan cahaya matahari.", true, "Air dan cahaya membantu tumbuhan tumbuh."],
    ["Meja adalah benda hidup.", false, "Meja tidak tumbuh dan tidak bernapas."],
    ["Kulit dipakai untuk meraba.", true, "Kulit merasakan panas, dingin, dan kasar."],
    ["Kucing bisa tumbuh dan bergerak.", true, "Kucing adalah makhluk hidup."],
    ["Benda tak hidup bisa bernapas.", false, "Benda tak hidup tidak bernapas."],
    ["Lidah dipakai untuk mengecap rasa.", true, "Lidah merasakan manis, asin, dan asam."],
    ["Hidung dipakai untuk mendengar.", false, "Telinga yang dipakai untuk mendengar."],
    ["Manusia termasuk makhluk hidup.", true, "Manusia tumbuh, bernapas, dan bergerak."],
    ["Batu bisa tumbuh seperti tumbuhan.", false, "Batu adalah benda tak hidup."],
    ["Pancaindra kita ada lima.", true, "Mata, telinga, hidung, lidah, dan kulit."],
  ],
  Pancasila: [
    ["Berkenalan yang sopan dilakukan dengan ramah.", true, "Sapa teman dengan ramah dan sebut nama."],
    ["Perbedaan teman boleh diejek.", false, "Perbedaan harus dihargai, bukan diejek."],
    ["Mandi dan gosok gigi adalah cara merawat tubuh.", true, "Tubuh yang bersih membuat kita sehat."],
    ["Aturan di sekolah boleh dilanggar.", false, "Aturan harus dipatuhi."],
    ["Makan sebaiknya dilakukan dengan tenang.", true, "Duduk tenang saat makan."],
    ["Anak mandiri meminta orang lain mengerjakan semuanya.", false, "Anak mandiri melakukan sendiri hal sederhana."],
    ["Bermain bersama harus rukun.", true, "Rukun membuat bermain menyenangkan."],
    ["Datang tepat waktu adalah aturan di sekolah.", true, "Tepat waktu adalah sikap disiplin."],
    ["Jadwal harian tidak berguna.", false, "Jadwal harian membantu mengatur waktu."],
    ["Menghargai teman yang berbeda itu baik.", true, "Perbedaan membuat kelas kita kaya."],
    ["Meremehkan teman adalah sikap yang baik.", false, "Meremehkan teman menyakiti hati."],
    ["Aturan membuat hidup kita aman dan tertib.", true, "Aturan melindungi kita semua."],
  ],
  "B. Inggris": [
    ["Hello artinya halo.", true, "Hello = halo."],
    ["Good morning artinya selamat malam.", false, "Good morning = selamat pagi."],
    ["One artinya satu.", true, "One = satu."],
    ["Red artinya biru.", false, "Red = merah."],
    ["Book artinya buku.", true, "Book = buku."],
    ["Chair artinya meja.", false, "Chair = kursi."],
    ["What's your name? artinya siapa namamu?", true, "What's your name? = siapa namamu?"],
    ["Five artinya empat.", false, "Five = lima."],
    ["Blue artinya biru.", true, "Blue = biru."],
    ["Pencil artinya tas.", false, "Pencil = pensil."],
    ["My name is ... artinya namaku ...", true, "My name is ... = namaku ..."],
    ["Table artinya kursi.", false, "Table = meja."],
  ],
  PJOK: [
    ["Gerak non-lokomotor dilakukan di tempat.", true, "Non-lokomotor = gerak di tempat."],
    ["Berlari adalah gerak non-lokomotor.", false, "Berlari adalah gerak lokomotor."],
    ["Membungkuk adalah gerak non-lokomotor.", true, "Membungkuk dilakukan di tempat."],
    ["Melempar bola adalah gerak manipulatif.", true, "Melempar memakai benda (bola)."],
    ["Menendang bola memakai tangan.", false, "Menendang memakai kaki."],
    ["Pemanasan membuat tubuh siap berolahraga.", true, "Pemanasan mencegah cedera."],
    ["Melompat memakai dua kaki.", true, "Melompat memakai dua kaki sekaligus."],
    ["Memutar badan adalah gerak lokomotor.", false, "Memutar badan adalah gerak non-lokomotor."],
    ["Menangkap bola melatih mata dan tangan.", true, "Mata melihat, tangan menangkap."],
    ["Berjalan lebih cepat dari berlari.", false, "Berlari lebih cepat dari berjalan."],
    ["Merangkak memakai tangan dan kaki.", true, "Merangkak memakai tangan dan kaki."],
    ["Olahraga sebaiknya dilakukan di tempat yang berbahaya.", false, "Olahraga di tempat yang aman dan rata."],
  ],
  PAI: [
    ["Huruf hijaiah ada 28.", true, "Huruf hijaiah dari alif sampai ya."],
    ["Fathah berbunyi i.", false, "Fathah berbunyi a."],
    ["Al-Fatihah terdiri dari 7 ayat.", true, "Al-Fatihah adalah surah pembuka."],
    ["Rukun iman ada lima.", false, "Rukun iman ada enam."],
    ["Basmalah dibaca sebelum kegiatan.", true, "Basmalah sebelum memulai kegiatan baik."],
    ["Hamdalah artinya segala puji bagi Allah.", true, "Hamdalah dibaca sesudah kegiatan."],
    ["Rukun Islam ada lima.", true, "Syahadat, salat, zakat, puasa, haji."],
    ["Nabi dan rasul berjumlah 20.", false, "Nabi dan rasul ada 25."],
    ["Nabi Muhammad adalah nabi terakhir.", true, "Nabi Muhammad penutup para nabi."],
    ["Kasrah berbunyi u.", false, "Kasrah berbunyi i."],
    ["Salat dilakukan lima waktu.", true, "Salat lima waktu setiap hari."],
    ["Puasa dilakukan di bulan Syawal.", false, "Puasa di bulan Ramadan."],
  ],
  "Seni Rupa": [
    ["Unsur rupa ada tiga: garis, bentuk, dan warna.", true, "Garis, bentuk, dan warna."],
    ["Pensil dipakai untuk mewarnai.", false, "Pensil dipakai untuk menggambar."],
    ["Krayon dipakai untuk mewarnai.", true, "Krayon untuk mewarnai gambar."],
    ["Gunting dipakai dengan hati-hati.", true, "Gunting tajam, pakai pelan-pelan."],
    ["Kolase dibuat dari potongan kertas.", true, "Potongan kertas ditempel menjadi kolase."],
    ["Lingkaran mempunyai 4 sudut.", false, "Lingkaran tidak punya sudut."],
    ["Merah, kuning, dan biru adalah warna dasar.", true, "Tiga warna dasar."],
    ["Merah dicampur kuning menjadi hijau.", false, "Merah + kuning = jingga."],
    ["Lem dipakai untuk menempel.", true, "Lem menempelkan potongan kertas."],
    ["Garis zigzag seperti petir.", true, "Zigzag naik-turun seperti petir."],
    ["Segitiga mempunyai 4 sisi.", false, "Segitiga punya 3 sisi."],
    ["Setelah berkarya, alat harus dirapikan.", true, "Alat dirapikan setelah dipakai."],
  ],
};

const ISIAN_BANK: Record<string, IsianTuple[]> = {
  Matematika: [
    ["Berapa hasil 6 + 4?", "10", "6 + 4 = 10."],
    ["Berapa hasil 9 − 3?", "6", "9 − 3 = 6."],
    ["Berapa 5 × 4?", "20", "5 × 4 = 20."],
    ["Lingkaran mempunyai berapa sudut?", "0", "Lingkaran tidak punya sudut."],
    ["Berapa sisi segitiga?", "3", "Segitiga punya 3 sisi."],
    ["Seperempat dari 12 adalah ...", "3", "12 : 4 = 3."],
    ["Berapa 100 : 5?", "20", "100 : 5 = 20."],
    ["Bilangan sesudah 19 adalah ...", "20", "Sesudah 19 adalah 20."],
    ["Berapa 7 × 7?", "49", "7 × 7 = 49."],
    ["1 meter sama dengan berapa sentimeter?", "100", "1 m = 100 cm."],
    ["Berapa keliling persegi dengan sisi 4 cm?", "16", "Keliling = 4 × 4 = 16 cm."],
    ["Berapa hasil 12 + 8?", "20", "12 + 8 = 20."],
  ],
  "B. Indonesia": [
    ["Huruf pertama kata 'bola' adalah huruf ...", "B", "Bola diawali huruf B."],
    ["Tanda yang dipakai untuk kalimat bertanya adalah tanda ...", "tanya", "Kalimat bertanya memakai tanda tanya."],
    ["Kata 'kuda' terdiri dari suku kata ku dan ...", "da", "Ku-da."],
    ["Bunyi jam dinding adalah tik-...", "tok", "Jam berbunyi tik-tok."],
    ["Setelah bermain, mainan harus ...", "dirapikan", "Mainan dirapikan kembali."],
    ["Kuman dibunuh dengan mencuci tangan memakai ...", "sabun", "Sabun membunuh kuman."],
    ["Cerita 'Bola Boni' bercerita tentang Boni dan ...", "bola", "Bola Boni: Boni dan bolanya."],
    ["Tanda seru dipakai pada kalimat yang ...", "berseru", "Kalimat berseru memakai tanda seru."],
    ["Suku kata pertama dari kata 'lilin' adalah ...", "li", "Li-lin."],
    ["Kalimat yang baik diawali huruf ...", "besar", "Awal kalimat memakai huruf besar."],
    ["Kata 'hati' terdiri dari suku kata ha dan ...", "ti", "Ha-ti."],
    ["Bermain bersama harus ...", "rukun", "Bermain bersama harus rukun."],
  ],
  IPAS: [
    ["Pancaindra untuk melihat adalah ...", "mata", "Mata untuk melihat."],
    ["Pancaindra untuk mendengar adalah ...", "telinga", "Telinga untuk mendengar."],
    ["Pancaindra untuk mencium bau adalah ...", "hidung", "Hidung untuk mencium bau."],
    ["Tumbuhan butuh air dan cahaya ...", "matahari", "Cahaya matahari membantu tumbuhan."],
    ["Kucing termasuk benda ...", "hidup", "Kucing tumbuh dan bergerak."],
    ["Meja termasuk benda ...", "tak hidup", "Meja tidak tumbuh."],
    ["Pancaindra kita ada ...", "lima", "Ada lima pancaindra."],
    ["Lidah dipakai untuk mengecap ...", "rasa", "Lidah mengecap rasa."],
    ["Kulit dipakai untuk ...", "meraba", "Kulit meraba."],
    ["Tumbuhan tumbuh dari ...", "biji", "Tumbuhan tumbuh dari biji."],
    ["Hewan yang hidup di air adalah ...", "ikan", "Ikan hidup di air."],
    ["Bagian tubuh untuk berjalan adalah ...", "kaki", "Kaki untuk berjalan."],
  ],
  Pancasila: [
    ["Saat berkenalan, kita menyebut ... dengan ramah.", "nama", "Sebut nama dengan ramah."],
    ["Perbedaan teman harus ...", "dihargai", "Perbedaan dihargai."],
    ["Merawat tubuh dengan mandi dan gosok ...", "gigi", "Gosok gigi merawat tubuh."],
    ["Anak mandiri memakai sepatu ...", "sendiri", "Anak mandiri memakai sepatu sendiri."],
    ["Bermain bersama harus ...", "rukun", "Bermain bersama harus rukun."],
    ["Contoh aturan di rumah adalah merapikan ...", "mainan", "Rapikan mainan setelah bermain."],
    ["Di sekolah kita harus datang tepat ...", "waktu", "Datang tepat waktu."],
    ["Makan dilakukan dengan ...", "tenang", "Makan dengan tenang."],
    ["Jadwal harian membantu mengatur ...", "waktu", "Jadwal mengatur waktu."],
    ["Aturan membuat hidup ...", "aman", "Aturan membuat hidup aman."],
    ["Melanggar aturan bisa ... diri sendiri.", "membahayakan", "Melanggar aturan berbahaya."],
    ["Teman yang berbeda kesukaan tetap ... kita.", "teman", "Semua teman tetap teman kita."],
  ],
  "B. Inggris": [
    ["Hello artinya ...", "halo", "Hello = halo."],
    ["Good morning artinya selamat ...", "pagi", "Good morning = selamat pagi."],
    ["One artinya ...", "satu", "One = satu."],
    ["Red artinya ...", "merah", "Red = merah."],
    ["Book artinya ...", "buku", "Book = buku."],
    ["Chair artinya ...", "kursi", "Chair = kursi."],
    ["Five artinya ...", "lima", "Five = lima."],
    ["Blue artinya ...", "biru", "Blue = biru."],
    ["Pencil artinya ...", "pensil", "Pencil = pensil."],
    ["Table artinya ...", "meja", "Table = meja."],
    ["Three artinya ...", "tiga", "Three = tiga."],
    ["Yellow artinya ...", "kuning", "Yellow = kuning."],
  ],
  PJOK: [
    ["Gerak yang dilakukan di tempat disebut gerak ...", "non-lokomotor", "Non-lokomotor = di tempat."],
    ["Gerak yang berpindah tempat disebut gerak ...", "lokomotor", "Lokomotor = berpindah tempat."],
    ["Gerak mengendalikan benda disebut gerak ...", "manipulatif", "Manipulatif memakai benda."],
    ["Contoh gerak non-lokomotor adalah ...", "membungkuk", "Membungkuk dilakukan di tempat."],
    ["Contoh gerak lokomotor adalah ...", "berlari", "Berlari berpindah tempat."],
    ["Melempar dan menangkap bola adalah gerak ...", "manipulatif", "Melempar memakai bola."],
    ["Menendang bola memakai ...", "kaki", "Menendang memakai kaki."],
    ["Sebelum olahraga kita melakukan ...", "pemanasan", "Pemanasan menyiapkan tubuh."],
    ["Merangkak memakai tangan dan ...", "kaki", "Merangkak memakai tangan dan kaki."],
    ["Bola dipantulkan dengan telapak ...", "tangan", "Bola dipantulkan dengan tangan."],
    ["Melompat memakai dua ...", "kaki", "Melompat memakai dua kaki."],
    ["Olahraga membuat tubuh ...", "sehat", "Olahraga membuat tubuh sehat."],
  ],
  PAI: [
    ["Huruf hijaiah berjumlah ...", "28", "Huruf hijaiah ada 28."],
    ["Fathah berbunyi ...", "a", "Fathah berbunyi a."],
    ["Kasrah berbunyi ...", "i", "Kasrah berbunyi i."],
    ["Dammah berbunyi ...", "u", "Dammah berbunyi u."],
    ["Surah Al-Fatihah terdiri dari ... ayat.", "7", "Al-Fatihah 7 ayat."],
    ["Rukun iman ada ...", "enam", "Rukun iman ada enam."],
    ["Rukun Islam ada ...", "lima", "Rukun Islam ada lima."],
    ["Basmalah dibaca sebelum ...", "kegiatan", "Basmalah sebelum kegiatan baik."],
    ["Hamdalah dibaca sesudah ...", "kegiatan", "Hamdalah sesudah kegiatan."],
    ["Nabi dan rasul berjumlah ...", "25", "Nabi dan rasul ada 25."],
    ["Nabi terakhir adalah Nabi ...", "Muhammad", "Nabi Muhammad nabi terakhir."],
    ["Puasa dilakukan di bulan ...", "Ramadan", "Puasa di bulan Ramadan."],
  ],
  "Seni Rupa": [
    ["Unsur rupa ada ...", "tiga", "Unsur rupa: garis, bentuk, warna."],
    ["Pensil dipakai untuk ...", "menggambar", "Pensil untuk menggambar."],
    ["Krayon dipakai untuk ...", "mewarnai", "Krayon untuk mewarnai."],
    ["Gunting dipakai untuk memotong ...", "kertas", "Gunting memotong kertas."],
    ["Lem dipakai untuk ...", "menempel", "Lem untuk menempel."],
    ["Kolase dibuat dari potongan ...", "kertas", "Kolase dari potongan kertas."],
    ["Warna dasar adalah merah, kuning, dan ...", "biru", "Warna dasar: merah, kuning, biru."],
    ["Merah dicampur kuning menjadi ...", "jingga", "Merah + kuning = jingga."],
    ["Garis yang seperti pelangi disebut garis ...", "lengkung", "Garis lengkung seperti pelangi."],
    ["Roda berbentuk ...", "lingkaran", "Roda berbentuk lingkaran."],
    ["Segitiga mempunyai ... sisi.", "3", "Segitiga punya 3 sisi."],
    ["Setelah berkarya, alat ...", "dirapikan", "Alat dirapikan setelah dipakai."],
  ],
};

const URAIAN_BANK: Record<string, UraianTuple[]> = {
  Matematika: [
    ["Jelaskan cara menghitung 7 + 5 memakai jari!", ["7", "5", "12"], "Angkat 7 jari, tambah 5 jari, hitung semuanya: 12."],
    ["Mengapa 2 + 3 sama dengan 3 + 2? Jelaskan!", ["urutan", "hasil", "5"], "Urutan bilangan yang ditambah tidak mengubah hasil: keduanya 5."],
    ["Jelaskan perbedaan persegi dan persegi panjang!", ["sisi", "sama", "berhadapan"], "Persegi semua sisinya sama panjang; persegi panjang hanya sisi berhadapan yang sama panjang."],
    ["Bagaimana cara membandingkan dua bilangan? Jelaskan!", ["bandingkan", "besar", "kecil"], "Bandingkan dari nilai tempat terbesar: bilangan yang lebih besar nilainya lebih besar."],
    ["Jelaskan apa itu pecahan setengah dengan contoh!", ["setengah", "dua", "sama"], "Setengah artinya satu bagian dari dua bagian yang sama besar."],
    ["Mengapa kita perlu belajar perkalian? Jelaskan!", ["cepat", "berulang", "menghitung"], "Perkalian membuat menghitung penjumlahan berulang lebih cepat."],
    ["Jelaskan cara menghitung keliling persegi!", ["sisi", "4", "jumlah"], "Keliling persegi = jumlah keempat sisinya, atau 4 × sisi."],
    ["Apa yang terjadi bila bilangan dikurangi bilangan yang sama besar? Jelaskan!", ["nol", "habis"], "Hasilnya nol, karena bilangannya habis."],
    ["Jelaskan hubungan perkalian dan pembagian!", ["kebalikan", "pembagian", "perkalian"], "Pembagian adalah kebalikan dari perkalian."],
    ["Jelaskan cara membaca bilangan 1.250!", ["seribu", "ratus", "puluh"], "1.250 dibaca seribu dua ratus lima puluh."],
  ],
  "B. Indonesia": [
    ["Jelaskan mengapa kita harus mencuci tangan sebelum makan!", ["kuman", "sakit", "bersih"], "Tangan kotor membawa kuman; kuman bisa membuat kita sakit."],
    ["Ceritakan kembali isi cerita 'Bola Boni' dengan kata-katamu sendiri!", ["Boni", "bola", "berbunyi"], "Boni bermain bola yang berbunyi."],
    ["Jelaskan perbedaan kalimat bertanya dan kalimat berseru!", ["tanya", "seru", "tanda"], "Kalimat bertanya memakai tanda tanya, kalimat berseru memakai tanda seru."],
    ["Apa yang kamu lakukan saat bermain dengan teman? Jelaskan!", ["bergiliran", "aman", "rukun"], "Bermain dengan bergiliran, aman, dan rukun."],
    ["Jelaskan cara berkenalan dengan teman baru yang sopan!", ["nama", "ramah", "sapa"], "Sapa dengan ramah dan sebutkan nama."],
    ["Mengapa kita harus berani mencoba hal baru? Jelaskan!", ["belajar", "bisa", "berani"], "Berani mencoba membuat kita belajar dan akhirnya bisa."],
    ["Jelaskan mengapa kuman berbahaya bagi tubuh kita!", ["kuman", "sakit", "kecil"], "Kuman sangat kecil dan bisa membuat tubuh sakit."],
    ["Jelaskan cara menjaga kebersihan diri setiap hari!", ["mandi", "gosok gigi", "cuci tangan"], "Mandi, gosok gigi, dan cuci tangan setiap hari."],
    ["Sebutkan tiga kata yang memakai suku kata 'ba'!", ["baju", "batu", "baca"], "Contoh: baju, batu, baca."],
    ["Ceritakan kegiatanmu di pagi hari sebelum berangkat ke sekolah!", ["bangun", "mandi", "sarapan"], "Bangun pagi, mandi, sarapan, lalu berangkat."],
  ],
  IPAS: [
    ["Jelaskan tugas kelima pancaindra kita!", ["mata", "telinga", "hidung", "lidah", "kulit"], "Mata melihat, telinga mendengar, hidung mencium, lidah mengecap, kulit meraba."],
    ["Jelaskan perbedaan benda hidup dan benda tak hidup!", ["tumbuh", "bernapas", "bergerak"], "Benda hidup tumbuh, bernapas, dan bergerak; benda tak hidup tidak."],
    ["Mengapa tumbuhan butuh cahaya matahari? Jelaskan!", ["matahari", "tumbuh", "makanan"], "Cahaya matahari membantu tumbuhan membuat makanan dan tumbuh."],
    ["Jelaskan cara merawat tumbuhan di rumah!", ["siram", "matahari", "air"], "Siram dengan air dan letakkan di tempat kena cahaya matahari."],
    ["Jelaskan mengapa kita harus menjaga kebersihan lingkungan!", ["sehat", "bersih", "penyakit"], "Lingkungan bersih membuat kita sehat dan terhindar dari penyakit."],
    ["Apa yang terjadi bila kita tidak makan dan minum? Jelaskan!", ["lemas", "sakit", "energi"], "Tubuh lemas dan bisa sakit karena kekurangan energi."],
    ["Jelaskan bagian-bagian tubuhmu dan gunanya!", ["kepala", "tangan", "kaki"], "Kepala untuk berpikir, tangan untuk memegang, kaki untuk berjalan."],
    ["Jelaskan mengapa kulit dipakai untuk meraba!", ["kulit", "meraba", "rasa"], "Kulit merasakan panas, dingin, kasar, dan halus."],
    ["Sebutkan tiga hewan dan makanannya!", ["kucing", "ikan", "rumput"], "Contoh: kucing makan ikan, sapi makan rumput."],
    ["Jelaskan contoh benda di kelasmu dan gunanya!", ["meja", "kursi", "buku"], "Meja untuk menulis, kursi untuk duduk, buku untuk belajar."],
  ],
  Pancasila: [
    ["Jelaskan cara berkenalan dengan teman baru yang sopan!", ["nama", "ramah", "sapa"], "Sapa dengan ramah dan sebutkan nama."],
    ["Mengapa kita harus menghargai perbedaan teman? Jelaskan!", ["berbeda", "hargai", "rukun"], "Perbedaan itu indah; menghargai membuat kelas rukun."],
    ["Jelaskan aturan di rumahmu!", ["rapi", "tidur", "mainan"], "Contoh: merapikan mainan dan tidur tepat waktu."],
    ["Mengapa aturan penting di sekolah? Jelaskan!", ["tertib", "aman", "belajar"], "Aturan membuat sekolah tertib, aman, dan nyaman untuk belajar."],
    ["Jelaskan cara makan yang baik!", ["duduk", "tenang", "habis"], "Duduk tenang dan habiskan makanan."],
    ["Apa yang kamu lakukan bila temanmu berbeda pendapat? Jelaskan!", ["dengarkan", "hargai", "musyawarah"], "Dengarkan, hargai, lalu musyawarah."],
    ["Jelaskan contoh sikap mandiri di rumah!", ["sepatu", "tas", "sendiri"], "Memakai sepatu dan merapikan tas sendiri."],
    ["Mengapa kita harus menepati jadwal harian? Jelaskan!", ["jadwal", "waktu", "tertib"], "Jadwal membuat waktu teratur dan hidup tertib."],
    ["Jelaskan cara menjaga kerukunan di kelas!", ["rukun", "bergiliran", "sopan"], "Bersikap sopan, bergiliran, dan rukun."],
    ["Apa akibatnya bila semua orang melanggar aturan? Jelaskan!", ["kacau", "tidak aman", "berbahaya"], "Hidup menjadi kacau dan tidak aman."],
  ],
  "B. Inggris": [
    ["Tuliskan sapaan bahasa Inggris untuk pagi hari dan artinya!", ["good morning", "selamat pagi"], "Good morning = selamat pagi."],
    ["Tuliskan cara bertanya nama dalam bahasa Inggris dan jawabannya!", ["what's your name", "my name is"], "What's your name? — My name is ..."],
    ["Sebutkan tiga warna dalam bahasa Inggris dan artinya!", ["red", "blue", "yellow"], "Red merah, blue biru, yellow kuning."],
    ["Sebutkan bilangan 1 sampai 5 dalam bahasa Inggris!", ["one", "two", "three", "four", "five"], "One, two, three, four, five."],
    ["Sebutkan tiga benda di kelas dalam bahasa Inggris!", ["book", "pencil", "chair"], "Book, pencil, chair."],
    ["Tuliskan kalimat 'Ini sebuah buku' dan 'Ini sebuah pensil' dalam bahasa Inggris!", ["this is a book", "this is a pencil"], "This is a book. This is a pencil."],
    ["Jelaskan kapan kita mengucapkan 'Nice to meet you'!", ["berkenalan", "senang"], "Diucapkan saat berkenalan: senang berkenalan denganmu."],
    ["Tuliskan artinya: 'Good afternoon'!", ["selamat", "siang"], "Good afternoon = selamat siang."],
    ["Sebutkan anggota keluargamu dalam bahasa Inggris!", ["father", "mother", "brother", "sister"], "Father, mother, brother, sister."],
    ["Sebutkan dua hewan dalam bahasa Inggris dan artinya!", ["cat", "dog", "kucing", "anjing"], "Cat kucing, dog anjing."],
  ],
  PJOK: [
    ["Jelaskan perbedaan gerak lokomotor dan non-lokomotor!", ["berpindah", "tempat", "lokomotor"], "Lokomotor berpindah tempat, non-lokomotor di tempat."],
    ["Sebutkan tiga contoh gerak non-lokomotor!", ["membungkuk", "memutar", "mengayun"], "Membungkuk, memutar badan, mengayun lengan."],
    ["Sebutkan tiga contoh gerak lokomotor!", ["berjalan", "berlari", "melompat"], "Berjalan, berlari, melompat."],
    ["Jelaskan cara melempar bola yang benar!", ["tangan", "sasaran", "pelan"], "Lempar dengan tangan ke arah sasaran, pelan-pelan."],
    ["Mengapa pemanasan penting sebelum olahraga? Jelaskan!", ["tubuh", "siap", "cedera"], "Pemanasan menyiapkan tubuh dan mencegah cedera."],
    ["Jelaskan cara menangkap bola yang benar!", ["dua tangan", "mata", "bola"], "Lihat bola dan tangkap dengan dua tangan."],
    ["Jelaskan cara mendarat yang aman setelah melompat!", ["lutut", "tekuk", "aman"], "Mendarat dengan lutut sedikit ditekuk."],
    ["Mengapa olahraga membuat tubuh sehat? Jelaskan!", ["sehat", "kuat", "bugar"], "Olahraga membuat tubuh sehat, kuat, dan bugar."],
    ["Jelaskan aturan bermain bola yang aman!", ["aman", "bergiliran", "hati-hati"], "Bermain bergiliran dan hati-hati di tempat aman."],
    ["Sebutkan tiga contoh gerak manipulatif!", ["melempar", "menangkap", "menendang"], "Melempar, menangkap, menendang bola."],
  ],
  PAI: [
    ["Jelaskan bunyi harakat fathah, kasrah, dan dammah!", ["fathah", "kasrah", "dammah"], "Fathah a, kasrah i, dammah u."],
    ["Sebutkan enam rukun iman!", ["Allah", "malaikat", "kitab", "rasul", "akhir", "qadar"], "Allah, malaikat, kitab, rasul, hari akhir, qada dan qadar."],
    ["Sebutkan lima rukun Islam!", ["syahadat", "salat", "zakat", "puasa", "haji"], "Syahadat, salat, zakat, puasa, haji."],
    ["Jelaskan kapan kita membaca basmalah dan hamdalah!", ["basmalah", "hamdalah", "kegiatan"], "Basmalah sebelum kegiatan, hamdalah sesudahnya."],
    ["Mengapa Nabi Muhammad menjadi teladan kita? Jelaskan!", ["jujur", "penyayang", "teladan"], "Nabi Muhammad jujur, amanah, dan penyayang."],
    ["Jelaskan isi Surah Al-Fatihah dengan kata-katamu sendiri!", ["Al-Fatihah", "pembuka", "tujuh"], "Al-Fatihah surah pembuka, 7 ayat, berisi pujian dan doa."],
    ["Apa arti dua kalimat syahadat? Jelaskan!", ["syahadat", "Allah", "Muhammad"], "Tiada Tuhan selain Allah dan Muhammad utusan Allah."],
    ["Jelaskan cara bersyukur kepada Allah setiap hari!", ["hamdalah", "syukur", "Allah"], "Membaca hamdalah dan memakai nikmat dengan baik."],
    ["Sebutkan tiga sifat terpuji Nabi Muhammad!", ["jujur", "amanah", "penyayang"], "Jujur, amanah, penyayang."],
    ["Jelaskan mengapa kita harus membaca Al-Qur'an setiap hari!", ["Al-Qur'an", "pahala", "belajar"], "Membaca Al-Qur'an menambah pahala dan ilmu."],
  ],
  "Seni Rupa": [
    ["Sebutkan tiga unsur rupa dan contohnya!", ["garis", "bentuk", "warna"], "Garis, bentuk, dan warna."],
    ["Jelaskan cara memakai gunting dengan aman!", ["hati-hati", "gagang", "pelan"], "Pegang gagang, potong pelan-pelan, hati-hati."],
    ["Jelaskan cara membuat kolase!", ["kertas", "gunting", "lem", "tempel"], "Potong kertas, lalu tempel dengan lem."],
    ["Jelaskan perbedaan garis lurus dan garis lengkung!", ["lurus", "lengkung", "penggaris", "pelangi"], "Lurus seperti penggaris, lengkung seperti pelangi."],
    ["Sebutkan tiga warna dasar!", ["merah", "kuning", "biru"], "Merah, kuning, biru."],
    ["Jelaskan apa yang terjadi bila warna merah dicampur kuning!", ["jingga", "campur", "merah", "kuning"], "Merah + kuning = jingga."],
    ["Ceritakan hasil pengamatanmu tentang sebuah bunga!", ["bunga", "warna", "bentuk"], "Bunga punya warna dan bentuk yang bisa diceritakan."],
    ["Jelaskan alat-alat berkarya seni dan gunanya!", ["pensil", "krayon", "gunting", "lem"], "Pensil menggambar, krayon mewarnai, gunting memotong, lem menempel."],
    ["Mengapa kita harus merapikan alat setelah berkarya? Jelaskan!", ["rapi", "bersih", "aman"], "Supaya rapi, bersih, dan aman dipakai lagi."],
    ["Jelaskan cara mewarnai gambar supaya rapi!", ["pelan", "rapi", "krayon"], "Warnai pelan-pelan dan rapi dengan krayon."],
  ],
};

// Keluarga soal PG kompleks: tiap keluarga punya daftar jawaban benar dan
// pengecoh; varian dienumerasi dengan rotasi (lihat kompleksPool).
interface KompleksFamily { prompt: string; good: string[]; bad: string[] }
const KOMPLEKS_BANK: Record<string, KompleksFamily[]> = {
  Matematika: [
    { prompt: "Bilangan berikut yang lebih dari 10 adalah ... (pilih semua yang benar)", good: ["12", "15", "20", "11", "18"], bad: ["5", "8", "3", "10", "7"] },
    { prompt: "Hasil penjumlahan berikut yang sama dengan 10 adalah ... (pilih semua yang benar)", good: ["6 + 4", "7 + 3", "5 + 5", "9 + 1", "2 + 8"], bad: ["6 + 3", "7 + 2", "5 + 4", "9 + 2", "1 + 8"] },
    { prompt: "Bangun datar berikut yang mempunyai 4 sisi adalah ... (pilih semua yang benar)", good: ["persegi", "persegi panjang", "jajar genjang", "belah ketupat"], bad: ["segitiga", "lingkaran", "segi lima"] },
  ],
  "B. Indonesia": [
    { prompt: "Kata berikut yang memakai suku kata 'ba' adalah ... (pilih semua yang benar)", good: ["baju", "batu", "baca", "buku"], bad: ["kuda", "lilin", "meja", "pensil"] },
    { prompt: "Kalimat berikut yang memakai tanda tanya adalah ... (pilih semua yang benar)", good: ["Siapa namamu?", "Di mana rumahmu?", "Apa kabarmu?"], bad: ["Aku senang.", "Hore, kita menang!", "Ini bukuku."] },
    { prompt: "Sikap berikut yang menunjukkan kebersihan adalah ... (pilih semua yang benar)", good: ["mencuci tangan", "membuang sampah", "gosok gigi"], bad: ["membuang sampah sembarangan", "tidak pernah mandi", "makan dengan tangan kotor"] },
  ],
  IPAS: [
    { prompt: "Yang termasuk pancaindra adalah ... (pilih semua yang benar)", good: ["mata", "telinga", "hidung", "lidah", "kulit"], bad: ["rambut", "kuku", "tulang", "gigi"] },
    { prompt: "Benda berikut yang termasuk benda hidup adalah ... (pilih semua yang benar)", good: ["kucing", "pohon", "burung", "ikan"], bad: ["meja", "batu", "buku", "pensil"] },
    { prompt: "Benda berikut yang termasuk benda tak hidup adalah ... (pilih semua yang benar)", good: ["meja", "batu", "kursi", "buku"], bad: ["kucing", "pohon", "ayam", "ikan"] },
  ],
  Pancasila: [
    { prompt: "Sikap berikut yang menunjukkan sopan santun adalah ... (pilih semua yang benar)", good: ["menyapa dengan ramah", "meminta maaf", "mengucapkan terima kasih"], bad: ["mengejek teman", "berteriak", "mendorong teman"] },
    { prompt: "Aturan berikut yang berlaku di sekolah adalah ... (pilih semua yang benar)", good: ["datang tepat waktu", "mendengarkan guru", "memakai seragam"], bad: ["pulang seenaknya", "berlari di kelas", "membuang sampah sembarangan"] },
    { prompt: "Contoh sikap menghargai perbedaan adalah ... (pilih semua yang benar)", good: ["bermain dengan semua teman", "mendengarkan pendapat teman", "tidak mengejek"], bad: ["mengejek teman", "memilih-milih teman", "tidak mau berteman"] },
  ],
  "B. Inggris": [
    { prompt: "Kata berikut yang berarti warna adalah ... (pilih semua yang benar)", good: ["red", "blue", "yellow", "green"], bad: ["book", "chair", "one", "pencil"] },
    { prompt: "Kata berikut yang berarti bilangan adalah ... (pilih semua yang benar)", good: ["one", "two", "three", "five", "ten"], bad: ["red", "book", "table", "bag"] },
    { prompt: "Kata berikut yang berarti benda di kelas adalah ... (pilih semua yang benar)", good: ["book", "pencil", "bag", "chair", "table"], bad: ["red", "blue", "one", "cat"] },
  ],
  PJOK: [
    { prompt: "Gerak berikut yang termasuk gerak non-lokomotor adalah ... (pilih semua yang benar)", good: ["membungkuk", "memutar badan", "mengayun lengan", "menekuk lutut"], bad: ["berjalan", "berlari", "melompat"] },
    { prompt: "Gerak berikut yang termasuk gerak lokomotor adalah ... (pilih semua yang benar)", good: ["berjalan", "berlari", "melompat", "merangkak"], bad: ["membungkuk", "memutar badan", "melempar bola"] },
    { prompt: "Gerak berikut yang termasuk gerak manipulatif adalah ... (pilih semua yang benar)", good: ["melempar bola", "menangkap bola", "menendang bola", "memantulkan bola"], bad: ["berjalan", "membungkuk", "berlari"] },
  ],
  PAI: [
    { prompt: "Yang termasuk rukun iman adalah ... (pilih semua yang benar)", good: ["iman kepada Allah", "iman kepada malaikat", "iman kepada kitab", "iman kepada rasul"], bad: ["iman kepada harta", "iman kepada teman", "iman kepada mainan"] },
    { prompt: "Yang termasuk rukun Islam adalah ... (pilih semua yang benar)", good: ["syahadat", "salat", "zakat", "puasa", "haji"], bad: ["bermain", "tidur", "menonton"] },
    { prompt: "Bacaan berikut yang dibaca sebelum kegiatan adalah ... (pilih semua yang benar)", good: ["basmalah", "bismillah"], bad: ["hamdalah", "alhamdulillah"] },
  ],
  "Seni Rupa": [
    { prompt: "Yang termasuk unsur rupa adalah ... (pilih semua yang benar)", good: ["garis", "bentuk", "warna"], bad: ["bunyi", "rasa", "bau"] },
    { prompt: "Warna berikut yang termasuk warna dasar adalah ... (pilih semua yang benar)", good: ["merah", "kuning", "biru"], bad: ["jingga", "ungu", "hijau"] },
    { prompt: "Alat berkarya berikut yang dipakai untuk menggambar adalah ... (pilih semua yang benar)", good: ["pensil", "krayon"], bad: ["gunting", "lem"] },
  ],
};

// PG ekstra per mapel (menambah pool PG supaya Paket A dan B tidak tumpang
// tindih, terutama untuk sas-k1-s1 yang butuh 40 PG per mapel).
const EXTRA_PG: Record<string, PgTuple[]> = {
  Matematika: [
    ["Kamu punya 8 permen. Kamu memberi 3 kepada temanmu. Berapa sisanya?", ["4", "5", "6"], 1, "8 − 3 = 5."],
    ["Berapa 4 + 6?", ["9", "10", "11"], 1, "4 + 6 = 10."],
    ["Ada 12 apel dalam keranjang. Dimakan 2 apel. Berapa apel yang tinggal?", ["9", "10", "11"], 1, "12 − 2 = 10."],
    ["Manakah bilangan yang paling kecil?", ["15", "9", "12"], 1, "9 paling kecil."],
    ["Berapa hasil 3 × 4?", ["11", "12", "13"], 1, "3 × 4 = 12."],
    ["Lingkaran, segitiga, dan persegi adalah contoh ...", ["bilangan", "bentuk", "warna"], 1, "Itu semua adalah bentuk."],
    ["Berapa 20 − 5?", ["14", "15", "16"], 1, "20 − 5 = 15."],
    ["Bilangan 17 dibaca ...", ["tujuh belas", "tujuh puluh", "satu tujuh"], 0, "17 dibaca tujuh belas."],
    ["Berapa hasil 2 + 2 + 2?", ["5", "6", "7"], 1, "2 + 2 + 2 = 6."],
    ["Satu lusin sama dengan ...", ["10", "12", "20"], 1, "Satu lusin = 12."],
    ["Berapa sisi yang dimiliki dua segitiga?", ["3", "6", "9"], 1, "Satu segitiga 3 sisi, dua segitiga 6 sisi."],
    ["Manakah yang merupakan bilangan genap?", ["7", "9", "10"], 2, "10 habis dibagi 2, jadi genap."],
  ],
  "B. Indonesia": [
    ["Kata 'meja' terdiri dari suku kata ...", ["me-ja", "m-eja", "mej-a"], 0, "Me-ja."],
    ["Kalimat 'Aku pergi ke sekolah.' diakhiri tanda ...", ["tanya", "seru", "titik"], 2, "Kalimat berita diakhiri tanda titik."],
    ["Manakah kata yang diawali huruf 's'?", ["Bola", "Sapu", "Kuda"], 1, "Sapu diawali huruf s."],
    ["Kata 'ibu' terdiri dari ... suku kata.", ["satu", "dua", "tiga"], 1, "I-bu, dua suku kata."],
    ["Membaca cerita dengan suara yang jelas disebut membaca ...", ["diam", "nyaring", "pelan"], 1, "Membaca nyaring."],
    ["Lawan kata 'besar' adalah ...", ["kecil", "tinggi", "panjang"], 0, "Lawan besar adalah kecil."],
    ["Kata yang tepat untuk melengkapi 'Aku ... ke sekolah setiap pagi.'", ["pergi", "pergi-pergi", "pergian"], 0, "Aku pergi ke sekolah setiap pagi."],
    ["Manakah yang merupakan nama benda?", ["Berlari", "Meja", "Senang"], 1, "Meja adalah nama benda."],
    ["Huruf vokal adalah huruf ...", ["a, i, u, e, o", "b, c, d", "k, l, m"], 0, "Huruf vokal: a, i, u, e, o."],
    ["Kata 'bermain' berawalan ...", ["ber-", "main-", "berma-"], 0, "Ber-main."],
    ["Kalimat tanya yang tepat adalah ...", ["Siapa namamu.", "Siapa namamu?", "Siapa namamu!"], 1, "Kalimat tanya memakai tanda tanya."],
    ["Ceritakan kembali sebuah cerita disebut ...", ["membaca", "menceritakan kembali", "menulis"], 1, "Menceritakan kembali isi cerita."],
  ],
  IPAS: [
    ["Hewan yang bisa terbang adalah ...", ["ikan", "burung", "kucing"], 1, "Burung bisa terbang."],
    ["Tumbuhan membuat makanan dengan bantuan ...", ["cahaya matahari", "bulan", "bintang"], 0, "Tumbuhan memakai cahaya matahari."],
    ["Bagian tumbuhan yang menyerap air adalah ...", ["daun", "akar", "bunga"], 1, "Akar menyerap air dari tanah."],
    ["Hewan yang hidup di air adalah ...", ["ayam", "ikan", "kambing"], 1, "Ikan hidup di air."],
    ["Makanan yang sehat untuk tubuh adalah ...", ["sayur dan buah", "permen saja", "kerupuk saja"], 0, "Sayur dan buah sehat untuk tubuh."],
    ["Bagian tubuh untuk mencium bau adalah ...", ["mata", "hidung", "telinga"], 1, "Hidung mencium bau."],
    ["Benda yang dapat ditarik magnet adalah ...", ["kayu", "besi", "plastik"], 1, "Besi dapat ditarik magnet."],
    ["Air berubah menjadi es bila ...", ["dipanaskan", "didinginkan", "dibiarkan"], 1, "Air membeku bila didinginkan."],
    ["Hewan yang menghasilkan susu adalah ...", ["sapi", "ayam", "bebek"], 0, "Sapi menghasilkan susu."],
    ["Cahaya matahari membantu tumbuhan ...", ["tumbuh", "tidur", "berlari"], 0, "Cahaya matahari membantu tumbuhan tumbuh."],
    ["Bagian tubuh untuk mendengar adalah ...", ["mata", "telinga", "lidah"], 1, "Telinga mendengar bunyi."],
    ["Benda yang termasuk makhluk hidup adalah ...", ["batu", "pohon", "meja"], 1, "Pohon adalah makhluk hidup."],
  ],
  Pancasila: [
    ["Lambang negara Indonesia adalah ...", ["Garuda Pancasila", "Komodo", "Banteng"], 0, "Garuda Pancasila adalah lambang negara.", 2],
    ["Sila pertama Pancasila berbunyi ...", ["Ketuhanan Yang Maha Esa", "Kemanusiaan yang adil dan beradab", "Persatuan Indonesia"], 0, "Sila pertama: Ketuhanan Yang Maha Esa.", 2],
    ["Saat teman terjatuh, sikap yang baik adalah ...", ["menertawakan", "menolong", "meninggalkan"], 1, "Menolong teman yang terjatuh."],
    ["Aturan dibuat agar hidup menjadi ...", ["kacau", "tertib", "sulit"], 1, "Aturan membuat hidup tertib."],
    ["Bermain bersama teman yang berbeda agama harus ...", ["dijauhi", "dihargai", "diejek"], 1, "Teman yang berbeda tetap dihargai."],
    ["Contoh sikap jujur adalah ...", ["berbohong", "mengakui kesalahan", "menyontek"], 1, "Mengakui kesalahan adalah sikap jujur."],
    ["Gotong royong berarti ...", ["bekerja sendiri", "bekerja sama", "bekerja untuk diri sendiri"], 1, "Gotong royong = bekerja sama."],
    ["Musyawarah dilakukan untuk ...", ["memaksakan kehendak", "mencapai mufakat", "bertengkar"], 1, "Musyawarah mencapai mufakat bersama."],
    ["Saat guru menjelaskan, sikap yang benar adalah ...", ["mendengarkan", "berbicara sendiri", "tidur"], 0, "Mendengarkan guru saat menjelaskan."],
    ["Membuang sampah pada tempatnya adalah sikap ...", ["tidak peduli", "peduli lingkungan", "malas"], 1, "Membuang sampah pada tempatnya peduli lingkungan."],
    ["Bendera negara Indonesia berwarna ...", ["merah putih", "merah biru", "putih hijau"], 0, "Bendera Indonesia merah putih.", 2],
    ["Sikap yang menunjukkan persatuan adalah ...", ["berkelahi", "bermain bersama dengan rukun", "memilih-milih teman"], 1, "Bermain bersama dengan rukun menunjukkan persatuan."],
  ],
  "B. Inggris": [
    ["What is 'kucing' in English?", ["dog", "cat", "bird"], 1, "Kucing = cat."],
    ["How do you say 'terima kasih' in English?", ["Hello", "Thank you", "Good bye"], 1, "Thank you = terima kasih."],
    ["What color is the sun? It is ...", ["blue", "yellow", "green"], 1, "Matahari berwarna kuning: yellow."],
    ["'Good night' artinya ...", ["selamat pagi", "selamat malam", "selamat siang"], 1, "Good night = selamat malam."],
    ["How many fingers do you have?", ["five", "ten", "two"], 1, "Kita punya sepuluh jari: ten."],
    ["'Saya suka apel' dalam bahasa Inggris adalah ...", ["I like apple", "I like banana", "I don't like apple"], 0, "I like apple = saya suka apel."],
    ["What is 'buku' in English?", ["book", "pencil", "bag"], 0, "Buku = book."],
    ["'Dog' artinya ...", ["kucing", "anjing", "burung"], 1, "Dog = anjing."],
    ["What is the color of grass? It is ...", ["red", "green", "blue"], 1, "Rumput berwarna hijau: green."],
    ["'Good bye' artinya ...", ["halo", "selamat tinggal", "selamat datang"], 1, "Good bye = selamat tinggal."],
    ["How do you say 'dua' in English?", ["one", "two", "three"], 1, "Dua = two."],
    ["'Fish' artinya ...", ["burung", "ikan", "kucing"], 1, "Fish = ikan."],
  ],
  PJOK: [
    ["Gerak yang dilakukan sambil berpindah tempat disebut gerak ...", ["non-lokomotor", "lokomotor", "manipulatif"], 1, "Lokomotor = berpindah tempat."],
    ["Olahraga yang baik dilakukan ...", ["setiap hari secukupnya", "sekali setahun", "tidak pernah"], 0, "Olahraga teratur membuat tubuh sehat."],
    ["Saat berlari, kita memakai ...", ["tangan", "kaki", "kepala"], 1, "Berlari memakai kaki."],
    ["Pemanasan dilakukan ... olahraga.", ["sesudah", "sebelum", "tanpa"], 1, "Pemanasan sebelum olahraga."],
    ["Bermain bola dengan teman melatih ...", ["kerja sama", "kesendirian", "kemarahan"], 0, "Bermain bola melatih kerja sama."],
    ["Saat menangkap bola, tangan kita harus ...", ["tertutup", "terbuka siap menangkap", "di belakang punggung"], 1, "Tangan terbuka siap menangkap bola."],
    ["Berenang adalah olahraga yang melatih ...", ["seluruh tubuh", "jari saja", "mata saja"], 0, "Berenang melatih seluruh tubuh."],
    ["Setelah olahraga, kita sebaiknya ...", ["langsung tidur", "pendinginan dan minum air", "makan banyak sekaligus"], 1, "Pendinginan dan minum air setelah olahraga."],
    ["Gerak memutar pinggang termasuk gerak ...", ["lokomotor", "non-lokomotor", "manipulatif"], 1, "Memutar pinggang dilakukan di tempat."],
    ["Bola basket dimainkan dengan ...", ["kaki", "tangan", "kepala"], 1, "Bola basket memakai tangan."],
    ["Sepak bola dimainkan dengan ...", ["tangan", "kaki", "dada saja"], 1, "Sepak bola memakai kaki."],
    ["Saat bermain, bila teman jatuh kita harus ...", ["menertawakan", "menolong", "meninggalkan"], 1, "Menolong teman yang jatuh."],
  ],
  PAI: [
    ["Al-Qur'an diturunkan kepada Nabi ...", ["Muhammad", "Adam", "Musa"], 0, "Al-Qur'an diturunkan kepada Nabi Muhammad."],
    ["Jumlah rukun iman adalah ...", ["lima", "enam", "tujuh"], 1, "Rukun iman ada enam."],
    ["Jumlah rukun Islam adalah ...", ["empat", "lima", "enam"], 1, "Rukun Islam ada lima."],
    ["Salat Subuh dikerjakan pada waktu ...", ["pagi", "siang", "malam"], 0, "Salat Subuh pada waktu pagi."],
    ["Kalimat 'alhamdulillah' disebut ...", ["basmalah", "hamdalah", "syahadat"], 1, "Alhamdulillah adalah hamdalah."],
    ["Kalimat 'bismillah' disebut ...", ["basmalah", "hamdalah", "syahadat"], 0, "Bismillah adalah basmalah."],
    ["Nabi yang membangun Ka'bah bersama Ismail adalah Nabi ...", ["Ibrahim", "Musa", "Isa"], 0, "Nabi Ibrahim membangun Ka'bah bersama Ismail."],
    ["Sifat jujur dalam bahasa Arab disebut ...", ["siddiq", "amanah", "tabligh"], 0, "Jujur = siddiq."],
    ["Malaikat yang menyampaikan wahyu adalah ...", ["Jibril", "Mikail", "Israfil"], 0, "Malaikat Jibril menyampaikan wahyu."],
    ["Kitab suci yang diturunkan kepada Nabi Musa adalah ...", ["Al-Qur'an", "Taurat", "Injil"], 1, "Taurat diturunkan kepada Nabi Musa."],
    ["Berterima kasih kepada Allah dilakukan dengan membaca ...", ["basmalah", "hamdalah", "istigfar"], 1, "Hamdalah adalah tanda bersyukur."],
    ["Nabi Muhammad lahir di kota ...", ["Madinah", "Mekah", "Yaman"], 1, "Nabi Muhammad lahir di Mekah."],
  ],
  "Seni Rupa": [
    ["Warna yang didapat dari campuran biru dan kuning adalah ...", ["jingga", "hijau", "ungu"], 1, "Biru + kuning = hijau."],
    ["Garis yang berbentuk seperti ombak disebut garis ...", ["lurus", "bergelombang", "zigzag"], 1, "Garis bergelombang seperti ombak."],
    ["Bulan sabit menyerupai ...", ["lingkaran", "segitiga", "persegi"], 0, "Bulan sabit menyerupai lingkaran yang terpotong."],
    ["Alat untuk mewarnai dengan air adalah ...", ["krayon", "cat air", "pensil"], 1, "Cat air dipakai untuk mewarnai dengan air."],
    ["Karya seni dari kain perca disebut ...", ["kolase", "patung", "lukisan"], 0, "Kolase bisa dibuat dari kain perca."],
    ["Warna yang menenangkan seperti langit adalah ...", ["merah", "biru", "jingga"], 1, "Biru seperti langit yang tenang."],
    ["Bentuk atap rumah biasanya ...", ["lingkaran", "segitiga", "persegi"], 1, "Atap rumah berbentuk segitiga."],
    ["Untuk menggambar lingkaran, kita bisa memakai ...", ["penggaris", "jangka", "gunting"], 1, "Jangka dipakai menggambar lingkaran."],
    ["Warna ungu didapat dari campuran ...", ["merah dan kuning", "merah dan biru", "kuning dan biru"], 1, "Merah + biru = ungu."],
    ["Karya tiga dimensi contohnya ...", ["gambar di kertas", "patung", "lukisan"], 1, "Patung adalah karya tiga dimensi."],
    ["Alat untuk menempel kertas adalah ...", ["gunting", "lem", "pensil"], 1, "Lem dipakai untuk menempel."],
    ["Warna daun yang sehat adalah ...", ["kuning", "cokelat", "hijau"], 2, "Daun yang sehat berwarna hijau."],
  ],
};

// PG ekstra gelombang kedua (6 butir per mapel) — menambah pool supaya
// Paket A dan B sas-k1-s1 (butuh 40 PG per mapel) tidak tumpang tindih.
const EXTRA_PG2: Record<string, PgTuple[]> = {
  Matematika: [
    ["Berapa 11 + 9?", ["19", "20", "21"], 1, "11 + 9 = 20."],
    ["Ada 7 burung di pohon. Datang 5 burung lagi. Berapa burung semuanya?", ["11", "12", "13"], 1, "7 + 5 = 12."],
    ["Berapa hasil 6 × 3?", ["16", "18", "21"], 1, "6 × 3 = 18."],
    ["Bangun yang mempunyai 3 sudut adalah ...", ["persegi", "segitiga", "lingkaran"], 1, "Segitiga punya 3 sudut."],
    ["Berapa 30 : 5?", ["5", "6", "7"], 1, "30 : 5 = 6."],
    ["Urutan bilangan dari besar ke kecil yang benar adalah ...", ["10, 9, 8", "8, 9, 10", "9, 10, 8"], 0, "Dari besar ke kecil: 10, 9, 8."],
  ],
  "B. Indonesia": [
    ["Kata 'sekolah' terdiri dari suku kata ...", ["se-ko-lah", "sek-olah", "seko-lah"], 0, "Se-ko-lah, tiga suku kata."],
    ["Manakah kalimat yang memakai huruf besar di awal?", ["aku pergi.", "Aku pergi.", "aku Pergi."], 1, "Awal kalimat memakai huruf besar."],
    ["Lawan kata 'tinggi' adalah ...", ["rendah", "panjang", "besar"], 0, "Lawan tinggi adalah rendah."],
    ["Kata 'matahari' terdiri dari ... suku kata.", ["dua", "tiga", "empat"], 2, "Ma-ta-ha-ri, empat suku kata."],
    ["Membaca dengan suara keras disebut membaca ...", ["dalam hati", "nyaring", "pelan"], 1, "Membaca nyaring."],
    ["Manakah kata yang merupakan nama hewan?", ["Meja", "Kucing", "Buku"], 1, "Kucing adalah hewan."],
  ],
  IPAS: [
    ["Hewan yang berkaki dua dan bisa terbang adalah ...", ["ayam", "burung", "kucing"], 1, "Burung berkaki dua dan bisa terbang."],
    ["Bagian tumbuhan yang menghasilkan buah adalah ...", ["akar", "bunga", "daun"], 1, "Bunga menjadi buah."],
    ["Benda yang keras dan bisa pecah adalah ...", ["kaca", "karet", "kain"], 0, "Kaca keras dan bisa pecah."],
    ["Hewan yang hidup di darat dan di air adalah ...", ["ikan", "katak", "burung"], 1, "Katak hidup di darat dan di air."],
    ["Makanan yang membuat tubuh kuat adalah ...", ["sayur", "permen", "kerupuk"], 0, "Sayur membuat tubuh kuat dan sehat."],
    ["Bagian tubuh yang dipakai untuk mengunyah adalah ...", ["gigi", "lidah", "bibir"], 0, "Gigi dipakai untuk mengunyah."],
  ],
  Pancasila: [
    ["Saat melihat teman kesulitan, sikap yang baik adalah ...", ["membantu", "menertawakan", "pergi"], 0, "Membantu teman yang kesulitan."],
    ["Anak yang rajin merapikan mainannya disebut anak yang ...", ["malas", "tertib", "nakal"], 1, "Merapikan mainan adalah sikap tertib."],
    ["Bermain dengan teman harus dilakukan dengan ...", ["ramah", "kasar", "marah"], 0, "Bermain dengan ramah."],
    ["Sebelum masuk kelas, kita sebaiknya ...", ["berlari", "berbaris dengan tertib", "mendorong teman"], 1, "Berbaris dengan tertib sebelum masuk kelas."],
    ["Mengucapkan terima kasih menunjukkan sikap ...", ["sombong", "sopan", "cuek"], 1, "Terima kasih menunjukkan sopan santun."],
    ["Saat bercerita di depan kelas, sikap yang baik adalah ...", ["percaya diri dan jelas", "berbisik saja", "membelakangi teman"], 0, "Bercerita dengan percaya diri dan jelas."],
  ],
  "B. Inggris": [
    ["'Thank you' artinya ...", ["maaf", "terima kasih", "sampai jumpa"], 1, "Thank you = terima kasih."],
    ["'Cat' artinya ...", ["anjing", "kucing", "burung"], 1, "Cat = kucing."],
    ["How do you say 'selamat pagi' in English?", ["Good night", "Good morning", "Good bye"], 1, "Good morning = selamat pagi."],
    ["What is 'meja' in English?", ["chair", "table", "book"], 1, "Meja = table."],
    ["'Bird' artinya ...", ["burung", "ikan", "kuda"], 0, "Bird = burung."],
    ["How do you say 'lima' in English?", ["four", "five", "six"], 1, "Lima = five."],
  ],
  PJOK: [
    ["Saat bermain kejar-kejaran, gerak yang dipakai adalah ...", ["berlari", "membungkuk", "memutar badan"], 0, "Bermain kejar-kejaran memakai gerak berlari."],
    ["Olahraga pagi yang baik dilakukan ...", ["siang bolong", "pagi hari", "tengah malam"], 1, "Olahraga pagi menyehatkan tubuh."],
    ["Saat berolahraga kita memakai pakaian yang ...", ["rapi dan nyaman", "ketat dan panas", "basah"], 0, "Pakaian olahraga harus nyaman."],
    ["Gerak yang melatih keseimbangan adalah ...", ["berdiri satu kaki", "duduk diam", "tidur"], 0, "Berdiri satu kaki melatih keseimbangan."],
    ["Bola yang dipakai bermain basket ukurannya ...", ["kecil", "besar", "sangat kecil"], 1, "Bola basket berukuran besar."],
    ["Setelah berolahraga, tubuh terasa ...", ["lemas", "segar", "ngantuk"], 1, "Tubuh terasa segar setelah olahraga."],
  ],
  PAI: [
    ["Surah Al-Fatihah dibaca pada setiap ...", ["rakaat salat", "tidur", "makan"], 0, "Al-Fatihah dibaca pada setiap rakaat salat."],
    ["Membaca Al-Qur'an sebaiknya dilakukan dengan ...", ["terburu-buru", "tartil dan pelan", "berteriak"], 1, "Membaca Al-Qur'an dengan tartil dan pelan."],
    ["Anak yang jujur akan ...", ["dipercaya teman", "dijauhi teman", "dimarahi"], 0, "Anak jujur dipercaya teman."],
    ["Berdoa sebelum tidur dilakukan dengan membaca ...", ["basmalah", "doa tidur", "hamdalah"], 1, "Sebelum tidur membaca doa tidur."],
    ["Malaikat selalu taat kepada ...", ["manusia", "Allah", "setan"], 1, "Malaikat selalu taat kepada Allah."],
    ["Berbagi makanan dengan teman adalah contoh sikap ...", ["pelit", "dermawan", "sombong"], 1, "Berbagi adalah sikap dermawan."],
  ],
  "Seni Rupa": [
    ["Warna yang cerah dan hangat adalah ...", ["merah", "biru", "hitam"], 0, "Merah adalah warna hangat."],
    ["Menggambar pemandangan sebaiknya memakai warna ...", ["alami seperti hijau dan biru", "hitam semua", "putih semua"], 0, "Warna alami membuat gambar indah."],
    ["Bentuk matahari biasanya digambar sebagai ...", ["lingkaran", "segitiga", "persegi"], 0, "Matahari digambar sebagai lingkaran."],
    ["Karya seni yang ditempel di dinding disebut ...", ["hiasan dinding", "mainan", "pakaian"], 0, "Hiasan dinding."],
    ["Alat untuk mewarnai yang berbentuk batang adalah ...", ["krayon", "gunting", "lem"], 0, "Krayon berbentuk batang."],
    ["Warna hitam didapat dari campuran ...", ["semua warna gelap", "putih dan kuning", "biru dan kuning"], 0, "Hitam berasal dari campuran warna-warna gelap."],
  ],
};

// ---------------------------------------------------------------------------
// Pembangun pool soal per (mapel, kelas).
// Prinsip: pool diurutkan deterministik HANYA dari (mapel, kelas) — TIDAK
// dari paket. Paket A memakai irisan pertama pool, Paket B irisan kedua
// (lihat takeForPaket), sehingga soal A dan B berbeda selama pool cukup
// besar. Pool digabung dari: kuis bab, PG ekstra, PG turunan pernyataan
// Benar/Salah, PG turunan kartu, dan (Matematika) aritmetika.
// ---------------------------------------------------------------------------
export const SIM_MINUTES: Record<number, number> = { 1: 60, 2: 60, 3: 70, 4: 80, 5: 90, 6: 90 };

function dedupeByQuestion(pool: GeneratedQuestion[]): GeneratedQuestion[] {
  const seen = new Set<string>();
  const out: GeneratedQuestion[] = [];
  for (const q of pool) {
    const optKey = Array.isArray(q.options) ? [...q.options].sort().join("|") : JSON.stringify(q.options);
    const key = `${q.question}||${JSON.stringify(q.answer)}||${optKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}

function gradeChapters(subject: string, grade: number): ChapterSeed[] {
  // Bab produk mtk-sd (campuran Kelas 1–6) TIDAK masuk pool per kelas,
  // supaya soal Kelas 1 tidak kecampuran soal Kelas 4–5.
  return CHAPTERS.filter((ch) => ch.subject === subject && ch.grade === grade && ch.product_id !== "mtk-sd");
}

function chapterFlashcards(subject: string, grade: number): { front: string; back: string }[] {
  const out: { front: string; back: string }[] = [];
  for (const ch of gradeChapters(subject, grade)) out.push(...ch.flashcards);
  return out;
}

function pgPool(subject: string, grade: number): GeneratedQuestion[] {
  const rng = mulberry32(hashStr(`pgpool:${subject}:${grade}`));
  let pool: GeneratedQuestion[] = [];
  for (const ch of gradeChapters(subject, grade)) pool.push(...ch.quiz);
  for (const t of [...(EXTRA_PG[subject] ?? []), ...(EXTRA_PG2[subject] ?? [])]) {
    if ((t[4] ?? 1) > grade) continue;
    const opts = shuffle([...t[1]], rng);
    pool.push(pg(t[0], opts, opts.indexOf(t[1][t[2]]), t[3]));
  }
  // Pernyataan Benar/Salah diubah menjadi PG "manakah pernyataan yang BENAR?"
  const bank = BS_BANK[subject] ?? [];
  const trues = bank.filter((b) => b[1]);
  const falses = bank.filter((b) => !b[1]);
  for (const t of trues) {
    const wrongs = shuffle([...falses], rng).slice(0, 2);
    if (wrongs.length < 2) continue;
    const opts = shuffle([t[0], wrongs[0][0], wrongs[1][0]], rng);
    pool.push(pg("Manakah pernyataan yang BENAR?", opts, opts.indexOf(t[0]), t[2]));
  }
  // Kartu TIDAK diubah lagi menjadi PG di sini: kuis bab sudah memakai
  // kartu sebagai soal (turunan kartu) — mengubahnya lagi akan membuat soal
  // yang sama (fakta sama, pengecoh beda) muncul di Paket A dan Paket B.
  if (subject === "Matematika") {
    for (let i = 0; i < 40; i++) pool.push(mathPg(grade, hashStr(`sim-math:${grade}:${i}`)));
  }
  pool = dedupeByQuestion(pool);
  return shuffle(pool, mulberry32(hashStr(`pgorder:${subject}:${grade}`)));
}

function bsPool(subject: string, grade: number): GeneratedQuestion[] {
  const out = (BS_BANK[subject] ?? []).map(([s, a, d]) => bs(s, a ? "Benar" : "Salah", d));
  return shuffle(out, mulberry32(hashStr(`bsorder:${subject}:${grade}`)));
}

function isianPool(subject: string, grade: number): GeneratedQuestion[] {
  const rng = mulberry32(hashStr(`isianpool:${subject}:${grade}`));
  let pool: GeneratedQuestion[] = (ISIAN_BANK[subject] ?? []).map(([q, a, d]) => isian(q, a, d));
  for (const card of chapterFlashcards(subject, grade)) {
    const q = card.front.endsWith("?") ? card.front : `${card.front} adalah ...`;
    pool.push(isian(q, card.back, `Jawabannya ${card.back}.`));
  }
  pool = dedupeByQuestion(pool);
  return shuffle(pool, mulberry32(hashStr(`isianorder:${subject}:${grade}`)));
}

function mjPool(subject: string, grade: number): GeneratedQuestion[] {
  const cards = chapterFlashcards(subject, grade);
  const seen = new Set<string>();
  const pairs: [string, string][] = [];
  for (const c of cards) {
    const k = `${c.front}||${c.back}`;
    if (seen.has(k)) continue;
    seen.add(k);
    pairs.push([c.front, c.back]);
  }
  const sets: GeneratedQuestion[] = [];
  for (let s = 0; s < 10; s++) {
    const chosen: [string, string][] = [];
    const usedFront = new Set<string>();
    const usedBack = new Set<string>();
    let idx = s;
    let guard = 0;
    while (chosen.length < 5 && guard < pairs.length * 2 + 5) {
      const p = pairs[idx % pairs.length];
      if (!usedFront.has(p[0]) && !usedBack.has(p[1])) {
        chosen.push(p);
        usedFront.add(p[0]);
        usedBack.add(p[1]);
      }
      idx++;
      guard++;
    }
    if (chosen.length < 5) continue;
    sets.push(menjodohkan(chosen, `mj:${subject}:${grade}:${s}`, "Pasangkan dengan jawaban yang tepat."));
  }
  return sets;
}

function uraianPool(subject: string, grade: number): GeneratedQuestion[] {
  const points = grade === 3 ? 4 : 5;
  const out = (URAIAN_BANK[subject] ?? []).map(([q, k, d]) => uraian(q, k, d, points));
  return shuffle(out, mulberry32(hashStr(`uraianorder:${subject}:${grade}`)));
}

function kompleksPool(subject: string, grade: number): GeneratedQuestion[] {
  const out: GeneratedQuestion[] = [];
  for (const fam of KOMPLEKS_BANK[subject] ?? []) {
    for (let v = 0; v < 8; v++) {
      const nC = Math.min(2, fam.good.length);
      const correct = Array.from({ length: nC }, (_, k) => fam.good[(v + k) % fam.good.length]);
      const wrong = Array.from({ length: 4 - nC }, (_, k) => fam.bad[(v * 2 + k) % fam.bad.length]);
      const rng = mulberry32(hashStr(`pk:${subject}:${fam.prompt}:${v}`));
      const options = shuffle([...correct, ...wrong], rng);
      out.push({
        type: "pg_kompleks",
        question: fam.prompt,
        options,
        answer: [...correct],
        discussion: `Jawaban yang benar: ${correct.join(", ")}.`,
        points: 2,
      });
    }
  }
  return shuffle(out, mulberry32(hashStr(`pkorder:${subject}:${grade}`)));
}

// Paket A = irisan pertama pool, Paket B = irisan kedua. Bila pool kurang
// dari 2n (seharusnya tidak terjadi dengan bank saat ini), bungkus dengan
// rotasi supaya jumlah tetap terpenuhi.
function takeForPaket<T>(pool: T[], n: number, paket: "A" | "B"): T[] {
  const start = paket === "A" ? 0 : n;
  if (pool.length >= 2 * n) return pool.slice(start, start + n);
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(pool[(start + i) % pool.length]);
  return out;
}

const SIM_TABLE: Record<number, { pg: number; pk: number; bs: number; mj: number; is: number; ur: number }> = {
  1: { pg: 10, pk: 0, bs: 5, mj: 5, is: 5, ur: 0 },
  2: { pg: 10, pk: 0, bs: 5, mj: 5, is: 5, ur: 0 },
  3: { pg: 15, pk: 3, bs: 5, mj: 5, is: 5, ur: 2 },
  4: { pg: 15, pk: 5, bs: 5, mj: 5, is: 5, ur: 3 },
  5: { pg: 15, pk: 5, bs: 5, mj: 5, is: 5, ur: 4 },
  6: { pg: 15, pk: 5, bs: 5, mj: 5, is: 5, ur: 5 },
};

export function buildSimulationQuestions(
  subject: string,
  grade: number,
  paket: "A" | "B"
): GeneratedQuestion[] {
  const t = SIM_TABLE[grade] ?? SIM_TABLE[1];
  const out: GeneratedQuestion[] = [];
  out.push(...takeForPaket(pgPool(subject, grade), t.pg, paket));
  if (t.pk > 0) out.push(...takeForPaket(kompleksPool(subject, grade), t.pk, paket));
  out.push(...takeForPaket(bsPool(subject, grade), t.bs, paket));
  out.push(...takeForPaket(mjPool(subject, grade), t.mj, paket));
  out.push(...takeForPaket(isianPool(subject, grade), t.is, paket));
  if (t.ur > 0) out.push(...takeForPaket(uraianPool(subject, grade), t.ur, paket));
  return out;
}

// Simulasi sas-k1-s1: 30 soal (20 PG ×3 poin, 5 B/S ×4 poin, 5 Isian ×4 poin),
// max_points = 100. Hanya Kelas 1, 5 mapel, Paket A dan B.
export function buildSasK1S1Questions(subject: string, paket: "A" | "B"): GeneratedQuestion[] {
  const pgQ = takeForPaket(pgPool(subject, 1), 20, paket).map((q) => ({ ...q, points: 3 }));
  const bsQ = takeForPaket(bsPool(subject, 1), 5, paket).map((q) => ({ ...q, points: 4 }));
  const isQ = takeForPaket(isianPool(subject, 1), 5, paket).map((q) => ({ ...q, points: 4 }));
  return [...pgQ, ...bsQ, ...isQ];
}

// Simulasi mtk-sd: 25 soal campuran Kelas 1–6 (15 PG + 5 B/S + 5 Isian).
export function buildMtkSdQuestions(): GeneratedQuestion[] {
  const out: GeneratedQuestion[] = [];
  for (let i = 0; i < 15; i++) {
    const g = (i % 6) + 1;
    out.push(mathPg(g, hashStr(`mtksd-pg:${i}`)));
  }
  const rng = mulberry32(hashStr("mtksd"));
  out.push(
    ...shuffle([...BS_BANK.Matematika], rng)
      .slice(0, 5)
      .map(([s, a, d]) => bs(s, a ? "Benar" : "Salah", d))
  );
  out.push(
    ...shuffle([...ISIAN_BANK.Matematika], rng)
      .slice(0, 5)
      .map(([q, a, d]) => isian(q, a, d))
  );
  return out;
}

// 5 soal PG harian, deterministik per tanggal + kelas, bergiliran mapel.
export function dailyQuestions(dateISO: string, grade: number): GeneratedQuestion[] {
  const subjects = ["Matematika", "B. Indonesia", "IPAS", "Pancasila", "B. Inggris"];
  const rng = mulberry32(hashStr(`daily:${dateISO}:${grade}`));
  const out: GeneratedQuestion[] = [];
  for (const s of subjects) {
    const pool = pgPool(s, grade);
    if (pool.length === 0) {
      out.push(mathPg(grade, hashStr(`daily-fallback:${dateISO}:${s}`)));
      continue;
    }
    const q = pool[Math.floor(rng() * pool.length)];
    out.push({ ...q, points: 1 });
  }
  return out;
}
