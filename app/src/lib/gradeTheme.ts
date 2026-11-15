// src/lib/gradeTheme.ts — tema warna per kelas (1–6).
// Satu-satunya tempat warna kelas didefinisikan; semua halaman memakai
// helper di sini (JANGAN hardcode warna kelas di halaman).
//
// Harmoni dengan brand: K1 memakai marigold brand (#f2b33d), K2 memakai
// emerald brand (#177245), K3–K6 memakai rona tetangga di roda warna
// (teal → biru-hijau → oranye → terakota) supaya tetap terasa satu
// keluarga, bukan warna acak.
//
// Tiap entri:
//   accent — warna utama kelas (garis aksen, cincin node, border chip).
//   soft   — tint terang untuk latar chip/label.
//   text   — warna teks DI ATAS soft; selalu gelap supaya kontras
//            terbaca. Kontras text/soft (dihitung WCAG):
//            K1 6,53 · K2 7,80 · K3 7,82 · K4 7,84 · K5 6,22 · K6 7,92
//            (semua di atas 4,5:1). Jangan pernah menulis teks putih
//            di atas accent terang (mis. marigold) — pakai pasangan
//            soft/text ini.

export interface GradeTheme {
	/** Warna utama kelas. */
	accent: string;
	/** Latar tint terang untuk chip/label. */
	soft: string;
	/** Warna teks di atas `soft` (gelap, kontras terbaca). */
	text: string;
}

const GRADE_THEMES: Record<number, GradeTheme> = {
	1: { accent: "#f2b33d", soft: "#fdf0cd", text: "#7c4a03" },
	2: { accent: "#177245", soft: "#dcefe2", text: "#0f5132" },
	3: { accent: "#0f766e", soft: "#d7efec", text: "#0b4f4a" },
	4: { accent: "#1d6f8e", soft: "#d9eaf2", text: "#134a5e" },
	5: { accent: "#d97706", soft: "#fdeeda", text: "#92400e" },
	6: { accent: "#b45309", soft: "#fbe9d7", text: "#7c2d12" }
};

/** Tema fallback (emerald brand) untuk kelas di luar 1–6. */
const FALLBACK: GradeTheme = { accent: "#177245", soft: "#dcefe2", text: "#0f5132" };

/** Tema warna untuk sebuah kelas (di luar 1–6 → fallback emerald). */
export function gradeTheme(grade: number): GradeTheme {
	if (!Number.isFinite(grade)) return FALLBACK;
	return GRADE_THEMES[Math.round(grade)] ?? FALLBACK;
}

/**
 * Kelas dari id produk.
 *   'k1'..'k6' → 1..6; 'sas-kN' / 'sas-kN-sM' / 'bundle-kN' → N.
 *   Bila id tidak mengandung kelas (mis. 'mtk-sd' = semua kelas),
 *   pakai `grade` produk bila diberikan (mis. dari bab pertama),
 *   selain itu fallback 1.
 */
export function gradeOfProduct(productId: string | undefined, grade?: number): number {
	if (typeof grade === "number" && Number.isFinite(grade) && grade >= 1 && grade <= 6) {
		return Math.round(grade);
	}
	const m = (productId ?? "").match(/(?:^|-)k([1-6])(?:-|$)/);
	if (m) return Number(m[1]);
	return 1;
}

/**
 * Label "Kelas N" untuk sebuah produk, atau null bila produk tidak
 * terikat satu kelas (mis. 'mtk-sd'). Dipakai bila halaman menampilkan
 * teks kelas — jangan tampilkan "Kelas 1" untuk produk semua kelas.
 */
export function gradeLabel(productId: string | undefined): string | null {
	const m = (productId ?? "").match(/(?:^|-)k([1-6])(?:-|$)/);
	return m ? `Kelas ${m[1]}` : null;
}

/**
 * Style CSS custom properties untuk sebuah kelas — pasang di elemen
 * lalu pakai var(--grade-accent) / var(--grade-soft) / var(--grade-text)
 * di CSS atau inline style turunannya.
 */
export function gradeStyle(grade: number): string {
	const t = gradeTheme(grade);
	return `--grade-accent: ${t.accent}; --grade-soft: ${t.soft}; --grade-text: ${t.text};`;
}
