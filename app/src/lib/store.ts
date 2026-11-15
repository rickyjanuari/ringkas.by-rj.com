// src/lib/store.ts — auth store + cart store (localStorage).
import { writable, derived } from "svelte/store";
import { getToken, setToken, clearToken, type User } from "./api";

const CART_KEY = "ringkas_cart";

// ---------------------------------------------------------------------------
// Auth: pengguna yang sedang masuk + token sesi.
// ---------------------------------------------------------------------------
interface AuthState {
	user: User | null;
	token: string | null;
}

function loadCart(): string[] {
	try {
		const raw = localStorage.getItem(CART_KEY);
		const parsed = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
	} catch {
		return [];
	}
}

function createAuthStore() {
	const { subscribe, set } = writable<AuthState>({
		user: null,
		token: typeof localStorage !== "undefined" ? getToken() : null
	});
	return {
		subscribe,
		/** Dipanggil setelah login/register berhasil. */
		login(user: User, token: string) {
			setToken(token);
			set({ user, token });
		},
		setUser(user: User | null) {
			let token: string | null = null;
			subscribe((s) => (token = s.token))();
			set({ user, token });
		},
		/** Logout lokal (server dipanggil terpisah oleh halaman akun). */
		logout() {
			clearToken();
			set({ user: null, token: null });
		}
	};
}

export const auth = createAuthStore();

// ---------------------------------------------------------------------------
// Keranjang: array id produk, tersimpan di localStorage.
// ---------------------------------------------------------------------------
function createCartStore() {
	const { subscribe, update, set } = writable<string[]>(loadCart());
	// Simpan setiap perubahan.
	subscribe((list) => {
		try {
			localStorage.setItem(CART_KEY, JSON.stringify(list));
		} catch {
			/* abaikan */
		}
	});
	return {
		subscribe,
		add(id: string) {
			update((list) => (list.includes(id) ? list : [...list, id]));
		},
		remove(id: string) {
			update((list) => list.filter((x) => x !== id));
		},
		clear() {
			set([]);
		},
		has(id: string): boolean {
			let found = false;
			subscribe((list) => (found = list.includes(id)))();
			return found;
		}
	};
}

export const cart = createCartStore();
export const cartCount = derived(cart, ($cart) => $cart.length);
