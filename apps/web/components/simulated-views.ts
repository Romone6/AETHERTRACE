import simulation from "../public/observations/simulation.json";

const displays: Record<string, { completion: string; mask: string } | undefined> = simulation.displays;

export function getSimulatedDisplay(source: string) {
  return displays[source.replace(/^\//, "")];
}
