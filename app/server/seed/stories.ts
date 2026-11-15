// stories.ts — bank "Cerita Edukasi" (FITUR KETERLIBATAN 6).
//
// 6 cerita orisinal, satu per kelas 1-6, gaya teman-belajar: kalimat
// pendek, satu ide per kalimat. TANPA nama tokoh (dipakai peran seperti
// "kakak", "adik", "seorang anak", "guru") dan TANPA sapaan bergender.
// Bukan salinan dongeng berhak cipta.
//
// Pemakaian: GET /api/stories (daftar, tanpa isi/jawaban),
// GET /api/stories/:id (isi + soal, tanpa jawaban), dan
// POST /api/stories/:id/submit (dinilai server-side di server/stories.ts,
// attempt tercatat sebagai quiz_attempts kind = 'cerita').
// Cerita GRATIS untuk semua akun login (seperti Latihan Harian).

export interface StoryQuestion {
  question: string;
  options: string[];
  answer: string;
  discussion: string;
}

export interface Story {
  id: string;
  grade: number;
  title: string;
  moral: string;
  paragraphs: string[];
  questions: StoryQuestion[];
}

function pg(
  question: string,
  options: string[],
  answerIdx: number,
  discussion: string
): StoryQuestion {
  return { question, options, answer: options[answerIdx], discussion };
}

