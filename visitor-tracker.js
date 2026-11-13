(() => {
  "use strict";

  const API = "https://visitor-indexer.aryanavery1488.workers.dev";
  const VISITOR_KEY = "visitor_index_id_v1";
  const SESSION_KEY = "visitor_index_session_v1";
  const SESSION_STARTED_KEY = "visitor_index_session_started_v1";
  const SESSION_PATH_KEY = "visitor_index_session_path_v1";
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
  let newSession = false;
  let sessionStartedAt = Date.now();
  let sessionPath = [];
  try {
    sessionId = sessionStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = "s_" + makeId();
      sessionStorage.setItem(SESSION_KEY, sessionId);
      newSession = true;
    }
    const storedStart = Number(sessionStorage.getItem(SESSION_STARTED_KEY));
    if (storedStart > 0) sessionStartedAt = storedStart;
    else sessionStorage.setItem(SESSION_STARTED_KEY, String(sessionStartedAt));
    const storedPath = JSON.parse(sessionStorage.getItem(SESSION_PATH_KEY) || "[]");
    if (Array.isArray(storedPath)) sessionPath = storedPath.filter(x => typeof x === "string").slice(-20);
  } catch {
    sessionId = "s_" + makeId();
    newSession = true;
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

  function renderingEngine() {
    if (/Firefox\//i.test(agent)) return "Gecko";
    if (/AppleWebKit/i.test(agent) && !/Chrome|Chromium|CriOS|Edg|OPR|Brave/i.test(agent)) return "WebKit";
    if (/AppleWebKit|Chrome|Chromium|CriOS|Edg|OPR/i.test(agent)) return "Blink";
    return "Unknown";
  }

  const mobile = userAgentData?.mobile ?? /Android|iPhone|iPad|iPod|Mobile/i.test(agent);
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

  const browserVersionMatch = agent.match(/(?:Brave|Chrome|CriOS|Edg|OPR|Firefox|FxiOS|Version)\/([\d.]+)/i);
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
    system: { name: systemName(), version: null },
    browser: {
      name: browserName(),
      version: browserVersionMatch?.[1] || null,
      rendering_engine: renderingEngine(),
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
    attribution: { referrer_host: referrerHost(), utm }
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
    referrer: document.referrer ? safePage(document.referrer) : null,
    language: locale.language,
    timezone: locale.timezone,
    screen: { width: screen.width, height: screen.height },
    metadata
  });

  window.__visitorTrackingPromise = visitPromise;

  function appendSessionPage(page) {
    sessionPath.push(page);
    sessionPath = sessionPath.slice(-20);
    try { sessionStorage.setItem(SESSION_PATH_KEY, JSON.stringify(sessionPath)); } catch {}
  }

  if (newSession) {
    sendEvent("session_start", {
      started_at: new Date(sessionStartedAt).toISOString(),
      entry_page: safePage(location.href)
    });
  }

  const featureSupport = {
    performance_observer: "PerformanceObserver" in window,
    resize_observer: "ResizeObserver" in window,
    intersection_observer: "IntersectionObserver" in window,
    navigation_timing: !!performance.getEntriesByType?.("navigation")?.length,
    resource_timing: !!performance.getEntriesByType?.("resource"),
    service_worker_api: "serviceWorker" in navigator,
    send_beacon_api: "sendBeacon" in navigator,
    user_agent_data_api: !!navigator.userAgentData,
    network_information_api: !!connection,
    orientation_api: !!screen.orientation,
    cookie_enabled: !!navigator.cookieEnabled
  };
  sendEvent("feature_support", {
    features: featureSupport,
    feature_count: Object.values(featureSupport).filter(Boolean).length
  });

  let pageStarted = Date.now();
  let pageEnded = false;
  let activeMilliseconds = 0;
  let visibleSince = document.visibilityState === "visible" ? Date.now() : null;

  function activeDuration() {
    return Math.max(0, activeMilliseconds + (visibleSince ? Date.now() - visibleSince : 0));
  }

  function pageView(extra = {}) {
    const current = safePage(location.href);
    const previous = sessionPath.length ? sessionPath[sessionPath.length - 1] : null;
    appendSessionPage(current);
    const navigation = performance.getEntriesByType("navigation")[0];
    sendEvent("page_view", {
      title: (document.title || "").slice(0, 180),
      referrer_host: referrerHost(),
      previous_page: previous && previous !== current ? previous : null,
      navigation_type: navigation?.type || (previous ? "same_document" : "entry"),
      page_index_in_session: sessionPath.length,
      utm,
      ...extra
    });
  }

  pageView({
    entry_page: !document.referrer || (() => {
      try { return new URL(document.referrer).origin !== location.origin; }
      catch { return true; }
    })()
  });

  function finishPage() {
    if (pageEnded) return;
    pageEnded = true;
    sendEvent("page_exit", {
      active_duration_ms: Math.round(activeDuration()),
      navigation_path: sessionPath.slice(-12)
    }, Math.min(86400000, Math.max(0, Date.now() - pageStarted)));
    flushVitals();
  }

  function startPage(extra = {}) {
    pageEnded = false;
    pageStarted = Date.now();
    activeMilliseconds = 0;
    visibleSince = document.visibilityState === "visible" ? Date.now() : null;
    sentMilestones.clear();
    pageView(extra);
  }

  const vitalValues = new Map();
  const vitalSent = new Map();
  const vitalObservers = [];

  function recordVital(name, value, unit = "ms", method = null) {
    if (!Number.isFinite(value)) return;
    vitalValues.set(name, {
      name,
      value: Math.round(value * 1000) / 1000,
      unit,
      method
    });
  }

  function flushVitals() {
    for (const item of vitalObservers) {
      try {
        const pending = item.observer.takeRecords();
        if (pending.length) item.consume(pending);
      } catch {}
    }
    for (const [name, data] of vitalValues) {
      const signature = String(data.value);
      if (vitalSent.get(name) === signature) continue;
      vitalSent.set(name, signature);
      sendEvent("web_vital", data);
    }
  }

  function observeVital(options, consume) {
    try {
      if (!("PerformanceObserver" in window) ||
          !PerformanceObserver.supportedEntryTypes?.includes(options.type)) return;
      const observer = new PerformanceObserver(list => consume(list.getEntries()));
      observer.observe({ ...options, buffered: true });
      vitalObservers.push({ observer, consume });
    } catch {}
  }

  observeVital({ type: "largest-contentful-paint" }, entries => {
    if (entries.length) {
      recordVital("LCP", entries[entries.length - 1].startTime, "ms", "largest_contentful_paint");
    }
  });

  let cumulativeLayoutShift = 0;
  observeVital({ type: "layout-shift" }, entries => {
    for (const entry of entries) {
      if (!entry.hadRecentInput) cumulativeLayoutShift += entry.value;
    }
    recordVital("CLS", cumulativeLayoutShift, "score", "cumulative_layout_shift");
  });

  let maxInteractionDuration = 0;
  observeVital({ type: "event", durationThreshold: 40 }, entries => {
    for (const entry of entries) {
      if (entry.interactionId) maxInteractionDuration = Math.max(maxInteractionDuration, entry.duration);
    }
    if (maxInteractionDuration > 0) {
      recordVital("INP", maxInteractionDuration, "ms", "largest_observed_interaction_candidate");
    }
  });

  observeVital({ type: "longtask" }, entries => {
    if (!entries.length) return;
    const durations = entries.map(entry => entry.duration).filter(Number.isFinite);
    sendEvent("long_task", {
      count: durations.length,
      duration_ms: Math.round(durations.reduce((a, b) => a + b, 0)),
      maximum_ms: Math.round(Math.max(...durations)),
      threshold_ms: 50
    });
  });

  function sendPerformance() {
    try {
      const navigation = performance.getEntriesByType("navigation")[0];
      const resources = performance.getEntriesByType("resource");
      if (!navigation) return;

      const paints = performance.getEntriesByType("paint");
      const slowResources = resources
        .filter(entry => entry.duration >= 1000 && /^https?:/i.test(entry.name))
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 8)
        .map(entry => ({
          resource: safePage(entry.name),
          initiator_type: String(entry.initiatorType || "other").slice(0, 30),
          duration_ms: Math.round(entry.duration),
          transfer_bytes: Number(entry.transferSize) || 0
        }));

      const byType = {};
      for (const entry of resources) {
        const type = String(entry.initiatorType || "other").slice(0, 24);
        byType[type] = (byType[type] || 0) + 1;
      }

      sendEvent("page_performance", {
        navigation_type: navigation.type || null,
        dom_content_loaded_ms: Math.round(navigation.domContentLoadedEventEnd),
        load_ms: Math.round(navigation.loadEventEnd),
        response_ms: Math.round(navigation.responseEnd - navigation.requestStart),
        transfer_bytes: navigation.transferSize || 0,
        resource_count: resources.length,
        resource_types: byType,
        resource_duration_ms: Math.round(resources.reduce((sum, entry) => sum + entry.duration, 0)),
        first_paint_ms: Math.round(paints.find(entry => entry.name === "first-paint")?.startTime || 0),
        first_contentful_paint_ms: Math.round(paints.find(entry => entry.name === "first-contentful-paint")?.startTime || 0),
        slow_resource_count: slowResources.length
      });

      if (slowResources.length) {
        sendEvent("slow_resource", { items: slowResources });
      }
    } catch {}
  }

  if (document.readyState === "complete") {
    setTimeout(sendPerformance, 0);
  } else {
    addEventListener("load", () => setTimeout(sendPerformance, 0), { once: true });
  }

  if (userAgentData?.getHighEntropyValues) {
    userAgentData.getHighEntropyValues([
      "architecture", "bitness", "platformVersion", "uaFullVersion"
    ]).then(details => {
      sendEvent("browser_details", details);
    }).catch(() => {});
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

  let resizeTimer = null;
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      sendEvent("viewport_change", {
        viewport_width: innerWidth,
        viewport_height: innerHeight,
        screen_width: screen.width,
        screen_height: screen.height,
        pixel_ratio: devicePixelRatio || 1,
        orientation: screen.orientation?.type || null
      });
    }, 700);
  }, { passive: true });

  addEventListener("pagehide", () => {
    finishPage();
    sendEvent("session_end", {
      ended_at: new Date().toISOString(),
      session_duration_ms: Math.max(0, Date.now() - sessionStartedAt),
      last_page: safePage(location.href),
      navigation_path: sessionPath.slice(-20)
    });
    flushVitals();
  });

  addEventListener("hashchange", () => {
    finishPage();
    startPage({ navigation: "hash" });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (visibleSince) activeMilliseconds += Date.now() - visibleSince;
      visibleSince = null;
      sendEvent("tab_hidden", { active_duration_ms: Math.round(activeMilliseconds) });
      flushVitals();
    } else {
      visibleSince = Date.now();
      sendEvent("tab_visible");
    }
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
        element: String(target.tagName || "unknown").toLowerCase().slice(0, 24),
        resource_type: String(target.type || "").slice(0, 40) || null,
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
})();