/**
 * Promise helpers for Sonner with sounds.
 * - Wrap any promise with tpromise() for loading/success/error toasts.
 * - Auto-plays appropriate sounds via notify.*.
 */

import { toast } from "sonner";
import { notify } from "./notify";

type Msg<T> = string | ((value: T) => string);

/** Options matching sonner's toast.promise */
type PromiseMessages<T> = {
  loading?: string;
  success?: Msg<T>;
  error?: Msg<any>;
};

type PromiseOptions = {
  /** Override default toast duration (ms). */
  duration?: number;
  /** Additional props forwarded to Sonner (optional). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props?: Record<string, any>;
};

/**
 * Wrap a promise with loading/success/error toasts and notification sounds.
 * Usage:
 *   await tpromise(apiCall(), {
 *     loading: "Saving…",
 *     success: (res) => `Saved (${res.id})`,
 *     error: (e) => e.message ?? "Failed to save",
 *   });
 */
export async function tpromise<T>(
  p: Promise<T>,
  messages: PromiseMessages<T>,
  options?: PromiseOptions
): Promise<T> {
  const duration = options?.duration ?? 3500;

  const successMsg = (v: T) =>
    typeof messages.success === "function" ? (messages.success as (vv: T) => string)(v) :
    typeof messages.success === "string" ? messages.success :
    "Done!";

  const errorMsg = (e: any) =>
    typeof messages.error === "function" ? (messages.error as (ee: any) => string)(e) :
    typeof messages.error === "string" ? messages.error :
    (e?.message ?? e?.error_description ?? e?.hint ?? "Something went wrong");

  const result = await toast.promise<T>(
    p,
    {
      loading: messages.loading ?? "Working…",
      success: (v) => {
        // sound
        notify.success("Success!");
        return successMsg(v);
      },
      error: (e) => {
        notify.error(e);
        return errorMsg(e);
      },
    },
    { duration, ...options?.props }
  );

  return result;
}

/* --------------------------------------------------------------- */
/* Convenience wrappers                                             */
/* --------------------------------------------------------------- */

export const ok = (message: string, description?: string, opts?: Parameters<typeof toast.success>[1]) => {
  toast.success(message, { description, ...opts });
  notify.success(message);
};

export const info = (message: string, description?: string, opts?: Parameters<typeof toast.info>[1]) => {
  toast.info(message, { description, ...opts });
  notify.info(message);
};

export const warn = (message: string, description?: string, opts?: Parameters<typeof toast.warning>[1]) => {
  toast.warning(message, { description, ...opts });
  notify.warn(message);
};

export const err = (e: unknown, title = "Error", opts?: Parameters<typeof toast.error>[1]) => {
  const desc =
    (e as any)?.message ??
    (e as any)?.error_description ??
    (e as any)?.hint ??
    "Something went wrong";
  toast.error(title, { description: desc, ...opts });
  notify.error(e, title);
};
