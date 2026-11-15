import type { DB, Order, Product, User } from "./db.js";

// ---------------------------------------------------------------------------
// Variabel template email pesanan lunas (TIDAK ada pengiriman otomatis di v1).
// Hanya untuk order PAID — lempar Error bila order tidak ada / belum lunas.
// ---------------------------------------------------------------------------

export interface OrderEmailProduct {
  judul: string;
  harga: number;
}

export interface OrderEmailData {
  order_id: string;
  nama: string;
  email: string;
  produk: OrderEmailProduct[];
  total: number;
  tanggal_bayar: string | null;
  url_produk: string;
}

interface OrderItem {
  product_id: string;
  title: string;
  price: number;
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

export function getOrderEmailData(db: DB, orderId: string): OrderEmailData {
  const order = db.get<Order>("SELECT * FROM orders WHERE id = ?", orderId);
  if (!order) throw new Error("Order tidak ditemukan.");
  if (order.status !== "PAID") throw new Error("Order belum lunas.");
  const user = db.get<User>("SELECT * FROM users WHERE id = ?", order.user_id);
  const items = parseItems(order.items);
  let url_produk = items.length > 0 ? `/belajar/${items[0].product_id}` : "/belajar";
  if (items.length > 0) {
    const first = db.get<Product>("SELECT * FROM products WHERE id = ?", items[0].product_id);
    if (first?.external_url) url_produk = first.external_url;
  }
  return {
    order_id: order.id,
    nama: user?.name ?? "",
    email: user?.email ?? "",
    produk: items.map((it) => ({ judul: it.title, harga: it.price })),
    total: order.total,
    tanggal_bayar: order.paid_at,
    url_produk
  };
}
