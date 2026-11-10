/**
 * A/B test variant assignment + privacy-friendly analytics via GoatCounter.
 * No salary or personal data is ever sent.
 */

const STORAGE_KEY = 'btl_variant';
const VARIANTS = ['numbers', 'story'];

export function getVariant() {
  let v = localStorage.getItem(STORAGE_KEY);
  if (!v || !VARIANTS.includes(v)) {
    v = Math.random() < 0.5 ? 'numbers' : 'story';
    localStorage.setItem(STORAGE_KEY, v);
  }
  return v;
}

/**
 * Send a named event to GoatCounter.
 * GoatCounter is configured via window.goatcounter (set by their script tag).
 * props must never contain salary or any identifying information.
 */
export function trackEvent(name, props = {}) {
  if (typeof window === 'undefined') return;
  if (!window.goatcounter?.count) return;
  window.goatcounter.count({
    path:  `event:${name}`,
    title: JSON.stringify(props),
    event: true,
  });
}

/**
 * Attach scroll-depth tracking (25 / 50 / 75 / 100 %) to a target element.
 * Returns a cleanup function that removes the observer.
 */
export function attachScrollTracking(variant) {
  const milestones = new Set();
  const thresholds = [0.25, 0.50, 0.75, 1.00];

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        thresholds.forEach(t => {
          if (entry.intersectionRatio >= t && !milestones.has(t)) {
            milestones.add(t);
            trackEvent('scroll_depth', { variant, pct: Math.round(t * 100) });
          }
        });
      });
    },
    { threshold: thresholds }
  );

  const target = document.getElementById('result');
  if (target) observer.observe(target);

  return () => observer.disconnect();
}

/**
 * Track time on result page. Call once the result section is shown.
 * Fires on pagehide so the page can still be garbage-collected.
 */
export function attachTimeTracking(variant, startTime) {
  const handler = () => {
    const seconds = Math.round((Date.now() - startTime) / 1000);
    trackEvent('time_on_result', { variant, seconds });
  };
  window.addEventListener('pagehide', handler, { once: true });
  return () => window.removeEventListener('pagehide', handler);
}
