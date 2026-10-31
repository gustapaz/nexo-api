import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Nexo API | Planejamento com Rust e WebAssembly",
  description:
    "Caminho crítico e cronogramas com motor Rust executado no servidor.",
  metadataBase: new URL("https://nexo-api-gustapaz.starrylinen.chatgpt.site"),
  alternates: { canonical: "/" },
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
