// app.ts — factory aplikasi Hono yang dipakai DUA entry point:
//   - server/index.ts (Node, dev lokal & `npm start`)
//   - server/worker.ts (Cloudflare Worker + D1)
// Semua route /api/... didaftarkan di server/actions.ts. File ini hanya
// memasang CORS + health + routes, sehingga perilaku API identik di mana
// pun aplikasi dijalankan.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { registerRoutes } from "./actions.js";
import { registerTryoutRoutes } from "./tryout.js";
import { registerQaRoutes } from "./qa.js";
import { registerRaporRoutes } from "./rapor.js";
import { registerAnbkRoutes } from "./anbk.js";
import { registerAdaptiveRoutes } from "./adaptive.js";
import { registerVoiceRoutes } from "./voice.js";
import { registerPushRoutes } from "./push.js";
import { registerFlashcardRoutes } from "./flashcards.js";
import { registerTeacherQuizRoutes } from "./teacher-quiz.js";
import type { Database } from "./database.js";
import type { ImageStorage } from "./storage.js";

export interface AppOptions {
  storage: ImageStorage;
}

export function createApp(db: Database, opts: AppOptions): Hono {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"]
    })
  );

  app.get("/api/health", (c) =>
    c.json({ ok: true, app: "ringkas", time: new Date().toISOString() })
  );

  registerRoutes(app, db, opts.storage);
  registerTryoutRoutes(app, db);
  registerQaRoutes(app, db);
  registerRaporRoutes(app, db);
  registerAnbkRoutes(app, db);
  registerAdaptiveRoutes(app, db);
  registerVoiceRoutes(app, db);
  registerPushRoutes(app, db);
  registerFlashcardRoutes(app, db);
  registerTeacherQuizRoutes(app, db);

  return app;
}