export const STORIES: Story[] = [
  {
    id: "cerita-k1",
    grade: 1,
    title: "Celengan Bambu di Sudut Kelas",
    moral: "Menabung sedikit demi sedikit membuat keinginan besar menjadi mungkin.",
    paragraphs: [
      "Di sudut kelas ada sebuah celengan bambu. Celengan itu milik bersama seluruh anak di kelas.",
      "Setiap pagi, seorang anak memasukkan satu koin ke dalamnya. Koin itu berasal dari sisa uang jajan anak itu.",
      "Ada hari ketika seorang anak tidak membawa koin sama sekali. Itu tidak apa-apa. Celengan tidak pernah marah.",
    ],
    questions: [
      pg(
        "Dari mana asal koin yang dimasukkan ke celengan?",
        ["Sisa uang jajan", "Uang guru", "Uang dari toko"],
        0,
        "Koin itu berasal dari sisa uang jajan. Menyisihkan sedikit setiap hari itu sudah menabung."
      ),
      pg(
        "Apa yang terjadi bila seorang anak tidak membawa koin?",
        ["Celengan marah", "Tidak apa-apa", "Kelas dibubarkan"],
        1,
        "Tidak apa-apa. Menabung itu kebiasaan, bukan paksaan. Besok bisa mencoba lagi."
      ),
      pg(
        "Apa pesan utama cerita ini?",
        ["Menabung sedikit demi sedikit itu berharga", "Uang jajan harus dihabiskan", "Celengan harus besar"],
        0,
        "Benar. Sedikit demi sedikit, lama-lama menjadi banyak. Itulah gunanya menabung."
      )
    ]
  },
  {
    id: "cerita-k2",
    grade: 2,
    title: "Dompet yang Tertinggal di Bangku",
    moral: "Jujur berarti mengembalikan barang yang bukan milik kita, walau tidak ada yang melihat.",
    paragraphs: [
      "Sepulang sekolah, seorang anak menemukan dompet di bangku taman. Di dalam dompet ada uang dan sebuah kartu nama.",
      "Seorang anak itu memegang dompet itu lama sekali. Tidak ada orang lain di taman itu.",
      "Lalu seorang anak itu membawa dompet itu ke kantor sekolah. Keesokan harinya, pemilik dompet datang dan berterima kasih.",
    ],
    questions: [
      pg(
        "Apa yang ditemukan di bangku taman?",
        ["Sebuah dompet", "Sebuah buku", "Sebuah bola"],
        0,
        "Yang ditemukan adalah sebuah dompet berisi uang dan kartu nama."
      ),
      pg(
        "Apa yang dilakukan dengan dompet itu?",
        ["Dibawa ke kantor sekolah", "Dibawa pulang dan disimpan", "Ditinggal di bangku"],
        0,
        "Dompet itu dibawa ke kantor sekolah supaya bisa kembali ke pemiliknya."
      ),
      pg(
        "Mengapa mengembalikan dompet itu disebut jujur?",
        ["Karena barang itu bukan milik sendiri", "Karena dompet itu berat", "Karena taman itu sepi"],
        0,
        "Jujur berarti tidak mengambil barang orang lain, walau tidak ada yang melihat."
      ),
      pg(
        "Apa yang dilakukan pemilik dompet keesokan harinya?",
        ["Datang dan berterima kasih", "Marah-marah", "Pergi ke pasar"],
        0,
        "Pemilik dompet datang dan berterima kasih. Kebaikan kecil terasa besar bagi yang menerima."
      )
    ]
  },
  {
    id: "cerita-k3",
    grade: 3,
    title: "Lomba Layang-layang di Lapangan",
    moral: "Kerja sama membuat pekerjaan yang berat terasa ringan.",
    paragraphs: [
      "Kelas tiga ingin membuat layang-layang besar untuk lomba. Satu anak tidak bisa membuat layang-layang sebesar itu sendirian.",
      "Maka anak-anak membagi tugas. Ada yang memotong kertas, ada yang mengikat tali, ada yang menggambar.",
      "Layang-layang itu selesai sebelum waktu makan siang. Saat diterbangkan, layang-layang itu naik tinggi sekali.",
    ],
    questions: [
      pg(
        "Mengapa anak-anak membagi tugas?",
        ["Karena layang-layang itu terlalu besar untuk satu anak", "Karena kertasnya habis", "Karena lomba dibatalkan"],
        0,
        "Layang-layang besar sulit dibuat sendirian. Tugas yang dibagi terasa lebih ringan."
      ),
      pg(
        "Apa tugas yang dibagi dalam cerita ini?",
        ["Memotong kertas, mengikat tali, dan menggambar", "Membeli layang-layang", "Menonton dari jauh"],
        0,
        "Ada yang memotong kertas, ada yang mengikat tali, ada yang menggambar. Semua bagian penting."
      ),
      pg(
        "Kapan layang-layang itu selesai dibuat?",
        ["Sebelum waktu makan siang", "Minggu depan", "Tidak pernah selesai"],
        0,
        "Layang-layang itu selesai sebelum waktu makan siang karena semua bekerja bersama."
      ),
      pg(
        "Apa pesan utama cerita ini?",
        ["Kerja sama membuat pekerjaan berat terasa ringan", "Lomba selalu dimenangkan yang paling cepat", "Layang-layang harus besar"],
        0,
        "Benar. Saat bekerja bersama, setiap orang membantu sesuai kemampuannya."
      )
    ]
  },
  {
    id: "cerita-k4",
    grade: 4,
    title: "Sepeda yang Terus Jatuh",
    moral: "Gagal sekali bukan berarti gagal selamanya; setiap percobaan membuat kita lebih pandai.",
    paragraphs: [
      "Seorang anak mendapat sepeda baru dari kakak. Pada percobaan pertama, sepeda itu miring dan anak itu jatuh.",
      "Lututnya lecet, tetapi anak itu bangun lagi. Kakak menunjukkan cara memegang setang dengan tenang.",
      "Pada percobaan kelima, sepeda itu berjalan lurus sejauh sepuluh langkah. Pada percobaan kesepuluh, anak itu bisa bersepeda sampai ujung jalan.",
    ],
    questions: [
      pg(
        "Apa yang terjadi pada percobaan pertama?",
        ["Sepeda miring dan anak itu jatuh", "Sepeda langsung melaju jauh", "Sepeda hilang"],
        0,
        "Pada percobaan pertama sepeda miring dan anak itu jatuh. Itu wajar saat belajar hal baru."
      ),
      pg(
        "Apa yang dilakukan kakak?",
        ["Menunjukkan cara memegang setang dengan tenang", "Mengambil sepedanya kembali", "Pergi begitu saja"],
        0,
        "Kakak membantu dengan menunjukkan cara memegang setang dengan tenang."
      ),
      pg(
        "Apa yang terjadi pada percobaan kesepuluh?",
        ["Anak itu bisa bersepeda sampai ujung jalan", "Sepeda rusak", "Anak itu berhenti belajar"],
        0,
        "Pada percobaan kesepuluh, anak itu bisa bersepeda sampai ujung jalan. Latihan mengubah jatuh menjadi bisa."
      ),
      pg(
        "Apa pesan utama cerita ini?",
        ["Gagal sekali bukan berarti gagal selamanya", "Sepeda baru selalu sulit", "Jatuh itu memalukan"],
        0,
        "Benar. Setiap percobaan membuat kita lebih pandai, walau diawali jatuh."
      )
    ]
  },
  {
    id: "cerita-k5",
    grade: 5,
    title: "Dua Kantong di Pasar",
    moral: "Penuhi kebutuhan dulu, baru pikirkan keinginan; uang yang disisihkan hari ini menolong esok hari.",
    paragraphs: [
      "Seorang anak pergi ke pasar dengan dua kantong kain. Kantong pertama untuk kebutuhan: beras, telur, dan sayur.",
      "Kantong kedua untuk keinginan: mainan dan jajanan warna-warni. Di tengah pasar, uang anak itu ternyata hanya cukup untuk satu kantong penuh.",
      "Anak itu mengisi kantong pertama sampai penuh. Kantong kedua hanya diisi satu bungkus kecil, dan sisanya ditabung.",
    ],
    questions: [
      pg(
        "Apa isi kantong pertama?",
        ["Beras, telur, dan sayur", "Mainan dan jajanan", "Baju dan sepatu"],
        0,
        "Kantong pertama berisi kebutuhan: beras, telur, dan sayur."
      ),
      pg(
        "Mengapa uang hanya cukup untuk satu kantong penuh?",
        ["Karena uangnya terbatas", "Karena pasar tutup", "Karena kantongnya robek"],
        0,
        "Uang anak itu terbatas, jadi harus memilih mana yang diisi dulu."
      ),
      pg(
        "Apa yang dilakukan dengan kantong kedua?",
        ["Hanya diisi satu bungkus kecil, sisanya ditabung", "Diisi penuh juga", "Dibuang"],
        0,
        "Kantong kedua hanya diisi satu bungkus kecil, dan sisanya ditabung. Keinginan bisa menunggu."
      ),
      pg(
        "Apa pesan utama cerita ini?",
        ["Penuhi kebutuhan dulu, baru keinginan", "Semua uang harus dihabiskan di pasar", "Kebutuhan tidak penting"],
        0,
        "Benar. Kebutuhan diisi dulu, keinginan secukupnya, dan sisanya ditabung untuk esok."
      ),
      pg(
        "Apa bedanya kebutuhan dan keinginan dalam cerita ini?",
        ["Kebutuhan dipakai setiap hari, keinginan hanya menyenangkan sesaat", "Tidak ada bedanya", "Keinginan lebih mahal selalu"],
        0,
        "Kebutuhan seperti beras dipakai setiap hari. Keinginan seperti mainan hanya menyenangkan sesaat."
      )
    ]
  },
  {
    id: "cerita-k6",
    grade: 6,
    title: "Janji Menjaga Perpustakaan",
    moral: "Tanggung jawab berarti menepati janji, walau ada hal lain yang lebih menyenangkan.",
    paragraphs: [
      "Seorang anak berjanji menjaga perpustakaan kecil setiap hari Jumat. Tugasnya sederhana: merapikan buku dan mencatat siapa yang meminjam.",
      "Pada suatu Jumat, teman-teman mengajak bermain bola di lapangan. Bermain bola jauh lebih menyenangkan daripada merapikan buku.",
      "Anak itu tetap datang ke perpustakaan dan menyelesaikan tugasnya dulu. Setelah itu, anak itu bergabung bermain bola dengan hati yang tenang.",
    ],
    questions: [
      pg(
        "Apa janji anak itu?",
        ["Menjaga perpustakaan kecil setiap hari Jumat", "Bermain bola setiap hari", "Membeli buku baru"],
        0,
        "Anak itu berjanji menjaga perpustakaan kecil setiap hari Jumat."
      ),
      pg(
        "Apa tugas menjaga perpustakaan itu?",
        ["Merapikan buku dan mencatat peminjam", "Mengunci pintu selamanya", "Membaca semua buku"],
        0,
        "Tugasnya merapikan buku dan mencatat siapa yang meminjam."
      ),
      pg(
        "Apa godaan pada hari Jumat itu?",
        ["Ajakan bermain bola di lapangan", "Hujan deras", "Perpustakaan tutup"],
        0,
        "Teman-teman mengajak bermain bola, dan itu jauh lebih menyenangkan."
      ),
      pg(
        "Apa yang dilakukan anak itu?",
        ["Menyelesaikan tugas dulu, lalu bermain bola", "Membatalkan janji begitu saja", "Bersembunyi di rumah"],
        0,
        "Anak itu menyelesaikan tugas dulu, lalu bergabung bermain bola dengan hati yang tenang."
      ),
      pg(
        "Apa pesan utama cerita ini?",
        ["Tanggung jawab berarti menepati janji", "Bermain itu tidak penting", "Janji boleh dibatalkan bila ada yang lebih seru"],
        0,
        "Benar. Menepati janji walau ada yang lebih menyenangkan itulah tanggung jawab."
      )
    ]
  }
];

export function findStory(id: string): Story | undefined {
  return STORIES.find((s) => s.id === id);
}
