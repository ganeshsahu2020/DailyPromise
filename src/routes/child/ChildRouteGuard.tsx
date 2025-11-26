"use client";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { LS_CHILD, LS_FAMILY, findFamilyForChild } from "@/utils/childAuth";

type Props = { children: React.ReactNode };

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
function dumpStorage(store: "local" | "session") {
  try {
    const s = store === "local" ? window.localStorage : window.sessionStorage;
    const obj: Record<string, string> = {};
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i)!;
      obj[k] = s.getItem(k) ?? "";
    }
    return JSON.stringify(obj);
  } catch {
    return "{}";
  }
}

/** Resolve whatever key we have (id or child_uid) to canonical child id via RPC and cache it */
async function resolveCanonicalChildId(
  rawKey: string
): Promise<{ id: string; family_id: string | null } | null> {
  try {
    const { data, error } = await supabase.rpc("api_child_lookup", { p_key: rawKey });
    if (error) {
      console.error("[ChildRouteGuard] api_child_lookup failed:", error);
      return null;
    }
    if (!data || (Array.isArray(data) && !data[0])) return null;

    // PostgREST may return a single row or an array depending on definition; normalize
    const row = Array.isArray(data) ? data[0] : data;
    return { id: row.id as string, family_id: (row.family_id as string) ?? null };
  } catch (e) {
    console.error("[ChildRouteGuard] api_child_lookup exception:", e);
    return null;
  }
}

export default function ChildRouteGuard({ children }: Props) {
  const loc = useLocation();
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const ranOnce = useRef(false);

  // 1) Read both stores once
  const ssChild = typeof window !== "undefined" ? safeGet("session", "child_uid") : null;
  const lsChild = typeof window !== "undefined" ? safeGet("local", LS_CHILD) : null;

  // Debug snapshot
  if (typeof window !== "undefined") {
    // eslint-disable-next-line no-console
    console.log("🔍 ChildRouteGuard checking sessions:", {
      sessionStorage: ssChild,
      localStorage: lsChild,
      fullSessionStorage: dumpStorage("session"),
      fullLocalStorage: dumpStorage("local"),
    });
  }

  // 2) Before paint, repair missing session from local so subsequent reads see it
  useLayoutEffect(() => {
    if (!ssChild && lsChild) safeSet("session", "child_uid", lsChild);
  }, [ssChild, lsChild]);

  const effectiveChildKey = ssChild || lsChild || null;

  const returnTo = useMemo(() => {
    const path = loc.pathname + (loc.search || "") + (loc.hash || "");
    return encodeURIComponent(path);
  }, [loc.pathname, loc.search, loc.hash]);

  useEffect(() => {
    if (ranOnce.current) return;
    ranOnce.current = true;

    let cancelled = false;
    (async () => {
      if (!effectiveChildKey) {
        if (!cancelled) {
          setAllowed(false);
          setReady(true);
        }
        return;
      }

      // Resolve to canonical ID and normalize storage
      const canonical = await resolveCanonicalChildId(effectiveChildKey);
      if (!canonical) {
        if (!cancelled) {
          setAllowed(false);
          setReady(true);
        }
        return;
      }

      // Normalize both stores to id
      safeSet("session", "child_uid", canonical.id);
      safeSet("local", LS_CHILD, canonical.id);

      // Ensure we have a family id in localStorage (non-blocking inference)
      let familyId = safeGet("local", LS_FAMILY);
      if (!familyId) {
        try {
          const inferred = (await findFamilyForChild(canonical.id)) || canonical.family_id;
          if (inferred) {
            familyId = inferred;
            safeSet("local", LS_FAMILY, inferred);
            // eslint-disable-next-line no-console
            console.log("[ChildRouteGuard] inferred family and cached", { familyId });
          }
        } catch (e: any) {
          // eslint-disable-next-line no-console
          console.log("[ChildRouteGuard] could not infer family (non-blocking)", e?.message || e);
        }
      }

      // Optional: verify family pairing via RPC if you have it (non-blocking)
      if (familyId) {
        try {
          const { data, error } = await supabase.rpc("api_child_family_v1", { child_id: canonical.id });
          if (!error) {
            const realFam = (data as any)?.[0]?.family_id ?? null;
            if (realFam && realFam !== familyId) {
              safeSet("local", LS_FAMILY, realFam);
              // eslint-disable-next-line no-console
              console.log("[ChildRouteGuard] corrected mismatched family", { realFam });
            }
          }
        } catch {}
      }

      if (!cancelled) {
        setAllowed(true);
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [effectiveChildKey]);

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
