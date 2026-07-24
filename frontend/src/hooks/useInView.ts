import { useEffect, useRef, useState } from "react";

/**
 * Retorna true na primeira vez que o elemento referenciado entra na viewport
 * (equivalente a framer-motion's whileInView + viewport once:true), sem
 * depender de nenhuma lib externa de animacao.
 */
export function useInView<T extends HTMLElement>(amount = 0.3) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || inView) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: amount }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [amount, inView]);

  return { ref, inView };
}
