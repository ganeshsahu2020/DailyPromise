import { useEffect, useRef } from "react";

export function useRafLoop(enabled: boolean, tick: () => void) {
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    let stopped = false;
    const loop = () => {
      if (stopped) return;
      if (enabled) tick();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [enabled, tick]); // ensure `tick` is stable (wrap with useCallback in caller)
}
