import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./venture.css";

export const metadata: Metadata = {
  title: "Aethertrace — evidence in the infrared",
  description:
    "Explore SPHEREx observations with their archive provenance, uncertainty, and limitations intact.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
