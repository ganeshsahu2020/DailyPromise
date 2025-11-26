// src/utils/points.ts
import { supabase } from "@/lib/supabase";

/** Get current points balance (RPC → view fallback) */
export async function getPointsBalance(childUid: string): Promise<number> {
  try {
    const { data, error } = await supabase.rpc("child_portal_points_balance", { _child_uid: childUid });
    if (!error && typeof data === "number") return data ?? 0;
  } catch {}
  try {
    const { data } = await supabase
      .from("vw_child_points_balance")
      .select("points_balance")
      .eq("child_uid", childUid)
      .maybeSingle();
    return data?.points_balance ?? 0;
  } catch {
    return 0;
  }
}

/** Reserved points = sum of Accepted offers using effective cost (override > offer > catalog) */
export async function getReservedPoints(childUid: string, canonicalId?: string | null): Promise<number> {
  // 1) Try server RPC if you have it (best for RLS)
  try {
    const { data, error } = await supabase.rpc("api_child_reserved_points", { p_child_uid: childUid });
    if (!error && data != null) return Number(data) || 0;
  } catch {}

  // 2) Client fallback
  const childIds = canonicalId ? [childUid, canonicalId] : [childUid];
  const offerQ = await supabase
    .from("reward_offers")
    .select("reward_id, points_cost, points_cost_override")
    .in("child_uid", childIds)
    .eq("status", "Accepted");
  const offers = (offerQ.data || []) as {
    reward_id: string | null; points_cost: number | null; points_cost_override: number | null;
  }[];

  if (!offers.length) return 0;

  const needIds = Array.from(new Set(
    offers
      .filter(o => !Number.isFinite(o.points_cost as any) && !Number.isFinite(o.points_cost_override as any) && !!o.reward_id)
      .map(o => o.reward_id as string)
  ));

  let catalog: Record<string, number> = {};
  if (needIds.length) {
    const c = await supabase.from("rewards_catalog").select("id, points_cost").in("id", needIds);
    if (!c.error && c.data) catalog = Object.fromEntries(c.data.map((r: any) => [r.id, r.points_cost ?? 0]));
  }

  return offers.reduce((sum, o) => {
    const eff =
      (o.points_cost_override ?? undefined) ??
      (o.points_cost ?? undefined) ??
      (o.reward_id ? catalog[o.reward_id] ?? 0 : 0);
    return sum + (Number.isFinite(eff) ? Number(eff) : 0);
  }, 0);
}

/** Standard “available” */
export function availablePoints(balance: number, reserved: number) {
  return Math.max(0, (balance || 0) - (reserved || 0));
}
