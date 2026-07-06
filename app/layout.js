import "plyr/dist/plyr.css";
import "./globals.css";
import { ContactProvider } from "@/lib/ContactContext";

export const metadata = {
  title: "Portal de Admisión — Talk English Academy",
  description:
    "Completa los 4 pasos de admisión antes de tu llamada programada con Talk English Academy.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600;700&family=DM+Sans:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ContactProvider>{children}</ContactProvider>
      </body>
    </html>
  );
}
