// src/hooks/useWallet.ts
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type WalletRow = {
  child_uid: string;
  total_points: number;
  reserved_points: number;
  available_points: number;
};

export function useWallet(familyId?: string | null) {
  const [rows, setRows] = useState<WalletRow[]>([]);
  const [loading, setLoading] = useState<boolean>(!!familyId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!familyId) { setRows([]); setLoading(false); return; }
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.rpc("api_family_wallet", { p_family: familyId });
      if (!alive) return;
      if (error) { setError(error.message); setRows([]); }
      else { setRows(Array.isArray(data) ? data as WalletRow[] : []); }
      setLoading(false);
    }
    load();
    return () => { alive = false; };
  }, [familyId]);

  const totals = useMemo(() => {
    const total_points = rows.reduce((s, r) => s + (r.total_points ?? 0), 0);
    const reserved_points = rows.reduce((s, r) => s + (r.reserved_points ?? 0), 0);
    const available_points = rows.reduce((s, r) => s + (r.available_points ?? 0), 0);
    return { total_points, reserved_points, available_points };
  }, [rows]);

  return { rows, totals, loading, error };
}
