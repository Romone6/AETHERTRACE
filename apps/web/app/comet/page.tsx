import type { Metadata } from "next";
import { CometHubble } from "@/components/comet-hubble";
import { CometWalkthrough } from "@/components/guided-observations";

export const metadata: Metadata = {
  title: "3I/ATLAS | Aethertrace",
  description: "Replay six SPHEREx exposures from two passes of interstellar comet 3I/ATLAS.",
};

type Query = { frame?: string; positions?: string; coverage?: string; display?: string; sampling?: string };

export default async function CometPage({ searchParams }: { searchParams: Promise<Query> }) {
  const { frame, positions, coverage, display, sampling } = await searchParams;
  return (
    <main id="main" className="workspace comet-page">
      <CometWalkthrough
        key={JSON.stringify([frame, positions, coverage, display, sampling])}
        initialFrame={frame}
        initialMarker={positions !== "0"}
        initialCoverage={coverage === "1"}
        initialEnhanced={display !== "standard"}
        initialSmooth={sampling !== "pixels"}
        standalone
      />
      <CometHubble />
    </main>
  );
}
