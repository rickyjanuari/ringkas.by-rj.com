import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "./db.js";
import { registerRoutes } from "./actions.js";
import { seedDatabase } from "./seed/seed.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = join(__dirname, "..");

const PORT = Number(process.env.PORT ?? 8787);
const DATABASE_PATH =
  process.env.DATABASE_PATH ?? join(appDir, "data", "ringkas.db");

const db = openDatabase(DATABASE_PATH);
db.migrate(join(__dirname, "migrations"));
await seedDatabase(db);

const app = new Hono();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"]
  })
);

app.get("/api/health", (c) => c.json({ ok: true, app: "ringkas", time: new Date().toISOString() }));

registerRoutes(app, db);

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
