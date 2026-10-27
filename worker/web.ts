/**
 * Web worker: serves static SPA assets, proxies /api/* and /media/* to the
 * API worker so the workers.dev preview is fully functional same-origin.
 * Once inapmu.com delegates to Cloudflare, zone routes handle /api* + /media*
 * directly and this proxy only matters for the workers.dev preview host.
 */

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "script-src 'self' https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
  ].join("; "),
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/")) {
			return env.API.fetch(request);
		}
		return withSecurityHeaders(await env.ASSETS.fetch(request));
	},
} satisfies ExportedHandler<{ ASSETS: Fetcher; API: Fetcher }>;
