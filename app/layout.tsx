import type { Metadata, Viewport } from "next";
import { preload } from "react-dom";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { catalogDataUrl } from "@/lib/data/catalog";
import { inter, jetbrainsMono } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "opentide library",
    template: "%s · opentide library",
  },
  description:
    "Explore the opentide library: threats, detection objectives, signals and rules, linked by the opentide ontology and mapped to ATT&CK.",
  applicationName: "opentide library",
  openGraph: {
    type: "website",
    siteName: "opentide library",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Start both catalogue requests with the HTML, in parallel with the scripts.
  preload(catalogDataUrl("explorer.bundle.json"), {
    as: "fetch",
    crossOrigin: "anonymous",
  });
  preload(catalogDataUrl("explorer.vocab.json"), {
    as: "fetch",
    crossOrigin: "anonymous",
  });

  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="h-dvh overflow-hidden">
        <ThemeProvider>
          <TooltipProvider delayDuration={300} skipDelayDuration={150}>
            {children}
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
