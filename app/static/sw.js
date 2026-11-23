// sw.js — service worker Ringkas (PWA).
//
// Strategi:
//   - install: cache shell aplikasi (halaman utama, halaman offline,
//     manifest, logo). Bukan seluruh materi.
//   - activate: hapus cache lama yang namanya bukan CACHE_NAME.
//   - fetch:
//       * /api/* .......... network-only (data selalu segar; saat
//         offline kembalikan JSON 503, bukan data basi).
//       * navigasi ........ network-first; bila gagal, pakai cache;
//         bila tidak ada di cache, tampilkan /offline.html.
//       * aset statis ...... cache-first (/_app/, /logo/, /shorts/,
//         /manifest.webmanifest): sekali dibuka, bisa dibuka lagi
//         tanpa internet.
//       * sisanya .......... teruskan ke jaringan apa adanya.
//
// BATASAN JUJUR — ini BUKAN offline penuh: materi (bab, kuis, simulasi)
// yang belum pernah dibuka tidak tersedia saat offline, karena isinya
// dimuat dari API (/api/study/..., /api/quiz/...) yang memang tidak
// di-cache. Yang tetap bisa dibaca offline: halaman yang sudah pernah
// dibuka dan aset statisnya. Naikkan CACHE_VERSION tiap kali shell
// berubah supaya perangkat mengambil versi terbaru.
//
// Service worker disajikan sebagai aset statis oleh Worker (lihat
// server/worker.ts: semua non-/api/* diteruskan ke ASSETS), jadi berkas
// ini harus tetap di app/static/ dan terdaftar dari /sw.js (scope "/").
"use strict";

const CACHE_VERSION = "ringkas-v3";
const CACHE_NAME = CACHE_VERSION;

const CORE_SHELL = [
  "/",
  "/offline.html",
  "/manifest.webmanifest",
  "/logo/logo-ringkas-icon-emerald.svg",
  "/logo/favicon-192.png",
  "/logo/logo-ringkas-icon-1024.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => {
        // Gagal meng-cache shell (mis. offline saat instalasi pertama)
        // bukan kegagalan fatal: service worker tetap terpasang dan
        // halaman yang dibuka nanti akan di-cache saat fetch.
      })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/_app/") ||
    pathname.startsWith("/logo/") ||
    pathname.startsWith("/shorts/") ||
    pathname === "/hero-scene.webp" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/offline.html" ||
    pathname === "/sw.js"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Hanya tangani origin yang sama — font Google dkk. diteruskan apa adanya.
  if (url.origin !== self.location.origin) return;

  // 1) API: selalu jaringan, jangan pernah sajikan data basi.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(JSON.stringify({ error: "Kamu sedang offline. Coba lagi saat sudah terhubung." }), {
            status: 503,
            headers: { "Content-Type": "application/json" }
          })
      )
    );
    return;
  }

  // 2) Navigasi (perpindahan halaman): jaringan dulu, cache bila gagal,
  //    halaman offline bila halaman itu belum pernah dibuka.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match("/offline.html");
          if (offline) return offline;
          return new Response("Kamu sedang offline.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          });
        })
    );
    return;
  }

  // 3) Aset statis: cache dulu, jaringan bila belum ada (lalu simpan).
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        });
      })
    );
    return;
  }

  // 4) Sisanya (mis. /favicon.ico bila ada): jaringan apa adanya.
});

// ---------------------------------------------------------------------------
// Push: pengingat jadwal belajar (FITUR 4).
//
// Server mengirim payload JSON {title, body, url} yang sudah dienkripsi
// (RFC 8291) — browser mendekripsinya sebelum event ini jalan, jadi
// event.data.json() sudah berisi teks notifikasi. Bila payload kosong
// atau rusak, tampilkan notifikasi umum supaya pengingat tidak hilang
// diam-diam.
// ---------------------------------------------------------------------------

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "Waktunya belajar di Ringkas";
  const body = data.body || "Ayo buka Ringkas dan lanjutkan belajarmu hari ini.";
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/belajar";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/logo/logo-ringkas-icon-1024.png",
      badge: "/logo/favicon-192.png",
      data: { url },
      tag: "ringkas-jadwal-belajar"
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/belajar";
  const target = new URL(url, self.location.origin).href;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url === target && "focus" in client) return client.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(target);
        return undefined;
      })
  );
});
