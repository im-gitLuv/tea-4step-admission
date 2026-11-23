// /link-invalido — pantalla amable cuando el magic link no sirve
// (expiró, fue revocado o está mal copiado). CTA a WhatsApp del equipo.
import Link from "next/link";

export const metadata = {
  title: "Enlace no válido — Portal de Admisión TEA",
  robots: { index: false, follow: false },
};

export default function LinkInvalidoPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5f7fc",
        fontFamily: "'Work Sans', system-ui, sans-serif",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 460,
          width: "100%",
          background: "#fff",
          border: "1px solid #e6e9f2",
          borderRadius: 14,
          padding: "32px 28px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            margin: "0 auto 18px",
            borderRadius: "50%",
            background: "#ffeaee",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 26,
          }}
        >
          🔒
        </div>
        <h1 style={{ color: "#0F145B", fontSize: 20, margin: "0 0 10px" }}>
          Tu enlace ya no está activo
        </h1>
        <p style={{ color: "#3c4257", fontSize: 14.5, lineHeight: 1.6, margin: "0 0 6px" }}>
          Los enlaces de acceso vencen a los 30 días y pueden ser renovados.
          Pídele al equipo de admisiones uno nuevo y te lo enviará por correo
          o por WhatsApp en minutos.
        </p>
        <a
          href="https://wa.me/?text=Hola%2C%20mi%20enlace%20del%20Portal%20de%20Admisi%C3%B3n%20ya%20no%20funciona.%20%C2%BFMe%20pueden%20enviar%20uno%20nuevo%3F"
          style={{
            display: "inline-block",
            marginTop: 18,
            background: "#EA0029",
            color: "#fff",
            fontWeight: 700,
            fontSize: 14,
            padding: "12px 24px",
            borderRadius: 8,
            textDecoration: "none",
          }}
        >
          Escribir por WhatsApp
        </a>
        <p style={{ color: "#8a93a6", fontSize: 12, marginTop: 16 }}>
          <Link href="/" style={{ color: "#283A97" }}>
            Volver al inicio
          </Link>
        </p>
      </div>
    </div>
  );
}
