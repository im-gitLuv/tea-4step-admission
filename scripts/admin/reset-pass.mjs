// Uso: node scripts/admin/reset-pass.mjs <user_id> "NuevaClave123!"
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local'); process.exit(1); }

const [userId, newPass] = process.argv.slice(2);
if (!userId || !newPass) { console.error('Uso: node scripts/admin/reset-pass.mjs <user_id> "NuevaClave"'); process.exit(1); }

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const { data, error } = await supabase.auth.admin.updateUserById(userId, { password: newPass });
if (error) { console.error('Error:', error.message); process.exit(1); }
console.log('✔ Contraseña actualizada para', data.user.email);