import { Inter, JetBrains_Mono } from "next/font/google";

// Names must not collide with Tailwind's `--font-sans` / `--font-mono` theme variables: both
// land on <html>, and the theme value would self-reference into an invalid cycle.
export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});
