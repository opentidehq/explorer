import type { Metadata } from "next";
import { inter, jetbrainsMono } from "@/lib/fonts";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenTide Explorer",
  description: "Interactive exploration of OpenTide detection corpus",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="h-dvh overflow-hidden font-sans">
        <ThemeProvider>
          <TooltipProvider delayDuration={0} skipDelayDuration={0}>
            {children}
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
