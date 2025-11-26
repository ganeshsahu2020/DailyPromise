// src/utils/childDb.ts
import { supabase } from "@/lib/supabase";
import { safeSingle } from "./supaSafe";

/**
 * Resolve a child by either canonical id (child_profiles.id) or legacy child_uid.
 * Always returns at most one row (first match) and never throws on 406.
 */
export async function getChildByAnyKey<T extends string = "*">(
  key: string,
  columns?: T
): Promise<{
  data: Record<string, any> | null;
  error: any | null;
}> {
  const cols = (columns as string) || "*";
  // Avoid .single() to prevent 406, use limit(1).maybeSingle() + safeSingle
  return safeSingle(
    supabase
      .from("child_profiles")
      .select(cols)
      .or(`id.eq.${key},child_uid.eq.${key}`)
      .limit(1)
      .maybeSingle()
  );
}
