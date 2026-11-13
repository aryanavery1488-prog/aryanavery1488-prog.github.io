(() => {
  "use strict";

  const API = "https://visitor-indexer.aryanavery1488.workers.dev";
  const VISITOR_KEY = "visitor_index_id_v1";
  const SESSION_KEY = "visitor_index_session_v1";
  const makeId = () => crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);

  let visitorId;
  try {
    visitorId = localStorage.getItem(VISITOR_KEY);
    if (!visitorId) {
      visitorId = "v_" + makeId();
      localStorage.setItem(VISITOR_KEY, visitorId);
    }
  } catch {
    visitorId = "v_" + makeId();
  }

  let sessionId;
  try {
    sessionId = sessionStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = "s_" + makeId();
      sessionStorage.setItem(SESSION_KEY, sessionId);
    }
  } catch {
    sessionId = "s_" + makeId();
  }

  const agent = navigator.userAgent || "";
  const userAgentData = navigator.userAgentData || null;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;

  function safePage(value) {
    try {
      const url = new URL(value, location.href);
      return url.origin + url.pathname + url.hash.slice(0, 180);
    } catch {
      return location.origin + location.pathname;
    }
  }

  function referrerHost() {
    try {
      return document.referrer ? new URL(document.referrer).hostname : null;
    } catch {
      return null;
    }
  }

  function browserName() {
    const brands = userAgentData?.brands || [];
    const brandNames = brands.map(item => item.brand || "").join(" ");
    if (/Brave/i.test(brandNames) || navigator.brave) return "Brave";
    if (/Edg\//i.test(agent) || /Microsoft Edge/i.test(brandNames)) return "Edge";
    if (/OPR\//i.test(agent) || /Opera/i.test(brandNames)) return "Opera";
    if (/Firefox\//i.test(agent)) return "Firefox";
    if (/SamsungBrowser/i.test(agent)) return "Samsung Internet";
    if (/CriOS/i.test(agent)) return "Chrome";
    if (/FxiOS/i.test(agent)) return "Firefox";
    if (/Chrome\//i.test(agent) || /Google Chrome/i.test(brandNames)) return "Chrome";
    if (/Safari\//i.test(agent)) return "Safari";
    return "Other";
  }

  function systemName() {
    const platform = userAgentData?.platform || navigator.platform || "";
    if (/Windows/i.test(platform) || /Windows/i.test(agent)) return "Windows";
    if (/Android/i.test(platform) || /Android/i.test(agent)) return "Android";
    if (/iPhone|iPad|iPod/i.test(agent)) return "iOS";
    if (/macOS|Mac/i.test(platform) || /Mac OS|Macintosh/i.test(agent)) return "macOS";
    if (/Linux/i.test(platform) || /Linux/i.test(agent)) return "Linux";
    return "Other";
  }

  const mobile = userAgentData?.mobile ??
    /Android|iPhone|iPad|iPod|Mobile/i.test(agent);
  const category = /iPad|Tablet/i.test(agent)
    ? "tablet"
    : mobile ? "mobile" : "desktop";

  const params = new URLSearchParams(location.search);
  const utm = {};
  ["source", "medium", "campaign", "term", "content"].forEach(key => {
    const value = params.get("utm_" + key);
    if (value) utm[key] = value.slice(0, 100);
  });

  const locale = {
    language: navigator.language || null,
    languages: (navigator.languages || []).slice(0, 10),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    timezone_offset_minutes: new Date().getTimezoneOffset()
  };

  const metadata = {
    device: {
      category,
      platform: userAgentData?.platform || navigator.platform || null,
      vendor: navigator.vendor || null,
      hardware_concurrency: navigator.hardwareConcurrency || null,
      device_memory_gb: navigator.deviceMemory || null,
      max_touch_points: navigator.maxTouchPoints || 0,
      cookie_enabled: !!navigator.cookieEnabled,
      online: navigator.onLine
    },
    system: { name: systemName() },
    browser: {
      name: browserName(),
      user_agent: agent,
      brands: userAgentData?.brands || null,
      mobile_hint: !!mobile,
      do_not_track: navigator.doNotTrack || null
    },
    display: {
      screen_width: screen.width || null,
      screen_height: screen.height || null,
      available_width: screen.availWidth || null,
      available_height: screen.availHeight || null,
      viewport_width: innerWidth,
      viewport_height: innerHeight,
      pixel_ratio: devicePixelRatio || 1,
      color_depth: screen.colorDepth || null,
      orientation: screen.orientation?.type || null
    },
    locale,
    connection: connection ? {
      effective_type: connection.effectiveType || null,
      downlink_mbps: connection.downlink || null,
      rtt_ms: connection.rtt || null,
      save_data: !!connection.saveData
    } : null,
    attribution: {
      referrer_host: referrerHost(),
      utm
    }
  };

  const base = {
    visitor_id: visitorId,
    session_id: sessionId,
    first_party_notice: true
  };

  function post(path, data) {
    return fetch(API + path, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...base, ...data })
    }).catch(() => null);
  }

  function sendEvent(type, details = {}, duration = null) {
    return visitPromise.then(() => post("/api/event", {
      event_type: type,
      page: safePage(location.href),
      duration_ms: duration,
      details
    }));
  }

  const visitPromise = post("/api/visit", {
    page: safePage(location.href),
    referrer: safePage(document.referrer || location.href),
    language: locale.language,
    timezone: locale.timezone,
    screen: { width: screen.width, height: screen.height },
    metadata
  });

  window.__visitorTrackingPromise = visitPromise;

  function pageView(extra = {}) {
    sendEvent("page_view", {
      title: (document.title || "").slice(0, 180),
      referrer_host: referrerHost(),
      utm,
      ...extra
    });
  }

  let pageStarted = Date.now();
  let pageEnded = false;
  pageView({
    entry_page: !document.referrer || (() => {
      try { return new URL(document.referrer).origin !== location.origin; }
      catch { return true; }
    })()
  });

  function finishPage() {
    if (pageEnded) return;
    pageEnded = true;
    sendEvent("page_exit", {}, Math.min(86400000, Math.max(0, Date.now() - pageStarted)));
    flushVitals();
  }

  function startPage(extra = {}) {
    pageEnded = false;
    pageStarted = Date.now();
    pageView(extra);
  }

  const vitalValues = new Map();
  const vitalSent = new Set();

  function recordVital(name, value, unit = "ms") {
    if (!Number.isFinite(value)) return;
    vitalValues.set(name, { name, value: Math.round(value * 1000) / 1000, unit });
  }

  function flushVitals() {
    for (const [name, data] of vitalValues) {
      if (vitalSent.has(name)) continue;
      vitalSent.add(name);
      sendEvent("web_vital", data);
    }
  }

  try {
    if ("PerformanceObserver" in window &&
        PerformanceObserver.supportedEntryTypes?.includes("largest-contentful-paint")) {
      let observer;
      observer = new PerformanceObserver(list => {
        const entries = list.getEntries();
        if (entries.length) recordVital("LCP", entries[entries.length - 1].startTime);
      });
      observer.observe({ type: "largest-contentful-paint", buffered: true });
      addEventListener("pagehide", () => observer.disconnect(), { once: true });
    }
  } catch {}

  try {
    if ("PerformanceObserver" in window &&
        PerformanceObserver.supportedEntryTypes?.includes("layout-shift")) {
      let cumulative = 0;
      let observer;
      observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) cumulative += entry.value;
        }
        recordVital("CLS", cumulative, "score");
      });
      observer.observe({ type: "layout-shift", buffered: true });
      addEventListener("pagehide", () => observer.disconnect(), { once: true });
    }
  } catch {}

  try {
    if ("PerformanceObserver" in window &&
        PerformanceObserver.supportedEntryTypes?.includes("event")) {
      let maxDuration = 0;
      let observer;
      observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.interactionId) maxDuration = Math.max(maxDuration, entry.duration);
        }
        if (maxDuration > 0) recordVital("INP", maxDuration);
      });
      observer.observe({ type: "event", buffered: true, durationThreshold: 40 });
      addEventListener("pagehide", () => observer.disconnect(), { once: true });
    }
  } catch {}

  function sendPerformance() {
    try {
      const navigation = performance.getEntriesByType("navigation")[0];
      const resources = performance.getEntriesByType("resource");
      if (!navigation) return;
      const failures = resources
        .filter(entry => entry.duration > 0 && entry.transferSize === 0 &&
          !entry.name.startsWith("data:") && !entry.name.startsWith("blob:"))
        .slice(0, 20)
        .map(entry => safePage(entry.name));

      sendEvent("page_performance", {
        dom_content_loaded_ms: Math.round(navigation.domContentLoadedEventEnd),
        load_ms: Math.round(navigation.loadEventEnd),
        response_ms: Math.round(navigation.responseEnd - navigation.requestStart),
        transfer_bytes: navigation.transferSize || 0,
        resource_count: resources.length,
        resource_duration_ms: Math.round(resources.reduce((sum, entry) => sum + entry.duration, 0)),
        failed_resource_count: failures.length,
        possible_failed_resources: failures
      });
    } catch {}
  }

  if (document.readyState === "complete") {
    setTimeout(sendPerformance, 0);
  } else {
    addEventListener("load", () => setTimeout(sendPerformance, 0), { once: true });
  }

  const scrollMilestones = [25, 50, 75, 90];
  const sentMilestones = new Set();

  addEventListener("scroll", () => {
    const root = document.documentElement;
    const maxScroll = Math.max(1, root.scrollHeight - innerHeight);
    const percentage = Math.min(100, Math.round((scrollY / maxScroll) * 100));
    for (const milestone of scrollMilestones) {
      if (percentage >= milestone && !sentMilestones.has(milestone)) {
        sentMilestones.add(milestone);
        sendEvent("scroll_depth", { milestone });
      }
    }
  }, { passive: true });

  addEventListener("pagehide", finishPage);

  addEventListener("hashchange", () => {
    finishPage();
    sentMilestones.clear();
    startPage({ navigation: "hash" });
  });

  document.addEventListener("visibilitychange", () => {
    sendEvent(document.visibilityState === "hidden" ? "tab_hidden" : "tab_visible");
  });

  document.addEventListener("click", event => {
    const element = event.target?.closest?.("[data-analytics-action]");
    if (!element) return;
    const action = element.getAttribute("data-analytics-action");
    if (action && /^[a-z0-9_.:-]{1,60}$/i.test(action)) {
      sendEvent("ui_click", { action });
    }
  }, true);

  addEventListener("error", event => {
    const target = event.target;
    if (target && target !== window) {
      let resource = null;
      try {
        const source = target.currentSrc || target.src || target.href;
        if (source) resource = safePage(source);
      } catch {}
      sendEvent("resource_error", {
        resource,
        element: String(target.tagName || "unknown").toLowerCase(),
        resource_type: target.type || null,
        message: "Resource failed to load"
      });
      return;
    }

    sendEvent("javascript_error", {
      message: String(event.message || "Script error").slice(0, 240),
      file: event.filename ? safePage(event.filename) : null,
      line: event.lineno || null,
      column: event.colno || null
    });
  }, true);

  addEventListener("unhandledrejection", event => {
    sendEvent("unhandled_rejection", {
      message: String(event.reason?.message || event.reason || "Unhandled rejection").slice(0, 240)
    });
  });

  if (connection?.addEventListener) {
    connection.addEventListener("change", () => {
      sendEvent("network_change", {
        effective_type: connection.effectiveType || null,
        downlink_mbps: connection.downlink || null,
        rtt_ms: connection.rtt || null,
        save_data: !!connection.saveData
      });
    });
  }

  if (userAgentData?.getHighEntropyValues) {
    userAgentData.getHighEntropyValues([
      "architecture", "bitness", "model", "platformVersion", "uaFullVersion"
    ]).then(details => sendEvent("browser_details", details)).catch(() => {});
  }
})();