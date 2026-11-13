const ALLOWED_ORIGIN = "https://aryanavery1488-prog.github.io";
const RETENTION_DAYS = 90;
const PAGE_SIZE = 200;
const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...headers }
  });
}

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin"
  };
}

function clean(value, max = 1500) {
  return typeof value === "string" ? value.slice(0, max) : null;
}

function validVisitorId(id) {
  return typeof id === "string" && /^v_[a-zA-Z0-9-]{10,100}$/.test(id);
}

function isAdmin(request, env) {
  const supplied = request.headers.get("Authorization") || "";
  return Boolean(env.ADMIN_TOKEN) && supplied === "Bearer " + env.ADMIN_TOKEN;
}

function encodeCursor(lastSeen, visitorId) {
  return btoa(lastSeen + "\n" + visitorId);
}

function decodeCursor(value) {
  if (!value || value.length > 500) return null;
  try {
    const parts = atob(value).split("\n");
    if (parts.length !== 2 || !parts[0] || !validVisitorId(parts[1])) return null;
    return { lastSeen: parts[0], visitorId: parts[1] };
  } catch (_) {
    return null;
  }
}

function mapRecord(row) {
  let metadata = {};
  try { metadata = JSON.parse(row.metadata_json || "{}"); } catch (_) {}
  return {
    visitor_id: row.visitor_id,
    first_seen: row.first_seen,
    last_seen: row.last_seen,
    visits: row.visits,
    ip_address: row.ip_address,
    user_agent: row.user_agent,
    page: row.page,
    referrer: row.referrer,
    language: row.language,
    timezone: row.timezone,
    screen: {
      width: row.screen_width,
      height: row.screen_height
    },
    notice_shown: Boolean(row.notice_shown),
    metadata,
    retention_expires_at: row.retention_expires_at
  };
}

async function readJson(request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 10000) {
    throw new Error("REQUEST_TOO_LARGE");
  }
  try { return JSON.parse(raw); }
  catch (_) { throw new Error("INVALID_JSON"); }
}

async function cleanupExpired(db) {
  const now = new Date().toISOString();
  return db.prepare(
    "DELETE FROM visitors WHERE retention_expires_at <= ?"
  ).bind(now).run();
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (origin !== ALLOWED_ORIGIN) return json({ error: "Origin not allowed" }, 403);

    const headers = cors(origin);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (!env.DB) return json({ error: "D1 database binding DB is not configured" }, 503, headers);

    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/health" && request.method === "GET") {
        await env.DB.prepare("SELECT 1 AS connected").first();
        return json({ status: "healthy", database: "connected" }, 200, headers);
      }

      if (url.pathname === "/api/visit" && request.method === "POST") {
        let body;
        try { body = await readJson(request); }
        catch (error) {
          const status = error.message === "REQUEST_TOO_LARGE" ? 413 : 400;
          return json({ error: status === 413 ? "Request too large" : "Invalid JSON" }, status, headers);
        }

        if (!validVisitorId(body.visitor_id)) {
          return json({ error: "Invalid visitor ID" }, 400, headers);
        }
        if (body.first_party_notice !== true) {
          return json({ error: "The visitor notice must be acknowledged first" }, 400, headers);
        }

        const now = new Date().toISOString();
        const expires = new Date(Date.now() + RETENTION_DAYS * 86400000).toISOString();
        const ipAddress = clean(request.headers.get("CF-Connecting-IP"), 64);
        const userAgent = clean(request.headers.get("User-Agent"), 500);
        const language = clean(body.language, 50);
        const timezone = clean(body.timezone, 100);
        const width = Number.isInteger(body.screen?.width) ? Math.min(20000, Math.max(0, body.screen.width)) : null;
        const height = Number.isInteger(body.screen?.height) ? Math.min(20000, Math.max(0, body.screen.height)) : null;
        const page = clean(body.page, 1500);
        const referrer = clean(body.referrer, 1500);
        const metadata = JSON.stringify({
          language,
          timezone,
          screen: { width, height }
        });

        await env.DB.prepare(`
          INSERT INTO visitors (
            visitor_id, first_seen, last_seen, visits, ip_address, user_agent,
            page, referrer, language, timezone, screen_width, screen_height,
            notice_shown, metadata_json, retention_expires_at
          ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
          ON CONFLICT(visitor_id) DO UPDATE SET
            last_seen = excluded.last_seen,
            visits = MIN(visitors.visits + 1, 1000000),
            ip_address = excluded.ip_address,
            user_agent = excluded.user_agent,
            page = excluded.page,
            referrer = excluded.referrer,
            language = excluded.language,
            timezone = excluded.timezone,
            screen_width = excluded.screen_width,
            screen_height = excluded.screen_height,
            notice_shown = 1,
            metadata_json = excluded.metadata_json,
            retention_expires_at = excluded.retention_expires_at
        `).bind(
          body.visitor_id, now, now, ipAddress, userAgent,
          page, referrer, language, timezone, width, height, metadata, expires
        ).run();

        return json({ ok: true }, 200, headers);
      }

      if (url.pathname.startsWith("/api/admin/")) {
        if (!isAdmin(request, env)) return json({ error: "Unauthorized" }, 401, headers);

        if (url.pathname === "/api/admin/visitors" && request.method === "GET") {
          const cursorValue = url.searchParams.get("cursor");
          const cursor = cursorValue ? decodeCursor(cursorValue) : null;
          if (cursorValue && !cursor) return json({ error: "Invalid cursor" }, 400, headers);

          const since = new Date(Date.now() - 86400000).toISOString();
          const stats = await env.DB.prepare(`
            SELECT
              COUNT(*) AS unique_visitors,
              COALESCE(SUM(visits), 0) AS total_visits,
              COALESCE(SUM(CASE WHEN first_seen >= ? THEN 1 ELSE 0 END), 0) AS new_last_24h,
              COALESCE(SUM(CASE WHEN last_seen >= ? THEN 1 ELSE 0 END), 0) AS active_last_24h
            FROM visitors
          `).bind(since, since).first();

          let query;
          if (cursor) {
            query = env.DB.prepare(`
              SELECT * FROM visitors
              WHERE last_seen < ? OR (last_seen = ? AND visitor_id < ?)
              ORDER BY last_seen DESC, visitor_id DESC
              LIMIT ?
            `).bind(cursor.lastSeen, cursor.lastSeen, cursor.visitorId, PAGE_SIZE + 1);
          } else {
            query = env.DB.prepare(`
              SELECT * FROM visitors
              ORDER BY last_seen DESC, visitor_id DESC
              LIMIT ?
            `).bind(PAGE_SIZE + 1);
          }

          const result = await query.all();
          const rows = result.results || [];
          const hasMore = rows.length > PAGE_SIZE;
          const page = rows.slice(0, PAGE_SIZE);
          const last = page[page.length - 1];

          return json({
            stats,
            visitors: page.map(mapRecord),
            next_cursor: hasMore && last ? encodeCursor(last.last_seen, last.visitor_id) : null
          }, 200, headers);
        }

        const match = url.pathname.match(/^\/api\/admin\/visitors\/(v_[a-zA-Z0-9-]{10,100})$/);
        if (match && request.method === "DELETE") {
          await env.DB.prepare("DELETE FROM visitors WHERE visitor_id = ?")
            .bind(match[1]).run();
          return json({ ok: true }, 200, headers);
        }
      }

      return json({ error: "Not found" }, 404, headers);
    } catch (error) {
      return json({ error: "Internal server error" }, 500, headers);
    }
  },

  async scheduled(controller, env, ctx) {
    if (env.DB) ctx.waitUntil(cleanupExpired(env.DB));
  }
};