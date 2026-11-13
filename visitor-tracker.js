(() => {
  "use strict";
  const API_BASE = "https://REPLACE-WITH-YOUR-WORKER.workers.dev";
  const STORAGE_KEY = "visitor_index_id_v1";
  const CONSENT_KEY = "visitor_index_notice_seen_v1";
  const now = new Date().toISOString();

  function visitorId() {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = "v_" + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  }

  // The site displays a clear notice before this script is loaded.
  // This acknowledgement records that the visitor was shown the notice.
  try { sessionStorage.setItem(CONSENT_KEY, "shown"); } catch (_) {}

  const payload = {
    visitor_id: visitorId(),
    page: location.href.slice(0, 1500),
    referrer: document.referrer.slice(0, 1500),
    language: navigator.language || null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    screen: { width: screen.width || null, height: screen.height || null },
    first_party_notice: true,
    observed_at: now
  };

  fetch(API_BASE + "/api/visit", {
    method: "POST",
    mode: "cors",
    credentials: "omit",
    cache: "no-store",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).catch(() => {});
})();