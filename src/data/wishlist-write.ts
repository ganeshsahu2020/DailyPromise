// src/data/wishlist-write.ts
import {supabase} from "@/lib/supabase";

type Args={
  child_uid:string;
  label:string;
  description:string;
  category:string;
  target_points:number;
  link?:string|null;
  occasion?:string|null;
};

export async function createOrGetWishlistId({
  child_uid,
  label,
  description,
  category,
  target_points,
  link=null,
  occasion=null
}:Args):Promise<string|null>{
  const labelCi=label.toLowerCase().trim();

  // 1) Do an upsert WITHOUT .select() to avoid 406 on conflict (204 No Content).
  const up=await supabase
    .from("wishlist_items")
    .upsert({
      child_uid,
      label,
      description,
      category:category.toLowerCase(),
      target_points,
      link,
      occasion
    },{onConflict:"child_uid,label_ci",ignoreDuplicates:true});

  // 2) If inserted, or conflicted (no body), fetch the id by unique key.
  if(!up.error){
    const probe=await supabase
      .from("wishlist_items")
      .select("id")
      .eq("child_uid",child_uid)
      .eq("label_ci",labelCi)
      .order("created_at",{ascending:false})
      .limit(1)
      .maybeSingle();

    return probe.data?.id ?? null;
  }

  // 3) If we did get an error, still try to probe (covers transient 409/23505 etc.)
  const probe=await supabase
    .from("wishlist_items")
    .select("id")
    .eq("child_uid",child_uid)
    .eq("label_ci",labelCi)
    .order("created_at",{ascending:false})
    .limit(1)
    .maybeSingle();

  return probe.data?.id ?? null;
}
