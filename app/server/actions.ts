import { Hono, type Context } from "hono";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import {
  type Chapter,
  type Database,
  type Flashcard,
  type Product,
  type ProductImage,
  type QuestionRow,
  type Simulation,
  type User,
  type Order,
  type SQLInputValue,
  newId,
  nowIso
} from "./database.js";
import { getEnv } from "./env.js";
import type { ImageStorage } from "./storage.js";
import { createQris, checkQrisStatus, verifyWebhookSignature } from "./klikqris.js";
import { receiptPdf, worksheetPdf, productPdf } from "./pdf.js";
import { getOrderEmailData } from "./email.js";
// Modul seed dibuat agen lain (server/seed/study.ts belum ada saat berkas ini
// ditulis) — abaikan error resolusi modul sampai modul itu tersedia.
// @ts-ignore
import { dailyQuestions } from "./seed/study.js";
// @ts-ignore
import type { GeneratedQuestion } from "./seed/study.js";

// ---------------------------------------------------------------------------
// Helper umum
// ---------------------------------------------------------------------------

type OrderRow = Order & { expired_at: string | null };

interface OrderItem {
  product_id: string;
  title: string;
  price: number;
}

interface PublicQuestion {
  id: string;
  type: string;
  question: string;
  options: unknown;
}

interface GradeInput {
  id: string;
  type: string;
  answer: string;
  discussion: string;
  points: number;
}

