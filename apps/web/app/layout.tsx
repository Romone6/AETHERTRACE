import type { Metadata } from "next";
import type { ReactNode } from "react";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import "./globals.css";
import "./venture.css";

export const metadata: Metadata = {
  title: "Aethertrace | SPHEREx Observation Explorer",
  description:
    "Browse NASA SPHEREx infrared observations, compare image cutouts and explore archive records.",
  other: {
    "ai-assistance": "OpenAI Codex assisted with implementation, testing, and documentation. See the Method page for details.",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
