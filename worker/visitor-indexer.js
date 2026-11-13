const ALLOWED_ORIGIN = "https://aryanavery1488-prog.github.io";
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

function response(data, status=200, extra={}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extra } });
}
function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin"
  };
}
function validId(id) { return typeof id === "string" && /^v_[a-zA-Z0-9-]{10,100}$/.test(id); }
function clean(value, max=1500) { return typeof value === "string" ? value.slice(0,max) : null; }
function authorized(request, env) {
  const supplied = request.headers.get("Authorization") || "";
  return !!env.ADMIN_TOKEN && supplied === "Bearer " + env.ADMIN_TOKEN;
}
function keyFor(id) { return "visitors/" + id + ".json"; }

async function purgeExpired(bucket) {
  const cutoff = Date.now() - RETENTION_MS;
  let cursor;
  do {
    const page = await bucket.list({ prefix: "visitors/", cursor, limit: 1000 });
    for (const obj of page.objects) {
      if (obj.uploaded && obj.uploaded.getTime() < cutoff) await bucket.delete(obj.key);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (origin !== ALLOWED_ORIGIN) return response({ error: "Origin not allowed" }, 403);
    const headers = cors(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (!env.VISITOR_BUCKET) return response({ error: "Private storage is not configured" }, 503, headers);

    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/visit" && request.method === "POST") {
        const length = Number(request.headers.get("Content-Length") || 0);
        if (length > 10000) return response({ error: "Request too large" }, 413, headers);
        const body = await request.json();
        if (!validId(body.visitor_id)) return response({ error: "Invalid visitor ID" }, 400, headers);
        const key = keyFor(body.visitor_id);
        const existingObject = await env.VISITOR_BUCKET.get(key);
        const existing = existingObject ? await existingObject.json() : null;
        const now = new Date().toISOString();
        const ip = request.headers.get("CF-Connecting-IP") || null;
        const ua = clean(request.headers.get("User-Agent"), 500);
        const record = {
          visitor_id: body.visitor_id,
          first_seen: existing?.first_seen || now,
          last_seen: now,
          visits: Math.min(1000000, (existing?.visits || 0) + 1),
          ip_address: ip,
          user_agent: ua,
          page: clean(body.page),
          referrer: clean(body.referrer),
          language: clean(body.language, 50),
          timezone: clean(body.timezone, 100),
          screen: body.screen && typeof body.screen === "object" ? {
            width: Number.isFinite(body.screen.width) ? Math.min(20000, Math.max(0, body.screen.width)) : null,
            height: Number.isFinite(body.screen.height) ? Math.min(20000, Math.max(0, body.screen.height)) : null
          } : null,
          notice_shown: body.first_party_notice === true,
          retention_expires_at: new Date(Date.now() + RETENTION_MS).toISOString()
        };
        await env.VISITOR_BUCKET.put(key, JSON.stringify(record, null, 2), {
          httpMetadata: { contentType: "application/json" },
          customMetadata: { visitor_id: body.visitor_id }
        });
        return response({ ok: true }, 200, headers);
      }

      if (url.pathname.startsWith("/api/admin/")) {
        if (!authorized(request, env)) return response({ error: "Unauthorized" }, 401, headers);
        if (url.pathname === "/api/admin/visitors" && request.method === "GET") {
          await purgeExpired(env.VISITOR_BUCKET);
          const visitors = [];
          let cursor;
          do {
            const page = await env.VISITOR_BUCKET.list({ prefix: "visitors/", cursor, limit: 1000 });
            for (const object of page.objects) {
              const item = await env.VISITOR_BUCKET.get(object.key);
              if (item) visitors.push(await item.json());
            }
            cursor = page.truncated ? page.cursor : undefined;
          } while (cursor);
          visitors.sort((a,b) => (b.last_seen || "").localeCompare(a.last_seen || ""));
          return response({ count: visitors.length, visitors }, 200, headers);
        }
        const match = url.pathname.match(/^\/api\/admin\/visitors\/(v_[a-zA-Z0-9-]{10,100})$/);
        if (match && request.method === "DELETE") {
          await env.VISITOR_BUCKET.delete(keyFor(match[1]));
          return response({ ok: true }, 200, headers);
        }
      }
      return response({ error: "Not found" }, 404, headers);
    } catch (error) {
      return response({ error: "Internal server error" }, 500, headers);
    }
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(purgeExpired(env.VISITOR_BUCKET));
  }
};