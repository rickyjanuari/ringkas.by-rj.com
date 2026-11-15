// src/lib/api.ts — semua panggilan ke /api/... sesuai API_CONTRACT.md.
// Token sesi disimpan di localStorage `ringkas_token`.

export interface User {
	id: string;
	name: string;
	email: string;
	whatsapp: string | null;
	role: string;
	created_at: string;
}

/** Produk publik: semua kolom produk KECUALI external_url. */
export interface ProductPublic {
	id: string;
	title: string;
	jenjang: string;
	mapel: string;
	price: number;
	strikethrough_price: number | null;
	pages: number;
	cover_label: string;
	cover_color: string;
	badge: string | null;
	active: number;
	category: string;
	description: string;
	created_at: string;
}

/** Produk lengkap (admin) — termasuk external_url. */
export interface Product extends ProductPublic {
	external_url: string | null;
}

export interface ChapterMeta {
	id: string;
	title: string;
	subject: string;
	grade: number;
	semester: number;
	sort_order: number;
	video_url: string | null;
	video_duration: string | null;
}

export interface PublicQuestion {
	id: number | string;
	type: string;
	question: string;
	options: string[] | { left: string[]; right: string[] } | null;
}

export interface FullChapter extends ChapterMeta {
	summary: string;
	points: string[];
	focus_text: string;
	flashcards: { front: string; back: string }[];
	quiz: PublicQuestion[];
}

export interface SimulationMeta {
	id: string;
	product_id: string | null;
	subject: string;
	grade: number;
	paket: string;
	title: string;
	total_minutes: number;
	max_points: number;
	created_at: string;
}

export interface SimulationPack {
	simulation: SimulationMeta;
	questions: PublicQuestion[];
}

export interface QuizResult {
	score: number;
	max_score: number;
	correct: Record<string, boolean>;
	review: { questionId: string; correct: boolean; discussion: string }[];
}

export interface StudyPack {
	product: ProductPublic;
	chapters: FullChapter[];
	simulations: SimulationMeta[];
	externalUrl: string | null;
	simLocked: boolean;
}

export interface OrderItem {
	product_id: string;
	title: string;
	price: number;
	/** Hanya terisi bila order PAID (lihat kontrak). */
	externalUrl?: string | null;
}

export interface Order {
	id: string;
	user_id: string;
	items: OrderItem[];
	total: number;
	status: string; // PENDING | PAID | EXPIRED
	klikqris_order_id: string | null;
	qris_url: string | null;
	direct_url: string | null;
	total_amount: number | null;
	signature: string | null;
	whatsapp: string | null;
	idempotency_key: string | null;
	created_at: string;
	paid_at: string | null;
	expired_at: string | null;
}

export interface TrackerData {
	streak: number;
	studyDays: string[];
	doneChapters: { product_id: string; chapter_id: string; done_at: string }[];
	badges: string[];
	stickers: { chapter_id: string; earned_at: string }[];
	scores: { kind: string; ref_id: string; score: number; max_score: number; created_at: string }[];
}

const TOKEN_KEY = "ringkas_token";

export function getToken(): string | null {
	try {
		return localStorage.getItem(TOKEN_KEY);
	} catch {
		return null;
	}
}

export function setToken(token: string | null): void {
	try {
		if (token) localStorage.setItem(TOKEN_KEY, token);
		else localStorage.removeItem(TOKEN_KEY);
	} catch {
		/* abaikan */
	}
}

export function clearToken(): void {
	setToken(null);
}

/**
 * Panggil endpoint /api/... . Bila status 401, token dihapus dan error
 * dilempar. Pesan error server ({error}) selalu diteruskan sebagai pesan Error.
 */
export async function api<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
	const headers: Record<string, string> = {
		...((opts.headers as Record<string, string> | undefined) ?? {})
	};
	if (opts.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
	const token = getToken();
	if (token) headers["Authorization"] = `Bearer ${token}`;
	let res: Response;
	try {
		res = await fetch(path, { ...opts, headers });
	} catch {
		throw new Error("Tidak bisa terhubung ke server. Periksa koneksi internet kamu ya.");
	}
	if (res.status === 401) {
		clearToken();
		throw new Error("Sesi habis, silakan masuk lagi.");
	}
	const data = (await res.json().catch(() => ({}))) as { error?: string };
	if (!res.ok) {
		throw new Error(data.error || `Terjadi kesalahan (${res.status}). Coba lagi ya.`);
	}
	return data as T;
}

/** Unduh berkas (PDF/CSV) dari endpoint yang butuh Bearer — kembalikan Blob + nama berkas. */
export async function apiBlob(
	path: string
): Promise<{ blob: Blob; filename: string }> {
	const headers: Record<string, string> = {};
	const token = getToken();
	if (token) headers["Authorization"] = `Bearer ${token}`;
	const res = await fetch(path, { headers });
	if (res.status === 401) {
		clearToken();
		throw new Error("Sesi habis, silakan masuk lagi.");
	}
	if (!res.ok) {
		const data = (await res.json().catch(() => ({}))) as { error?: string };
		throw new Error(data.error || `Gagal mengunduh (${res.status}).`);
	}
	const blob = await res.blob();
	const cd = res.headers.get("content-disposition") || "";
	const m = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(cd);
	const filename = m ? decodeURIComponent(m[1].replace(/"/g, "")) : "ringkas-unduhan";
	return { blob, filename };
}

/** Pemicu unduhan Blob di browser. */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatRupiah(n: number): string {
	return "Rp" + Number(n || 0).toLocaleString("id-ID");
}

export function formatTanggal(iso: string | null | undefined): string {
	if (!iso) return "-";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleString("id-ID", {
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit"
	});
}

/** Apakah sebuah URL terlihat seperti URL gambar (untuk QRIS). */
export function isImageUrl(url: string | null | undefined): boolean {
	if (!url) return false;
	if (url.startsWith("data:image/")) return true;
	try {
		const u = new URL(url, "https://contoh.id");
		return /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(u.pathname);
	} catch {
		return false;
	}
}

/** Tautan WhatsApp dengan pesan siap kirim (bukan pengiriman otomatis server). */
export function waLink(nomor: string | null | undefined, pesan: string): string {
	const text = encodeURIComponent(pesan);
	const digits = (nomor || "").replace(/\D/g, "");
	if (digits) return `https://wa.me/${digits}?text=${text}`;
	return `https://api.whatsapp.com/send?text=${text}`;
}
