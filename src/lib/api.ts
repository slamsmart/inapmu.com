/**
 * API client for the inapmu.com backend (Cloudflare Workers + D1 + R2).
 * All requests go through same-origin /api (vite dev proxy or same zone in prod).
 */

export type ApiError = { error: string; retryAfter?: number; reason?: string };

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfter?: number;

  constructor(status: number, body: ApiError) {
    super(body.error);
    this.status = status;
    this.code = body.error;
    this.retryAfter = body.retryAfter;
  }
}

async function parseError(response: Response): Promise<never> {
  const body = (await response.json().catch(() => ({ error: "unknown_error" }))) as ApiError;
  throw new ApiRequestError(response.status, body);
}

/** Turnstile token acquired by the widget; set once per form render. */
let turnstileTokenProvider: () => string | undefined = () => undefined;

export function setTurnstileTokenProvider(provider: () => string | undefined): void {
  turnstileTokenProvider = provider;
}

function withTurnstile(formData: FormData): FormData {
  const token = turnstileTokenProvider();
  if (token) formData.set("cf-turnstile-response", token);
  return formData;
}

function authorizationHeaders(): Record<string, string> {
  const token = currentSession();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type PartnerApplication = {
  fullName: string;
  email: string;
  phone: string;
  propertyName: string;
  city: string;
  propertyType: string;
};

export async function submitPartnerApplication(input: PartnerApplication): Promise<void> {
  const formData = withTurnstile(new FormData());
  formData.set("fullName", input.fullName);
  formData.set("email", input.email);
  formData.set("phone", input.phone);
  formData.set("propertyName", input.propertyName);
  formData.set("city", input.city);
  formData.set("propertyType", input.propertyType);
  formData.set("website", ""); // honeypot: real clients leave empty

  const response = await fetch("/api/partners/apply", { method: "POST", body: formData });
  if (!response.ok) await parseError(response);
}

export type ListingInput = {
  title: string;
  type: string;
  city: string;
  address: string;
  price: number;
  period: string;
  description: string;
  mapsUrl: string;
  photos: File[];
};

export async function createListing(input: ListingInput): Promise<void> {
  const formData = withTurnstile(new FormData());
  formData.set("title", input.title);
  formData.set("type", input.type);
  formData.set("city", input.city);
  formData.set("address", input.address);
  formData.set("price", String(input.price));
  formData.set("period", input.period);
  formData.set("description", input.description);
  formData.set("mapsUrl", input.mapsUrl);
  formData.set("website", "");
  for (const photo of input.photos) formData.append("photos", photo);

  const response = await fetch("/api/listings", { method: "POST", headers: authorizationHeaders(), body: formData });
  if (!response.ok) await parseError(response);
}

export async function submitVerification(ktp: File): Promise<void> {
  const formData = withTurnstile(new FormData());
  formData.set("ktp", ktp);
  formData.set("website", "");

  const response = await fetch("/api/verifications", { method: "POST", headers: authorizationHeaders(), body: formData });
  if (!response.ok) await parseError(response);
}

export type SessionUser = {
  id: number;
  email: string;
  name: string | null;
  phone?: string | null;
  provider?: string | null;
  created_at?: number;
};

/** Display name: profile name, else the part of the email before "@". */
export function displayName(user: Pick<SessionUser, "email" | "name">): string {
  return user.name?.trim() || user.email.split("@")[0];
}

export async function updateProfile(input: { name: string; phone: string }): Promise<SessionUser> {
  const response = await fetch("/api/auth/profile", {
    method: "POST",
    headers: { "content-type": "application/json", ...authorizationHeaders() },
    credentials: "same-origin",
    body: JSON.stringify(input),
  });
  if (!response.ok) await parseError(response);
  return ((await response.json()) as { user: SessionUser }).user;
}

export async function logoutUser(): Promise<void> {
  try {
    sessionStorage.removeItem("inapmu.session");
  } catch {
    // storage unavailable
  }
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
}

export async function registerUser(email: string, password: string, name: string): Promise<void> {
  const cfTurnstileResponse = turnstileTokenProvider();
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, name, cfTurnstileResponse }),
  });
  if (!response.ok) await parseError(response);
}

export async function loginUser(email: string, password: string): Promise<{ token: string; user: SessionUser }> {
  const cfTurnstileResponse = turnstileTokenProvider();
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, cfTurnstileResponse }),
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as { token: string; user: SessionUser };
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const response = await fetch("/api/auth/me", {
    headers: authorizationHeaders(),
    credentials: "same-origin",
  });
  if (response.status === 401) return null;
  if (!response.ok) await parseError(response);
  const body = (await response.json()) as { user?: SessionUser };
  return body.user ?? null;
}

export function saveSession(token: string): void {
  try {
    sessionStorage.setItem("inapmu.session", token);
  } catch {
    // storage unavailable (private mode) — session simply not persisted
  }
}

export function currentSession(): string | null {
  try {
    return sessionStorage.getItem("inapmu.session");
  } catch {
    return null;
  }
}

export function mediaUrl(objectKey: string | null): string | null {
  if (!objectKey) return null;
  return `/media/${objectKey}`;
}

// ---------------------------------------------------------------------------
// Billing (Mayar QRIS). Amount and fulfillment are owned by the server.
// ---------------------------------------------------------------------------

export type PaidPlan = "gold" | "platinum";
export type ActivePlan = { plan: "free" | PaidPlan; expiresAt: number | null };
export type CheckoutOrder = {
  orderId: string;
  plan: PaidPlan;
  amount: number;
  status: "creating" | "pending" | "paid" | "expired" | "failed";
  qrString: string | null;
  paymentLink: string | null;
  expiresAt: number | null;
  activePlan?: ActivePlan;
};

export async function createCheckout(plan: PaidPlan, mobile?: string): Promise<CheckoutOrder> {
  const response = await fetch("/api/billing/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", ...authorizationHeaders() },
    credentials: "same-origin",
    body: JSON.stringify({ plan, mobile }),
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as CheckoutOrder;
}

export async function getCheckoutOrder(orderId: string): Promise<CheckoutOrder> {
  const response = await fetch(`/api/billing/orders/${encodeURIComponent(orderId)}`, {
    headers: authorizationHeaders(),
    credentials: "same-origin",
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as CheckoutOrder;
}

export async function getActivePlan(): Promise<ActivePlan | null> {
  const response = await fetch("/api/billing/me", { headers: authorizationHeaders(), credentials: "same-origin" });
  if (response.status === 401) return null;
  if (!response.ok) await parseError(response);
  return (await response.json()) as ActivePlan;
}
