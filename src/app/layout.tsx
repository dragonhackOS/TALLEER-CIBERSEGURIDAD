import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Talleres · Prepa Yucatán", template: "%s · Talleres Prepa Yucatán" },
  description: "Plataforma oficial de inscripción a talleres de la Escuela Preparatoria Yucatán.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#1d3fd8", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Leer cabeceras fuerza render dinámico → Next aplica el nonce de la CSP a sus scripts.
  await headers();
  return (
    <html lang="es-MX">
      <body className="min-h-screen">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
