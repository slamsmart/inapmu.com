/**
 * Web worker: serves static SPA assets, proxies /api/* and /media/* to the
 * API worker so the workers.dev preview is fully functional same-origin.
 * Once inapmu.com delegates to Cloudflare, zone routes handle /api* + /media*
 * directly and this proxy only matters for the workers.dev preview host.
 */

const API_ORIGIN = "https://inapmu-api.aicm-id.workers.dev";

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/")) {
			return env.API.fetch(request);
		}
		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<{ ASSETS: Fetcher; API: Fetcher }>;
