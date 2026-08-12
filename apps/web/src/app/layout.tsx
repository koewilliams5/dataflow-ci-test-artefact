import type { Metadata } from "next";
import { JetBrains_Mono, Inter } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DataFlow CI",
  description: "Ingestion et validation de fichiers pour DataFlow CI",
};

// Empêche un flash de thème incorrect au premier rendu : lit la préférence
// enregistrée avant même l'hydratation React (voir ThemeToggle.tsx pour
// l'écriture de cette même clé localStorage).
const THEME_INIT_SCRIPT = `
try {
  var stored = localStorage.getItem("dataflow-theme");
  if (stored === "light" || stored === "dark") {
    document.documentElement.dataset.theme = stored;
  }
} catch (_) {}
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="fr"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
