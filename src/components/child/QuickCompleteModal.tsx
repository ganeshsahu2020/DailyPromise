import React, { useState } from "react";

/**
 * RLS-safe quick-complete modal:
 * - No direct inserts to target_evidence (blocked by RLS).
 * - Builds a checklist evidence object and calls onComplete(evidence).
 * - TargetDetail will pass this to api_child_complete_target RPC.
 *
 * Updated: uses a responsive card + grid layout that matches the other modals:
 * - Stacked single-column on small screens
 * - Two-column layout on md+ where main content spans 2/3 and an aside spans 1/3
 * - Aside is sticky on md+ and the entire card is scrollable on small screens so all content is reachable
 * - Backdrop sits under the card and card uses high z-index so it appears above other UI chrome
 */

type Props = {
  target: { id: string; title: string; category?: string };
  childName: string;
  onComplete: (evidence?: {
    id: string;
    type: "checklist";
    data: string[]; // TargetDetail will stringify if needed
    description?: string;
  }) => void;
  onCancel: () => void;
};

type CompletionStatus = {
  completed: boolean;
  effort: string;
  challenges: string[];
  learned: string;
};

export default function QuickCompleteModal({
  target,
  childName,
  onComplete,
  onCancel,
}: Props) {
  const [completionStatus, setCompletionStatus] = useState<CompletionStatus>({
    completed: true,
    effort: "",
    challenges: [],
    learned: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const effortOptions = [
    { value: "easy", label: "😊 Easy peasy!", description: "No problem at all!" },
    { value: "medium", label: "😅 A bit challenging", description: "Had to think a little" },
    { value: "hard", label: "💪 Pretty tough", description: "Really had to work hard" },
    { value: "super_hard", label: "🔥 Super challenging", description: "Pushed my limits!" },
  ];

  const challengeOptions = [
    { value: "focus", label: "Staying focused" },
    { value: "understanding", label: "Understanding what to do" },
    { value: "time", label: "Running out of time" },
    { value: "tools", label: "Missing tools/materials" },
    { value: "distractions", label: "Too many distractions" },
    { value: "energy", label: "Low energy" },
    { value: "none", label: "No challenges!" },
  ];

  const learnedOptions = [
    { value: "new_skill", label: "Learned a new skill" },
    { value: "better_faster", label: "Got better/faster at something" },
    { value: "problem_solving", label: "Improved problem-solving" },
    { value: "patience", label: "Practiced patience" },
    { value: "creativity", label: "Used my creativity" },
    { value: "teamwork", label: "Worked well with others" },
    { value: "nothing_new", label: "Nothing new this time" },
  ];

  const isFormValid = completionStatus.effort && completionStatus.learned;

  const toggleChallenge = (challengeValue: string) => {
    setCompletionStatus((prev) => {
      if (challengeValue === "none") {
        return { ...prev, challenges: ["none"] };
      }
      const next = prev.challenges.includes(challengeValue)
        ? prev.challenges.filter((c) => c !== challengeValue)
        : [...prev.challenges.filter((c) => c !== "none"), challengeValue];
      return { ...prev, challenges: next };
    });
  };

  async function handleSubmit() {
    if (!isFormValid || !completionStatus.completed) return;
    setSubmitting(true);
    try {
      const effortLabel =
        effortOptions.find((o) => o.value === completionStatus.effort)?.label ||
        "Not specified";
      const learnedLabel =
        learnedOptions.find((o) => o.value === completionStatus.learned)?.label ||
        "Not specified";
      const challengesLabel = completionStatus.challenges.length
        ? completionStatus.challenges
            .map((c) => challengeOptions.find((o) => o.value === c)?.label || c)
            .join(", ")
        : "None";

      onComplete({
        id: String(Date.now()),
        type: "checklist",
        data: [
          "Completed: Yes",
          `Effort Level: ${effortLabel}`,
          `Challenges: ${challengesLabel}`,
          `Learned: ${learnedLabel}`,
        ],
        description: "Quick completion checklist",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center p-4">
      {/* Backdrop below card */}
      <div className="absolute inset-0 bg-black/50 z-[9990]" onClick={onCancel} />

      {/* Centered card */}
      <div className="relative z-[9995] w-full max-w-3xl rounded-2xl shadow-2xl overflow-y-auto max-h-[92vh] bg-slate-900/95">
        {/* use grid so we can add an aside that stacks on mobile */}
        <div className="grid grid-cols-1 md:grid-cols-3">
          {/* Main content (spans 2 columns on md+) */}
          <div className="md:col-span-2">
            {/* Header */}
            <div className="p-6 border-b border-white/10">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-2xl font-bold text-white">🎉 Quick Complete: {target.title}</h2>
                  <p className="text-white/70 mt-1">Tell us a bit about how it went, {childName}!</p>
                </div>
                <div className="flex-shrink-0">
                  <button
                    onClick={onCancel}
                    className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition"
                    disabled={submitting}
                    aria-label="Close quick complete"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Effort */}
              <div className="space-y-3">
                <label className="block text-white font-semibold">💪 How much effort did this take?</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {effortOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setCompletionStatus((p) => ({ ...p, effort: option.value }))}
                      className={`p-3 rounded-xl text-left transition-all ${
                        completionStatus.effort === option.value
                          ? "bg-indigo-500/20 border-2 border-indigo-400"
                          : "bg-white/10 border border-white/20 hover:bg-white/15"
                      } ${submitting ? "opacity-50 cursor-not-allowed" : ""}`}
                      disabled={submitting}
                    >
                      <div className="font-semibold text-white">{option.label}</div>
                      <div className="text-white/70 text-sm">{option.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Challenges */}
              <div className="space-y-3">
                <label className="block text-white font-semibold">🚧 Any challenges you faced?</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {challengeOptions.map((option) => (
                    <label
                      key={option.value}
                      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                        completionStatus.challenges.includes(option.value)
                          ? "bg-green-500/20 border-2 border-green-400"
                          : "bg-white/10 border border-white/20 hover:bg-white/15"
                      } ${submitting ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={completionStatus.challenges.includes(option.value)}
                        onChange={() => !submitting && toggleChallenge(option.value)}
                        className="w-4 h-4 text-green-400 bg-white/20 border-white/30 rounded focus:ring-green-400"
                        disabled={submitting}
                      />
                      <span className="text-white flex-1">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Learned */}
              <div className="space-y-3">
                <label className="block text-white font-semibold">🧠 What did you learn or practice?</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {learnedOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => !submitting && setCompletionStatus((p) => ({ ...p, learned: option.value }))}
                      className={`p-3 rounded-xl text-left transition-all ${
                        completionStatus.learned === option.value
                          ? "bg-blue-500/20 border-2 border-blue-400"
                          : "bg-white/10 border border-white/20 hover:bg-white/15"
                      } ${submitting ? "opacity-50 cursor-not-allowed" : ""}`}
                      disabled={submitting}
                    >
                      <div className="font-semibold text-white">{option.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Confirmation */}
              <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={completionStatus.completed}
                    onChange={(e) => !submitting && setCompletionStatus((p) => ({ ...p, completed: e.target.checked }))}
                    className="w-5 h-5 text-green-400 bg-white/20 border-white/30 rounded focus:ring-green-400"
                    disabled={submitting}
                  />
                  <span className="text-white font-semibold">✅ I confirm I completed "{target.title}" to the best of my ability!</span>
                </label>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-white/10 flex gap-3">
              <button
                onClick={onCancel}
                disabled={submitting}
                className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white font-semibold transition-all flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!isFormValid || !completionStatus.completed || submitting}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 disabled:opacity-40 text-white font-bold transition-all transform hover:scale-105 flex-1 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    Saving...
                  </>
                ) : (
                  <>🎉 Complete Mission!</>
                )}
              </button>
            </div>
          </div>

          {/* Aside: tips + quick actions. Sticky on md+, stacked below on mobile */}
          <aside className="p-6 bg-slate-900/95 md:sticky md:top-6 md:max-h-[80vh] md:overflow-y-auto border-t md:border-t-0">
            <div className="flex flex-col h-full">
              <div className="mb-4">
                <h4 className="text-lg font-bold text-white">Adventure Guide</h4>
                <p className="text-white/70 text-sm mt-2">Quick tips to help complete the task: short steps, celebrate small wins, and be proud of effort.</p>
              </div>

              <div className="mb-4">
                <h5 className="font-semibold text-white mb-2">Quick Options</h5>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setCompletionStatus((p) => ({ ...p, effort: "easy" }))}
                    className="w-full px-4 py-2 rounded-lg bg-indigo-600/20 text-white text-sm"
                  >
                    Mark Effort Easy
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompletionStatus((p) => ({ ...p, effort: "medium" }))}
                    className="w-full px-4 py-2 rounded-lg bg-yellow-600/10 text-white text-sm"
                  >
                    Mark Effort Medium
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompletionStatus((p) => ({ ...p, learned: "new_skill" }))}
                    className="w-full px-4 py-2 rounded-lg bg-blue-600/20 text-white text-sm"
                  >
                    Pick "Learned a new skill"
                  </button>
                </div>
              </div>

              <div className="mt-auto">
                <button
                  onClick={handleSubmit}
                  disabled={!isFormValid || !completionStatus.completed || submitting}
                  className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold"
                >
                  {submitting ? "Saving..." : "Complete Now"}
                </button>
                <button onClick={onCancel} className="w-full mt-3 px-4 py-3 rounded-xl bg-white/10 text-white">Close</button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}