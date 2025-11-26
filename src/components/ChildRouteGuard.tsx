"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

type Props = { children: React.ReactNode };

const LS_CHILD = "child_portal_child_id";

function safeGet(store: "local" | "session", key: string): string | null {
  try {
    return store === "local"
      ? window.localStorage.getItem(key)
      : window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(store: "local" | "session", key: string, value: string) {
  try {
    store === "local"
      ? window.localStorage.setItem(key, value)
      : window.sessionStorage.setItem(key, value);
  } catch {}
}

export default function ChildRouteGuard({ children }: Props) {
  const loc = useLocation();
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const ranOnce = useRef(false);

  const ssChild = typeof window !== "undefined" ? safeGet("session", "child_uid") : null;
  const lsChild = typeof window !== "undefined" ? safeGet("local", LS_CHILD) : null;

  // Repair session from local *before paint*
  useLayoutEffect(() => {
    if (!ssChild && lsChild) safeSet("session", "child_uid", lsChild);
  }, [ssChild, lsChild]);

  const effectiveChildId = ssChild || lsChild || null;

  const returnTo = useMemo(() => {
    const path = loc.pathname + (loc.search || "") + (loc.hash || "");
    return encodeURIComponent(path);
  }, [loc.pathname, loc.search, loc.hash]);

  useEffect(() => {
    if (ranOnce.current) return;
    ranOnce.current = true;

    if (!effectiveChildId) {
      setAllowed(false);
      setReady(true);
      return;
    }
    setAllowed(true);
    setReady(true);
  }, [effectiveChildId]);

  if (!ready) {
    return (
      <div className="min-h-[50vh] grid place-items-center text-sm text-white/70">
        Checking child session…
      </div>
    );
  }

  if (!allowed) return <Navigate to={`/child/login?returnTo=${returnTo}`} replace />;

  return <>{children}</>;
}
