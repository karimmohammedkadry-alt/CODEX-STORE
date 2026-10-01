import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function readKey(name: string, fallbackJsonName?: string) {
  const legacy = Deno.env.get(name);
  if (legacy) return legacy;
  if (fallbackJsonName) {
    try {
      const raw = Deno.env.get(fallbackJsonName);
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed.default || Object.values(parsed)[0] || "";
      }
    } catch { /* ignore */ }
  }
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const publishable = readKey("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEYS");
    const secret = readKey("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEYS");
    if (!url || !publishable || !secret) return json({ error: "إعدادات Supabase الخاصة بالـ Edge Function غير مكتملة." }, 500);

    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "الجلسة غير صالحة." }, 401);

    const caller = createClient(url, publishable, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: userError } = await caller.auth.getUser();
    if (userError || !user) return json({ error: "الجلسة غير صالحة أو انتهت." }, 401);

    const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: profile, error: profileError } = await admin.from("profiles").select("role").eq("id", user.id).single();
    if (profileError || profile?.role !== "admin") return json({ error: "ليس لديك صلاحية تغيير الصلاحيات." }, 403);

    const body = await req.json();
    const userId = String(body.userId || "");
    const role = body.role === "admin" ? "admin" : "user";
    if (!userId) return json({ error: "معرف الحساب مطلوب." }, 400);
    if (userId === user.id) return json({ error: "لا يمكن تغيير صلاحية حسابك الحالي من هنا." }, 400);

    const { data: target, error: targetError } = await admin.from("profiles").select("id, role").eq("id", userId).single();
    if (targetError || !target) return json({ error: "الحساب غير موجود." }, 404);

    const { error } = await admin.from("profiles").update({ role, updated_at: new Date().toISOString() }).eq("id", userId);
    if (error) return json({ error: "فشل تحديث صلاحية الحساب." }, 400);

    return json({ success: true, role });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "حدث خطأ غير متوقع." }, 500);
  }
});
