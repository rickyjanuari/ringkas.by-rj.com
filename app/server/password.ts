// password.ts — kebijakan kata sandi: panjang minimal + denylist lokal
// + HaveIBeenPwned k-anonymity (opsional, gagal-terbuka).
//
// PRIVASI HIBP: hanya 5 karakter pertama hash SHA-1 yang dikirim ke
// api.pwnedpasswords.com — kata sandi (dan hash lengkapnya) TIDAK PERNAH
// keluar dari server ini. Server mengembalikan ~800 suffix hash untuk
// prefix itu, dan pencocokan dilakukan lokal di sini.
//
// Jalan di Workers maupun Node: hanya WebCrypto (globalThis.crypto.subtle)
// dan fetch — tanpa modul Node.

/** ~200 kata sandi paling umum (varian RockYou/NCSC) — ditolak mentah. */
const COMMON_PASSWORDS = new Set([
  "123456", "123456789", "12345678", "12345", "1234567", "1234567890", "123123",
  "1234", "111111", "123321", "000000", "654321", "666666", "987654321", "12345678910",
  "password", "password1", "password123", "passw0rd", "passwd", "qwerty", "qwerty123",
  "qwertyuiop", "1qaz2wsx", "1q2w3e4r", "1q2w3e", "qazwsx", "abc123", "abc1234",
  "abcd1234", "admin", "admin123", "administrator", "root", "toor", "letmein", "welcome",
  "welcome1", "welcome123", "login", "master", "monkey", "dragon", "sunshine", "princess",
  "football", "baseball", "superman", "batman", "trustno1", "shadow", "michael", "jordan",
  "hunter", "buster", "soccer", "harley", "charlie", "andrew", "thomas", "jessica",
  "killer", "george", "computer", "michelle", "jennifer", "pepper", "daniel", "freedom",
  "hello", "hello123", "iloveyou", "loveme", "secret", "secret123", "pass123", "pass1234",
  "passw0rd123", "p@ssw0rd", "p@ssword", "changeme", "default", "test", "test123",
  "test1234", "testing", "guest", "user", "user123", "demo", "demo123", "asdfgh",
  "asdfghjkl", "zxcvbn", "zxcvbnm", "qwe123", "qweasd", "qaz123", "wsx123", "edcrfv",
  "123qwe", "123qweasd", "123abc", "1234qwer", "11111111", "222222", "333333", "444444",
  "555555", "7777777", "88888888", "999999", "00000000", "121212", "112233", "11223344",
  "12344321", "123456a", "a123456", "aa123456", "123654", "159753", "357951", "456789",
  "987654", "147258", "147258369", "258369", "741852963", "qwerty1", "qwerty12",
  "qwertyui", "asdf1234", "zxcv1234", "iloveyou1", "iloveyou123", "love123", "love",
  "god", "sex", "secret1", "god123", "jesus", "jesus1", "maggie", "ashley", "bailey",
  "pass", "pass1", "pass12", "passw0rd1", "password12", "password1234", "admin1",
  "admin1234", "adminadmin", "root123", "toor123", "system", "oracle", "manager",
  "super", "superman1", "batman123", "pokemon", "naruto", "liverpool", "arsenal",
  "chelsea", "michael1", "jordan23", "kobe24", "tiger", "money", "money123", "money1",
  "summer", "summer1", "summer123", "winter", "winter123", "autumn", "spring", "spring123",
  "flower", "flower123", "rose", "rose123", "samsung", "samsung123", "iphone", "apple",
  "apple123", "google", "google123", "facebook", "instagram", "indonesia", "indonesia123",
  "jakarta", "jakarta123", "bandung", "surabaya", "bismillah", "bismillah123", "allah",
  "allah123", "sayang", "sayang123", "cinta", "cinta123", "anak", "anak123", "keluarga",
  "merdeka", "merdeka123", "garuda", "garuda123", "pancasila", "rahasia", "rahasia123",
  "sandi", "sandi123", "katasandi", "sekolah", "sekolah123", "guru", "guru123", "siswa",
  "belajar", "belajar123", "ringkas", "ringkas123"
]);

function sha1Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  return globalThis.crypto.subtle
    .digest("SHA-1", data)
    .then((buf) =>
      [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")
    );
}

/**
 * Cek HaveIBeenPwned k-anonymity: kirim hanya 5 karakter pertama hash
 * SHA-1, cocokkan suffix secara lokal. Mengembalikan true bila kata
 * sandi pernah bocor. Gagal fetch/timeout -> false (cek dilewati,
 * JANGAN blokir pengguna karena layanan pihak ketiga sedang down).
 */
async function isPwned(password: string): Promise<boolean> {
  try {
    const hash = (await sha1Hex(password)).toUpperCase();
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "User-Agent": "Ringkas" },
      signal: AbortSignal.timeout(2000)
    });
    if (!res.ok) return false;
    const body = await res.text();
    for (const line of body.split("\n")) {
      const [s, count] = line.trim().split(":");
      if (s === suffix && Number(count) > 0) return true;
    }
    return false;
  } catch (err) {
    console.error("[password] cek HIBP gagal, dilewati:", err);
    return false;
  }
}

export async function validatePassword(
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (password.length < 8) {
    return { ok: false, error: "Kata sandi minimal 8 karakter." };
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { ok: false, error: "Kata sandi ini terlalu umum. Pakai kata sandi lain." };
  }
  if (await isPwned(password)) {
    return {
      ok: false,
      error: "Kata sandi ini pernah bocor di internet. Pakai kata sandi lain."
    };
  }
  return { ok: true };
}
