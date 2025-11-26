import { useEffect, useState } from "react";
import { getChildByAnyKey } from "@/utils/childDb";

type Basics = { id: string; child_uid: string; first_name: string | null; nick_name: string | null };

export function useChildBasics(key: string | null | undefined) {
  const [data, setData] = useState<Basics | null>(null);
  const [loading, setLoading] = useState(!!key);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!key) { setData(null); setLoading(false); return; }
      setLoading(true);
      const { data } = await getChildByAnyKey(
        key,
        "id, child_uid, first_name, nick_name"
      );
      if (!alive) return;
      setData((data as Basics) ?? null);
      setLoading(false);
      // normalize to canonical id if you want:
      if (data && key !== (data as any).id) {
        try {
          sessionStorage.setItem("child_uid", (data as any).id);
          localStorage.setItem("child_portal_child_id", (data as any).id);
        } catch {}
      }
    })();
    return () => { alive = false; };
  }, [key]);

  return { data, loading };
}
