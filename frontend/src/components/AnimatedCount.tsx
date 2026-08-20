import { animate } from "framer-motion";
import { useEffect, useRef } from "react";

/** Counts up from 0 to `value` over ~1s. Purely visual. */
export function AnimatedCount({ value, className = "" }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const controls = animate(0, value, {
      duration: 1,
      ease: "easeOut",
      onUpdate: (v) => { node.textContent = Math.round(v).toLocaleString(); },
    });
    return () => controls.stop();
  }, [value]);
  return <span ref={ref} className={className}>0</span>;
}
