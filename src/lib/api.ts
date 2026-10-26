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

  const response = await fetch("/api/listings", { method: "POST", body: formData });
  if (!response.ok) await parseError(response);
}

export async function submitVerification(email: string, ktp: File): Promise<void> {
  const formData = withTurnstile(new FormData());
  formData.set("email", email);
  formData.set("ktp", ktp);
  formData.set("website", "");

  const response = await fetch("/api/verifications", { method: "POST", body: formData });
  if (!response.ok) await parseError(response);
}

export type SessionUser = { id: number; email: string; name: string | null };

export async function registerUser(email: string, password: string, name: string): Promise<void> {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  if (!response.ok) await parseError(response);
}

export async function loginUser(email: string, password: string): Promise<{ token: string; user: SessionUser }> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) await parseError(response);
  return (await response.json()) as { token: string; user: SessionUser };
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
