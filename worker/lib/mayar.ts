/**
 * Mayar Headless API V2 helper (server-only).
 * Schema source: docs.mayar.id/api-reference-v2 (invoice/create, transaction/detail).
 */

export type MayarEnvironment = "sandbox" | "production";
export type MayarConfig = { apiKey: string; environment: MayarEnvironment };

const BASE_URL: Record<MayarEnvironment, string> = {
  sandbox: "https://api.mayar.io/hl/v2",
  production: "https://api.mayar.id/hl/v2",
};

export class MayarApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "MayarApiError";
  }
}

type Envelope<T> = { statusCode?: number; messages?: string; message?: string; data?: T };

export async function mayarFetch<T>(config: MayarConfig, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${config.apiKey}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch(`${BASE_URL[config.environment]}${path}`, { ...init, headers });
  const body = (await response.json().catch(() => ({}))) as Envelope<T>;
  const statusCode = body.statusCode ?? response.status;
  if (!response.ok || statusCode >= 400) {
    throw new MayarApiError(body.messages ?? body.message ?? `HTTP ${response.status}`, statusCode);
  }
  return body.data as T;
}

export type CreateInvoiceInput = {
  name: string;
  email: string;
  mobile: string;
  description: string;
  expiredAt: string;
  items: { quantity: number; rate: number; description: string }[];
  paymentMethod: "qris";
  extraData: Record<string, string>;
};

export type CreateInvoiceResult = {
  id: string;
  transactionId: string;
  link: string;
  expiredAt: number;
  extraData?: Record<string, unknown>;
  [key: string]: unknown;
};

export function createInvoice(config: MayarConfig, input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
  return mayarFetch<CreateInvoiceResult>(config, "/invoices/create", { method: "POST", body: JSON.stringify(input) });
}

export type TransactionDetail = { id: string; amount: number; status: string; extraData?: Record<string, unknown> | null };

export function getTransaction(config: MayarConfig, transactionId: string): Promise<TransactionDetail> {
  return mayarFetch<TransactionDetail>(config, `/transactions/${encodeURIComponent(transactionId)}`);
}

/**
 * The V2 docs do not define where a QRIS payload appears in the create
 * response. Treat the response as untrusted: look for an EMVCo QR string
 * (starts with "000201") anywhere within a shallow depth. Never throws.
 */
export function findQrisPayload(value: unknown, depth = 0): string | null {
  if (depth > 4 || value === null || value === undefined) return null;
  if (typeof value === "string") {
    return /^000201[0-9A-Za-z .\-/:*$%+]{20,1500}$/.test(value) ? value : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findQrisPayload(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      const found = findQrisPayload(item, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** Only https links from Mayar domains may be shown to the buyer. */
export function safeMayarLink(link: unknown): string | null {
  if (typeof link !== "string") return null;
  try {
    const url = new URL(link);
    const host = url.hostname;
    const ok = url.protocol === "https:" && (/(^|\.)myr\.id$/.test(host) || /(^|\.)mayar\.(id|io|link)$/.test(host));
    return ok ? url.toString() : null;
  } catch {
    return null;
  }
}

// Substring match so variants like customerEmail / buyerPhone are also redacted.
const PII_KEYS = /(email|mobile|phone|name|address|customer|account|^user$|ktp)/i;

/** Redact PII before storing a webhook payload for audit. */
export function redactPayload(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redactPayload(item, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = PII_KEYS.test(key) ? "[redacted]" : redactPayload(item, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") return value.slice(0, 300);
  return value;
}
