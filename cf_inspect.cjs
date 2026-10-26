// Inspect DNS records + workers custom domains for inapmu.com
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
  return { status: res.status, json };
}

(async () => {
  const token = getAccessToken();
  const zoneId = "daae675e29e8731646be77bd340d0e55";

  const dns = await api(token, "GET", `/zones/${zoneId}/dns_records?per_page=100`);
  console.log("=== DNS RECORDS ===");
  for (const r of dns.json.result || []) {
    console.log(`${r.type}\t${r.name}\t->\t${r.content}\tproxied=${r.proxied} prio=${r.priority ?? ""}`);
  }
  if (!dns.json.result?.length) console.log("(none)");

  const cd = await api(token, "GET", `/accounts/256edca59021db439c2ae22f9e3e9086/workers/domains`);
  console.log("=== WORKERS CUSTOM DOMAINS ===");
  for (const d of cd.json.result || []) {
    console.log(`${d.hostname} zone=${d.zone_name} service=${d.service} env=${d.environment} status=${d.status ?? ""}`);
  }
  if (!cd.json.result?.length) console.log("(none)");
  else if (!cd.json.success) console.log(JSON.stringify(cd.json.errors));

  const sub = await api(token, "GET", `/accounts/256edca59021db439c2ae22f9e3e9086/workers/subdomains`);
  console.log("=== WORKERS DEV SUBDOMAIN ===");
  console.log(JSON.stringify(sub.json.result ?? sub.json));
})();
