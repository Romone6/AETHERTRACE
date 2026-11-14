"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

type Target = {
  id: string;
  name: string;
  ra_deg: number;
  dec_deg: number;
  source?: string;
};

type Observation = {
  id: string;
  observed_at: string;
  observed_end: string;
  release: string;
  channel: string;
  wavelength_um?: number | null;
  wavelength_min_um: number;
  wavelength_max_um: number;
  product_url?: string;
  provenance: Record<string, unknown>;
  quality_flags?: string[];
  variance_available?: boolean;
};

type Comparison = {
  target: string;
  observation_a: Observation;
  observation_b: Observation;
  status: string;
  difference_url?: string;
  statistics?: unknown;
  uncertainty?: Record<string, unknown>;
  limitations: string[];
};

type FitsInspection = {
  status: "available";
  width: number;
  height: number;
  finite_image_pixels: number;
  flagged_pixels: number | null;
  positive_variance_pixels: number | null;
  spectral_wcs_present: boolean;
};

type View = "home" | "explorer" | "evidence" | "archive" | "method";

let targetCatalog: Promise<Target[]> | null = null;
const observationCatalog = new Map<string, Promise<Observation[]>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTarget(value: unknown): value is Target {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" &&
    typeof value.ra_deg === "number" && typeof value.dec_deg === "number";
}

function isObservation(value: unknown): value is Observation {
  return isRecord(value) && typeof value.id === "string" &&
    typeof value.observed_at === "string" && typeof value.observed_end === "string" &&
    typeof value.release === "string" && typeof value.channel === "string" &&
    (typeof value.wavelength_um === "number" || value.wavelength_um == null) &&
    typeof value.wavelength_min_um === "number" && typeof value.wavelength_max_um === "number" &&
    isRecord(value.provenance);
}

function getTargets() {
  targetCatalog ??= fetch("/api/targets", { headers: { Accept: "application/json" } })
    .then(async (response) => {
      if (!response.ok) throw new Error("The target catalog is unavailable.");
      const data: unknown = await response.json();
      if (!Array.isArray(data) || !data.every(isTarget)) throw new Error("The target catalog did not match its API contract.");
      return data;
    })
    .catch((error) => { targetCatalog = null; throw error; });
  return targetCatalog;
}

