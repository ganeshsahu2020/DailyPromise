/**
 * toast.promise helper with sounds.
 * Usage:
 *   await tpromise(apiCall(), {
 *     loading: "Saving…",
 *     success: "Saved!",
 *     error:   "Save failed",
 *   });
 *
 * Or pass a thunk:
 *   await tpromise(() => apiCall(), msgs);
 */

import { toast } from "sonner";
import { play } from "./notify";

type Msgs = {
  loading?: string;
  success?: string;
  error?: string;
};

type Options = {
  /** Suppress success/error sounds (toast still shows). */
  silent?: boolean;
};

function errToString(e: unknown) {
  if (!e) return "Something went wrong.";
  if (typeof e === "string") return e;
  const any = e as any;
  return any?.message || any?.error_description || any?.hint || "Something went wrong.";
}

export async function tpromise<T>(
  p: Promise<T> | (() => Promise<T>),
  msgs: Msgs = {},
  opts: Options = {}
): Promise<T> {
  const run = typeof p === "function" ? (p as () => Promise<T>)() : p;

  // Show toast bound to the promise
  const out = toast.promise(run, {
    loading: msgs.loading ?? "Working…",
    success: msgs.success ?? "Done!",
    error:   (e) => msgs.error ?? errToString(e),
  });

  // Fire sounds on settle
  run.then(() => { if (!opts.silent) void play("success"); })
     .catch(() => { if (!opts.silent) void play("error"); });

  // Wait for the original promise
  return out;
}

export default tpromise;
