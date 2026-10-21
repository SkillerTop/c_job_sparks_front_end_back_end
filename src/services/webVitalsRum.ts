import { apiUrl } from '@/services/apiClient';

type LayoutShiftEntry = PerformanceEntry & { value: number; hadRecentInput: boolean };
type EventTimingEntry = PerformanceEntry & { duration: number; interactionId?: number };

export function startWebVitalsRum() {
  if (!import.meta.env.PROD || typeof PerformanceObserver === 'undefined') return () => undefined;
  let lcp = 0;
  let cls = 0;
  let inp = 0;
  const observers: PerformanceObserver[] = [];
  const observe = (type: string, callback: PerformanceObserverCallback) => {
    try {
      const observer = new PerformanceObserver(callback);
      observer.observe({ type, buffered: true });
      observers.push(observer);
    } catch {
      // Older browsers omit unsupported performance entry types.
    }
  };
  observe('largest-contentful-paint', (list) => {
    lcp = list.getEntries().at(-1)?.startTime ?? lcp;
  });
  observe('layout-shift', (list) => {
    for (const entry of list.getEntries() as LayoutShiftEntry[])
      if (!entry.hadRecentInput) cls += entry.value;
  });
  observe('event', (list) => {
    for (const entry of list.getEntries() as EventTimingEntry[])
      if ((entry.interactionId ?? 0) > 0) inp = Math.max(inp, entry.duration);
  });
  const report = () => {
    if (document.visibilityState !== 'hidden') return;
    const body = JSON.stringify({
      path: window.location.pathname,
      lcp: Math.round(lcp),
      cls: Number(cls.toFixed(4)),
      inp: Math.round(inp),
      navigationType: (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type ?? 'unknown',
    });
    navigator.sendBeacon(apiUrl('/api/v1/telemetry/web-vitals'), new Blob([body], { type: 'application/json' }));
  };
  document.addEventListener('visibilitychange', report);
  return () => {
    document.removeEventListener('visibilitychange', report);
    observers.forEach((observer) => observer.disconnect());
  };
}
