"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import comet from "./comet-data.json";
import barnard from "./barnard-data.json";

const dateTime = new Intl.DateTimeFormat("en", {
  dateStyle: "medium", timeStyle: "medium", timeZone: "UTC",
});

export function observationDate(value: string) {
  return dateTime.format(new Date(value)) + " UTC";
}

type BlinkFrame = { image: string; date: string };

export function Blink({ frames }: { frames: [BlinkFrame, BlinkFrame] }) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [failed, setFailed] = useState(false);
  return (
    <section aria-label="Blink comparison" className="blink-panel">
      <h3>Blink comparison</h3>
      <p>Both images use one sky grid and one brightness scale.</p>
      <div className="blink-stage comparison-image">
        {frames.map((frame, i) => (
          <img
            key={i}
            className={i === index ? "blink-active" : "blink-hidden"}
            aria-hidden={i !== index}
            src={frame.image}
            alt={`Observation ${i === 0 ? "A" : "B"}, ${observationDate(frame.date)}`}
            style={{ transform: `scale(${zoom})` }}
            onError={() => setFailed(true)}
          />
        ))}
      </div>
      {failed && <p role="status">An aligned preview could not be displayed.</p>}
      <p className="mask-legend"><span aria-hidden="true" /> Blue pixels are excluded from the shared comparison.</p>
      <dl className="blink-dates">
        {frames.map((frame, i) => (
          <div key={i} className={i === index ? "is-current" : undefined}>
            <dt>Observation {i === 0 ? "A" : "B"}</dt>
            <dd><time dateTime={frame.date}>{observationDate(frame.date)}</time></dd>
          </div>
        ))}
      </dl>
      <span className="sr-only" aria-live="polite">Showing observation {index === 0 ? "A" : "B"}</span>
      <div className="observation-actions" onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          setIndex(event.key === "ArrowLeft" ? 0 : 1);
        }
      }}>
        <button type="button" aria-label="Show A" aria-pressed={index === 0} onClick={() => setIndex(0)}>Show A</button>
        <button type="button" aria-label="Show B" aria-pressed={index === 1} onClick={() => setIndex(1)}>Show B</button>
        <button type="button" onClick={() => setIndex(1 - index)}>Toggle A/B</button>
      </div>
      <label>Zoom <select value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
        <option value={1}>1×</option><option value={2}>2×</option><option value={3}>3×</option>
      </select></label>
    </section>
  );
}

export function WorkedExampleLink() {
  return (
    <Link className="example-link" href="/explorer#comet-title">
      <img src={comet.frames[0].image} alt="" width={100} height={100} />
      <div><strong>Follow interstellar comet 3I/ATLAS</strong><span>Three aligned SPHEREx exposures, with the comet’s predicted position.</span></div>
      <span className="example-arrow" aria-hidden="true">↗</span>
    </Link>
  );
}

export function CometWalkthrough() {
  const [index, setIndex] = useState(0);
  const [showMarker, setShowMarker] = useState(true);
  const frame = comet.frames[index];

  useEffect(() => {
    if (index + 1 < comet.frames.length) {
      const image = new Image();
      image.src = comet.frames[index + 1].image;
    }
  }, [index]);

  return (
    <section className="card guided-observation comet-walkthrough" aria-labelledby="comet-title">
      <h2 id="comet-title">Follow interstellar comet 3I/ATLAS</h2>
      <p>Step through three SPHEREx exposures taken minutes apart on 14 December 2025. The background sky is aligned so you can watch the comet move.</p>
      <div className="comet-layout">
        <div className="comparison-image comet-stage">
          <div className="comet-image">
            <img src={frame.image} alt="SPHEREx infrared cutout of the 3I/ATLAS field" />
            {showMarker && <span aria-hidden="true" className="comet-marker" style={{ left: `${frame.marker[0] * 100}%`, top: `${frame.marker[1] * 100}%` }} />}
          </div>
        </div>
        <div className="comet-controls">
          <p className="comet-epoch" aria-live="polite">Frame {index + 1} of {comet.frames.length} · {observationDate(frame.date)}</p>
          <div className="comet-filmstrip" role="group" aria-label="Comet exposures">
            {comet.frames.map((exposure, i) => (
              <button key={exposure.id} type="button" aria-pressed={index === i} aria-label={`Show exposure ${i + 1}`} onClick={() => setIndex(i)}>
                <img src={exposure.image} alt="" width={60} height={60} loading="lazy" />
                <time dateTime={exposure.date}>{exposure.date.slice(11, 19)} UTC</time>
              </button>
            ))}
          </div>
          <div className="observation-actions">
            <button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous exposure</button>
            <button type="button" disabled={index === comet.frames.length - 1} onClick={() => setIndex(index + 1)}>Next exposure</button>
            <label><input type="checkbox" checked={showMarker} onChange={(event) => setShowMarker(event.target.checked)} /> Show predicted position</label>
          </div>
          <p><span className="comet-marker-key" aria-hidden="true" /> The ring marks IRSA’s predicted position: {frame.ra.toFixed(5)}°, {frame.dec.toFixed(5)}° (ICRS).</p>
          <p>These D6 images share a display scale. The archive flags the predicted center as an outlier in all three exposures. Local wavelength can vary.</p>
          <div className="cutout-links">
            <a href={frame.source} target="_blank" rel="noreferrer">Source product ↗</a>
            <a href="https://irsa.ipac.caltech.edu/data/SPHEREx/docs/comet3iatlas/index.html" target="_blank" rel="noreferrer">IRSA observation table ↗</a>
          </div>
          <p className="observation-id">{frame.id}</p>
        </div>
      </div>
    </section>
  );
}

