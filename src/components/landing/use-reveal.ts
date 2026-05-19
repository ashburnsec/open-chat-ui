'use client';

import { useEffect, useRef } from 'react';

/**
 * Toggle `data-revealed="true"` on a DOM element when it scrolls into
 * the viewport. CSS in globals.css applies the fade-up transition
 * gated on that attribute.
 *
 *   const ref = useReveal();
 *   <div ref={ref} data-reveal>…</div>
 *
 * One observer per call — fine for ~10-20 elements per landing.
 * `rootMargin: '-10% 0px'` triggers the reveal slightly before the
 * element fully enters, so the user sees the animation play instead
 * of finding it already in steady state.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(): React.RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Skip the observer + reveal immediately if the user prefers no motion.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.setAttribute('data-revealed', 'true');
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).setAttribute('data-revealed', 'true');
            obs.unobserve(e.target);
          }
        }
      },
      { rootMargin: '-10% 0px', threshold: 0.05 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}
