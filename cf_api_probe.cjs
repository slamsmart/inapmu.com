// List zones and DNS records via Cloudflare API using wrangler's OAuth token
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
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  return { status: res.status, json };
}

(async () => {
  const token = getAccessToken();
  const zones = await api(token, "GET", "/zones?name=inapmu.com");
  console.log("zones:", JSON.stringify(zones.json.result?.map(z => ({ id: z.id, name: z.name, status: z.status, ns: z.name_servers })), null, 1));
})();
