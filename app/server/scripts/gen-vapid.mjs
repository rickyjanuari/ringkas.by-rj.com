// gen-vapid.mjs — buat pasangan kunci VAPID P-256 (sekali jalan).
//
// Jalankan dari app/:  node server/scripts/gen-vapid.mjs
// Skrip Node SAJA (node:crypto) — BUKAN kode Workers. Outputnya dicetak
// ke terminal; pemilik lalu memasangnya sebagai secret Worker dengan
// perintah `wrangler secret put` yang ikut dicetak.
//
// JANGAN commit output skrip ini, JANGAN kirim kunci privat lewat chat
// atau email, dan JANGAN menulisnya ke berkas apa pun di repo.

import { generateKeyPairSync } from "node:crypto";

function base64url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

// Kunci publik = titik EC uncompressed: 0x04 || X (32 byte) || Y (32 byte).
// Kunci privat = skalar d (32 byte).
const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "P-256"
});
const pubJwk = publicKey.export({ format: "jwk" });
const privJwk = privateKey.export({ format: "jwk" });
const pubRaw = Buffer.concat([
  Buffer.from([0x04]),
  Buffer.from(pubJwk.x, "base64url"),
  Buffer.from(pubJwk.y, "base64url")
]);
const privRaw = Buffer.from(privJwk.d, "base64url");

const publicKeyB64 = base64url(pubRaw);
const privateKeyB64 = base64url(privRaw);

console.log("Pasangan kunci VAPID baru (P-256) sudah dibuat.");
console.log("");
console.log("Kunci publik  (untuk GET /api/push/vapid-key, boleh tampil di klien):");
console.log(publicKeyB64);
console.log("");
console.log("Kunci privat  (RAHASIA — hanya sebagai secret Worker, jangan dibagikan):");
console.log(privateKeyB64);
console.log("");
console.log("Pasang sebagai secret Cloudflare (jalankan satu per satu, tempel nilainya saat diminta):");
console.log("  wrangler secret put VAPID_PUBLIC_KEY");
console.log("  wrangler secret put VAPID_PRIVATE_KEY");
console.log("  wrangler secret put VAPID_SUBJECT");
console.log('  (VAPID_SUBJECT: "mailto:halo@ringkas.by-rj.com")');
console.log("");
console.log("Untuk dev lokal, isi .dev.vars dengan baris yang sama (tanpa tanda kutip di sekeliling nilai).");
