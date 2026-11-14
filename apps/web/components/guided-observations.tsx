"use client";

import { useEffect, useState } from "react";
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
      <p aria-live="polite">Observation {index === 0 ? "A" : "B"} · {observationDate(frames[index].date)}</p>
      <div className="observation-actions" onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          setIndex(event.key === "ArrowLeft" ? 0 : 1);
        }
      }}>
        <button type="button" aria-pressed={index === 0} onClick={() => setIndex(0)}>Show A</button>
        <button type="button" aria-pressed={index === 1} onClick={() => setIndex(1)}>Show B</button>
        <button type="button" onClick={() => setIndex(1 - index)}>Toggle A/B</button>
      </div>
      <label>Zoom <select value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
        <option value={1}>1×</option><option value={2}>2×</option><option value={3}>3×</option>
      </select></label>
    </section>
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
    <section className="card guided-observation" aria-labelledby="comet-title">
      <h2 id="comet-title">Follow interstellar comet 3I/ATLAS</h2>
      <p>Step through three SPHEREx exposures taken minutes apart on 14 December 2025. The background sky is aligned so you can watch the comet move.</p>
      <div className="comparison-image comet-stage">
        <div className="comet-image">
          <img src={frame.image} alt="SPHEREx infrared cutout of the 3I/ATLAS field" />
          {showMarker && <span aria-hidden="true" className="comet-marker" style={{ left: `${frame.marker[0] * 100}%`, top: `${frame.marker[1] * 100}%` }} />}
        </div>
      </div>
      <p aria-live="polite">Frame {index + 1} of {comet.frames.length} · {observationDate(frame.date)}</p>
      <div className="observation-actions">
        <button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous exposure</button>
        <button type="button" disabled={index === comet.frames.length - 1} onClick={() => setIndex(index + 1)}>Next exposure</button>
        <label><input type="checkbox" checked={showMarker} onChange={(event) => setShowMarker(event.target.checked)} /> Show predicted position</label>
      </div>
      <p>Predicted position from IRSA: {frame.ra.toFixed(5)}°, {frame.dec.toFixed(5)}° (ICRS). The circle marks the predicted position. These D6 images share a display scale. The archive flags the predicted center as an outlier in all three exposures. Local wavelength can vary, so use this sequence for visual inspection.</p>
      <div className="cutout-links">
        <a href={frame.source} target="_blank" rel="noreferrer">Source product ↗</a>
        <a href="https://irsa.ipac.caltech.edu/data/SPHEREx/docs/comet3iatlas/index.html" target="_blank" rel="noreferrer">IRSA observation table ↗</a>
      </div>
      <p className="observation-id">{frame.id}</p>
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

export function BarnardValidation() {
  return (
    <details className="card guided-observation">
      <summary>Worked example: Barnard’s Star</summary>
      <p><strong>Insufficient data for a brightness measurement.</strong> The two D3 exposures have different calibrated wavelengths at the star, and the predicted center falls on flagged pixels in both.</p>
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
