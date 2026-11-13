const ORIGIN = "https://aryanavery1488-prog.github.io";
const RETENTION_DAYS = 90;
const MAX_PAGE = 200;
const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...HEADERS, ...headers }
  });

const cors = origin => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Vary": "Origin"
});

const clean = (value, max = 1500) =>
  typeof value === "string" ? value.slice(0, max) : null;

const validVisitorId = value =>
  typeof value === "string" && /^v_[a-zA-Z0-9-]{10,100}$/.test(value);

function safeObject(value, maxBytes = 6000) {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const serialized = JSON.stringify(value);
    return serialized.length <= maxBytes ? JSON.parse(serialized) : {};
  } catch {
    return {};
  }
}

function parseObject(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function readJson(request, maxBytes = 12000) {
  const source = await request.text();
  if (new TextEncoder().encode(source).length > maxBytes) throw new Error("body_too_large");
  try {
    return JSON.parse(source);
  } catch {
    throw new Error("invalid_json");
  }
}

function isAdmin(request, env) {
  return typeof env.ADMIN_TOKEN === "string" &&
    env.ADMIN_TOKEN.length > 0 &&
    request.headers.get("Authorization") === "Bearer " + env.ADMIN_TOKEN;
}

function visitorRecord(row) {
  const metadata = parseObject(row.metadata_json);
  return {
    visitor_id: row.visitor_id,
    first_seen: row.first_seen,
    last_seen: row.last_seen,
    visits: row.visits,
    sessions: row.session_count || 0,
    ip_address: row.ip_address,
    user_agent: row.user_agent,
    page: row.page,
    referrer: row.referrer,
    language: row.language,
    timezone: row.timezone,
    screen: { width: row.screen_width, height: row.screen_height },
    location: {
      country: row.geo_country,
      region: row.geo_region,
      city: row.geo_city
    },
    network: { asn: row.network_asn, edge_colo: row.edge_colo },
    notice_shown: !!row.notice_shown,
    metadata,
    retention_expires_at: row.retention_expires_at
  };
}

function eventRecord(row) {
  return {
    id: row.id,
    visitor_id: row.visitor_id,
    session_id: row.session_id,
    event_type: row.event_type,
    page: row.page,
    occurred_at: row.occurred_at,
    duration_ms: row.duration_ms,
    details: parseObject(row.details_json)
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (origin !== ORIGIN) return json({ error: "Origin not allowed" }, 403);

    const headers = cors(origin);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (!env.DB) return json({ error: "D1 binding DB is missing" }, 503, headers);

    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/health" && request.method === "GET") {
        await env.DB.prepare("SELECT 1").first();
        return json({ status: "healthy", database: "connected" }, 200, headers);
      }

      if (url.pathname === "/api/visit" && request.method === "POST") {
        let body;
        try {
          body = await readJson(request);
        } catch {
          return json({ error: "Invalid or oversized JSON" }, 400, headers);
        }

        if (!validVisitorId(body.visitor_id) || body.first_party_notice !== true) {
          return json({ error: "Notice acknowledgement required" }, 400, headers);
        }

        const now = new Date().toISOString();
        const expiry = new Date(Date.now() + RETENTION_DAYS * 86400000).toISOString();
        const ip = clean(request.headers.get("CF-Connecting-IP"), 64);
        const userAgent = clean(request.headers.get("User-Agent"), 500);
        const width = Number.isInteger(body.screen?.width)
          ? Math.min(20000, Math.max(0, body.screen.width))
          : null;
        const height = Number.isInteger(body.screen?.height)
          ? Math.min(20000, Math.max(0, body.screen.height))
          : null;
        const edge = request.cf || {};

        await env.DB.prepare(
          "INSERT INTO visitors (" +
          "visitor_id, first_seen, last_seen, visits, ip_address, user_agent, page, referrer, " +
          "language, timezone, screen_width, screen_height, notice_shown, metadata_json, " +
          "retention_expires_at, geo_country, geo_region, geo_city, network_asn, edge_colo" +
          ") VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?) " +
          "ON CONFLICT(visitor_id) DO UPDATE SET " +
          "last_seen=excluded.last_seen, visits=MIN(visitors.visits + 1, 1000000), " +
          "ip_address=excluded.ip_address, user_agent=excluded.user_agent, page=excluded.page, " +
          "referrer=excluded.referrer, language=excluded.language, timezone=excluded.timezone, " +
          "screen_width=excluded.screen_width, screen_height=excluded.screen_height, notice_shown=1, " +
          "metadata_json=excluded.metadata_json, retention_expires_at=excluded.retention_expires_at, " +
          "geo_country=excluded.geo_country, geo_region=excluded.geo_region, geo_city=excluded.geo_city, " +
          "network_asn=excluded.network_asn, edge_colo=excluded.edge_colo"
        ).bind(
          body.visitor_id, now, now, ip, userAgent, clean(body.page), clean(body.referrer),
          clean(body.language, 50), clean(body.timezone, 100), width, height,
          JSON.stringify(safeObject(body.metadata)), expiry,
          clean(edge.country, 8), clean(edge.region, 100), clean(edge.city, 100),
          Number.isInteger(edge.asn) ? edge.asn : null, clean(edge.colo, 12)
        ).run();

        return json({ ok: true }, 200, headers);
      }

      if (url.pathname === "/api/event" && request.method === "POST") {
        let body;
        try {
          body = await readJson(request, 8000);
        } catch {
          return json({ error: "Invalid or oversized JSON" }, 400, headers);
        }

        if (!validVisitorId(body.visitor_id) || body.first_party_notice !== true) {
          return json({ error: "Notice acknowledgement required" }, 400, headers);
        }

        const eventTypes = [
          "page_view", "page_exit", "tab_hidden", "tab_visible", "ui_click",
          "javascript_error", "unhandled_rejection", "resource_error",
          "browser_details", "page_performance", "network_change", "api_error",
          "web_vital", "scroll_depth", "feature_support", "viewport_change",
          "long_task", "slow_resource", "session_start", "session_end", "environment_diagnostics"
        ];
        if (!eventTypes.includes(body.event_type)) {
          return json({ error: "Unsupported event" }, 400, headers);
        }

        const duration = Number.isInteger(body.duration_ms)
          ? Math.min(86400000, Math.max(0, body.duration_ms))
          : null;

        await env.DB.prepare(
          "INSERT INTO visitor_events " +
          "(visitor_id, session_id, event_type, page, occurred_at, duration_ms, details_json) " +
          "SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS " +
          "(SELECT 1 FROM visitors WHERE visitor_id = ?)"
        ).bind(
          body.visitor_id,
          typeof body.session_id === "string" ? clean(body.session_id, 110) : null,
          body.event_type,
          clean(body.page),
          new Date().toISOString(),
          duration,
          JSON.stringify(safeObject(body.details, 3000)),
          body.visitor_id
        ).run();

        return json({ ok: true }, 200, headers);
      }

      if (!url.pathname.startsWith("/api/admin/")) {
        return json({ error: "Not found" }, 404, headers);
      }

      if (!isAdmin(request, env)) {
        return json({ error: "Unauthorized" }, 401, headers);
      }

      if (url.pathname === "/api/admin/visitors" && request.method === "GET") {
        const query = clean(url.searchParams.get("q"), 120);
        const country = clean(url.searchParams.get("country"), 8);
        const device = clean(url.searchParams.get("device"), 40);
        const os = clean(url.searchParams.get("os"), 80);
        const browser = clean(url.searchParams.get("browser"), 80);
        const from = clean(url.searchParams.get("from"), 30);
        const to = clean(url.searchParams.get("to"), 30);
        const sort = url.searchParams.get("sort") || "last_seen";
        const direction = url.searchParams.get("dir") === "asc" ? "ASC" : "DESC";
        const allowedSorts = {
          last_seen: "last_seen",
          first_seen: "first_seen",
          visits: "visits"
        };
        const order = allowedSorts[sort] || "last_seen";
        const limit = Math.min(MAX_PAGE, Math.max(1, Number(url.searchParams.get("limit")) || 100));
        const offset = Math.min(1000000, Math.max(0, Number(url.searchParams.get("offset")) || 0));

        const where = [];
        const args = [];

        if (query) {
          where.push(
            "(visitor_id LIKE ? OR ip_address LIKE ? OR user_agent LIKE ? OR " +
            "geo_city LIKE ? OR geo_region LIKE ? OR geo_country LIKE ? OR " +
            "CAST(network_asn AS TEXT) LIKE ? OR " +
            "json_extract(metadata_json, '$.browser.name') LIKE ? OR " +
            "json_extract(metadata_json, '$.system.name') LIKE ?)"
          );
          for (let index = 0; index < 9; index++) args.push("%" + query + "%");
        }

        if (country) {
          where.push("geo_country = ?");
          args.push(country.toUpperCase());
        }
        if (device) {
          where.push("json_extract(metadata_json, '$.device.category') = ?");
          args.push(device);
        }
        if (os) {
          where.push("json_extract(metadata_json, '$.system.name') = ?");
          args.push(os);
        }
        if (browser) {
          where.push("json_extract(metadata_json, '$.browser.name') = ?");
          args.push(browser);
        }
        if (from) {
          where.push("first_seen >= ?");
          args.push(from + "T00:00:00.000Z");
        }
        if (to) {
          where.push("first_seen <= ?");
          args.push(to + "T23:59:59.999Z");
        }

        const clause = where.length ? " WHERE " + where.join(" AND ") : "";
        const stats = await env.DB.prepare(
          "SELECT COUNT(*) AS unique_visitors, COALESCE(SUM(visits), 0) AS total_visits " +
          "FROM visitors" + clause
        ).bind(...args).first();

        const rows = (await env.DB.prepare(
          "SELECT visitors.*, (SELECT COUNT(DISTINCT session_id) FROM visitor_events " +
          "WHERE visitor_events.visitor_id = visitors.visitor_id) AS session_count " +
          "FROM visitors" + clause +
          " ORDER BY " + order + " " + direction + ", visitor_id ASC LIMIT ? OFFSET ?"
        ).bind(...args, limit, offset).all()).results || [];

        return json({
          stats: stats || { unique_visitors: 0, total_visits: 0 },
          visitors: rows.map(visitorRecord),
          offset,
          next_offset: rows.length === limit ? offset + rows.length : null
        }, 200, headers);
      }

      if (url.pathname === "/api/admin/analytics" && request.method === "GET") {
        const since = new Date(Date.now() - 30 * 86400000).toISOString();

        const browserExpression =
          "CASE " +
          "WHEN json_extract(metadata_json, '$.browser.name') IS NOT NULL " +
          "AND json_extract(metadata_json, '$.browser.name') NOT IN " +
          "('Not-A.Brand', 'Not A Brand', 'Unknown', '') " +
          "THEN json_extract(metadata_json, '$.browser.name') " +
          "WHEN json_extract(metadata_json, '$.browser.brands[1].brand') IS NOT NULL " +
          "AND json_extract(metadata_json, '$.browser.brands[1].brand') NOT IN " +
          "('Not-A.Brand', 'Not A Brand', 'Chromium', 'Unknown', '') " +
          "THEN json_extract(metadata_json, '$.browser.brands[1].brand') " +
          "WHEN json_extract(metadata_json, '$.browser.brands[2].brand') IS NOT NULL " +
          "AND json_extract(metadata_json, '$.browser.brands[2].brand') NOT IN " +
          "('Not-A.Brand', 'Not A Brand', 'Chromium', 'Unknown', '') " +
          "THEN json_extract(metadata_json, '$.browser.brands[2].brand') " +
          "ELSE 'Unknown' END";

        const [
          pages, events, countries, browsers, devices, systems, campaigns,
          referrers, sessions, errors, vitals, scrollDepth, recentErrors,
          navigationPaths, featureSupport, slowResources, longTasks, environmentDiagnostics
        ] = await Promise.all([
          env.DB.prepare(
            "SELECT page, COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors " +
            "FROM visitor_events WHERE event_type = 'page_view' AND occurred_at >= ? " +
            "GROUP BY page ORDER BY views DESC LIMIT 12"
          ).bind(since).all(),

          env.DB.prepare(
            "SELECT event_type, COUNT(*) AS total FROM visitor_events " +
            "WHERE occurred_at >= ? GROUP BY event_type ORDER BY total DESC"
          ).bind(since).all(),

          env.DB.prepare(
            "SELECT COALESCE(geo_country, 'Unknown') AS country, COUNT(*) AS visitors " +
            "FROM visitors WHERE first_seen >= ? GROUP BY geo_country " +
            "ORDER BY visitors DESC LIMIT 12"
          ).bind(since).all(),

          env.DB.prepare(
            "SELECT " + browserExpression + " AS browser, COUNT(*) AS visitors " +
            "FROM visitors WHERE first_seen >= ? GROUP BY browser " +
            "ORDER BY visitors DESC LIMIT 10"
          ).bind(since).all(),

          env.DB.prepare(
            "SELECT COALESCE(json_extract(metadata_json, '$.device.category'), 'Unknown') AS device, " +
            "COUNT(*) AS visitors FROM visitors WHERE first_seen >= ? " +
            "GROUP BY device ORDER BY visitors DESC LIMIT 10"
          ).bind(since).all(),

          env.DB.prepare(
            "SELECT COALESCE(json_extract(metadata_json, '$.system.name'), 'Unknown') AS os, " +
            "COUNT(*) AS visitors FROM visitors WHERE first_seen >= ? " +
            "GROUP BY os ORDER BY visitors DESC LIMIT 10"
          ).bind(since).all(),

          env.DB.prepare(
            "SELECT COALESCE(json_extract(details_json, '$.utm.source'), 'Direct / none') AS source, " +
            "COUNT(*) AS visits FROM visitor_events WHERE event_type = 'page_view' " +
            "AND occurred_at >= ? GROUP BY source ORDER BY visits DESC LIMIT 10"
          ).bind(since).all(),

          env.DB.prepare(
            "SELECT COALESCE(referrer, 'Direct / none') AS referrer, COUNT(*) AS visitors " +
            "FROM visitors WHERE first_seen >= ? GROUP BY referrer " +
            "ORDER BY visitors DESC LIMIT 10"
          ).bind(since).all(),

          env.DB.prepare(
            "SELECT COUNT(DISTINCT session_id) AS sessions, " +
            "SUM(CASE WHEN event_type = 'page_exit' THEN 1 ELSE 0 END) AS page_exits, " +
            "COALESCE(AVG(CASE WHEN event_type = 'page_exit' THEN duration_ms END), 0) " +
            "AS avg_page_duration_ms FROM visitor_events WHERE occurred_at >= ?"
          ).bind(since).first(),

          env.DB.prepare(
            "SELECT event_type, COUNT(*) AS total FROM visitor_events " +
            "WHERE event_type IN ('javascript_error', 'unhandled_rejection', 'resource_error', 'api_error') " +
            "AND occurred_at >= ? GROUP BY event_type"
          ).bind(since).all(),

          env.DB.prepare(
            "SELECT COALESCE(json_extract(details_json, '$.name'), 'Unknown') AS name, " +
            "ROUND(AVG(CAST(json_extract(details_json, '$.value') AS REAL)), 1) AS average, " +
            "COUNT(*) AS samples, COALESCE(MAX(json_extract(details_json, '$.unit')), 'ms') AS unit " +
            "FROM visitor_events WHERE event_type = 'web_vital' AND occurred_at >= ? " +
            "GROUP BY name ORDER BY name"
          ).bind(since).all(),

          env.DB.prepare(
            "SELECT COALESCE(json_extract(details_json, '$.milestone'), 'Unknown') AS milestone, " +
            "COUNT(*) AS total FROM visitor_events WHERE event_type = 'scroll_depth' " +
            "AND occurred_at >= ? GROUP BY milestone ORDER BY milestone"
          ).bind(since).all(),

          env.DB.prepare(
            "SELECT id, visitor_id, session_id, event_type, page, occurred_at, details_json " +
            "FROM visitor_events WHERE event_type IN " +
            "('javascript_error', 'unhandled_rejection', 'resource_error', 'api_error') " +
            "AND occurred_at >= ? ORDER BY occurred_at DESC LIMIT 30"
          ).bind(since).all(),

          env.DB.prepare(
            "SELECT COALESCE(json_extract(details_json, '$.previous_page'), 'Entry / direct') || " +
            "' → ' || COALESCE(page, 'Unknown page') AS path, COUNT(*) AS transitions " +
            "FROM visitor_events WHERE event_type = 'page_view' AND occurred_at >= ? " +
            "AND json_extract(details_json, '$.previous_page') IS NOT NULL " +
            "GROUP BY path ORDER BY transitions DESC LIMIT 15"
          ).bind(since).all(),

          env.DB.prepare(
            "SELECT COUNT(*) AS samples, " +
            "SUM(CASE WHEN json_extract(details_json, '$.features.performance_observer') = 1 THEN 1 ELSE 0 END) AS performance_observer, " +
            "SUM(CASE WHEN json_extract(details_json, '$.features.resize_observer') = 1 THEN 1 ELSE 0 END) AS resize_observer, " +
            "SUM(CASE WHEN json_extract(details_json, '$.features.intersection_observer') = 1 THEN 1 ELSE 0 END) AS intersection_observer, " +
            "SUM(CASE WHEN json_extract(details_json, '$.features.navigation_timing') = 1 THEN 1 ELSE 0 END) AS navigation_timing, " +
            "SUM(CASE WHEN json_extract(details_json, '$.features.service_worker_api') = 1 THEN 1 ELSE 0 END) AS service_worker_api " +
            "FROM visitor_events WHERE event_type = 'feature_support' AND occurred_at >= ?"
          ).bind(since).first(),

          env.DB.prepare(
            "SELECT id, visitor_id, session_id, page, occurred_at, details_json " +
            "FROM visitor_events WHERE event_type = 'slow_resource' AND occurred_at >= ? " +
            "ORDER BY occurred_at DESC LIMIT 20"
          ).bind(since).all(),

          env.DB.prepare(
            "SELECT COUNT(*) AS events, COALESCE(ROUND(AVG(CAST(json_extract(details_json, '$.duration_ms') AS REAL)), 1), 0) AS average_ms, " +
            "COALESCE(MAX(CAST(json_extract(details_json, '$.duration_ms') AS REAL)), 0) AS maximum_ms " +
            "FROM visitor_events WHERE event_type = 'long_task' AND occurred_at >= ?"
          ).bind(since).first(),

          env.DB.prepare(
            "SELECT id, visitor_id, session_id, page, occurred_at, details_json " +
            "FROM visitor_events WHERE event_type = 'environment_diagnostics' AND occurred_at >= ? " +
            "ORDER BY occurred_at DESC LIMIT 30"
          ).bind(since).all()
        ]);

        return json({
          period_days: 30,
          top_pages: pages.results || [],
          event_counts: events.results || [],
          countries: countries.results || [],
          browsers: browsers.results || [],
          devices: devices.results || [],
          systems: systems.results || [],
          campaigns: campaigns.results || [],
          referrers: referrers.results || [],
          sessions: sessions || {},
          errors: errors.results || [],
          web_vitals: vitals.results || [],
          scroll_depth: scrollDepth.results || [],
          recent_errors: (recentErrors.results || []).map(eventRecord),
          navigation_paths: navigationPaths.results || [],
          feature_support: featureSupport || {},
          slow_resources: (slowResources.results || []).map(eventRecord),
          long_tasks: longTasks || { events: 0, average_ms: 0, maximum_ms: 0 },
          environment_diagnostics: (environmentDiagnostics.results || []).map(eventRecord)
        }, 200, headers);
      }

      const eventMatch = url.pathname.match(
        /^\/api\/admin\/visitors\/(v_[a-zA-Z0-9-]{10,100})\/events$/
      );

      if (eventMatch && request.method === "GET") {
        const rows = (await env.DB.prepare(
          "SELECT id, visitor_id, session_id, event_type, page, occurred_at, duration_ms, details_json " +
          "FROM visitor_events WHERE visitor_id = ? ORDER BY occurred_at DESC LIMIT 500"
        ).bind(eventMatch[1]).all()).results || [];

        return json({ events: rows.map(eventRecord) }, 200, headers);
      }

      const deleteMatch = url.pathname.match(
        /^\/api\/admin\/visitors\/(v_[a-zA-Z0-9-]{10,100})$/
      );

      if (deleteMatch && request.method === "DELETE") {
        await env.DB.prepare("DELETE FROM visitor_events WHERE visitor_id = ?")
          .bind(deleteMatch[1]).run();
        await env.DB.prepare("DELETE FROM visitors WHERE visitor_id = ?")
          .bind(deleteMatch[1]).run();
        return json({ ok: true }, 200, headers);
      }

      return json({ error: "Not found" }, 404, headers);
    } catch {
      return json({ error: "Internal server error" }, 500, headers);
    }
  },

  async scheduled(controller, env, context) {
    if (!env.DB) return;
    const now = new Date().toISOString();
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString();

    context.waitUntil(Promise.all([
      env.DB.prepare("DELETE FROM visitors WHERE retention_expires_at <= ?").bind(now).run(),
      env.DB.prepare("DELETE FROM visitor_events WHERE occurred_at <= ?").bind(cutoff).run()
    ]));
  }
};
