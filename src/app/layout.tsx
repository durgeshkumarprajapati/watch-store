import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { brand } from "@/config/brand";
import "@fontsource-variable/bodoni-moda/opsz.css";
import "@fontsource-variable/raleway";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";


export const metadata: Metadata = {
  title: { default: brand.title, template: brand.titleTemplate },
  description: brand.description,
  icons: { icon: brand.favicon },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#172a3a" },
    { media: "(prefers-color-scheme: dark)", color: "#111315" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-body antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
