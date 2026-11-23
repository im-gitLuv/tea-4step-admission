// Diagnóstico de login admin — node --env-file=.env.local scripts/diag-login.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const [email, password] = process.argv.slice(2);

if (!url || !key) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}
if (!email || !password) {
  console.error("Uso: node --env-file=.env.local scripts/diag-login.mjs TU_EMAIL TU_PASSWORD");
  process.exit(1);
}

const sb = createClient(url, key);

const { data, error } = await sb.auth.signInWithPassword({ email, password });
if (error) {
  console.log(">> LOGIN FALLÓ — error real:", error.status, error.message);
} else {
  console.log(">> LOGIN OK — user_id:", data.user.id, "confirmado:", !!data.user.email_confirmed_at);
}

const { data: users } = await sb.auth.admin.listUsers({ perPage: 20 });
console.log("\nUsuarios en Supabase Auth:");
users.users.forEach(u =>
  console.log("  -", u.email, "| confirmado:", u.email_confirmed_at ? "SÍ" : "NO")
);
if (!users.users.length) console.log("  (ninguno)");

const { data: admins, error: errA } = await sb.from("admin_users").select("user_id, role");
console.log("\nFilas en admin_users:", errA ? "ERROR: " + errA.message : admins.length ? "" : "(vacía)");
if (!errA) admins.forEach(a => console.log("  -", a.user_id, "→", a.role));