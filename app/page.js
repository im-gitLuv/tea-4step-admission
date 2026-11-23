import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PARTICIPANT_COOKIE } from "@/lib/session";

// Estrato 1: si el visitante ya tiene sesión de magic link vigente,
// "/" lo manda directo al portal; si no, al login de la v1
// (que sigue vivo para los leads del funnel actual).
export default function Home() {
  const hasSession = Boolean(cookies().get(PARTICIPANT_COOKIE)?.value);
  redirect(hasSession ? "/portal" : "/login");
}