function getObservations(targetId: string) {
  let records = observationCatalog.get(targetId);
  if (!records) {
    records = fetch(`/api/observations?target=${encodeURIComponent(targetId)}`, { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Observation service returned ${response.status}.`);
        const data: unknown = await response.json();
        if (!Array.isArray(data) || !data.every(isObservation)) throw new Error("Observations did not match the published API contract.");
        return data;
      })
      .catch((error) => { observationCatalog.delete(targetId); throw error; });
    observationCatalog.set(targetId, records);
  }
  return records;
}

function formatDate(value: string, includeTime = true) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
    timeZone: "UTC",
  }).format(date) + (includeTime ? " UTC" : "");
}

function safeUrl(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><strong>{title}</strong><span>{detail}</span></div>;
}

function isPixelCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isFitsInspection(value: unknown): value is FitsInspection {
  if (!isRecord(value) || value.status !== "available" ||
    !isPixelCount(value.width) || value.width === 0 || !isPixelCount(value.height) || value.height === 0) {
    return false;
  }
  const total = value.width * value.height;
  return isPixelCount(value.finite_image_pixels) && value.finite_image_pixels <= total &&
    (value.flagged_pixels === null || (isPixelCount(value.flagged_pixels) && value.flagged_pixels <= total)) &&
    (value.positive_variance_pixels === null || (isPixelCount(value.positive_variance_pixels) && value.positive_variance_pixels <= total)) &&
    typeof value.spectral_wcs_present === "boolean";
}

function ComparisonCutout({ observation, targetId, label, inspection }: {
  observation: Observation;
  targetId: string;
  label: string;
  inspection: unknown;
}) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const params = new URLSearchParams({ target: targetId, observation_id: observation.id, size: "0.05" });
  const sourceUrl = safeUrl(observation.product_url);
  const hasInspection = isFitsInspection(inspection);

  return (
    <figure className="comparison-cutout">
      <figcaption>
        <span className="micro-label">{label}</span>
        <time dateTime={observation.observed_at}>{formatDate(observation.observed_at)}</time>
        <span>{observation.release} · {observation.channel} · {observation.wavelength_min_um.toFixed(3)}–{observation.wavelength_max_um.toFixed(3)} μm</span>
        <code>{observation.id}</code>
      </figcaption>
      <div className="comparison-image">
        {previewFailed ? (
          <EmptyState title="Preview unavailable" detail="The source record remains available below." />
        ) : (
          <img src={`/api/preview?${params}`} alt={`Display-only SPHEREx cutout from ${formatDate(observation.observed_at)}`} onError={() => setPreviewFailed(true)} />
        )}
      </div>
      {hasInspection ? (
        <dl className="cutout-diagnostics">
          <div><dt>FITS image size</dt><dd>{inspection.width} × {inspection.height} pixels</dd></div>
          <div><dt>Finite image pixels</dt><dd>{inspection.finite_image_pixels}</dd></div>
          <div><dt>Pixels with finite nonzero flags</dt><dd>{inspection.flagged_pixels ?? "Unavailable"}</dd></div>
          <div><dt>Pixels with finite positive variance</dt><dd>{inspection.positive_variance_pixels ?? "Unavailable"}</dd></div>
          <div><dt>Spectral WCS extension</dt><dd>{inspection.spectral_wcs_present ? "Present" : "Absent"}</dd></div>
        </dl>
      ) : (
        <p className="cutout-inspection-status">{isRecord(inspection) && inspection.status === "unavailable" ? "FITS inspection unavailable." : "FITS quality checks unavailable."}</p>
      )}
      <div className="cutout-links">
        <a href={`/api/archive/cutout?${params}`}>Download FITS cutout</a>
        {sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer">Open source product <span aria-hidden="true">↗</span></a>}
      </div>
    </figure>
  );
}

function ComparisonResult({ comparison }: { comparison: Comparison }) {
  const fits = isRecord(comparison.statistics) && comparison.statistics.fits_inspection;
  return (
    <section className="card comparison-result" aria-labelledby="comparison-status">
      <div className="card-heading">
        <div>
          <h2 id="comparison-status">{comparison.status === "INSUFFICIENT_DATA" ? "Visual comparison" : "Comparison results"}</h2>
        </div>
      </div>
      <p className="comparison-caveat">
        These 0.05° cutouts use the same sky coordinates. Brightness is scaled separately for each image, and the images are shown on their original pixel grids.
      </p>
      <div className="comparison-cutouts">
        <ComparisonCutout key={`a:${comparison.observation_a.id}`} observation={comparison.observation_a} targetId={comparison.target} label="Observation A" inspection={isRecord(fits) ? fits.observation_a : undefined} />
        <ComparisonCutout key={`b:${comparison.observation_b.id}`} observation={comparison.observation_b} targetId={comparison.target} label="Observation B" inspection={isRecord(fits) ? fits.observation_b : undefined} />
      </div>
      <p className="comparison-caveat">
        Counts describe each FITS plane separately. Flag bits include processing and status information and need interpretation before masking pixels. Comparing flux requires a shared mask, aligned images, and propagated uncertainty.
      </p>
      <p className="comparison-caveat">This visual comparison cannot establish a change in brightness or position. A measurement requires aligned images, matched wavelengths and propagated uncertainty.</p>
    </section>
  );
}

const pageCopy: Record<Exclude<View, "home">, { title: string; intro: string }> = {
  explorer: { title: "Observation explorer", intro: "Browse SPHEREx images by sky field, detector and date." },
  evidence: { title: "Compare observations", intro: "View two exposures and inspect the quality of their source images." },
  archive: { title: "Archive records", intro: "Find observation IDs, exposure times, wavelength coverage and source files." },
  method: { title: "How to read the images", intro: "Understand SPHEREx cutouts and what a visual comparison can tell you." },
};

export default function Explorer({ view }: { view: View }) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [serviceState, setServiceState] = useState<"loading" | "ready" | "error">("loading");
  const observationRequest = useRef(0);
  const [message, setMessage] = useState("Loading sky fields…");
  const [loadingObservations, setLoadingObservations] = useState(false);
  const [channel, setChannel] = useState("SPHEREx-D3");
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [archiveChannel, setArchiveChannel] = useState("All channels");
  const [visibleCount, setVisibleCount] = useState(24);
  const [epochA, setEpochA] = useState("");
  const [epochB, setEpochB] = useState("");
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [comparisonMessage, setComparisonMessage] = useState("");
  const [loadingComparison, setLoadingComparison] = useState(false);
  const comparisonRequest = useRef<AbortController | null>(null);
  const channels = Array.from(new Set(observations.map((item) => item.channel))).sort();
  const channelObservations = observations.filter((item) => item.channel === channel);
  const frame = channelObservations[frameIndex];
  const filteredObservations = observations.filter((item) => {
    const needle = query.trim().toLocaleLowerCase();
    const matchesQuery = !needle || [item.id, item.release, item.channel, item.observed_at]
      .some((value) => value.toLocaleLowerCase().includes(needle));
    return matchesQuery && (archiveChannel === "All channels" || item.channel === archiveChannel);
  });

  useEffect(() => {
    if (view === "method") return;
    let active = true;
    async function load() {
      try {
        const data = await getTargets();
        if (!active) return;
        setTargets(data);
        setServiceState("ready");
        const savedTarget = window.sessionStorage.getItem("aethertrace-field");
        const first = data.find((item) => item.id === savedTarget) ?? data[0];
        if (!first) {
          setMessage("No sky fields are available.");
          return;
        }
        setTarget(first);
        await loadObservations(first);
      } catch {
        if (!active) return;
        setServiceState("error");
        setMessage("Sky fields are temporarily unavailable.");
      }
    }
    void load();
    return () => {
      active = false;
      observationRequest.current += 1;
    };
  }, [view]);

  async function loadObservations(selected: Target) {
    const request = ++observationRequest.current;
    setLoadingObservations(true);
    setMessage(`Loading observations for ${selected.name}…`);
    try {
      const data = await getObservations(selected.id);
      if (request !== observationRequest.current) return;
      setObservations([...data].sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at)));
      setChannel(data.some((item) => item.channel === "SPHEREx-D3") ? "SPHEREx-D3" : (data[0]?.channel ?? ""));
      setFrameIndex(0);
      setMessage(data.length ? `${data.length.toLocaleString()} observations · ${new Set(data.map((item) => item.channel)).size} detector channels` : "No observations found for this field.");
    } catch {
      if (request !== observationRequest.current) return;
      setObservations([]);
      setMessage("Could not load observations. Try selecting another field.");
    } finally {
      if (request === observationRequest.current) setLoadingObservations(false);
    }
  }

  async function chooseTarget(id: string) {
    const selected = targets.find((item) => item.id === id) ?? null;
    if (!selected) return;
    window.sessionStorage.setItem("aethertrace-field", selected.id);
    setTarget(selected);
    setObservations([]);
    setArchiveChannel("All channels");
    setQuery("");
    setVisibleCount(24);
    clearComparison();
    setEpochA("");
    setEpochB("");
    setFrameIndex(0);
    setPlaying(false);
    await loadObservations(selected);
  }

  useEffect(() => {
    if (!playing || channelObservations.length < 2) return;
    const timer = window.setInterval(() => setFrameIndex((index) => (index + 1) % channelObservations.length), 1200);
    return () => window.clearInterval(timer);
  }, [playing, channelObservations.length]);

  useEffect(() => setPreviewFailed(false), [frame?.id]);

  useEffect(() => () => comparisonRequest.current?.abort(), []);

  function clearComparison() {
    comparisonRequest.current?.abort();
    comparisonRequest.current = null;
    setComparison(null);
    setComparisonMessage("");
    setLoadingComparison(false);
  }

  async function compare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearComparison();
    if (!target || !epochA || !epochB || epochA === epochB) {
      setComparisonMessage("Choose two different observations before reviewing.");
      return;
    }
    const request = new AbortController();
    comparisonRequest.current = request;
    setLoadingComparison(true);
    setComparisonMessage("Checking compatibility and inspecting the source cutouts…");
    try {
      const params = new URLSearchParams({ target: target.id, epoch_a: epochA, epoch_b: epochB, inspect_cutouts: "true" });
      const response = await fetch(`/api/compare?${params}`, { headers: { Accept: "application/json" }, signal: request.signal });
      if (!response.ok) throw new Error(response.status === 422 ? "Choose observations with matching release, detector and wavelength coverage." : "Comparison is temporarily unavailable.");
      const data: unknown = await response.json();
      if (request.signal.aborted) return;
      if (!isRecord(data) || data.target !== target.id ||
        !isObservation(data.observation_a) || data.observation_a.id !== epochA ||
        !isObservation(data.observation_b) || data.observation_b.id !== epochB ||
        typeof data.status !== "string" || !Array.isArray(data.limitations) || !data.limitations.every((item) => typeof item === "string")) {
        throw new Error("Comparison results could not be loaded.");
      }
      setComparison(data as Comparison);
      setComparisonMessage("");
    } catch (error) {
      if (!request.signal.aborted) setComparisonMessage(error instanceof Error ? error.message : "Comparison unavailable.");
    } finally {
      if (comparisonRequest.current === request) {
        comparisonRequest.current = null;
        setLoadingComparison(false);
      }
    }
  }

  const targetControls = (
    <div className="context-bar">
      <div className="context-target">
        <label htmlFor="target-select">Sky field</label>
        <select id="target-select" value={target?.id ?? ""} disabled={serviceState !== "ready" || targets.length === 0} onChange={(event) => void chooseTarget(event.target.value)}>
          {!targets.length && <option value="">{serviceState === "loading" ? "Loading catalog…" : "No targets available"}</option>}
          {targets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>
      <span className="context-message" role="status">{message}</span>
    </div>
  );

  return (
    <main id="main" className={`app-main page-${view}`}>
      {view === "home" ? (
        <>
          <section className="home-hero">
            <div className="home-copy">
              <p className="eyebrow">NASA SPHEREx · Data Release 1</p>
              <h1>Explore the <em>infrared sky</em></h1>
              <p className="home-intro">Browse infrared images of galaxies, nebulae and stars across multiple observation dates.</p>
              {targetControls}
              <div className="home-actions">
                <Link className="button-primary" href="/explorer">Explore observations</Link>
                <Link className="text-link" href="/archive">Browse archive records</Link>
              </div>
            </div>
            <figure className="home-visual">
              {frame && target && !previewFailed ? <img src={`/api/preview?target=${encodeURIComponent(target.id)}&observation_id=${encodeURIComponent(frame.id)}`} alt={`Display-only SPHEREx image preview for ${target.name}, observed ${formatDate(frame.observed_at)}.`} onError={() => setPreviewFailed(true)} /> : <div className="visual-empty">{loadingObservations || serviceState === "loading" ? "Loading image…" : "Image unavailable"}</div>}
              <figcaption><span>{target?.name ?? "SPHEREx DR1"}</span>{frame && <time dateTime={frame.observed_at}>{formatDate(frame.observed_at, false)}</time>}</figcaption>
              <p className="visual-caveat">Brightness is scaled for display.</p>
            </figure>
          </section>
        </>
      ) : (
        <div className="workspace">
          <header className="page-heading"><div><h1>{pageCopy[view].title}</h1><p>{pageCopy[view].intro}</p></div></header>
          {view !== "method" && targetControls}

          {view === "explorer" && (
            <>
              <div className="deck-grid">
                <section className="deck-viewer card" aria-label="Observation sequence">
                  <div className="card-heading"><div><span className="micro-label">{target?.name ?? "TARGET NOT SELECTED"}</span><h2>{frame ? formatDate(frame.observed_at, false) : "No observation selected"}</h2></div><span className="sequence-count">{frame ? `${frameIndex + 1} / ${channelObservations.length}` : "— / —"}</span></div>
                  <div className="deck-stage">
                    {frame && target && !previewFailed ? <img className="deck-image" src={`/api/preview?target=${encodeURIComponent(target.id)}&observation_id=${encodeURIComponent(frame.id)}`} alt={`Display-only SPHEREx cutout for ${target.name}, observed ${formatDate(frame.observed_at)}. Not a calibrated measurement.`} onError={() => setPreviewFailed(true)} /> : <EmptyState title={previewFailed ? "Preview unavailable" : loadingObservations ? "Retrieving archive frames" : "Select a sky field"} detail={previewFailed ? "You can still review the observation details." : "Choose a field to view its images."} />}
                  </div>
                  <div className="playback-controls"><button type="button" className="play-button" onClick={() => setPlaying((value) => !value)} disabled={channelObservations.length < 2} aria-label={playing ? "Pause sequence" : "Play sequence"}>{playing ? "Ⅱ" : "▶"}</button><label htmlFor="frame-select">FRAME</label><input id="frame-select" type="range" min="0" max={Math.max(0, channelObservations.length - 1)} value={frameIndex} disabled={!channelObservations.length} onChange={(event) => { setPlaying(false); setFrameIndex(Number(event.target.value)); }} aria-valuetext={frame ? formatDate(frame.observed_at) : "No frame"} /><span className="channel-control"><label htmlFor="channel-select">CHANNEL</label><select id="channel-select" value={channel} disabled={!channels.length} onChange={(event) => { setChannel(event.target.value); setFrameIndex(0); setPlaying(false); }}>
                    {channels.length ? channels.map((item) => <option key={item} value={item}>{item.replace("SPHEREx-", "")}</option>) : <option value="">—</option>}
                  </select></span></div>
                  <div className="frame-caption"><span>{frame ? `${formatDate(frame.observed_at)} — ${formatDate(frame.observed_end)}` : message}</span><span>{frame ? `${frame.wavelength_min_um.toFixed(3)}–${frame.wavelength_max_um.toFixed(3)} μm` : "— μm"}</span></div>
                </section>
                <aside className="deck-aside">
                  <section className="card frame-meta"><div className="card-heading"><div><h2>Observation details</h2></div></div>
                    {frame ? <dl className="meta-list"><div><dt>PRODUCT ID</dt><dd>{frame.id}</dd></div><div><dt>DATA RELEASE</dt><dd>{frame.release}</dd></div><div><dt>CHANNEL</dt><dd>{frame.channel}</dd></div><div><dt>WAVELENGTH RANGE</dt><dd>{frame.wavelength_min_um.toFixed(3)}–{frame.wavelength_max_um.toFixed(3)} μm</dd></div><div><dt>VARIANCE</dt><dd>{frame.variance_available == null ? "Not reported" : frame.variance_available ? "Available" : "Not available"}</dd></div></dl> : <EmptyState title="No frame selected" detail="Frame metadata will appear when the archive returns observations." />}
                    {safeUrl(frame?.product_url) && <a className="record-link" href={safeUrl(frame?.product_url)!} target="_blank" rel="noreferrer">Open source product <span aria-hidden="true">↗</span></a>}
                  </section>
                  <div className="caution-note"><span className="caution-icon" aria-hidden="true">i</span><p>Each cutout uses the same sky coordinates.{target?.id === "barnards-star" && " The star’s motion can move it away from the center between exposures."}</p></div>
                </aside>
              </div>
              <section className="card sequence-strip"><div className="card-heading"><div><h2>Frames in this channel</h2></div><span className="record-count">{channelObservations.length} RECORDS</span></div>
                {channelObservations.length ? <div className="sequence-list">{channelObservations.slice(Math.max(0, frameIndex - 2), frameIndex + 6).map((item, localIndex) => { const index = Math.max(0, frameIndex - 2) + localIndex; return <button type="button" key={item.id} className={`sequence-item ${index === frameIndex ? "is-selected" : ""}`} onClick={() => { setPlaying(false); setFrameIndex(index); }} aria-current={index === frameIndex ? "true" : undefined}><span className="sequence-node" /><span className="sequence-date">{formatDate(item.observed_at, false)}</span><span className="sequence-id">{item.id}</span><span className="sequence-wave">{item.wavelength_min_um.toFixed(2)}–{item.wavelength_max_um.toFixed(2)} μm</span></button>; })}</div> : <EmptyState title="No frames in this channel" detail={message} />}
              </section>
            </>
          )}

          {view === "evidence" && (
            <section className="evidence-layout">
              <div className="card evidence-card"><div className="card-heading"><h2>Choose two observations</h2></div><p className="section-copy">Both observations must use the same release, detector and wavelength coverage.</p>
                <label className="evidence-channel">Detector <select value={channel} disabled={!channels.length} onChange={(event) => { setChannel(event.target.value); setEpochA(""); setEpochB(""); clearComparison(); }}>{channels.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                <form className="compare-form" onSubmit={compare}>
                  <label>OBSERVATION A
                    <select value={epochA} disabled={channelObservations.length < 2} onChange={(event) => { setEpochA(event.target.value); clearComparison(); }}>
                      <option value="">Select an observation</option>
                      {channelObservations.map((item) => <option key={item.id} value={item.id}>{formatDate(item.observed_at)} · {item.release}</option>)}
                    </select>
                  </label>
                  <span className="compare-connector" aria-hidden="true">+</span>
                  <label>OBSERVATION B
                    <select value={epochB} disabled={channelObservations.length < 2} onChange={(event) => { setEpochB(event.target.value); clearComparison(); }}>
                      <option value="">Select an observation</option>
                      {channelObservations.map((item) => <option key={item.id} value={item.id}>{formatDate(item.observed_at)} · {item.release}</option>)}
                    </select>
                  </label>
                  <button className="button-primary" type="submit" disabled={channelObservations.length < 2 || loadingComparison}>
                    {loadingComparison ? "Reviewing…" : "View comparison"}<span aria-hidden="true">↗</span>
                  </button>
                </form>
                {comparisonMessage && <p className="inline-message" role="status">{comparisonMessage}</p>}
              </div>

              {comparison && <ComparisonResult comparison={comparison} />}
            </section>
          )}

          {view === "archive" && (
            <section className="card archive-card"><div className="archive-toolbar"><div><h2>{loadingObservations ? "Loading records…" : `${filteredObservations.length} ${filteredObservations.length === 1 ? "observation" : "observations"}`}</h2></div><div className="archive-filters"><label className="search-box"><span aria-hidden="true">⌕</span><span className="sr-only">Search archive records</span><input type="search" placeholder="Search IDs, channel, date…" value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(24); }} /></label><label className="filter-select"><span className="sr-only">Filter by detector channel</span><select value={archiveChannel} onChange={(event) => { setArchiveChannel(event.target.value); setVisibleCount(24); }}><option>All channels</option>{channels.map((item) => <option key={item}>{item}</option>)}</select></label></div></div>
              <div className="archive-table-wrap"><table className="archive-table"><thead><tr><th>Observation</th><th>Observed · UTC</th><th>Channel</th><th>Wavelength</th><th>Release</th><th>Variance</th></tr></thead><tbody>{filteredObservations.slice(0, visibleCount).map((item) => <tr key={item.id}><td><details className="record-disclosure"><summary><code>{item.id}</code></summary><div className="record-provenance"><p><strong>Source record</strong></p>{item.quality_flags?.length ? <p>Quality flags: {item.quality_flags.join(", ")}</p> : <p>No quality flags reported.</p>}{safeUrl(item.product_url) && <a href={safeUrl(item.product_url)!} target="_blank" rel="noreferrer">Open source product ↗</a>}</div></details></td><td>{formatDate(item.observed_at)}</td><td>{item.channel.replace("SPHEREx-", "")}</td><td>{item.wavelength_min_um.toFixed(3)}–{item.wavelength_max_um.toFixed(3)} μm</td><td><span className="table-release">{item.release}</span></td><td>{item.variance_available == null ? "—" : item.variance_available ? "Available" : "No"}</td></tr>)}</tbody></table></div>
              {!loadingObservations && filteredObservations.length === 0 && <EmptyState title="No matching records" detail={observations.length ? "Try a different observation ID, date or detector." : message} />}
              {filteredObservations.length > visibleCount && <button className="load-more" type="button" onClick={() => setVisibleCount((count) => count + 24)}>Load more records <span aria-hidden="true">↓</span></button>}
            </section>
          )}

          {view === "method" && (
            <>
              <div className="method-steps">
                <article className="method-step"><div><h2>Source observations</h2><p>The NASA/IPAC Infrared Science Archive provides the SPHEREx Data Release 1 images. Each record includes the original observation ID, exposure time, detector and wavelength range.</p></div></article>
                <article className="method-step"><div><h2>Image previews</h2><p>Each preview shows a cutout around fixed sky coordinates. Brightness is scaled for each image so faint detail is easier to see. Use the FITS files for measurements.</p></div></article>
                <article className="method-step"><div><h2>Scientific comparisons</h2><p>Measuring a change requires matching the wavelength at the target, aligning the images, interpreting pixel flags and accounting for uncertainty. A moving target may also need a different cutout center at each exposure.</p></div></article>
              </div>
              <div className="method-links"><a href="https://irsa.ipac.caltech.edu/Missions/spherex.html" target="_blank" rel="noreferrer">SPHEREx at IRSA <span aria-hidden="true">↗</span></a></div>
            </>
          )}
        </div>
      )}
    </main>
  );
}
