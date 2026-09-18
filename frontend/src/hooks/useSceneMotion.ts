import { useEffect, useRef, useState } from "react";

export function observeSceneMotion(node: HTMLElement, update: (active: boolean) => void) {
  update(false);
  if (typeof IntersectionObserver === "undefined") return () => {};

  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let visible = false;
  const sync = () => update(visible && !document.hidden && !preference.matches);
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  });

  observer.observe(node);
  document.addEventListener("visibilitychange", sync);
  preference.addEventListener("change", sync);
  return () => {
    observer.disconnect();
    document.removeEventListener("visibilitychange", sync);
    preference.removeEventListener("change", sync);
  };
}

export function useSceneMotion<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (ref.current) return observeSceneMotion(ref.current, setActive);
  }, []);
  return { ref, active };
}
