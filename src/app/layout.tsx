import type { Metadata } from "next";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-body antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
