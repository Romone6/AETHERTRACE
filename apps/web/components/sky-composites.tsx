"use client";

import Link from "next/link";
import { useState } from "react";
import { getSimulatedDisplay } from "./simulated-views";
import orion from "../public/observations/orion-composite.json";
import orionCore from "../public/observations/orion-4005-composite.json";
import andromeda from "../public/observations/andromeda-composite.json";
import pleiades from "../public/observations/pleiades-composite.json";
import barnard from "../public/observations/barnard-field-composite.json";

export const composites: Record<string, typeof orion | undefined> = {
  "orion-nebula": orion,
  andromeda,
  pleiades,
  "barnards-star": barnard,
};

export function DisplayMethodLink({ kind }: { kind: "composites" | "previews" | "comparisons" | "comet" | "simulation" }) {
  return <Link className="display-method-link" href={`/method#display-${kind}`}>Display method</Link>;
}

export function SkyComposite({ field, id, explorer = false }: { field: string; id?: string; explorer?: boolean }) {
  const [showOrionCore, setShowOrionCore] = useState(false);
  const [showSimulation, setShowSimulation] = useState(false);
  const isOrion = field === "orion-nebula";
  const singleBand = isOrion && showOrionCore;
  const composite = singleBand ? orionCore : composites[field];
  if (!composite) return null;
  const measuredPath = `/observations/${composite.image}`;
  const simulation = showSimulation ? getSimulatedDisplay(measuredPath) : undefined;
  return (
    <figure id={id} className="home-visual home-composite">
      <div className="home-composite-plate">
        <div className="composite-image-stack">
          <img
            src={simulation ? `/${simulation.completion}` : measuredPath}
            width={composite.size_px[0]}
            height={composite.size_px[1]}
            alt={simulation ? `Simulated completion of ${composite.title}. Amber hatching marks estimates.` : singleBand ? "Orion Nebula in measured 4.005 micrometer infrared brightness." : `False-color infrared view of ${composite.title}.`}
          />
          {simulation && <img className="simulation-mask" src={`/${simulation.mask}`} alt="" />}
        </div>
      </div>
      <figcaption className="home-composite-caption">
        <span>{simulation ? `${composite.release}-based · Simulated completion` : `${composite.release} · ${singleBand ? "4.005 μm grayscale" : "False color"}`}</span>
        <strong>{composite.title}</strong>
        {!singleBand && <ul aria-label="Color and infrared wavelength">
          {composite.bands.map((band) => (
            <li key={band.color} className={`wavelength-${band.color.toLowerCase()}`}>
              {band.color} <span>{band.wavelength_um.toFixed(3)} μm</span>
            </li>
          ))}
        </ul>}
        <p>
          {singleBand ? "Measured brightness in one infrared band. This band covers parts of the core missing from the color composite." : "Three All-Sky Cube bands, with brightness scaled for display."}
          {composite.coverage_fraction < 1 && ` Measured coverage ${(composite.coverage_fraction * 100).toFixed(1)}%.`}
          {!simulation && composite.coverage_fraction < 1 && " Gaps are transparent."}
        </p>
        <label className="simulation-toggle">
          <input type="checkbox" checked={showSimulation} onChange={(event) => setShowSimulation(event.target.checked)} />
          Simulated completion
        </label>
        {simulation && <p className="simulation-note">Amber hatching marks estimates. <DisplayMethodLink kind="simulation" /></p>}
        {isOrion && <button type="button" className="orion-band-toggle" onClick={() => setShowOrionCore((value) => !value)}>
          {singleBand ? "Return to false color" : "View Orion at 4.005 μm"}
        </button>}
        {!explorer && <Link href={`/explorer?target=${field}&view=exposure`}>Explore individual exposures <span aria-hidden="true">↗</span></Link>}
        <div className="home-composite-sources">
          <DisplayMethodLink kind="composites" />
          <a href={composite.release_url}>Source release</a>
          <a href={`/observations/${composite.image.replace(/\.webp$/, ".json")}`}>Processing record (JSON)</a>
        </div>
      </figcaption>
    </figure>
  );
}