function parseItems(raw: string): OrderItem[] {
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .filter(
        (it): it is OrderItem =>
          !!it && typeof it === "object" && typeof (it as OrderItem).product_id === "string"
      )
      .map((it) => ({
        product_id: it.product_id,
        title: typeof it.title === "string" ? it.title : it.product_id,
        price: typeof it.price === "number" ? it.price : 0
      }));
  } catch {
    return [];
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function randomAlphaNum(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  const bytes = randomBytes(length);
  for (const b of bytes) out += chars[b % chars.length];
  return out;
}

function newToken(): string {
  return randomBytes(32).toString("hex");
}

async function readJson(c: Context): Promise<Record<string, unknown>> {
  try {
    const v: unknown = await c.req.json();
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Normalisasi nomor WhatsApp ke 62xx; null bila tidak valid. */
function normalizeWhatsapp(input: string): string | null {
  let s = input.replace(/[\s\-().]/g, "");
  if (s.startsWith("+62")) s = s.slice(1);
  else if (s.startsWith("08")) s = "62" + s.slice(1);
  if (!/^62\d{9,13}$/.test(s)) return null;
  return s;
}

function publicUser(u: User): Record<string, unknown> {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    whatsapp: u.whatsapp,
    role: u.role,
    created_at: u.created_at
  };
}

function publicProduct(p: Product): Record<string, unknown> {
  return {
    id: p.id,
    title: p.title,
    jenjang: p.jenjang,
    mapel: p.mapel,
    price: p.price,
    strikethrough_price: p.strikethrough_price,
    pages: p.pages,
    cover_label: p.cover_label,
    cover_color: p.cover_color,
    badge: p.badge,
    active: p.active,
    category: p.category,
    description: p.description,
    created_at: p.created_at
  };
}

/** Helper auth: mengembalikan User atau null (handler yang membalas 401). */
async function authUser(c: Context, db: Database): Promise<User | null> {
  const header = c.req.header("Authorization");
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const session = await db.get<{ user_id: string }>(
    "SELECT user_id FROM sessions WHERE token = ?",
    token
  );
  if (!session) return null;
  return await db.get<User>("SELECT * FROM users WHERE id = ?", session.user_id) ?? null;
}

async function orderOut(db: Database, o: OrderRow): Promise<Record<string, unknown>> {
  const items = parseItems(o.items);
  const paid = o.status === "PAID";
  const itemsOut = await Promise.all(
    items.map(async (it) => {
      let externalUrl: string | null = null;
      if (paid) {
        const p = await db.get<Product>(
          "SELECT external_url FROM products WHERE id = ?",
          it.product_id
        );
        externalUrl = p?.external_url ?? null;
      }
      return { product_id: it.product_id, title: it.title, price: it.price, externalUrl };
    })
  );
  return {
    id: o.id,
    user_id: o.user_id,
    items: itemsOut,
    total: o.total,
    status: o.status,
    klikqris_order_id: o.klikqris_order_id,
    qris_url: o.qris_url,
    direct_url: o.direct_url,
    total_amount: o.total_amount,
    expired_at: o.expired_at,
    idempotency_key: o.idempotency_key,
    whatsapp: o.whatsapp,
    created_at: o.created_at,
    paid_at: o.paid_at
  };
}

async function userHasPaidProduct(db: Database, userId: string, productId: string): Promise<boolean> {
  const orders = await db.all<OrderRow>("SELECT * FROM orders WHERE user_id = ? AND status = 'PAID'", userId);
  return orders.some((o) => parseItems(o.items).some((it) => it.product_id === productId));
}

async function isSimLocked(db: Database, userId: string): Promise<boolean> {
  const row = await db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM parent_links WHERE child_user_id = ? AND redeemed = 1 AND sas_locked = 1",
    userId
  );
  return (row?.n ?? 0) > 0;
}

function computeStreak(dates: string[]): number {
  const set = new Set(dates);
  let streak = 0;
  const d = new Date();
  for (;;) {
    const iso = d.toISOString().slice(0, 10);
    if (!set.has(iso)) break;
    streak += 1;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return streak;
}

function computeBadges(
  doneCount: number,
  stickerCount: number,
  attempts: { kind: string; score: number; max_score: number }[]
): string[] {
  const badges: string[] = [];
  if (doneCount >= 1) badges.push("Langkah Pertama");
  if (stickerCount >= 7) badges.push("Kolektor 7");
  if (stickerCount >= 14) badges.push("Kolektor 14");
  if (stickerCount >= 21) badges.push("Kolektor 21");
  if (stickerCount >= 28) badges.push("Kolektor 28");
  if (attempts.some((a) => a.kind === "simulation")) badges.push("Pejuang Simulasi");
  if (attempts.some((a) => a.max_score > 0 && a.score === a.max_score)) badges.push("Nilai Sempurna");
  return badges;
}

async function markStudyDay(db: Database, userId: string): Promise<void> {
  await db.run("INSERT OR IGNORE INTO study_days (user_id, date) VALUES (?, ?)", userId, todayIso());
}

function parseJsonArray(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function parseJsonObject(raw: string): Record<string, string> {
  try {
    const v: unknown = JSON.parse(raw);
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const out: Record<string, string> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (typeof val === "string") out[k] = val;
      }
      return out;
    }
  } catch {
    // abaikan
  }
  return {};
}

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function parseOptions(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** Nilai satu soal; mengembalikan poin yang diperoleh dan benar/tidak. */
function gradeOne(q: GradeInput, userAnswer: unknown): { earned: number; correct: boolean } {
  switch (q.type) {
    case "pg":
    case "bs": {
      const ok =
        typeof userAnswer === "string" &&
        normalizeText(userAnswer) === normalizeText(q.answer);
      return { earned: ok ? q.points : 0, correct: ok };
    }
    case "pg_kompleks": {
      const correctArr = parseJsonArray(q.answer);
      const chosen = Array.isArray(userAnswer) ? userAnswer.map((x) => String(x)) : [];
      const correctChosen = chosen.filter((c) =>
        correctArr.some((a) => normalizeText(a) === normalizeText(c))
      ).length;
      const total = correctArr.length || 1;
      const earned = (q.points * correctChosen) / total;
      const correct = correctChosen === total && chosen.length === total;
      return { earned, correct };
    }
    case "menjodohkan": {
      const key = parseJsonObject(q.answer);
      const ans =
        userAnswer && typeof userAnswer === "object" && !Array.isArray(userAnswer)
          ? (userAnswer as Record<string, unknown>)
          : {};
      const keys = Object.keys(key);
      let okCount = 0;
      for (const k of keys) {
        if (typeof ans[k] === "string" && ans[k] === key[k]) okCount += 1;
      }
      const earned = keys.length > 0 ? (q.points / keys.length) * okCount : 0;
      return { earned, correct: keys.length > 0 && okCount === keys.length };
    }
    case "isian": {
      const ok =
        typeof userAnswer === "string" &&
        normalizeText(userAnswer) === normalizeText(q.answer);
      return { earned: ok ? q.points : 0, correct: ok };
    }
    case "uraian": {
      const keywords = parseJsonArray(q.answer);
      const text = typeof userAnswer === "string" ? normalizeText(userAnswer) : "";
      const found = keywords.filter((k) => text.includes(normalizeText(k))).length;
      const earned =
        keywords.length > 0 ? Math.floor((q.points * found) / keywords.length) : 0;
      return { earned, correct: keywords.length > 0 && found === keywords.length };
    }
    default:
      return { earned: 0, correct: false };
  }
}

function isHttpUrl(u: string): boolean {
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// registerRoutes
// ---------------------------------------------------------------------------

export function registerRoutes(app: Hono, db: Database, storage: ImageStorage): void {
  // ------------------------- Auth & akun -------------------------

  app.post("/api/auth/register", async (c) => {
    const body = await readJson(c);
    const name = asString(body.name).trim();
    const email = asString(body.email).trim().toLowerCase();
    const password = asString(body.password);
    const whatsappRaw = asString(body.whatsapp).trim();
    if (!name) return c.json({ error: "Nama tidak boleh kosong." }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json({ error: "Format email tidak valid." }, 400);
    }
    if (password.length < 6) return c.json({ error: "Password minimal 6 karakter." }, 400);
    let whatsapp: string | null = null;
    if (whatsappRaw) {
      whatsapp = normalizeWhatsapp(whatsappRaw);
      if (!whatsapp) return c.json({ error: "Nomor WhatsApp tidak valid." }, 400);
    }
    const existing = await db.get<User>("SELECT id FROM users WHERE email = ?", email);
    if (existing) return c.json({ error: "Email sudah terdaftar." }, 409);
    const id = newId("usr");
    const hash = bcrypt.hashSync(password, bcrypt.genSaltSync(10));
    await db.run(
      "INSERT INTO users (id, name, email, password_hash, whatsapp, role, created_at) VALUES (?, ?, ?, ?, ?, 'customer', ?)",
      id,
      name,
      email,
      hash,
      whatsapp,
      nowIso()
    );
    const user = await db.get<User>("SELECT * FROM users WHERE id = ?", id);
    if (!user) return c.json({ error: "Gagal membuat akun." }, 500);
    const token = newToken();
    await db.run("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)", token, id, nowIso());
    return c.json({ user: publicUser(user), token }, 201);
  });

  app.post("/api/auth/login", async (c) => {
    const body = await readJson(c);
    const email = asString(body.email).trim().toLowerCase();
    const password = asString(body.password);
    const user = await db.get<User>("SELECT * FROM users WHERE email = ?", email);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return c.json({ error: "Email atau password salah." }, 401);
    }
    const token = newToken();
    await db.run("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)", token, user.id, nowIso());
    return c.json({ user: publicUser(user), token });
  });

  app.get("/api/auth/me", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    return c.json({ user: publicUser(user) });
  });

  app.post("/api/auth/logout", async (c) => {
    const header = c.req.header("Authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (token) await db.run("DELETE FROM sessions WHERE token = ?", token);
    return c.json({ ok: true });
  });

  app.post("/api/account/whatsapp", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const whatsapp = normalizeWhatsapp(asString(body.whatsapp).trim());
    if (!whatsapp) return c.json({ error: "Nomor WhatsApp tidak valid." }, 400);
    await db.run("UPDATE users SET whatsapp = ? WHERE id = ?", whatsapp, user.id);
    const updated = await db.get<User>("SELECT * FROM users WHERE id = ?", user.id);
    return c.json({ user: publicUser(updated ?? user) });
  });

  // ------------------------- Tracker -------------------------

  app.get("/api/tracker", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const days = (await db.all<{ date: string }>("SELECT date FROM study_days WHERE user_id = ? ORDER BY date DESC", user.id))
      .map((r) => r.date);
    const doneChapters = await db.all<{ product_id: string; chapter_id: string; done_at: string }>(
      "SELECT product_id, chapter_id, done_at FROM tracker WHERE user_id = ? ORDER BY done_at DESC",
      user.id
    );
    const stickers = await db.all<{ chapter_id: string; earned_at: string }>(
      "SELECT chapter_id, earned_at FROM stickers WHERE user_id = ? ORDER BY earned_at",
      user.id
    );
    const scores = await db.all<{ kind: string; ref_id: string; score: number; max_score: number; created_at: string }>(
      "SELECT kind, ref_id, score, max_score, created_at FROM quiz_attempts WHERE user_id = ? ORDER BY created_at DESC",
      user.id
    );
    const badges = computeBadges(doneChapters.length, stickers.length, scores);
    return c.json({
      streak: computeStreak(days),
      studyDays: days,
      doneChapters,
      badges,
      stickers,
      scores
    });
  });

  app.get("/api/stickers", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const stickers = await db.all<{ chapter_id: string; earned_at: string }>(
      "SELECT chapter_id, earned_at FROM stickers WHERE user_id = ? ORDER BY earned_at",
      user.id
    );
    const doneCount = (await db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM tracker WHERE user_id = ?",
      user.id
    ))?.n ?? 0;
    const scores = await db.all<{ kind: string; score: number; max_score: number }>(
      "SELECT kind, score, max_score FROM quiz_attempts WHERE user_id = ?",
      user.id
    );
    return c.json({ stickers, badges: computeBadges(doneCount, stickers.length, scores) });
  });

  // ------------------------- Katalog & produk -------------------------

  app.get("/api/catalog", async (c) => {
    const products = await db.all<Product>("SELECT * FROM products WHERE active = 1 ORDER BY created_at, id");
    return c.json({ products: products.map(publicProduct) });
  });

  app.get("/api/products/:id", async (c) => {
    const product = await db.get<Product>("SELECT * FROM products WHERE id = ?", c.req.param("id"));
    if (!product) return c.json({ error: "Produk tidak ditemukan." }, 404);
    const chapters = await db.all<Chapter>(
      "SELECT * FROM chapters WHERE product_id = ? ORDER BY sort_order, id",
      product.id
    );
    const images = await db.all<ProductImage>(
      "SELECT * FROM product_images WHERE product_id = ? ORDER BY id",
      product.id
    );
    return c.json({
      product: publicProduct(product),
      chapters: chapters.map((ch) => ({
        id: ch.id,
        title: ch.title,
        subject: ch.subject,
        grade: ch.grade,
        semester: ch.semester,
        sort_order: ch.sort_order,
        video_url: ch.video_url,
        video_duration: ch.video_duration
      })),
      images: images.map((im) => ({ id: im.id, url: im.url, kind: im.kind }))
    });
  });

  // ------------------------- Admin: produk -------------------------

  app.get("/api/admin/products", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const products = await db.all<Product>("SELECT * FROM products ORDER BY created_at, id");
    return c.json({ products });
  });

  app.post("/api/admin/products", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const body = await readJson(c);
    const title = asString(body.title).trim();
    const price = asNumber(body.price);
    if (!title) return c.json({ error: "Judul produk wajib diisi." }, 400);
    if (price === undefined || price < 0) return c.json({ error: "Harga produk tidak valid." }, 400);
    const id = asString(body.id).trim() || newId("prd");
    const existing = await db.get<Product>("SELECT id FROM products WHERE id = ?", id);
    if (existing) return c.json({ error: "ID produk sudah dipakai." }, 409);
    const externalUrl = asString(body.external_url).trim() || null;
    if (externalUrl && !isHttpUrl(externalUrl)) {
      return c.json({ error: "Link eksternal harus diawali http:// atau https://." }, 400);
    }
    await db.run(
      `INSERT INTO products (id, title, jenjang, mapel, price, strikethrough_price, pages, cover_label, cover_color, badge, active, category, description, external_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      title,
      asString(body.jenjang) || "SD",
      asString(body.mapel) || "",
      price,
      asNumber(body.strikethrough_price) ?? null,
      asNumber(body.pages) ?? 0,
      asString(body.cover_label) || "",
      asString(body.cover_color) || "#2273d8",
      asString(body.badge) || null,
      asNumber(body.active) ?? 1,
      asString(body.category) || "SD",
      asString(body.description) || "",
      externalUrl,
      nowIso()
    );
    const product = await db.get<Product>("SELECT * FROM products WHERE id = ?", id);
    return c.json({ product }, 201);
  });

  app.put("/api/admin/products/:id", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const id = c.req.param("id");
    const product = await db.get<Product>("SELECT * FROM products WHERE id = ?", id);
    if (!product) return c.json({ error: "Produk tidak ditemukan." }, 404);
    const body = await readJson(c);
    const allowed: (keyof Product)[] = [
      "title", "jenjang", "mapel", "price", "strikethrough_price", "pages",
      "cover_label", "cover_color", "badge", "active", "category", "description", "external_url"
    ];
    const sets: string[] = [];
    const params: SQLInputValue[] = [];
    for (const key of allowed) {
      if (key in body) {
        if (key === "external_url") {
          const v = asString(body.external_url).trim() || null;
          if (v && !isHttpUrl(v)) {
            return c.json({ error: "Link eksternal harus diawali http:// atau https://." }, 400);
          }
          sets.push("external_url = ?");
          params.push(v);
        } else if (key === "price" || key === "strikethrough_price" || key === "pages" || key === "active") {
          const v = asNumber(body[key]);
          if (v === undefined && key === "price") {
            return c.json({ error: "Harga produk tidak valid." }, 400);
          }
          sets.push(`${key} = ?`);
          params.push(v ?? null);
        } else {
          sets.push(`${key} = ?`);
          params.push(asString(body[key]));
        }
      }
    }
    if (sets.length === 0) return c.json({ error: "Tidak ada perubahan." }, 400);
    await db.run(`UPDATE products SET ${sets.join(", ")} WHERE id = ?`, ...params, id);
    const updated = await db.get<Product>("SELECT * FROM products WHERE id = ?", id);
    return c.json({ product: updated });
  });

  app.delete("/api/admin/products/:id", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const product = await db.get<Product>("SELECT * FROM products WHERE id = ?", c.req.param("id"));
    if (!product) return c.json({ error: "Produk tidak ditemukan." }, 404);
    await db.run("DELETE FROM products WHERE id = ?", product.id);
    return c.json({ ok: true });
  });

  app.post("/api/admin/products/:id/active", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const product = await db.get<Product>("SELECT * FROM products WHERE id = ?", c.req.param("id"));
    if (!product) return c.json({ error: "Produk tidak ditemukan." }, 404);
    const body = await readJson(c);
    const active = asNumber(body.active);
    if (active !== 0 && active !== 1) return c.json({ error: "Nilai active harus 0 atau 1." }, 400);
    await db.run("UPDATE products SET active = ? WHERE id = ?", active, product.id);
    const updated = await db.get<Product>("SELECT * FROM products WHERE id = ?", product.id);
    return c.json({ product: updated });
  });

  app.post("/api/admin/products/:id/external-link", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const product = await db.get<Product>("SELECT * FROM products WHERE id = ?", c.req.param("id"));
    if (!product) return c.json({ error: "Produk tidak ditemukan." }, 404);
    const body = await readJson(c);
    const url = asString(body.url).trim() || null;
    if (url && !isHttpUrl(url)) {
      return c.json({ error: "Link eksternal harus diawali http:// atau https://." }, 400);
    }
    await db.run("UPDATE products SET external_url = ? WHERE id = ?", url, product.id);
    const updated = await db.get<Product>("SELECT * FROM products WHERE id = ?", product.id);
    return c.json({ product: updated });
  });

  app.post("/api/admin/products/:id/images", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const product = await db.get<Product>("SELECT * FROM products WHERE id = ?", c.req.param("id"));
    if (!product) return c.json({ error: "Produk tidak ditemukan." }, 404);
    const body = await readJson(c);
    const filename = asString(body.filename).trim();
    const dataUrl = asString(body.dataUrl);
    const kind = asString(body.kind) === "feature" ? "feature" : "gallery";
    if (!filename || !dataUrl) {
      return c.json({ error: "Nama berkas dan data gambar wajib diisi." }, 400);
    }
    const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
    const mime = match ? match[1] : "image/png";
    const base64 = match ? match[2] : dataUrl;
    if (!/^[A-Za-z0-9+/=\r\n]+$/.test(base64)) {
      return c.json({ error: "Data gambar base64 tidak valid." }, 400);
    }
    const extFromMime: Record<string, string> = {
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/webp": ".webp",
      "image/gif": ".gif"
    };
    const safeBase = filename.split(/[\\/]/).pop()?.replace(/[^A-Za-z0-9._-]/g, "_") || "gambar";
    const hasExt = /\.[A-Za-z0-9]{2,5}$/.test(safeBase);
    const safeName = `${Date.now()}-${hasExt ? safeBase : safeBase + (extFromMime[mime] ?? ".png")}`;
    let url: string;
    try {
      // Di Worker (Cloudflare), storage ini melempar Error dan handler
      // mengembalikan 501 — berkas tidak persisten di Workers (butuh R2).
      url = await storage.save(product.id, safeName, base64);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "Gagal menyimpan gambar." },
        501
      );
    }
    if (kind === "feature") {
      await db.run("UPDATE product_images SET kind = 'gallery' WHERE product_id = ? AND kind = 'feature'", product.id);
    }
    const result = await db.run(
      "INSERT INTO product_images (product_id, url, kind, created_at) VALUES (?, ?, ?, ?)",
      product.id,
      url,
      kind,
      nowIso()
    );
    const image = await db.get<ProductImage>(
      "SELECT * FROM product_images WHERE id = ?",
      Number(result.lastInsertRowid)
    );
    return c.json({ image }, 201);
  });

  app.delete("/api/admin/images/:id", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const image = await db.get<ProductImage>("SELECT * FROM product_images WHERE id = ?", c.req.param("id"));
    if (!image) return c.json({ error: "Gambar tidak ditemukan." }, 404);
    // Berkas dihapus best-effort; baris DB tetap dihapus apa pun hasilnya.
    await storage.delete(image.url);
    await db.run("DELETE FROM product_images WHERE id = ?", image.id);
    return c.json({ ok: true });
  });

  app.post("/api/admin/products/:id/feature", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const product = await db.get<Product>("SELECT * FROM products WHERE id = ?", c.req.param("id"));
    if (!product) return c.json({ error: "Produk tidak ditemukan." }, 404);
    const body = await readJson(c);
    const imageId = asNumber(body.image_id);
    if (imageId === undefined) return c.json({ error: "image_id wajib diisi." }, 400);
    const image = await db.get<ProductImage>(
      "SELECT * FROM product_images WHERE id = ? AND product_id = ?",
      imageId,
      product.id
    );
    if (!image) return c.json({ error: "Gambar tidak ditemukan." }, 404);
    await db.run("UPDATE product_images SET kind = 'gallery' WHERE product_id = ? AND kind = 'feature'", product.id);
    await db.run("UPDATE product_images SET kind = 'feature' WHERE id = ?", imageId);
    const updated = await db.get<ProductImage>("SELECT * FROM product_images WHERE id = ?", imageId);
    return c.json({ image: updated });
  });

  app.get("/api/admin/users", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const users = await db.all<{
      id: string; name: string; email: string; role: string; whatsapp: string | null;
      created_at: string; order_count: number;
    }>(
      `SELECT u.id, u.name, u.email, u.role, u.whatsapp, u.created_at,
              COUNT(o.id) AS order_count
       FROM users u LEFT JOIN orders o ON o.user_id = u.id
       GROUP BY u.id ORDER BY u.created_at, u.email`
    );
    return c.json({ users });
  });

  app.post("/api/admin/users/:id/role", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const targetId = c.req.param("id");
    if (targetId === admin.id) {
      return c.json({ error: "Admin tidak dapat mengubah role akunnya sendiri." }, 403);
    }
    const target = await db.get<User>("SELECT * FROM users WHERE id = ?", targetId);
    if (!target) return c.json({ error: "Pengguna tidak ditemukan." }, 404);
    const body = await readJson(c);
    const role = asString(body.role);
    if (role !== "admin" && role !== "customer") {
      return c.json({ error: "Role harus admin atau customer." }, 400);
    }
    await db.run("UPDATE users SET role = ? WHERE id = ?", role, targetId);
    const updated = await db.get<User>("SELECT * FROM users WHERE id = ?", targetId);
    return c.json({ user: publicUser(updated ?? target) });
  });

  app.post("/api/admin/chapters/:id/video", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const chapter = await db.get<Chapter>("SELECT * FROM chapters WHERE id = ?", c.req.param("id"));
    if (!chapter) return c.json({ error: "Bab tidak ditemukan." }, 404);
    const body = await readJson(c);
    const videoUrl = asString(body.video_url).trim() || null;
    if (videoUrl && !isHttpUrl(videoUrl)) {
      return c.json({ error: "Link video harus diawali http:// atau https://." }, 400);
    }
    const videoDuration = videoUrl ? asString(body.video_duration).trim() || null : null;
    await db.run(
      "UPDATE chapters SET video_url = ?, video_duration = ? WHERE id = ?",
      videoUrl,
      videoDuration,
      chapter.id
    );
    const updated = await db.get<Chapter>("SELECT * FROM chapters WHERE id = ?", chapter.id);
    return c.json({ chapter: updated });
  });

  // ------------------------- Checkout & order -------------------------

  app.post("/api/checkout", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const items = Array.isArray(body.items)
      ? body.items.filter((x): x is string => typeof x === "string")
      : [];
    if (items.length === 0) return c.json({ error: "Keranjang masih kosong." }, 400);
    const idempotencyKey = asString(body.idempotency_key).trim() || null;

    const products: Product[] = [];
    for (const pid of items) {
      const p = await db.get<Product>("SELECT * FROM products WHERE id = ?", pid);
      if (!p) return c.json({ error: `Produk ${pid} tidak ditemukan.` }, 404);
      if (p.active !== 1) return c.json({ error: `Produk ${p.title} sedang tidak aktif.` }, 400);
      products.push(p);
    }
    const total = products.reduce((sum, p) => sum + p.price, 0);
    const orderItems: OrderItem[] = products.map((p) => ({
      product_id: p.id,
      title: p.title,
      price: p.price
    }));
    const itemsKey = [...items].sort().join(",");

    // Nomor WA dari checkout (opsional): snapshot di order + perbarui akun.
    let orderWhatsapp = user.whatsapp;
    const waRaw = asString(body.whatsapp).trim();
    if (waRaw) {
      const wa = normalizeWhatsapp(waRaw);
      if (!wa) return c.json({ error: "Nomor WhatsApp tidak valid." }, 400);
      orderWhatsapp = wa;
      if (wa !== user.whatsapp) {
        await db.run("UPDATE users SET whatsapp = ? WHERE id = ?", wa, user.id);
      }
    }

    // Idempotensi: kunci sama, atau item + total sama dan masih PENDING.
    if (idempotencyKey) {
      const byKey = await db.get<OrderRow>(
        "SELECT * FROM orders WHERE user_id = ? AND idempotency_key = ?",
        user.id,
        idempotencyKey
      );
      if (byKey) return c.json({ order: await orderOut(db, byKey) });
    }
    const pending = await db.all<OrderRow>(
      "SELECT * FROM orders WHERE user_id = ? AND status = 'PENDING'",
      user.id
    );
    for (const o of pending) {
      const oKey = parseItems(o.items).map((it) => it.product_id).sort().join(",");
      const notExpired = !o.expired_at || new Date(o.expired_at).getTime() > Date.now();
      if (oKey === itemsKey && o.total === total && notExpired) {
        return c.json({ order: await orderOut(db, o) });
      }
    }

    const orderId = `RM-${randomAlphaNum(12)}`;
    let qris;
    try {
      qris = await createQris(orderId, total, `Ringkas ${orderId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("belum dikonfigurasi")) {
        return c.json({ error: "KlikQRIS belum dikonfigurasi. Pembayaran belum bisa diproses." }, 503);
      }
      console.error("[checkout] createQris gagal:", err);
      return c.json({ error: "Pembayaran QRIS gagal dibuat, silakan coba lagi." }, 503);
    }
    await db.run(
      `INSERT INTO orders (id, user_id, items, total, status, klikqris_order_id, qris_url, direct_url, total_amount, expired_at, whatsapp, idempotency_key, created_at, paid_at)
       VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      orderId,
      user.id,
      JSON.stringify(orderItems),
      total,
      orderId,
      qris.qris_url,
      qris.direct_url,
      qris.total_amount,
      qris.expired_at,
      orderWhatsapp,
      idempotencyKey ?? `auto-${orderId}`,
      nowIso()
    );
    const order = await db.get<OrderRow>("SELECT * FROM orders WHERE id = ?", orderId);
    if (!order) return c.json({ error: "Gagal membuat order." }, 500);
    return c.json({ order: await orderOut(db, order) }, 201);
  });

  app.get("/api/payment/status/:order_id", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const order = await db.get<OrderRow>("SELECT * FROM orders WHERE id = ?", c.req.param("order_id"));
    if (!order) return c.json({ error: "Order tidak ditemukan." }, 404);
    if (order.user_id !== user.id) return c.json({ error: "Order ini bukan milikmu." }, 403);
    if (order.status === "PENDING" && getEnv().klikqrisApiKey && getEnv().klikqrisMerchantId) {
      try {
        const status = await checkQrisStatus(order.klikqris_order_id ?? order.id);
        if (status === "PAID" || status === "SUCCESS") {
          await db.run("UPDATE orders SET status = 'PAID', paid_at = ? WHERE id = ?", nowIso(), order.id);
        } else if (status === "EXPIRED") {
          await db.run("UPDATE orders SET status = 'EXPIRED' WHERE id = ?", order.id);
        }
      } catch (err) {
        console.error("[payment/status] checkQrisStatus gagal:", err);
      }
    }
    const fresh = await db.get<OrderRow>("SELECT * FROM orders WHERE id = ?", order.id);
    return c.json({ order: await orderOut(db, fresh ?? order) });
  });

  app.post("/api/webhook/klikqris", async (c) => {
    const body = await readJson(c);
    const orderId = asString(body.order_id);
    const status = asString(body.status).toUpperCase();
    const signature = typeof body.signature === "string" ? body.signature : null;
    const secret = getEnv().klikqrisWebhookSecret;
    if (!secret) {
      console.warn("[webhook] KLIKQRIS_WEBHOOK_SECRET tidak disetel — signature tidak divalidasi.");
    } else {
      const { signature: _sig, ...payload } = body;
      if (!verifyWebhookSignature(payload, signature)) {
        return c.json({ received: true, applied: false }, 200);
      }
    }
    if (!orderId || (status !== "PAID" && status !== "SUCCESS")) {
      return c.json({ received: true, applied: false }, 200);
    }
    const order = await db.get<OrderRow>(
      "SELECT * FROM orders WHERE id = ? OR klikqris_order_id = ?",
      orderId,
      orderId
    );
    if (!order) return c.json({ received: true, applied: false }, 200);
    if (order.status === "PAID") return c.json({ received: true, applied: false }, 200);
    await db.run("UPDATE orders SET status = 'PAID', paid_at = ? WHERE id = ?", nowIso(), order.id);
    return c.json({ received: true, applied: true }, 200);
  });

  app.get("/api/orders", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const orders = await db.all<OrderRow>(
      "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC",
      user.id
    );
    return c.json({ orders: await Promise.all(orders.map((o) => orderOut(db, o))) });
  });

  app.get("/api/orders/:id/receipt", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const order = await db.get<OrderRow>("SELECT * FROM orders WHERE id = ?", c.req.param("id"));
    if (!order) return c.json({ error: "Order tidak ditemukan." }, 404);
    if (order.user_id !== user.id) return c.json({ error: "Order ini bukan milikmu." }, 403);
    if (order.status !== "PAID") return c.json({ error: "Struk hanya tersedia untuk order yang sudah lunas." }, 400);
    const pdf = await receiptPdf(
      { ...order, buyer_name: user.name, buyer_email: user.email },
      parseItems(order.items)
    );
    return c.body(Uint8Array.from(pdf), 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="struk-${order.id}.pdf"`
    });
  });

  app.get("/api/orders/:id/download/:product_id", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const order = await db.get<OrderRow>("SELECT * FROM orders WHERE id = ?", c.req.param("id"));
    if (!order) return c.json({ error: "Order tidak ditemukan." }, 404);
    if (order.user_id !== user.id) return c.json({ error: "Order ini bukan milikmu." }, 403);
    if (order.status !== "PAID") return c.json({ error: "Unduhan hanya tersedia untuk order yang sudah lunas." }, 400);
    const productId = c.req.param("product_id");
    if (!parseItems(order.items).some((it) => it.product_id === productId)) {
      return c.json({ error: "Produk ini tidak ada di order tersebut." }, 403);
    }
    const product = await db.get<Product>("SELECT * FROM products WHERE id = ?", productId);
    if (!product) return c.json({ error: "Produk tidak ditemukan." }, 404);
    const chapters = await db.all<Chapter>(
      "SELECT * FROM chapters WHERE product_id = ? ORDER BY sort_order, id",
      productId
    );
    const pdf = await productPdf(product, chapters);
    return c.body(Uint8Array.from(pdf), 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ringkasan-${product.id}.pdf"`
    });
  });

  app.get("/api/order-email-data/:order_id", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const order = await db.get<OrderRow>("SELECT * FROM orders WHERE id = ?", c.req.param("order_id"));
    if (!order) return c.json({ error: "Order tidak ditemukan." }, 404);
    if (order.user_id !== user.id) return c.json({ error: "Order ini bukan milikmu." }, 403);
    if (order.status !== "PAID") return c.json({ error: "Data email hanya tersedia untuk order yang sudah lunas." }, 400);
    try {
      return c.json(await getOrderEmailData(db, order.id));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Gagal mengambil data order." }, 400);
    }
  });

  // ------------------------- Belajar -------------------------

  app.get("/api/study/:product_id", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const product = await db.get<Product>("SELECT * FROM products WHERE id = ?", c.req.param("product_id"));
    if (!product) return c.json({ error: "Produk tidak ditemukan." }, 404);
    const chapters = await db.all<Chapter>(
      "SELECT * FROM chapters WHERE product_id = ? ORDER BY sort_order, id",
      product.id
    );
    // Hemat query D1: ambil SEMUA flashcard + soal bab produk ini dalam
    // 2 query (IN ...), lalu kelompokkan di JS — bukan 2 query PER bab.
    // Penting di Workers Gratis (batas ±50 query D1 per satu pemanggilan):
    // Kelas 1 punya 26 bab — cara lama butuh ~59 query per request,
    // cara baru ~8 query.
    const chapterIds = chapters.map((c) => c.id);
    const flashcardsByChapter = new Map<string, Flashcard[]>();
    const quizByChapter = new Map<string, QuestionRow[]>();
    if (chapterIds.length > 0) {
      const placeholders = chapterIds.map(() => "?").join(", ");
      const allFlashcards = await db.all<Flashcard>(
        `SELECT * FROM flashcards WHERE chapter_id IN (${placeholders}) ORDER BY id`,
        ...chapterIds
      );
      for (const f of allFlashcards) {
        const list = flashcardsByChapter.get(f.chapter_id) ?? [];
        list.push(f);
        flashcardsByChapter.set(f.chapter_id, list);
      }
      const allQuestions = await db.all<QuestionRow>(
        `SELECT * FROM questions WHERE chapter_id IN (${placeholders}) ORDER BY sort_order, id`,
        ...chapterIds
      );
      for (const q of allQuestions) {
        const key = q.chapter_id ?? "";
        const list = quizByChapter.get(key) ?? [];
        list.push(q);
        quizByChapter.set(key, list);
      }
    }
    const fullChapters = chapters.map((ch) => {
      const flashcards = flashcardsByChapter.get(ch.id) ?? [];
      const quiz = (quizByChapter.get(ch.id) ?? []).map((q): PublicQuestion => ({
        id: String(q.id),
        type: q.type,
        question: q.question,
        options: parseOptions(q.options)
      }));
      let points: string[] = [];
      try {
        const parsed: unknown = JSON.parse(ch.points);
        if (Array.isArray(parsed)) points = parsed.filter((p): p is string => typeof p === "string");
      } catch {
        points = [];
      }
      return {
        id: ch.id,
        product_id: ch.product_id,
        title: ch.title,
        subject: ch.subject,
        grade: ch.grade,
        semester: ch.semester,
        summary: ch.summary,
        points,
        focus_text: ch.focus_text,
        video_url: ch.video_url,
        video_duration: ch.video_duration,
        sort_order: ch.sort_order,
        flashcards: flashcards.map((f) => ({ front: f.front, back: f.back })),
        quiz
      };
    });
    const simulations = await db.all<Simulation>(
      "SELECT * FROM simulations WHERE product_id = ? ORDER BY subject, paket",
      product.id
    );
    const externalUrl = (await userHasPaidProduct(db, user.id, product.id))
      ? product.external_url
      : null;
    return c.json({
      product: publicProduct(product),
      chapters: fullChapters,
      simulations: simulations.map((s) => ({
        id: s.id,
        subject: s.subject,
        grade: s.grade,
        paket: s.paket,
        title: s.title,
        total_minutes: s.total_minutes,
        max_points: s.max_points
      })),
      externalUrl,
      simLocked: await isSimLocked(db, user.id)
    });
  });

  app.post("/api/study/chapter-done", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const chapterId = asString(body.chapter_id);
    const productId = asString(body.product_id);
    if (!chapterId || !productId) return c.json({ error: "chapter_id dan product_id wajib diisi." }, 400);
    const chapter = await db.get<Chapter>(
      "SELECT * FROM chapters WHERE id = ? AND product_id = ?",
      chapterId,
      productId
    );
    if (!chapter) return c.json({ error: "Bab tidak ditemukan." }, 404);
    const hadSticker = await db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM stickers WHERE user_id = ? AND chapter_id = ?",
      user.id,
      chapterId
    );
    await db.run(
      `INSERT INTO tracker (user_id, product_id, chapter_id, done, done_at) VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(user_id, chapter_id) DO UPDATE SET done = 1, done_at = excluded.done_at`,
      user.id,
      productId,
      chapterId,
      nowIso()
    );
    let sticker = false;
    if ((hadSticker?.n ?? 0) === 0) {
      await db.run(
        "INSERT OR IGNORE INTO stickers (user_id, chapter_id, earned_at) VALUES (?, ?, ?)",
        user.id,
        chapterId,
        nowIso()
      );
      sticker = true;
    }
    await markStudyDay(db, user.id);
    return c.json({ ok: true, sticker });
  });

  app.post("/api/bookmark", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const chapterId = asString(body.chapter_id);
    const productId = asString(body.product_id);
    if (!chapterId || !productId) return c.json({ error: "chapter_id dan product_id wajib diisi." }, 400);
    if (body.bookmarked === true) {
      await db.run(
        "INSERT OR IGNORE INTO bookmarks (user_id, product_id, chapter_id, created_at) VALUES (?, ?, ?, ?)",
        user.id,
        productId,
        chapterId,
        nowIso()
      );
    } else {
      await db.run("DELETE FROM bookmarks WHERE user_id = ? AND chapter_id = ?", user.id, chapterId);
    }
    return c.json({ ok: true });
  });

  app.post("/api/note", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const chapterId = asString(body.chapter_id);
    const productId = asString(body.product_id);
    const note = asString(body.note).trim();
    if (!chapterId || !productId) return c.json({ error: "chapter_id dan product_id wajib diisi." }, 400);
    if (!note) {
      await db.run("DELETE FROM notes WHERE user_id = ? AND chapter_id = ?", user.id, chapterId);
    } else {
      await db.run(
        `INSERT INTO notes (user_id, product_id, chapter_id, note, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, chapter_id) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at`,
        user.id,
        productId,
        chapterId,
        note,
        nowIso()
      );
    }
    return c.json({ ok: true });
  });

  app.get("/api/search", async (c) => {
    const q = (c.req.query("q") ?? "").trim();
    if (!q) return c.json({ products: [], chapters: [], terms: [] });
    const like = `%${q}%`;
    const products = await db.all<Product>(
      "SELECT * FROM products WHERE active = 1 AND title LIKE ? ORDER BY title LIMIT 20",
      like
    );
    const chapters = await db.all<{ id: string; product_id: string; title: string; subject: string }>(
      "SELECT id, product_id, title, subject FROM chapters WHERE title LIKE ? ORDER BY title LIMIT 20",
      like
    );
    const terms = (await db.all<{ front: string }>(
        "SELECT DISTINCT front FROM flashcards WHERE front LIKE ? OR back LIKE ? LIMIT 10",
        like,
        like
      ))
      .map((r) => r.front);
    return c.json({
      products: products.map(publicProduct),
      chapters,
      terms
    });
  });

  app.get("/api/daily", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const date = todayIso();
    const generated = dailyQuestions(date, 1) as GeneratedQuestion[];
    const questions: PublicQuestion[] = generated.map((q, i) => ({
      id: `daily-${i}`,
      type: q.type,
      question: q.question,
      options: q.options
    }));
    return c.json({ date, questions });
  });

  app.get("/api/simulations/:id/questions", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const sim = await db.get<Simulation>(
      "SELECT * FROM simulations WHERE id = ?",
      c.req.param("id")
    );
    if (!sim) return c.json({ error: "Simulasi tidak ditemukan." }, 404);
    if (await isSimLocked(db, user.id)) {
      return c.json({ error: "Simulasi dikunci oleh orang tua." }, 403);
    }
    const questions = (await db.all<QuestionRow>(
        "SELECT * FROM questions WHERE simulation_id = ? ORDER BY sort_order, id",
        sim.id
      ))
      .map((q): PublicQuestion => ({
        id: String(q.id),
        type: q.type,
        question: q.question,
        options: parseOptions(q.options)
      }));
    return c.json({
      simulation: {
        id: sim.id,
        subject: sim.subject,
        grade: sim.grade,
        paket: sim.paket,
        title: sim.title,
        total_minutes: sim.total_minutes,
        max_points: sim.max_points
      },
      questions
    });
  });

  app.post("/api/quiz/submit", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const kind = asString(body.kind);
    const refId = asString(body.ref_id);
    const answers =
      body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
        ? (body.answers as Record<string, unknown>)
        : {};
    if (kind !== "quiz" && kind !== "simulation" && kind !== "daily") {
      return c.json({ error: "Jenis kuis tidak dikenal." }, 400);
    }
    if (!refId) return c.json({ error: "ref_id wajib diisi." }, 400);
    if (kind === "simulation" && await isSimLocked(db, user.id)) {
      return c.json({ error: "Simulasi dikunci oleh orang tua." }, 403);
    }

    let gradeList: GradeInput[] = [];
    if (kind === "quiz") {
      gradeList = (await db.all<QuestionRow>(
          "SELECT * FROM questions WHERE chapter_id = ? ORDER BY sort_order, id",
          refId
        ))
        .map((q) => ({ id: String(q.id), type: q.type, answer: q.answer, discussion: q.discussion, points: q.points }));
    } else if (kind === "simulation") {
      gradeList = (await db.all<QuestionRow>(
          "SELECT * FROM questions WHERE simulation_id = ? ORDER BY sort_order, id",
          refId
        ))
        .map((q) => ({ id: String(q.id), type: q.type, answer: q.answer, discussion: q.discussion, points: q.points }));
    } else {
      const generated = dailyQuestions(refId, 1) as GeneratedQuestion[];
      gradeList = generated.map((q, i) => ({
        id: `daily-${i}`,
        type: q.type,
        answer: typeof q.answer === "string" ? q.answer : JSON.stringify(q.answer),
        discussion: q.discussion,
        points: q.points
      }));
    }
    if (gradeList.length === 0) return c.json({ error: "Soal tidak ditemukan." }, 404);

    let totalEarned = 0;
    let maxScore = 0;
    const correct: Record<string, boolean> = {};
    const review: { questionId: string; correct: boolean; discussion: string }[] = [];
    for (const q of gradeList) {
      const result = gradeOne(q, answers[q.id]);
      totalEarned += result.earned;
      maxScore += q.points;
      correct[q.id] = result.correct;
      review.push({ questionId: q.id, correct: result.correct, discussion: q.discussion });
    }
    const score = Math.round(totalEarned);
    await db.run(
      "INSERT INTO quiz_attempts (user_id, kind, ref_id, score, max_score, answers, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      user.id,
      kind,
      refId,
      score,
      maxScore,
      JSON.stringify(answers),
      nowIso()
    );
    await markStudyDay(db, user.id);
    return c.json({ score, max_score: maxScore, correct, review });
  });

  app.get("/api/study/:product_id/:chapter_id/worksheet", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const productId = c.req.param("product_id");
    const chapterId = c.req.param("chapter_id");
    const chapter = await db.get<Chapter>(
      "SELECT * FROM chapters WHERE id = ? AND product_id = ?",
      chapterId,
      productId
    );
    if (!chapter) return c.json({ error: "Bab tidak ditemukan." }, 404);
    if (!(await userHasPaidProduct(db, user.id, productId))) {
      return c.json({ error: "Worksheet hanya untuk pemilik produk yang sudah lunas." }, 403);
    }
    const questions = await db.all<QuestionRow>(
      "SELECT * FROM questions WHERE chapter_id = ? ORDER BY sort_order, id",
      chapterId
    );
    const pdf = await worksheetPdf(chapter, questions);
    return c.body(Uint8Array.from(pdf), 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="worksheet-${chapter.id}.pdf"`
    });
  });

  // ------------------------- Keluarga & kelas -------------------------

  app.post("/api/parent/link", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const code = randomAlphaNum(6);
    await db.run(
      "INSERT INTO parent_links (id, parent_user_id, child_user_id, code, redeemed, sas_locked, daily_target, created_at) VALUES (?, ?, NULL, ?, 0, 0, 0, ?)",
      newId("pl"),
      user.id,
      code,
      nowIso()
    );
    return c.json({ code });
  });

  app.post("/api/parent/redeem", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const code = asString(body.code).trim().toUpperCase();
    if (!code) return c.json({ error: "Kode wajib diisi." }, 400);
    const link = await db.get<{ id: string; parent_user_id: string; redeemed: number }>(
      "SELECT * FROM parent_links WHERE code = ?",
      code
    );
    if (!link || link.redeemed === 1) return c.json({ error: "Kode tidak ditemukan atau sudah ditebus." }, 404);
    if (link.parent_user_id === user.id) {
      return c.json({ error: "Kamu tidak bisa menebus kode buatanmu sendiri." }, 400);
    }
    await db.run("UPDATE parent_links SET child_user_id = ?, redeemed = 1 WHERE id = ?", user.id, link.id);
    return c.json({ ok: true });
  });

  app.get("/api/parent/children", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const links = await db.all<{
      child_user_id: string; sas_locked: number; daily_target: number;
    }>(
      "SELECT child_user_id, sas_locked, daily_target FROM parent_links WHERE parent_user_id = ? AND redeemed = 1 AND child_user_id IS NOT NULL",
      user.id
    );
    const children = (await Promise.all(
      links.map(async (link) => {
        const child = await db.get<User>("SELECT * FROM users WHERE id = ?", link.child_user_id);
        if (!child) return null;
        const days = (await db.all<{ date: string }>("SELECT date FROM study_days WHERE user_id = ?", child.id))
          .map((r) => r.date);
        const doneCount = (await db.get<{ n: number }>(
          "SELECT COUNT(*) AS n FROM tracker WHERE user_id = ?",
          child.id
        ))?.n ?? 0;
        const scores = await db.all<{ kind: string; ref_id: string; score: number; max_score: number; created_at: string }>(
          "SELECT kind, ref_id, score, max_score, created_at FROM quiz_attempts WHERE user_id = ? ORDER BY created_at DESC",
          child.id
        );
        return {
          id: child.id,
          name: child.name,
          email: child.email,
          sas_locked: link.sas_locked,
          daily_target: link.daily_target,
          streak: computeStreak(days),
          done_chapters: doneCount,
          scores
        };
      })
    )).filter((x): x is NonNullable<typeof x> => x !== null);
    return c.json({ children });
  });

  app.post("/api/parent/lock", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const childId = asString(body.child_id);
    const locked = body.sas_locked === true ? 1 : 0;
    if (!childId) return c.json({ error: "child_id wajib diisi." }, 400);
    const link = await db.get<{ id: string }>(
      "SELECT id FROM parent_links WHERE parent_user_id = ? AND child_user_id = ? AND redeemed = 1",
      user.id,
      childId
    );
    if (!link) return c.json({ error: "Anak ini tidak terhubung denganmu." }, 403);
    await db.run("UPDATE parent_links SET sas_locked = ? WHERE id = ?", locked, link.id);
    return c.json({ ok: true });
  });

  app.post("/api/parent/target", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const childId = asString(body.child_id);
    const target = asNumber(body.daily_target);
    if (!childId) return c.json({ error: "child_id wajib diisi." }, 400);
    if (target === undefined || target < 0) return c.json({ error: "Target harian tidak valid." }, 400);
    const link = await db.get<{ id: string }>(
      "SELECT id FROM parent_links WHERE parent_user_id = ? AND child_user_id = ? AND redeemed = 1",
      user.id,
      childId
    );
    if (!link) return c.json({ error: "Anak ini tidak terhubung denganmu." }, 403);
    await db.run("UPDATE parent_links SET daily_target = ? WHERE id = ?", target, link.id);
    return c.json({ ok: true });
  });

  app.post("/api/class", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const productId = asString(body.product_id);
    const name = asString(body.name).trim();
    if (!productId || !name) return c.json({ error: "product_id dan nama kelas wajib diisi." }, 400);
    const product = await db.get<Product>("SELECT * FROM products WHERE id = ?", productId);
    if (!product) return c.json({ error: "Produk tidak ditemukan." }, 404);
    if (!(await userHasPaidProduct(db, user.id, productId))) {
      return c.json({ error: "Guru harus sudah membeli produk ini." }, 403);
    }
    const id = newId("cls");
    const code = randomAlphaNum(6);
    await db.run(
      "INSERT INTO classes (id, code, teacher_user_id, product_id, name, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      id,
      code,
      user.id,
      productId,
      name,
      nowIso()
    );
    return c.json({ class: { id, code, name } }, 201);
  });

  app.post("/api/class/join", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const code = asString(body.code).trim().toUpperCase();
    if (!code) return c.json({ error: "Kode kelas wajib diisi." }, 400);
    const cls = await db.get<{ id: string; code: string; name: string; product_id: string }>(
      "SELECT * FROM classes WHERE code = ?",
      code
    );
    if (!cls) return c.json({ error: "Kelas tidak ditemukan." }, 404);
    await db.run(
      "INSERT OR IGNORE INTO class_members (class_id, user_id, joined_at) VALUES (?, ?, ?)",
      cls.id,
      user.id,
      nowIso()
    );
    return c.json({ class: { id: cls.id, code: cls.code, name: cls.name } });
  });

  app.get("/api/class/:id", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const cls = await db.get<{
      id: string; code: string; teacher_user_id: string; product_id: string; name: string; created_at: string;
    }>("SELECT * FROM classes WHERE id = ?", c.req.param("id"));
    if (!cls) return c.json({ error: "Kelas tidak ditemukan." }, 404);
    const isTeacher = cls.teacher_user_id === user.id;
    const isMember =
      (await db.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM class_members WHERE class_id = ? AND user_id = ?",
        cls.id,
        user.id
      ))?.n === 1;
    if (!isTeacher && !isMember) return c.json({ error: "Kamu bukan anggota kelas ini." }, 403);
    const memberRows = await db.all<{ user_id: string }>(
      "SELECT user_id FROM class_members WHERE class_id = ? ORDER BY joined_at",
      cls.id
    );
    const members = (await Promise.all(
      memberRows.map(async (m) => {
        const member = await db.get<User>("SELECT * FROM users WHERE id = ?", m.user_id);
        if (!member) return null;
        const doneCount = (await db.get<{ n: number }>(
          "SELECT COUNT(*) AS n FROM tracker WHERE user_id = ?",
          member.id
        ))?.n ?? 0;
        const scores = await db.all<{ kind: string; ref_id: string; score: number; max_score: number; created_at: string }>(
          "SELECT kind, ref_id, score, max_score, created_at FROM quiz_attempts WHERE user_id = ? ORDER BY created_at DESC",
          member.id
        );
        return { id: member.id, name: member.name, done_chapters: doneCount, scores };
      })
    )).filter((x): x is NonNullable<typeof x> => x !== null);
    return c.json({
      class: { id: cls.id, code: cls.code, name: cls.name, product_id: cls.product_id, teacher_user_id: cls.teacher_user_id, created_at: cls.created_at },
      members
    });
  });

  app.get("/api/class/:id/recap", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const cls = await db.get<{ id: string; teacher_user_id: string }>(
      "SELECT * FROM classes WHERE id = ?",
      c.req.param("id")
    );
    if (!cls) return c.json({ error: "Kelas tidak ditemukan." }, 404);
    if (cls.teacher_user_id !== user.id) {
      return c.json({ error: "Hanya guru kelas yang dapat mengunduh rekap." }, 403);
    }
    const memberRows = await db.all<{ user_id: string }>(
      "SELECT user_id FROM class_members WHERE class_id = ? ORDER BY joined_at",
      cls.id
    );
    const lines = ["siswa,bab_selesai,skor_rata_simulasi"];
    for (const m of memberRows) {
      const member = await db.get<User>("SELECT * FROM users WHERE id = ?", m.user_id);
      if (!member) continue;
      const doneCount = (await db.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM tracker WHERE user_id = ?",
        member.id
      ))?.n ?? 0;
      const avg = (await db.get<{ avg: number | null }>(
        "SELECT AVG(score) AS avg FROM quiz_attempts WHERE user_id = ? AND kind = 'simulation'",
        member.id
      ))?.avg;
      const avgText = avg === null || avg === undefined ? "0" : String(Math.round(avg * 10) / 10);
      const safeName = member.name.includes(",") ? `"${member.name.replace(/"/g, '""')}"` : member.name;
      lines.push(`${safeName},${doneCount},${avgText}`);
    }
    const csv = lines.join("\n");
    return c.body(csv, 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rekap-${cls.id}.csv"`
    });
  });
}
