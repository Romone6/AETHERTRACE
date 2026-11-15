"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import comet from "../public/observations/comet/processing.json";
import laterCometPass from "../public/observations/comet/later/processing.json";
import barnard from "../public/observations/barnard/processing.json";
import { ShareLink } from "./share-link";
import { DisplayMethodLink } from "./sky-composites";

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
      <p>Both images use one sky grid and a shared grayscale asinh stretch. <DisplayMethodLink kind="comparisons" /></p>
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
    <Link className="example-link" href="/comet">
      <img src={comet.frames[0].image} alt="" width={100} height={100} />
      <div><strong>Follow interstellar comet 3I/ATLAS</strong><span>Replay six SPHEREx exposures from two passes.</span></div>
      <span className="example-arrow" aria-hidden="true">↗</span>
    </Link>
  );
}

const cometPasses = [comet, laterCometPass];
const cometExposures = cometPasses.flatMap((pass, passIndex) =>
  pass.frames.map((frame, passFrame) => ({ frame, passIndex, passFrame })));
const finalCometFrame = cometExposures.at(-1)!.frame;
export const finalCometHref = `/comet?${new URLSearchParams({ frame: finalCometFrame.id, positions: "1" })}`;

function elapsedSinceFirst(date: string) {
  const seconds = Math.round((Date.parse(date) - Date.parse(comet.frames[0].date)) / 1000);
  return `+${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function CometWalkthrough({ initialFrame, initialMarker = true, initialCoverage = false, initialEnhanced = true, initialSmooth = true, standalone = false }: {
  initialFrame?: string;
  initialMarker?: boolean;
  initialCoverage?: boolean;
  initialEnhanced?: boolean;
  initialSmooth?: boolean;
  standalone?: boolean;
}) {
  const [index, setIndex] = useState(() => Math.max(0, cometExposures.findIndex(({ frame }) => frame.id === initialFrame)));
  const [showMarker, setShowMarker] = useState(initialMarker);
  const [showCoverage, setShowCoverage] = useState(initialCoverage);
  const [enhanced, setEnhanced] = useState(initialEnhanced);
  const [playing, setPlaying] = useState(false);
  const [smooth, setSmooth] = useState(initialSmooth);
  const smoothActive = enhanced && smooth;
  const imageKey = smoothActive ? "smooth_image" : enhanced ? "enhanced_image" : "image";
  const { frame, passIndex, passFrame } = cometExposures[index];
  const pass = cometPasses[passIndex];
  const isNewPass = passIndex > 0 && passFrame === 0;
  const [low, high] = enhanced ? pass.enhanced_display.shared_limits_mjy_sr : pass.scale;
  const colorRamp = enhanced
    ? `linear-gradient(90deg, ${pass.enhanced_display.palette_stops.map(({ color, level }) => `${color} ${(level / 255) * 100}%`).join(", ")})`
    : undefined;
  const shareParams = new URLSearchParams({ frame: frame.id, positions: showMarker ? "1" : "0", coverage: showCoverage ? "1" : "0", display: enhanced ? "enhanced" : "standard", sampling: smooth ? "smooth" : "pixels" });
  const title = "Follow interstellar comet 3I/ATLAS";
  const cutout = new URL(frame.source);
  cutout.searchParams.set("center", pass.cutout_center);
  cutout.searchParams.set("size", String(pass.cutout_size_deg));

  useEffect(() => {
    const nextIndex = (index + 1) % cometExposures.length;
    const next = cometExposures[nextIndex].frame;
    const image = new Image();
    image.src = next[imageKey];
    if (!playing) return;
    const timer = window.setTimeout(() => setIndex(nextIndex), isNewPass ? 2400 : 1400);
    return () => window.clearTimeout(timer);
  }, [index, imageKey, playing, isNewPass]);

  function freezeFrame(next: number) {
    setPlaying(false);
    setIndex(next);
  }

  return (
    <section className="card guided-observation comet-walkthrough" aria-labelledby="comet-title">
      {standalone ? <h1 id="comet-title">{title}</h1> : <h2 id="comet-title">{title}</h2>}
      <p>Replay six SPHEREx exposures from two passes on 14 December 2025. Each pass uses its own sky grid and shared brightness scale.</p>
      <div className="comet-quick-links">
        {frame.id !== finalCometFrame.id && (standalone
          ? <button type="button" onClick={() => { freezeFrame(cometExposures.length - 1); setShowMarker(true); }}>Jump to final tracked frame</button>
          : <Link href={finalCometHref}>Open final tracked frame</Link>)}
        <a className="comet-detail-jump" href="#comet-hubble">See the comet in finer detail with Hubble <span aria-hidden="true">↓</span></a>
      </div>
      <div className="comet-layout">
        <div className="comet-viewer">
          <div className="comet-stage-meta">
            <span>SPHEREx D6 · <time dateTime={frame.date}>{frame.date.slice(11, 19)} UTC</time> · 14 Dec 2025</span>
            <span>{enhanced ? "Color by infrared brightness" : "Grayscale infrared brightness"}</span>
          </div>
          <div className="comparison-image comet-stage">
            {isNewPass && <span className="comet-pass-break">Second pass · 1 h 33 min later</span>}
            <div className="comet-image">
              <img src={frame[imageKey]} alt="SPHEREx infrared cutout of the 3I/ATLAS field" />
              {showCoverage && <img className="comet-coverage" src={(smoothActive ? pass.smooth_display.coverage_overlay : pass.coverage_overlay).image} alt="" />}
              {showMarker && pass.frames.slice(0, passFrame).map((past) => (
                <span aria-hidden="true" key={past.id} className="comet-past-position" style={{ left: `${past.marker[0] * 100}%`, top: `${past.marker[1] * 100}%` }} />
              ))}
              {showMarker && <span aria-hidden="true" className="comet-marker comet-crosshair" style={{ left: `${frame.marker[0] * 100}%`, top: `${frame.marker[1] * 100}%` }} />}
            </div>
          </div>
          <div className="comet-replay">
            <button className="button-primary" type="button" onClick={() => setPlaying((value) => !value)}>
              {playing ? "Freeze frame" : "Play sequence"}
            </button>
            <span>{playing ? "Playing archived exposures" : "Frozen frame · archived exposure"} · Pass {passIndex + 1} of 2</span>
          </div>
          <div className="comet-filmstrip" role="group" aria-label="Comet exposures" onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            const next = Math.max(0, Math.min(cometExposures.length - 1, index + (event.key === "ArrowLeft" ? -1 : 1)));
            freezeFrame(next);
            event.currentTarget.querySelectorAll("button")[next]?.focus();
          }}>
            {cometExposures.map(({ frame: exposure, passIndex: group, passFrame: order }, i) => (
              <button key={exposure.id} data-pass-start={order === 0 || undefined} type="button" aria-pressed={index === i} aria-label={`Show exposure ${i + 1}, ${exposure.date.slice(11, 19)} UTC, ${elapsedSinceFirst(exposure.date)} elapsed`} onClick={() => freezeFrame(i)}>
                <span>Pass {group + 1}</span>
                <time dateTime={exposure.date}>{exposure.date.slice(11, 19)} UTC</time>
                <span>{elapsedSinceFirst(exposure.date)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="comet-controls">
          <p className="comet-epoch" aria-live={playing ? "off" : "polite"}>Frame {index + 1} of {cometExposures.length} · {frame.date.slice(11, 19)} UTC · {elapsedSinceFirst(frame.date)} elapsed</p>
          <details className="comet-display-options">
            <summary>Display and tracking options</summary>
            <div className="explorer-image-modes" role="group" aria-label="Comet display">
              <button type="button" aria-pressed={enhanced} onClick={() => setEnhanced(true)}>Enhanced</button>
              <button type="button" aria-pressed={!enhanced} onClick={() => setEnhanced(false)}>Standard</button>
            </div>
            <div className="comet-overlays">
              {enhanced && <label><input type="checkbox" checked={smooth} onChange={(event) => setSmooth(event.target.checked)} /> Smooth display</label>}
              <label><input type="checkbox" checked={showMarker} onChange={(event) => setShowMarker(event.target.checked)} /> Show predicted positions</label>
              <label><input type="checkbox" checked={showCoverage} onChange={(event) => setShowCoverage(event.target.checked)} /> Show coverage gaps</label>
            </div>
            {showMarker && <p><span className="comet-marker-key" aria-hidden="true" /> Crosshair shows the current predicted position. Dots show earlier predictions in this pass.</p>}
            {showCoverage && <p className="mask-legend"><span aria-hidden="true" /> Blue marks shared coverage gaps. {smoothActive ? "The finer grid also excludes samples without finite support in every exposure." : `${pass.common_pixels.toLocaleString("en")} of ${pass.total_pixels.toLocaleString("en")} pixels have finite data in all three frames.`}</p>}
          </details>
          <div className="comet-scale">
            <span>D6 · {enhanced ? "Color by brightness" : "Standard grayscale"} · Shared scale</span>
            <div aria-hidden="true" className="comet-scale-ramp" style={{ background: colorRamp }} />
            <span>{low.toFixed(2)}–{high.toFixed(2)} MJy/sr display limits</span>
          </div>
          {smoothActive && <p className="comet-sampling">656 × 656 display · resampled from the detector data.</p>}
          <p>The archive flags the predicted center as an outlier in this exposure.</p>
          <ShareLink key={shareParams.toString()} href={`/comet?${shareParams}`} label="Link to this exposure" />
          <details className="comet-provenance">
            <summary>Source and processing details</summary>
            <p>Predicted position {frame.ra.toFixed(5)}°, {frame.dec.toFixed(5)}° (ICRS). Local wavelength can vary. <DisplayMethodLink kind="comet" /></p>
            <div className="cutout-links">
              <a href={cutout.href}>FITS cutout ↗</a>
              <a href={frame.source} target="_blank" rel="noreferrer">Source product ↗</a>
              <a href="https://irsa.ipac.caltech.edu/data/SPHEREx/docs/comet3iatlas/index.html" target="_blank" rel="noreferrer">IRSA observation table ↗</a>
              <a href={passIndex === 0 ? "/observations/comet/processing.json" : "/observations/comet/later/processing.json"}>Processing record (JSON)</a>
            </div>
            <p className="observation-id">{frame.id}</p>
          </details>
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
        <a href="/observations/barnard/processing.json">Processing record (JSON)</a>
        <a href={barnard.calibration} target="_blank" rel="noreferrer">D3 wavelength calibration ↗</a>
        <a href="https://gea.esac.esa.int/archive/" target="_blank" rel="noreferrer">Gaia DR3 source {barnard.gaia.source_id} ↗</a>
      </div>
    </details>
  );
}


export function BarnardMethod() {
  const stages = [
    { image: barnard.method_images.original.image, title: "Original cutout", detail: "Exposure A on its native detector grid, with its own display stretch.", alt: "Original infrared cutout of Barnard’s Star with a bright area near the center" },
    { image: barnard.frames[0].image, title: "Aligned observation", detail: "Exposure A on the shared sky grid, with one grayscale asinh stretch for both exposures.", alt: "Exposure A shown in grayscale with excluded pixels in blue" },
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
