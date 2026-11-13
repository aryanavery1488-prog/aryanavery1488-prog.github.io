(() => {
  "use strict";
  const API_BASE = "https://REPLACE-WITH-YOUR-WORKER.workers.dev";
  const STORAGE_KEY = "visitor_index_id_v1";

  function makeId() {
    const random = crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);
    return "v_" + random;
  }

  function getVisitorId() {
    try {
      let id = localStorage.getItem(STORAGE_KEY);
      if (!id) {
        id = makeId();
        localStorage.setItem(STORAGE_KEY, id);
      }
      return id;
    } catch (_) {
      return makeId();
    }
  }

  function safePath(value) {
    try {
      const parsed = new URL(value);
      return parsed.origin + parsed.pathname;
    } catch (_) {
      return null;
    }
  }

  const payload = {
    visitor_id: getVisitorId(),
    page: safePath(location.href),
    referrer: safePath(document.referrer),
    language: navigator.language || null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    screen: { width: screen.width || null, height: screen.height || null },
    first_party_notice: true
  };

  window.__visitorTrackingPromise = fetch(API_BASE + "/api/visit", {
    method: "POST",
    mode: "cors",
    credentials: "omit",
    cache: "no-store",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).catch(() => null);
})();