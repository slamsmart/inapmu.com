// Setup: DNS records + workers dev subdomain, leaving NS delegation to manual step
const os = require("os");
const path = require("path");
const fs = require("fs");

function getAccessToken() {
  const cfg = path.join(os.homedir(), "AppData", "Roaming", "xdg.config", ".wrangler", "config", "default.toml");
  const alt = path.join(os.homedir(), ".config", ".wrangler", "config", "default.toml");
  const file = fs.existsSync(cfg) ? cfg : alt;
  const text = fs.readFileSync(file, "utf8");
  const m = text.match(/oauth_token\s*=\s*"([^"]+)"/);
  if (!m) throw new Error("no oauth_token in " + file);
  return m[1];
}

async function api(token, method, urlPath, body) {
  const res = await fetch("https://api.cloudflare.com/client/v4" + urlPath, {
    method,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  return { status: res.status, ok: json.success !== false, errors: json.errors, result: json.result };
}

(async () => {
  const token = getAccessToken();
  const zoneId = "daae675e29e8731646be77bd340d0e55";
  const account = "256edca59021db439c2ae22f9e3e9086";

  // 1. Create A record for apex -> 192.0.2.1 placeholder (proxied) only if missing
  let dns = await api(token, "GET", `/zones/${zoneId}/dns_records?per_page=100`);
  const names = new Set((dns.result || []).map(r => r.type + ":" + r.name));
  const need = [
    { type: "A", name: "inapmu.com", content: "192.0.2.1", proxied: true },
    { type: "A", name: "www.inapmu.com", content: "192.0.2.1", proxied: true },
    { type: "AAAA", name: "inapmu.com", content: "100::", proxied: true },
    { type: "AAAA", name: "www.inapmu.com", content: "100::", proxied: true },
  ];
  for (const rec of need) {
    if (names.has(rec.type + ":" + rec.name)) { console.log("exists:", rec.type, rec.name); continue; }
    const r = await api(token, "POST", `/zones/${zoneId}/dns_records`, rec);
    console.log("created:", rec.type, rec.name, r.ok ? "OK" : JSON.stringify(r.errors));
  }

  // 2. Ensure workers.dev subdomain exists (for preview URL before NS delegation)
  const sub = await api(token, "GET", `/accounts/${account}/workers/subdomains`);
  if (!sub.result) {
    const created = await api(token, "PUT", `/accounts/${account}/workers/subdomains`, { subdomain: "inapmu" });
    console.log("subdomain:", created.ok ? "created inapmu.workers.dev" : JSON.stringify(created.errors));
  } else {
    console.log("subdomain exists:", sub.result.subdomain + ".workers.dev");
  }
})();
