import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";

const REDUCED = "(prefers-reduced-motion: reduce)";

const subscribe = (notify: () => void) => {
  const query = typeof window.matchMedia === "function" ? window.matchMedia(REDUCED) : undefined;
  query?.addEventListener("change", notify);
  return () => query?.removeEventListener("change", notify);
};

// Without a way to ask, assume the person wants no motion
const snapshot = () => (typeof window.matchMedia === "function" ? window.matchMedia(REDUCED).matches : true);

/** The live "reduce motion" preference: changing it in the system settings takes effect without a reload */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}

/**
 * Is it worth running recurring work (a clock, a loop, a looping animation) for this element? Only while it is
 * enabled, on screen and the page is in front. Without IntersectionObserver there is no way to know, so no.
 */
export function useVisualActivity(ref: RefObject<Element | null>, enabled: boolean): boolean {
  const [onScreen, setOnScreen] = useState(false);
  const [inFront, setInFront] = useState(() => document.visibilityState === "visible");

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el || typeof IntersectionObserver === "undefined") {
      setOnScreen(false);
      return;
    }
    const observer = new IntersectionObserver((entries) => setOnScreen(entries[entries.length - 1].isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const sync = () => setInFront(document.visibilityState === "visible");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [enabled]);

  return enabled && onScreen && inFront;
}