export function verifiedBarnardFrames(targetId: string, a: string, b: string): [BlinkFrame, BlinkFrame] | null {
  if (targetId !== "barnards-star" || a === b) return null;
  const first = barnard.frames.findIndex((frame) => frame.id === a);
  const second = barnard.frames.findIndex((frame) => frame.id === b);
  if (first < 0 || second < 0) return null;
  return [
    { image: barnard.frames[first].image, date: barnard.frames[first].date },
    { image: barnard.frames[second].image, date: barnard.frames[second].date },
  ];
}

const barnardParams = new URLSearchParams({
  target: "barnards-star", channel: "SPHEREx-D3", a: barnard.frames[0].id, b: barnard.frames[1].id,
});

export function BarnardValidation({ open, onToggle }: { open: boolean; onToggle: (open: boolean) => void }) {
  return (
    <details className="card guided-observation worked-example" id="barnard-example" open={open} onToggle={(event) => onToggle(event.currentTarget.open)}>
      <summary>
        <img src={barnard.frames[0].image} alt="" width={72} height={72} loading="lazy" />
        <span><strong>Worked example: Barnard’s Star</strong><small>Inspect the flagged pixels and wavelength mismatch in two D3 exposures.</small></span>
      </summary>
      <p className="validation-finding"><strong>Insufficient data for a brightness measurement.</strong> The two D3 exposures have different calibrated wavelengths at the star, and the predicted center falls on flagged pixels in both.</p>
      <ul>
        <li>Position: Gaia DR3 space motion propagated to the middle of each exposure. Spacecraft-view parallax and the centroid were not fitted.</li>
        <li>Background alignment: celestial WCS puts {barnard.aligned_pixels} of {barnard.grid_pixels} pixels into a common usable footprint. Residual alignment against matched stars was not measured.</li>
        <li>Uncertainty: interpolation propagated independent-pixel variance; median conditional variance is {Number(barnard.median_conditional_variance.toPrecision(3))} (MJy/sr)². A flux uncertainty also needs background and covariance terms.</li>
      </ul>
      <div className="comparison-cutouts">
        {barnard.frames.map((frame) => (
          <section className="comparison-cutout" key={frame.id}>
            <h3>{observationDate(frame.date)}</h3>
            <dl className="cutout-diagnostics">
              <div><dt>Predicted RA, Dec</dt><dd>{frame.ra.toFixed(6)}°, {frame.dec.toFixed(6)}°</dd></div>
              <div><dt>Calibrated wavelength</dt><dd>{frame.wavelength.toFixed(3)} μm</dd></div>
              <div><dt>Calibrated bandwidth</dt><dd>{frame.bandwidth.toFixed(3)} μm</dd></div>
              <div><dt>Center quality flags</dt><dd>Overflow, readout error, bloom</dd></div>
            </dl>
            <a href={frame.source} target="_blank" rel="noreferrer">Source product ↗</a>
          </section>
        ))}
      </div>
      <Blink frames={verifiedBarnardFrames("barnards-star", barnard.frames[0].id, barnard.frames[1].id)!} />
      <div className="cutout-links">
        <a href={`/evidence?${barnardParams}`}>Open this pair</a>
        <a href={barnard.calibration} target="_blank" rel="noreferrer">D3 wavelength calibration ↗</a>
        <a href="https://gea.esac.esa.int/archive/" target="_blank" rel="noreferrer">Gaia DR3 source {barnard.gaia.source_id} ↗</a>
      </div>
    </details>
  );
}


export function BarnardMethod() {
  const stages = [
    { image: barnard.method_images.original.image, title: "Original cutout", detail: "Exposure A on its native detector grid, with its own display stretch.", alt: "Original infrared cutout of Barnard’s Star with a bright area near the center" },
    { image: barnard.frames[0].image, title: "Aligned observation", detail: "Exposure A on the shared sky grid. Both exposures use the same brightness scale.", alt: "Exposure A shown in grayscale with excluded pixels in blue" },
    { image: barnard.method_images.mask.image, title: "Shared pixel mask", detail: `${barnard.aligned_pixels} of ${barnard.grid_pixels} pixels are usable in both exposures. Blue marks excluded pixels.`, alt: "Blue pixels show areas excluded from the comparison, including the star’s predicted center" },
  ];
  return (
    <section className="card method-example" aria-labelledby="method-example-title">
      <h2 id="method-example-title">From cutout to comparison</h2>
      <p>Two SPHEREx D3 exposures of the Barnard’s Star field illustrate how alignment and pixel masking prepare images for comparison.</p>
      <div className="method-stages">
        {stages.map((stage) => (
          <figure key={stage.title}>
            <img src={stage.image} alt={stage.alt} width={29} height={29} loading="lazy" />
            <figcaption><strong>{stage.title}</strong><span>{stage.detail}</span></figcaption>
          </figure>
        ))}
      </div>
      <Link href="/evidence#barnard-example">Open the Barnard’s Star example <span aria-hidden="true">↗</span></Link>
    </section>
  );
}
