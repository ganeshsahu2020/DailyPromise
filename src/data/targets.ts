// src/data/targets.ts
import { supabase } from "@/lib/supabase";

/**
 * Robust helpers to compute "completed target" points.
 * - Prefer RPCs when available (fast, accurate).
 * - Gracefully fall back to a heuristic over points_ledger (no objects in JSX).
 *
 * Exports:
 *  - sumCompletedForChild(childUid) -> number
 *  - sumCompletedForChildren(childUids) -> Array<{ child_uid, total }>
 *  - sumCompletedTotalsMap(childUids) -> Record<string, number>
 *
 * Back-compat:
 *  - sumCompletedTargets(childUids) -> number (kept for old code paths)
 */

type Row = { child_uid: string; total: number };

const TARGET_REASON_HINTS = [
  "target",
  "completed target",
  "mission",
  "quest",
  "goal",
];

const clean = (s: string) => (s || "").toLowerCase().replace(/[^0-9a-f-]/g, "");
const uniq = (xs: string[]) => Array.from(new Set(xs.map(clean))).filter(Boolean);

/* -------------------------- RPC paths (try in order) -------------------------- */

async function rpcMany(childUids: string[]): Promise<Row[] | null> {
  const ids = uniq(childUids);
  if (!ids.length) return [];

  // Try your primary RPC (adjust the name/param if your DB uses a different one)
  // Expected return: Array<{ child_uid, total }>
  const tries: Array<() => Promise<Row[] | null>> = [
    async () => {
      const { data, error } = await supabase.rpc("api_targets_completed_sum_many", {
        p_child_uids: ids,
      });
      if (error) throw error;
      if (!Array.isArray(data)) return null;
      return data as Row[];
    },
    // Secondary spelling (if you used a different function name on SQL):
    async () => {
      const { data, error } = await supabase.rpc("api_sum_completed_targets_many", {
        p_child_uids: ids,
      });
      if (error) throw error;
      if (!Array.isArray(data)) return null;
      return data as Row[];
    },
  ];

  for (const run of tries) {
    try {
      const out = await run();
      if (out && Array.isArray(out)) return out.map(normalizeRow);
    } catch (e: any) {
      // keep trying; we’ll log once below in the caller
    }
  }
  return null;
}

async function rpcOne(childUid: string): Promise<number | null> {
  const id = clean(childUid);
  if (!id) return 0;

  const tries: Array<() => Promise<number | null>> = [
    async () => {
      const { data, error } = await supabase.rpc("api_targets_completed_sum", {
        p_child_uid: id,
      });
      if (error) throw error;
      // Some RPCs return number directly; some return { total }
      if (typeof data === "number") return data;
      if (data && typeof (data as any).total === "number") return (data as any).total;
      return null;
    },
    async () => {
      const { data, error } = await supabase.rpc("api_sum_completed_targets", {
        p_child_uid: id,
      });
      if (error) throw error;
      if (typeof data === "number") return data;
      if (data && typeof (data as any).total === "number") return (data as any).total;
      return null;
    },
  ];

  for (const run of tries) {
    try {
      const n = await run();
      if (Number.isFinite(n)) return Number(n);
    } catch {
      // swallow; caller will fallback
    }
  }
  return null;
}

/* ----------------------------- Heuristic fallback ---------------------------- */
/** Sum positive deltas from points_ledger where reason hints “targets”. */
async function heuristicTotals(childUids: string[]): Promise<Record<string, number>> {
  const ids = uniq(childUids);
  if (!ids.length) return {};

  const { data, error } = await supabase
    .from("points_ledger")
    .select("child_uid, delta, reason")
    .in("child_uid", ids);

  if (error || !Array.isArray(data)) return Object.fromEntries(ids.map((id) => [id, 0]));

  const want = TARGET_REASON_HINTS.map((s) => s.toLowerCase());
  const acc: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));

  for (const r of data as any[]) {
    const id = clean(r.child_uid || "");
    const delta = Number(r.delta) || 0;
    if (delta <= 0 || !id) continue;
    const rs = String(r.reason || "").toLowerCase();
    if (want.some((needle) => rs.includes(needle))) {
      acc[id] = (acc[id] || 0) + delta;
    }
  }
  return acc;
}

/* ---------------------------------- Public ---------------------------------- */

export async function sumCompletedTotalsMap(childUids: string[]): Promise<Record<string, number>> {
  const ids = uniq(childUids);
  if (!ids.length) return {};

  // 1) Try a set-based RPC
  try {
    const rows = await rpcMany(ids);
    if (rows) {
      const map = Object.fromEntries(rows.map((r) => [clean(r.child_uid), Number(r.total) || 0]));
      // Ensure all requested children exist in the map
      for (const id of ids) if (!(id in map)) map[id] = 0;
      return map;
    }
  } catch (e: any) {
    console.warn("[sumCompletedTotalsMap] RPC-many error, falling back", e?.message || e);
  }

  // 2) Try per-child RPC (still accurate, just N calls)
  const map: Record<string, number> = {};
  let anyHit = false;
  for (const id of ids) {
    try {
      const n = await rpcOne(id);
      if (Number.isFinite(n)) {
        map[id] = Number(n);
        anyHit = true;
      }
    } catch {
      // ignore and fallback
    }
  }
  if (anyHit) {
    for (const id of ids) if (!(id in map)) map[id] = 0;
    return map;
  }

  // 3) Heuristic from points_ledger
  console.warn("[sumCompletedTotalsMap] RPC unavailable – using heuristic over points_ledger.");
  return heuristicTotals(ids);
}

export async function sumCompletedForChildren(childUids: string[]): Promise<Array<Row>> {
  const map = await sumCompletedTotalsMap(childUids);
  // Preserve caller input order
  return childUids.map((id) => ({ child_uid: clean(id), total: map[clean(id)] ?? 0 }));
}

export async function sumCompletedForChild(childUid: string): Promise<number> {
  const id = clean(childUid);
  if (!id) return 0;
  const map = await sumCompletedTotalsMap([id]);
  return map[id] ?? 0;
}

/* --------------------------- Back-compat convenience -------------------------- */
/** Kept for old code paths that expected a single total across many children. */
export async function sumCompletedTargets(childUids: string[] | string): Promise<number> {
  if (typeof childUids === "string") {
    return sumCompletedForChild(childUids);
  }
  const rows = await sumCompletedForChildren(childUids);
  return rows.reduce((s, r) => s + (r.total || 0), 0);
}

/* --------------------------------- Utilities -------------------------------- */
function normalizeRow(r: any): Row {
  const child_uid = clean(r?.child_uid || r?.child || "");
  const total = Number(r?.total) || 0;
  return { child_uid, total };
}
