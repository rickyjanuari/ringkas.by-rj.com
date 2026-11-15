// index.ts — entry point Node (dev lokal & `npm start`).
// Untuk Cloudflare, entry point-nya server/worker.ts (lihat wrangler.toml).
// Keduanya memakai factory yang sama (server/app.ts) — perilaku /api/...
// identik di dua runtime.

import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "./db.js";
import { createApp } from "./app.js";
import { seedDatabase } from "./seed/seed.js";
import { LocalImageStorage } from "./storage.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = join(__dirname, "..");

const PORT = Number(process.env.PORT ?? 8787);
const DATABASE_PATH =
  process.env.DATABASE_PATH ?? join(appDir, "data", "ringkas.db");

const db = openDatabase(DATABASE_PATH);
db.migrate(join(__dirname, "migrations"));
await seedDatabase(db);

const app = createApp(db, {
  storage: new LocalImageStorage(join(appDir, "uploads"))
});

// Berkas upload (gambar produk) disajikan dari app/uploads/.
app.use("/uploads/*", serveStatic({ root: appDir }));

// Frontend hasil build SvelteKit (adapter-static) — hanya bila sudah di-build.
const buildDir = join(appDir, "build");
if (existsSync(join(buildDir, "index.html"))) {
  app.use("/*", serveStatic({ root: buildDir }));
  app.get("/*", (c) => {
    if (c.req.path.startsWith("/api/")) return c.notFound();
    return c.html(readFileSync(join(buildDir, "index.html"), "utf-8"));
  });
} else {
  app.get("/", (c) =>
    c.json({
      ok: true,
      app: "ringkas",
      note: "Frontend belum di-build. Jalankan `npm run build` atau `npm run dev` lalu buka http://localhost:5173."
    })
  );
}

console.log(`[ringkas] server jalan di http://localhost:${PORT}`);
console.log(`[ringkas] database: ${DATABASE_PATH}`);

serve({ fetch: app.fetch, port: PORT });