export function ImageryMethods() {
  return (
    <>
      <article className="method-step" id="display-composites">
        <h2>False-color sky composites</h2>
        <p>Each view uses the same three SPHEREx DR1 All-Sky Cube bands. Red shows 3.293 μm, green 2.189 μm and blue 1.254 μm. We reproject to a north-up tangent plane at 12.9 arcseconds per pixel, using the nearest native pixel with a finite brightness and positive coverage in all three bands. Where tiles overlap, we choose the tile with the highest minimum contribution count across the bands.</p>
        <p>Each band is clipped and scaled between its 5th and 99.85th percentiles, then combined using the Lupton asinh stretch (stretch 0.16, Q 9). Transparent pixels mark missing coverage. Colors show the assigned infrared bands. Use the original FITS data for brightness measurements or wavelength ratios.</p>
        <p>Orion’s optional 4.005 μm view uses a single measured plane from the same cubes, on the same sky grid. It shows brightness in grayscale and leaves pixels without measurements transparent. <a href="/observations/orion-4005-composite.json">Orion single-band processing record (JSON)</a></p>
        <ul className="method-source-list" aria-label="Field processing records">
          {Object.entries(composites).map(([field, composite]) => composite && (
            <li key={field}><a href={`/observations/${composite.image.replace(/\.webp$/, ".json")}`}>{composite.title} processing record (JSON)</a></li>
          ))}
        </ul>
      </article>
      <article className="method-step" id="display-simulation">
        <h2>Simulated completion</h2>
        <p>This optional view estimates missing display pixels by averaging neighboring colors inward from the coverage boundary. We then smooth the estimated region with the measured pixels held fixed. Amber hatching identifies every filled pixel. The method can suggest continuity across small gaps. Large gaps and crop edges may contain substantial extrapolation.</p>
        <p>The output is an illustration derived from display colors. Use the measured views and source FITS files to interpret brightness, wavelengths, and motion. <a href="/observations/simulation.json">Simulation processing record (JSON)</a></p>
      </article>
      <article className="method-step" id="display-previews">
        <h2>Individual exposure previews</h2>
        <p>Live and saved previews use the native FITS pixel grid. Enhanced grayscale clips finite brightness values at the 1st and 99.5th percentiles and applies an inverse hyperbolic sine (asinh) stretch with strength 10. Linear contrast maps values linearly between the 1st and 90th percentiles so bright peaks leave more room for fainter detail. Values beyond those limits are clipped. Nearest-neighbor enlargement keeps the original pixel boundaries in both views. Nonfinite pixels appear black. Finite flagged pixels may still be shown. Each exposure has its own grayscale scale, so equal shades across exposures can represent different brightness.</p>
        <p><a href="/observations/saved-exposures/manifest.json">Saved Andromeda, Orion and Pleiades records (JSON)</a> · <a href="/observations/barnard/saved-exposures.json">Saved Barnard’s Star records (JSON)</a></p>
      </article>
      <article className="method-step" id="display-comparisons">
        <h2>Aligned comparisons</h2>
        <p>We bilinearly align the exposures to the first image’s celestial grid and keep the pixels with valid brightness, variance and quality flags in both. From those pixels, we pool both frames to compute the 1st and 99.5th percentile limits and apply the same asinh stretch (strength 10) to both. Blue marks excluded pixels. A brightness-change measurement still requires wavelength matching and uncertainty analysis.</p>
        <p>Enhanced color maps that same stretched grayscale to the same teal-to-amber brightness palette in both exposures. Excluded pixels stay blue. The color represents display intensity, and each pixel stays on the same grid.</p>
        <p><a href="/observations/barnard/processing.json">Barnard’s Star comparison processing record (JSON)</a></p>
      </article>
      <article className="method-step" id="display-comet">
        <h2>3I/ATLAS sequence</h2>
        <p>For each pass, we bilinearly align three D6 exposures to a 41 × 41 tangent-plane grid with 6.15 arcseconds per pixel. The shared footprint uses finite pixels and retains flagged values for visual inspection. We clip at the pooled 3rd and 99.5th percentiles, then apply one grayscale asinh stretch (strength 5) across the three frames of that pass in Standard mode. Enhanced mode clips at the pooled 3rd and 98th percentiles and applies a stronger asinh stretch (strength 12) to reveal faint structure. It clips more of the brightest pixels and uses one teal-to-amber palette for brightness across all three frames in a pass. This color scale represents intensity within the D6 detector band. The crosshair and dots show the current and earlier IRSA predicted positions. The optional blue overlay shows pixels outside the shared finite footprint. The archive reports an outlier flag at the predicted center in each exposure.</p>
        <p>Smooth display samples the original FITS image directly onto a 656 × 656 grid using its sky coordinates and bilinear interpolation. It uses the same crop and color scale as the pixel view. Gaps remain masked. The detector samples at 6.15 arcseconds per pixel, so the finer grid smooths the display without increasing the telescope’s resolving power.</p>
        <p><a href="/observations/comet/processing.json">First pass processing record (JSON)</a> · <a href="/observations/comet/later/processing.json">Second pass processing record (JSON)</a></p>
      </article>
    </>
  );
}
