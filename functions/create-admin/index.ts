import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}


function readKey(name: string, fallbackJsonName?: string) {
  const legacy = Deno.env.get(name);
  if (legacy) return legacy;
  if (fallbackJsonName) {
    try {
      const raw = Deno.env.get(fallbackJsonName);
      if (raw) { const parsed = JSON.parse(raw); return parsed.default || Object.values(parsed)[0] || ""; }
    } catch { /* ignore */ }
  }
  return "";
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = readKey("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEYS");
    const serviceRoleKey = readKey("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEYS");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error("Missing Supabase Edge Function secrets.");
      return json({
        success: false,
        error: "إعدادات Supabase الخاصة بالـ Edge Function غير مكتملة.",
      }, 500);
    }

    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return json({ success: false, error: "الجلسة غير صالحة." }, 401);
    }

    // Verify the caller using their JWT, not the service role.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
    });

    const {
      data: { user: caller },
      error: callerError,
    } = await callerClient.auth.getUser();

    if (callerError || !caller) {
      return json({ success: false, error: "الجلسة غير صالحة أو انتهت." }, 401);
    }

    // Service-role client is used only inside this server-side function.
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: callerProfile, error: profileCheckError } = await adminClient
      .from("profiles")
      .select("id, role")
      .eq("id", caller.id)
      .maybeSingle();

    if (profileCheckError) {
      console.error("Admin profile check failed:", profileCheckError);
      return json({
        success: false,
        error: "تعذر التحقق من صلاحيات الأدمن.",
      }, 500);
    }

    if (callerProfile?.role !== "admin") {
      return json({
        success: false,
        error: "ليس لديك صلاحية إنشاء حسابات.",
      }, 403);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ success: false, error: "بيانات الطلب غير صحيحة." }, 400);
    }

    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const role = body.role === "admin" ? "admin" : "user";

    if (!name) {
      return json({ success: false, error: "اسم الحساب مطلوب." }, 400);
    }

    if (!email || !email.includes("@")) {
      return json({ success: false, error: "الإيميل غير صحيح." }, 400);
    }

    if (password.length < 6) {
      return json({
        success: false,
        error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل.",
      }, 400);
    }

    // Create the Auth account. New accounts created from this admin screen
    // are regular users by default; only the already-authorized admin can
    // decide whether an account should later receive elevated permissions.
    const {
      data: created,
      error: createUserError,
    } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (createUserError || !created.user) {
      console.error("Auth user creation failed:", createUserError);
      const message = createUserError?.message ?? "فشل إنشاء الحساب.";
      const normalized = message.toLowerCase();

      if (normalized.includes("already") || normalized.includes("registered")) {
        return json({
          success: false,
          error: "هذا البريد الإلكتروني مستخدم بالفعل.",
        }, 409);
      }

      return json({ success: false, error: message }, 400);
    }

    const newUser = created.user;

    // The SQL trigger normally creates this row. Upsert makes the function
    // resilient if the trigger was not installed or the schema was migrated.
    const { error: profileError } = await adminClient
      .from("profiles")
      .upsert({
        id: newUser.id,
        name,
        email,
        role,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });

    if (profileError) {
      console.error("Profile creation failed; rolling back Auth user:", profileError);
      await adminClient.auth.admin.deleteUser(newUser.id);

      return json({
        success: false,
        error: "فشل إنشاء بيانات الحساب في قاعدة البيانات.",
      }, 500);
    }

    return json({
      success: true,
      message: "تم إنشاء الحساب بنجاح.",
      user: {
        id: newUser.id,
        email: newUser.email,
        name,
        role,
      },
    });
  } catch (error) {
    console.error("create-admin unexpected error:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "حدث خطأ غير متوقع.",
    }, 500);
  }
});
