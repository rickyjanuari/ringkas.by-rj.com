// Client untuk API payment pusat di api.by-rj.com. Kunci aplikasi hanya
// dibaca oleh backend Ringkas; browser tidak pernah memanggil API ini langsung.

import { getEnv } from "./env.js";

export interface CentralPayment {
  payment_id: string;
  order_id: string;
  amount: number;
  currency: string;
  fee: number | null;
  net_amount: number | null;
  payment_link_url: string | null;
  status: string;
  expires_at: string | null;
  paid_at: string | null;
}

interface CreateCentralPaymentInput {
  orderId: string;
  amount: number;
  idempotencyKey: string;
  successReturnUrl: string;
  cancelReturnUrl: string;
  customerEmail: string;
  customerName?: string | null;
  metadata?: Record<string, unknown>;
}

function config() {
  const env = getEnv();
  if (!env.paymentApiUrl || !env.paymentApiKey) {
    throw new Error("Payment API belum dikonfigurasi");
  }
  return {
    url: env.paymentApiUrl.replace(/\/$/, ""),
    key: env.paymentApiKey
  };
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const { url, key } = config();
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      ...init.headers
    }
  });
  const body = await response.json().catch(() => null) as { error?: unknown } | T | null;
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : `HTTP ${response.status}`;
    throw new Error(`Payment API gagal: ${message}`);
  }
  return body as T;
}

export async function createCentralPayment(input: CreateCentralPaymentInput): Promise<CentralPayment> {
  return await request<CentralPayment>("/v1/payments", {
    method: "POST",
    headers: { "idempotency-key": input.idempotencyKey },
    body: JSON.stringify({
      order_id: input.orderId,
      amount: input.amount,
      currency: "IDR",
      expires_in_hours: 24,
      success_return_url: input.successReturnUrl,
      cancel_return_url: input.cancelReturnUrl,
      payment_method_type_code: "QRIS",
      customer_email: input.customerEmail,
      customer_name: input.customerName ?? undefined,
      metadata: input.metadata ?? {}
    })
  });
}

export async function getCentralPayment(paymentId: string): Promise<CentralPayment> {
  return await request<CentralPayment>(`/v1/payments/${encodeURIComponent(paymentId)}`, { method: "GET" });
}

export function centralPaymentStatus(status: string): "PAID" | "EXPIRED" | "PENDING" {
  if (status === "paid") return "PAID";
  if (status === "expired" || status === "failed" || status === "cancelled" || status === "refunded") return "EXPIRED";
  return "PENDING";
}
