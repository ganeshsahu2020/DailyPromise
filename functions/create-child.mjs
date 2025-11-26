import { createClient } from "@supabase/supabase-js";

export const config = { path: "/.netlify/functions/create-child" };

export async function handler(event) {
  try {
    const authz = event.headers.authorization || "";
    if (!authz.startsWith("Bearer ")) {
      return { statusCode: 401, body: JSON.stringify({ error: "Missing Bearer token" }) };
    }
    const accessToken = authz.slice("Bearer ".length);

    // Use anon client to get the calling parent profile
    const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } }
    });
    const { data: me, error: meErr } = await supa.auth.getUser();
    if (meErr || !me?.user) return { statusCode: 401, body: JSON.stringify({ error: "Invalid user" }) };

    // Ensure parent role
    const role = me.user.user_metadata?.role;
    if (role !== "parent") return { statusCode: 403, body: JSON.stringify({ error: "Only parents can create children" }) };

    const body = JSON.parse(event.body || "{}");
    const { first_name, last_name, nick_name, avatar_url, age, child_email, child_password } = body;
    if (!first_name || !age || !child_email || !child_password) {
      return { statusCode: 400, body: JSON.stringify({ error: "first_name, age, child_email, child_password required" }) };
    }

    // Admin client for auth.user creation
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Create auth user (email is internal; we auto-confirm)
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: child_email,
      password: child_password,
      email_confirm: true,
      user_metadata: { role: "child" }
    });
    if (cErr) return { statusCode: 400, body: JSON.stringify({ error: cErr.message }) };

    // Link DB profile
    const family_id = me.user.user_metadata?.family_id;
    const child_uid = created.user.id;
    const { error: insErr } = await admin
      .from("child_profiles")
      .insert({ child_uid, family_id, parent_uid: me.user.id, first_name, last_name, nick_name, avatar_url, age });
    if (insErr) return { statusCode: 400, body: JSON.stringify({ error: insErr.message }) };

    return { statusCode: 200, body: JSON.stringify({ ok: true, child_uid }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
}
