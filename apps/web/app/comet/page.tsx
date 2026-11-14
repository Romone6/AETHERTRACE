import type { Metadata } from "next";
import { CometWalkthrough } from "@/components/guided-observations";

export const metadata: Metadata = {
  title: "3I/ATLAS | Aethertrace",
  description: "Step through three aligned SPHEREx observations of interstellar comet 3I/ATLAS.",
};

type Query = { frame?: string; positions?: string; coverage?: string };

export default async function CometPage({ searchParams }: { searchParams: Promise<Query> }) {
  const { frame, positions, coverage } = await searchParams;
  return (
    <main id="main" className="workspace comet-page">
      <CometWalkthrough
        key={JSON.stringify([frame, positions, coverage])}
        initialFrame={frame}
        initialMarker={positions !== "0"}
        initialCoverage={coverage === "1"}
        standalone
      />
    </main>
  );
}
