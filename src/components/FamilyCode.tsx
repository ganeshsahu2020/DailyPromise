"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { tpromise } from "@/utils/toastx";

type Props = {
  title?: string;               // optional heading
  showQr?: boolean;             // show QR preview
  className?: string;
};

export default function FamilyCode({ title = "Family Code", showQr = true, className = "" }: Props) {
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [code, setCode] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const origin = useMemo(() => (typeof window !== "undefined" ? window.location.origin : ""), []);
  const sampleUrl = useMemo(() => {
    if (!familyId) return "";
    // The child login supports UUID (fid) and also manual Code entry.
    // We keep URL using fid for reliability; code is for human entry.
    return `${origin}/child/login?fid=${familyId}`;
  }, [origin, familyId]);

  const qrUrl = useMemo(() => {
    if (!sampleUrl) return "";
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(sampleUrl)}`;
  }, [sampleUrl]);

  useEffect(() => {
    (async () => {
      try {
        // who am I → family
        const { data: me, error } = await supabase.rpc("my_profile");
        if (error) throw error;

        const fid = (Array.isArray(me) ? me[0]?.family_id : (me as any)?.family_id) ?? null;
        setFamilyId(fid);

        if (!fid) return;

        // get-or-create code
        const { data, error: gerr } = await supabase.rpc("api_family_code_get", { p_family_id: fid });
        if (gerr) throw gerr;
        setCode((data as string) || "");
      } catch (e: any) {
        console.error("[FamilyCode] init error:", e?.message || e);
      }
    })();
  }, []);

  async function copy(text: string, label = "Copied!") {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      toast.error("Could not copy.");
    }
  }

  async function regen() {
    if (!familyId) return;
    if (!confirm("Regenerate your Family Code? Old cards with the old code will no longer work for manual entry.")) {
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await tpromise(
        supabase.rpc("api_family_regen_code", { p_family_id: familyId }),
        { loading: "Generating a new code…", success: "New code created.", error: "Could not regenerate code." }
      );
      if (error) throw error;
      setCode((data as string) || "");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`glass rounded-2xl p-4 ${className}`}>
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="font-semibold mb-1">{title}</div>
          {!familyId ? (
            <div className="text-sm text-white/70">No family linked to your profile.</div>
          ) : (
            <>
              <div className="text-sm text-white/70 mb-2">
                Share this short code with your kids for manual entry on the Child Login. QR cards still use the link below.
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-lg tracking-widest">
                  {code || "— — — — — —"}
                </div>
                <button
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20"
                  onClick={() => copy(code, "Code copied")}
                  disabled={!code}
                >
                  Copy Code
                </button>

                <div className="ml-auto" />

                <button
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20"
                  onClick={() => copy(sampleUrl, "Link copied")}
                  disabled={!sampleUrl}
                  title="Copy the child login link (uses family UUID)"
                >
                  Copy Link
                </button>

                <button
                  className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60"
                  onClick={regen}
                  disabled={!familyId || busy}
                >
                  {busy ? "Rotating…" : "Regenerate Code"}
                </button>
              </div>
            </>
          )}
        </div>

        {showQr && sampleUrl && (
          <img
            src={qrUrl}
            alt="Family QR"
            className="rounded bg-white p-2 w-[120px] h-[120px] shrink-0"
          />
        )}
      </div>

      {sampleUrl && (
        <div className="mt-3 text-[11px] opacity-70 break-all">
          {sampleUrl}
        </div>
      )}
    </div>
  );
}
