import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { fetchChildBrief } from "@/utils/childAuth";

/** Minimal RPC row from api_child_completed_min */
type Row = {
  id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  difficulty: string | null;
  points_award: number | null;
  target_created: string;
  child_uid: string | null;

  points: number | null;
  reason: string | null;
  completion_type: "full_evidence" | "completed" | "quick_complete" | null;
  evidence_count: number | null;
  completed_at: string | null;
  latest_evidence_date: string | null;
};

type CompletedTarget = {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  points_award: number;
  points: number;
  reason: string;
  completion_type: "full_evidence" | "quick_complete" | "completed";
  evidence_count: number;
  total_evidence: number;
  completed_at: string;
  target_created: string;
  latest_evidence_date?: string;
  child_uid?: string | null;
};

type CompletionDetail = {
  target_id: string;
  completion_type: "full_evidence" | "quick_complete" | "completed";
  note: string | null;
  completed_at: string | null;
  points_award: number | null;
  evidence: Array<{
    id: string;
    type: "photo" | "video" | "audio" | "text" | "checklist";
    data: any;
    description?: string | null;
    created_at?: string | null;
  }>;
  events: Array<{ id: string; type: string; note: string | null; created_at: string }>;
};

export default function CompletedTargets() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "with_evidence" | "quick_complete">("all");

  // viewer modal
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerErr, setViewerErr] = useState<string | null>(null);
  const [viewer, setViewer] = useState<CompletionDetail | null>(null);
  const [resolvedChildUid, setResolvedChildUid] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        const childKey =
          sessionStorage.getItem("child_uid") ||
          localStorage.getItem("child_portal_child_id");

        if (!childKey) {
          setRows([]);
          return;
        }

        const brief = await fetchChildBrief(childKey);
        const childUid =
          (brief as any)?.child_uid ||
          (brief as any)?.legacy_uid ||
          childKey;
        setResolvedChildUid(childUid);

        const { data, error } = await supabase.rpc("api_child_completed_min", {
          p_child_uid: childUid,
        });
        if (error) throw error;

        setRows((data || []) as Row[]);
      } catch (e) {
        console.error("[CompletedTargets] RPC load error:", e);
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const completedTargets: CompletedTarget[] = useMemo(() => {
    return (rows || []).map((r) => {
      const evidenceCount = r.evidence_count ?? 0;
      const type =
        (r.completion_type as CompletedTarget["completion_type"]) ||
        (evidenceCount > 0 ? "full_evidence" : "completed");

      return {
        id: r.id,
        title: r.title || "Completed Mission",
        description: r.description || "Mission completed successfully",
        category: r.category || "General",
        difficulty: r.difficulty || "Easy",
        points_award: r.points_award || 0,
        points: r.points ?? r.points_award ?? 0,
        reason: r.reason || "Target completed",
        completion_type: type,
        evidence_count: evidenceCount,
        total_evidence: evidenceCount,
        completed_at: r.completed_at || r.target_created,
        target_created: r.target_created,
        latest_evidence_date: r.latest_evidence_date || undefined,
        child_uid: r.child_uid,
      };
    });
  }, [rows]);

  const totals = useMemo(() => {
    const totalCompletions = completedTargets.length;
    const totalPoints = completedTargets.reduce((s, t) => s + (t.points ?? 0), 0);
    const withEvidenceCount = completedTargets.filter((t) => (t.total_evidence || 0) > 0).length;
    const quickCount = completedTargets.filter((t) => t.completion_type === "quick_complete").length;
    return { totalCompletions, totalPoints, withEvidenceCount, quickCount };
  }, [completedTargets]);

  const filteredTargets = useMemo(() => {
    if (filter === "with_evidence") {
      return completedTargets.filter((t) => (t.total_evidence || 0) > 0);
    }
    if (filter === "quick_complete") {
      return completedTargets.filter((t) => t.completion_type === "quick_complete");
    }
    return completedTargets;
  }, [completedTargets, filter]);

  const getCompletionBadge = (t: CompletedTarget) => {
    if (t.completion_type === "quick_complete") {
      return { label: "Quick Complete", color: "bg-green-500/20 text-green-400", icon: "⚡" };
    }
    if ((t.total_evidence || t.evidence_count) > 0) {
      return { label: "With Evidence", color: "bg-purple-500/20 text-purple-400", icon: "📸" };
    }
    return { label: "Completed", color: "bg-blue-500/20 text-blue-400", icon: "✅" };
  };

  const getEvidenceText = (t: CompletedTarget) => {
    const n = t.total_evidence || t.evidence_count || 0;
    if (n === 0) return "No evidence submitted";
    if (n === 1) return "1 evidence item";
    return `${n} evidence items`;
  };

  async function openViewer(t: CompletedTarget) {
    if (!resolvedChildUid) return;
    try {
      setViewerErr(null);
      setViewerLoading(true);
      setViewerOpen(true);

      const { data, error } = await supabase.rpc("api_child_completion_detail", {
        p_child_uid: resolvedChildUid,
        p_target_id: t.id,
      });
      if (error) throw error;

      setViewer(data as CompletionDetail);
    } catch (e: any) {
      console.error("[CompletedTargets] detail error:", e);
      setViewerErr(e?.message || "Could not load details. Please try again.");
      setViewer(null);
    } finally {
      setViewerLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="rounded-2xl p-6 bg-slate-900/95 border border-white/10">
          <div className="text-white/70 text-center py-8">Loading your completed missions...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
      <div className="mb-4">
        <Link to="/child" className="text-emerald-400 hover:text-emerald-300">
          ← Back to Dashboard
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main list (spans 3 cols) */}
        <main className="lg:col-span-3 space-y-4">
          <div className="rounded-2xl p-4 bg-slate-900/95 border border-white/10">
            {/* Header + Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h1 className="text-2xl font-bold">🏆 Completed Missions</h1>
                <p className="text-white/70 mt-1">
                  Celebrate your achievements! You've completed {totals.totalCompletions} missions.
                </p>
              </div>

              {/* Filters: use compact variants on small screens */}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setFilter("all")}
                  className={`text-xs sm:text-sm px-3 py-1 rounded-md transition-all ${filter === "all" ? "bg-white/20 text-white" : "bg-white/10 text-white/70 hover:bg-white/15"}`}
                  aria-pressed={filter === "all"}
                >
                  <span className="block text-[11px] leading-none">All</span>
                  <span className="block text-[11px] text-white/60">({completedTargets.length})</span>
                </button>

                <button
                  onClick={() => setFilter("with_evidence")}
                  className={`text-xs sm:text-sm px-3 py-1 rounded-md transition-all ${filter === "with_evidence" ? "bg-purple-500/20 text-purple-400" : "bg-white/10 text-white/70 hover:bg-white/15"}`}
                  aria-pressed={filter === "with_evidence"}
                >
                  <span className="block text-[11px] leading-none">With</span>
                  <span className="block text-[11px] leading-none">Evidence</span>
                  <span className="block text-[11px] text-white/60">({totals.withEvidenceCount})</span>
                </button>

                <button
                  onClick={() => setFilter("quick_complete")}
                  className={`text-xs sm:text-sm px-3 py-1 rounded-md transition-all ${filter === "quick_complete" ? "bg-green-500/20 text-green-400" : "bg-white/10 text-white/70 hover:bg-white/15"}`}
                  aria-pressed={filter === "quick_complete"}
                >
                  <span className="block text-[11px] leading-none">Quick</span>
                  <span className="block text-[11px] leading-none">Complete</span>
                  <span className="block text-[11px] text-white/60">({totals.quickCount})</span>
                </button>
              </div>
            </div>

            {/* Summary chips */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="rounded-xl p-3 bg-slate-800/40 text-center border border-white/10">
                <div className="text-white/60 text-xs">Total Missions</div>
                <div className="mt-1 text-2xl font-bold">{totals.totalCompletions}</div>
              </div>
              <div className="rounded-xl p-3 bg-slate-800/40 text-center border border-white/10">
                <div className="text-white/60 text-xs">With Evidence</div>
                <div className="mt-1 text-2xl font-bold text-purple-200">{totals.withEvidenceCount}</div>
              </div>
              <div className="rounded-xl p-3 bg-slate-800/40 text-center border border-white/10">
                <div className="text-white/60 text-xs">Quick Complete</div>
                <div className="mt-1 text-2xl font-bold text-green-200">{totals.quickCount}</div>
              </div>
              <div className="rounded-xl p-3 bg-slate-800/40 text-center border border-white/10">
                <div className="text-white/60 text-xs">Total Points</div>
                <div className="mt-1 text-2xl font-bold text-emerald-200">+{totals.totalPoints}<span className="text-white/50 text-xs align-middle"> pts</span></div>
              </div>
            </div>

            {filteredTargets.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-6xl mb-4">🎯</div>
                <h3 className="text-xl font-semibold text-white mb-2">No completed missions yet!</h3>
                <p className="text-white/70">Complete your first mission to see it here!</p>
                <Link to="/child" className="inline-block mt-4 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl">
                  Start a Mission
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredTargets.map((t) => {
                  const badge = getCompletionBadge(t);
                  return (
                    <article key={t.id} className="rounded-xl p-4 bg-slate-800/50 border border-white/10">
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                            <h3 className="text-lg font-semibold text-white">{t.title}</h3>
                            <div className="flex gap-2 self-start items-center">
                              <span className={`px-2 py-1 rounded text-sm ${badge.color}`}>{badge.icon} {badge.label}</span>
                              <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-sm">+{t.points || t.points_award} pts</span>
                            </div>
                          </div>

                          <p className="text-white/80 mb-3">{t.description}</p>

                          <div className="flex flex-wrap gap-3 text-sm text-white/60">
                            <span>{t.category} · {t.difficulty || "Easy"}</span>
                            <span>🎯 {getEvidenceText(t)}</span>
                            <span>📅 Completed {new Date(t.completed_at).toLocaleDateString()}</span>
                            {t.latest_evidence_date && <span>🕓 Last evidence {new Date(t.latest_evidence_date).toLocaleString()}</span>}
                          </div>
                        </div>

                        <div className="flex justify-center lg:justify-end items-start">
                          <button onClick={() => openViewer(t)} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white">View Details</button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </main>

        {/* Aside: quick stats & viewer info */}
        <aside className="rounded-2xl p-4 bg-slate-900/95 border border-white/10 md:sticky md:top-6 h-fit">
          <div className="space-y-4">
            <div>
              <h4 className="text-lg font-bold text-white">Overview</h4>
              <p className="text-white/70 text-sm mt-1">Review completed missions, evidence, and timeline events.</p>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-white/60">Total Completions</div>
              <div className="text-2xl font-bold">{totals.totalCompletions}</div>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-white/60">Total Points</div>
              <div className="text-2xl font-bold text-emerald-200">+{totals.totalPoints}</div>
            </div>

            <div className="pt-2 border-t border-white/5">
              <div className="text-xs text-white/60">Filter Tip</div>
              <div className="text-sm text-white/80 mt-1">Use filters to show evidence-backed completions or quick completes only.</div>
            </div>
          </div>
        </aside>
      </div>

      {/* Viewer Modal */}
      {viewerOpen && (
        <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="w-full max-w-3xl bg-slate-900 rounded-2xl border border-white/15 overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-xl font-bold">Completion Details</h2>
              <button className="px-3 py-1 rounded bg-white/10 hover:bg-white/20" onClick={() => { setViewerOpen(false); setViewer(null); setViewerErr(null); }}>
                Close
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {viewerLoading && <div className="text-white/70">Loading details…</div>}
              {viewerErr && <div className="text-red-400">{viewerErr}</div>}

              {viewer && (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="px-2 py-1 rounded bg-blue-500/20 text-blue-300 text-sm">
                      {viewer.completion_type === "quick_complete" ? "Quick Complete" : viewer.completion_type === "full_evidence" ? "With Evidence" : "Completed"}
                    </span>
                    {viewer.points_award != null && <span className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 text-sm">+{viewer.points_award} pts</span>}
                    {viewer.completed_at && <span className="text-white/60 text-sm">Completed {new Date(viewer.completed_at).toLocaleString()}</span>}
                  </div>

                  {viewer.note && (
                    <div className="text-white/80">
                      <span className="text-white/50">Note: </span>
                      {viewer.note}
                    </div>
                  )}

                  <div>
                    <h3 className="font-semibold mb-2">Evidence</h3>
                    {viewer.evidence.length === 0 ? (
                      <div className="text-white/60">No evidence submitted.</div>
                    ) : (
                      <div className="space-y-2">
                        {viewer.evidence.map((ev) => (
                          <div key={ev.id} className="p-3 rounded bg-white/5 border border-white/10">
                            <div className="text-sm text-white/70 mb-1">
                              {ev.type.toUpperCase()} {ev.created_at ? `· ${new Date(ev.created_at).toLocaleString()}` : ""}
                            </div>
                            {ev.type === "text" && <div className="whitespace-pre-wrap">{String(ev.data ?? "")}</div>}
                            {ev.type === "checklist" && Array.isArray(ev.data) && (
                              <ul className="list-disc pl-5 space-y-1">{ev.data.map((line: any, i: number) => <li key={i}>{String(line)}</li>)}</ul>
                            )}
                            {(ev.type === "photo" || ev.type === "video" || ev.type === "audio") && (
                              <a className="text-emerald-400 underline" href={typeof ev.data === "string" ? ev.data : "#"} target="_blank" rel="noreferrer">
                                Open {ev.type}
                              </a>
                            )}
                            {ev.description && <div className="text-white/60 text-sm mt-1">{ev.description}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Timeline</h3>
                    {viewer.events.length === 0 ? (
                      <div className="text-white/60">No timeline events.</div>
                    ) : (
                      <div className="space-y-2">
                        {viewer.events.map((e) => (
                          <div key={e.id} className="p-3 rounded bg-white/5 border border-white/10">
                            <div className="text-white/80">
                              <span className="font-semibold">{e.type}</span>{" "}
                              <span className="text-white/50">· {new Date(e.created_at).toLocaleString()}</span>
                            </div>
                            {e.note && <div className="text-white/70">{e.note}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}