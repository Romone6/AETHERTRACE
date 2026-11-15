import Link from "next/link";
import orion from "../public/observations/orion-composite.json";
import andromeda from "../public/observations/andromeda-composite.json";
import pleiades from "../public/observations/pleiades-composite.json";
import barnard from "../public/observations/barnard-field-composite.json";

export const composites: Record<string, typeof orion | undefined> = {
  "orion-nebula": orion,
  andromeda,
  pleiades,
  "barnards-star": barnard,
};

export function DisplayMethodLink({ kind }: { kind: "composites" | "previews" | "comparisons" | "comet" }) {
  return <Link className="display-method-link" href={`/method#display-${kind}`}>Display method</Link>;
}

export function SkyComposite({ field, id, explorer = false }: { field: string; id?: string; explorer?: boolean }) {
  const composite = composites[field];
  if (!composite) return null;
  return (
    <figure id={id} className="home-visual home-composite">
      <div className="home-composite-plate">
        <img
          src={`/observations/${composite.image}`}
          width={composite.size_px[0]}
          height={composite.size_px[1]}
          alt={`False-color infrared view of ${composite.title}.`}
        />
      </div>
      <figcaption className="home-composite-caption">
        <span>{composite.release} · False color</span>
        <strong>{composite.title}</strong>
        <ul aria-label="Color and infrared wavelength">
          {composite.bands.map((band) => (
            <li key={band.color} className={`wavelength-${band.color.toLowerCase()}`}>
              {band.color} <span>{band.wavelength_um.toFixed(3)} μm</span>
            </li>
          ))}
        </ul>
        <p>
          Three All-Sky Cube bands, with brightness scaled for display.
          {composite.coverage_fraction < 1 && ` Shared coverage ${(composite.coverage_fraction * 100).toFixed(1)}%. Gaps are transparent.`}
        </p>
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
        <ul className="method-source-list" aria-label="Field processing records">
          {Object.entries(composites).map(([field, composite]) => composite && (
            <li key={field}><a href={`/observations/${composite.image.replace(/\.webp$/, ".json")}`}>{composite.title} processing record (JSON)</a></li>
          ))}
        </ul>
      </article>
      <article className="method-step" id="display-previews">
        <h2>Individual exposure previews</h2>
        <p>We render a preview on request for each archive exposure. We keep its FITS cutout on the native pixel grid, clip its finite brightness values at the 1st and 99.5th percentiles, and apply an inverse hyperbolic sine (asinh) stretch with strength 10. Linear contrast uses a linear brightness mapping between the 1st and 90th percentiles so bright peaks leave more room for fainter detail. Values beyond those limits are clipped. Nearest-neighbor enlargement keeps the original pixel boundaries in both views. Nonfinite pixels appear black. Finite flagged pixels may still be shown. Each exposure has its own grayscale scale, so equal shades across exposures can represent different brightness.</p>
      </article>
      <article className="method-step" id="display-comparisons">
        <h2>Aligned comparisons</h2>
        <p>We bilinearly align the exposures to the first image’s celestial grid and keep the pixels with valid brightness, variance and quality flags in both. From those pixels, we pool both frames to compute the 1st and 99.5th percentile limits and apply the same asinh stretch (strength 10) to both. Blue marks excluded pixels. A brightness-change measurement still requires wavelength matching and uncertainty analysis.</p>
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
