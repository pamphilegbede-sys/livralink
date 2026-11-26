/**
 * Silent Real-User Monitoring (RUM) Core Web Vitals collector using native PerformanceObserver.
 * Reports LCP, INP, CLS, FCP, and TTFB without any blocking impact or visible UI telemetry.
 */

export type WebVitalMetricName = 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB';
export type WebVitalRating = 'good' | 'needs-improvement' | 'poor';

export function rateWebVital(name: WebVitalMetricName, value: number): WebVitalRating {
  if (name === 'LCP') return value <= 2500 ? 'good' : value <= 4000 ? 'needs-improvement' : 'poor';
  if (name === 'INP') return value <= 200 ? 'good' : value <= 500 ? 'needs-improvement' : 'poor';
  if (name === 'CLS') return value <= 0.1 ? 'good' : value <= 0.25 ? 'needs-improvement' : 'poor';
  if (name === 'FCP') return value <= 1800 ? 'good' : value <= 3000 ? 'needs-improvement' : 'poor';
  return value <= 800 ? 'good' : value <= 1800 ? 'needs-improvement' : 'poor';
}

let rumInitialized = false;

export function initWebVitalsRum(getCurrentView?: () => string): () => void {
  if (
    rumInitialized ||
    typeof window === 'undefined' ||
    typeof PerformanceObserver === 'undefined'
  ) {
    return () => {};
  }

  rumInitialized = true;
  const reported = new Set<WebVitalMetricName>();
  const observers: PerformanceObserver[] = [];

  const getConnectionType = (): string | undefined => {
    const conn = (navigator as any)?.connection;
    return typeof conn?.effectiveType === 'string' ? conn.effectiveType : undefined;
  };

  const sendMetric = (name: WebVitalMetricName, rawValue: number) => {
    if (!Number.isFinite(rawValue) || rawValue < 0) return;
    if (reported.has(name)) return;
    reported.add(name);

    const payload = JSON.stringify({
      name,
      value: name === 'CLS' ? Math.round(rawValue * 1000) / 1000 : Math.round(rawValue),
      rating: rateWebVital(name, rawValue),
      view: getCurrentView ? getCurrentView() : undefined,
      connectionType: getConnectionType(),
    });

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon('/api/telemetry/rum', blob);
        return;
      }
    } catch {}

    try {
      void fetch('/api/telemetry/rum', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    } catch {}
  };

  // TTFB & FCP from navigation / paint entries
  try {
    const navEntries = performance.getEntriesByType?.('navigation') as PerformanceNavigationTiming[] | undefined;
    if (navEntries && navEntries[0] && navEntries[0].responseStart > 0) {
      sendMetric('TTFB', navEntries[0].responseStart);
    }
  } catch {}

  let latestLcp = 0;
  let clsTotal = 0;
  let maxInp = 0;

  try {
    const lcpObs = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last && last.startTime > 0) {
        latestLcp = last.startTime;
      }
    });
    lcpObs.observe({ type: 'largest-contentful-paint', buffered: true });
    observers.push(lcpObs);
  } catch {}

  try {
    const fcpObs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint' && entry.startTime > 0) {
          sendMetric('FCP', entry.startTime);
        }
      }
    });
    fcpObs.observe({ type: 'paint', buffered: true });
    observers.push(fcpObs);
  } catch {}

  try {
    const clsObs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as any[]) {
        if (!entry.hadRecentInput && typeof entry.value === 'number') {
          clsTotal += entry.value;
        }
      }
    });
    clsObs.observe({ type: 'layout-shift', buffered: true });
    observers.push(clsObs);
  } catch {}

  try {
    const inpObs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as any[]) {
        if (typeof entry.duration === 'number' && entry.duration > maxInp) {
          maxInp = entry.duration;
        }
      }
    });
    inpObs.observe({ type: 'event', buffered: true } as PerformanceObserverInit);
    observers.push(inpObs);
  } catch {}

  const flushOnHide = () => {
    if (document.visibilityState === 'hidden') {
      if (latestLcp > 0) sendMetric('LCP', latestLcp);
      sendMetric('CLS', clsTotal);
      if (maxInp > 0) sendMetric('INP', maxInp);
    }
  };

  document.addEventListener('visibilitychange', flushOnHide, { passive: true });
  window.addEventListener('pagehide', flushOnHide, { passive: true });

  return () => {
    observers.forEach((o) => {
      try { o.disconnect(); } catch {}
    });
    document.removeEventListener('visibilitychange', flushOnHide);
    window.removeEventListener('pagehide', flushOnHide);
    rumInitialized = false;
  };
}
