import type { Metadata } from "next";
import { Newsreader, Lora, Libre_Baskerville, Geist_Mono } from "next/font/google";
import "./globals.css";
import { StaleTitleCleanup } from "./components/stale-title-cleanup";

const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const lora = Lora({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-body",
  display: "swap",
});

const libreBaskerville = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-title",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "adinkra",
  description:
    "Paste a Substack post, a Paul Graham essay, or any blog URL and read it reset in one clean, standard layout — no comments, no buttons, no feed.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${lora.variable} ${libreBaskerville.variable} ${geistMono.variable}`}
    >
      <body className="antialiased">
        <StaleTitleCleanup />
        {children}
      </body>
    </html>
  );
}
