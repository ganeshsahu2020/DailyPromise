// src/utils/supaSafe.ts
export async function safeSingle<T>(
  q: PromiseLike<{ data: T | null; error: any }>
): Promise<{ data: T | null; error: any | null }> {
  try {
    const { data, error } = await q;
    // Treat 406 (“not a single row”) as a soft empty, not a hard error
    if (error && (error.code === "406" || error.status === 406)) {
      return { data: null, error: null };
    }
    return { data: (data as T) ?? null, error: error ?? null };
  } catch (e: any) {
    if (e?.code === "406" || e?.status === 406) {
      return { data: null, error: null };
    }
    return { data: null, error: e };
  }
}
