"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

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
  wavelength_um: number | null;
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
  uncertainty?: Record<string, unknown>;
  limitations: string[];
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
    (typeof value.wavelength_um === "number" || value.wavelength_um === null) &&
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
  return <div className="empty-state"><span className="empty-glyph" aria-hidden="true">✳</span><strong>{title}</strong><span>{detail}</span></div>;
}

const pageCopy: Record<Exclude<View, "home">, { eyebrow: string; title: string; intro: string }> = {
  explorer: { eyebrow: "AETHERTRACE / EXPLORER", title: "Observation deck", intro: "Move through the SPHEREx archive one exposure at a time." },
  evidence: { eyebrow: "AETHERTRACE / EVIDENCE", title: "Review the evidence", intro: "Compare compatible archive observations and see what the data can—and cannot—support." },
  archive: { eyebrow: "AETHERTRACE / ARCHIVE", title: "Source records", intro: "Browse the returned archive metadata, with IDs, release details, wavelengths, and provenance intact." },
  method: { eyebrow: "AETHERTRACE / METHOD", title: "Read the signal carefully", intro: "A traceable path from archive product to a cautious, reproducible interpretation." },
};

export default function Explorer({ view }: { view: View }) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [serviceState, setServiceState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("Connecting to the archive service…");
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
    async function load() {
      try {
        const data = await getTargets();
        setTargets(data);
        setServiceState("ready");
        const first = data[0];
        if (!first) {
          setMessage("The API is ready, but no targets are currently listed.");
          return;
        }
        setTarget(first);
        await loadObservations(first);
      } catch (error) {
        setServiceState("error");
        setMessage(error instanceof Error ? error.message : "Archive service unavailable.");
      }
    }
    void load();
  }, []);

  async function loadObservations(selected: Target) {
    setLoadingObservations(true);
    setMessage(`Retrieving archive records for ${selected.name}…`);
    try {
      const data = await getObservations(selected.id);
      setObservations(data);
      setChannel(data.some((item) => item.channel === "SPHEREx-D3") ? "SPHEREx-D3" : (data[0]?.channel ?? ""));
      setFrameIndex(0);
      setMessage(data.length ? `${data.length} source records returned from the SPHEREx archive.` : "No archive observations were returned for this target.");
    } catch (error) {
      setObservations([]);
      setMessage(error instanceof Error ? error.message : "Could not retrieve archive records.");
    } finally {
      setLoadingObservations(false);
    }
  }

  async function chooseTarget(id: string) {
    const selected = targets.find((item) => item.id === id) ?? null;
    if (!selected) return;
    setTarget(selected);
    setObservations([]);
    setComparison(null);
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

  async function compare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target || !epochA || !epochB || epochA === epochB) {
      setComparison(null);
      setComparisonMessage("Choose two different observations before reviewing.");
      return;
    }
    setLoadingComparison(true);
    setComparison(null);
    setComparisonMessage("Checking compatibility with the archive service…");
    try {
      const params = new URLSearchParams({ target: target.id, epoch_a: epochA, epoch_b: epochB });
      const response = await fetch(`/api/compare?${params}`, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(response.status === 422 ? "The selected products are scientifically incompatible." : `Comparison service returned ${response.status}.`);
      const data: unknown = await response.json();
      if (!isRecord(data) || data.target !== target.id || !isObservation(data.observation_a) || !isObservation(data.observation_b) || typeof data.status !== "string" || !Array.isArray(data.limitations)) {
        throw new Error("Comparison response did not match the published API contract.");
      }
      setComparison(data as Comparison);
      setComparisonMessage("");
    } catch (error) {
      setComparisonMessage(`${error instanceof Error ? error.message : "Comparison unavailable."} No change claim is shown.`);
    } finally {
      setLoadingComparison(false);
    }
  }

  const targetControls = (
    <div className="context-bar">
      <div className="context-target">
        <span className="context-icon" aria-hidden="true">⌖</span>
        <label htmlFor="target-select">Target</label>
        <select id="target-select" value={target?.id ?? ""} disabled={serviceState !== "ready" || targets.length === 0} onChange={(event) => void chooseTarget(event.target.value)}>
          {!targets.length && <option value="">{serviceState === "loading" ? "Loading catalog…" : "No targets available"}</option>}
          {targets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>
      <div className="context-service" role="status"><i className={`status-dot ${serviceState}`} />{loadingObservations ? "Loading records" : serviceState === "ready" ? "Archive connected" : serviceState === "loading" ? "Connecting" : "Service unavailable"}</div>
      <span className="context-message">{message}</span>
    </div>
  );

  return (
    <main id="main" className={`app-main page-${view}`}>
      {view === "home" ? (
        <>
          <section className="home-hero">
            <div className="home-copy">
              <p className="eyebrow"><span className="status-dot ready" /> SPHEREx · DATA RELEASE 1</p>
              <h1>Look closer.<br /><em>Stay curious.</em></h1>
              <p className="home-intro">A clearer way to explore the infrared sky. Follow real observations, see where they came from, and keep every conclusion grounded in the evidence.</p>
              <div className="home-actions"><Link className="button-primary" href="/explorer">Enter the observation deck <span aria-hidden="true">↗</span></Link><Link className="text-link" href="/method">How we handle evidence</Link></div>
              <div className="home-trust"><span className="trust-mark">01</span><span>Archive records, provenance and limitations<br />kept together at every step.</span></div>
            </div>
            <figure className="home-visual">
              {frame && target && !previewFailed ? <img src={`/api/preview?target=${encodeURIComponent(target.id)}&observation_id=${encodeURIComponent(frame.id)}`} alt={`Display-only SPHEREx image preview for ${target.name}, observed ${formatDate(frame.observed_at)}.`} onError={() => setPreviewFailed(true)} /> : <div className="visual-empty"><span className="orbit orbit-a" /><span className="orbit orbit-b" /><span className="orbit-core" /><span className="visual-caption">{serviceState === "loading" ? "CONNECTING TO ARCHIVE" : "NO IMAGE PREVIEW AVAILABLE"}</span></div>}
              <figcaption><span>OBSERVATION PREVIEW</span><span>{target?.name ?? "SPHEREx DR1"}</span></figcaption>
              <p className="visual-caveat">Display stretch only · not calibrated photometry</p>
            </figure>
          </section>
          <section className="home-data" aria-label="Live archive summary">
            <div><span>Archive records</span><strong>{observations.length || "—"}</strong></div>
            <div><span>Detector channels</span><strong>{channels.length || "—"}</strong></div>
            <div><span>Selected sequence</span><strong>{channelObservations.length || "—"}<small> frames</small></strong></div>
            <p>{message}</p>
          </section>
          <section className="home-pages">
            <div className="section-intro"><p className="eyebrow">A trace through the data</p><h2>From archive to understanding.</h2><p>Every view stays connected to the original observation and the limits of what it can tell us.</p></div>
            <div className="destination-grid">
              <Link href="/explorer" className="destination-card"><span className="destination-index">01 / EXPLORE</span><strong>Observation deck</strong><span>Follow individual frames across time and channel.</span><b aria-hidden="true">↗</b></Link>
              <Link href="/evidence" className="destination-card"><span className="destination-index">02 / REVIEW</span><strong>Evidence review</strong><span>Check compatibility before comparing two epochs.</span><b aria-hidden="true">↗</b></Link>
              <Link href="/archive" className="destination-card"><span className="destination-index">03 / TRACE</span><strong>Archive records</strong><span>Inspect product IDs, release metadata and provenance.</span><b aria-hidden="true">↗</b></Link>
            </div>
          </section>
        </>
      ) : (
        <div className="workspace">
          <header className="page-heading"><div><p className="eyebrow">{pageCopy[view].eyebrow}</p><h1>{pageCopy[view].title}</h1><p>{pageCopy[view].intro}</p></div><span className="release-chip"><i className="status-dot ready" /> LIVE ARCHIVE</span></header>
          {view !== "method" && targetControls}

          {view === "explorer" && (
            <>
              <div className="deck-grid">
                <section className="deck-viewer card" aria-label="Observation sequence">
                  <div className="card-heading"><div><span className="micro-label">{target?.name ?? "TARGET NOT SELECTED"}</span><h2>{frame ? formatDate(frame.observed_at, false) : "Waiting for an observation"}</h2></div><span className="sequence-count">{frame ? `${frameIndex + 1} / ${channelObservations.length}` : "— / —"}</span></div>
                  <div className="deck-stage">
                    {frame && target && !previewFailed ? <img className="deck-image" src={`/api/preview?target=${encodeURIComponent(target.id)}&observation_id=${encodeURIComponent(frame.id)}`} alt={`Display-only SPHEREx cutout for ${target.name}, observed ${formatDate(frame.observed_at)}. Not a calibrated measurement.`} onError={() => setPreviewFailed(true)} /> : <EmptyState title={previewFailed ? "Preview unavailable" : loadingObservations ? "Retrieving archive frames" : "Select a target to begin"} detail={previewFailed ? "The archive image could not be rendered. The source metadata remain available." : "Only images returned from the live archive are shown here."} />}
                    <span className="stage-corner stage-tl" /><span className="stage-corner stage-tr" /><span className="stage-corner stage-bl" /><span className="stage-corner stage-br" />
                    <span className="stage-label">{frame ? `${frame.release} / ${frame.channel}` : "SPHEREx DR1"}</span>
                  </div>
                  <div className="playback-controls"><button type="button" className="play-button" onClick={() => setPlaying((value) => !value)} disabled={channelObservations.length < 2} aria-label={playing ? "Pause sequence" : "Play sequence"}>{playing ? "Ⅱ" : "▶"}</button><label htmlFor="frame-select">FRAME</label><input id="frame-select" type="range" min="0" max={Math.max(0, channelObservations.length - 1)} value={frameIndex} disabled={!channelObservations.length} onChange={(event) => { setPlaying(false); setFrameIndex(Number(event.target.value)); }} aria-valuetext={frame ? formatDate(frame.observed_at) : "No frame"} /><span className="channel-control"><label htmlFor="channel-select">CHANNEL</label><select id="channel-select" value={channel} disabled={!channels.length} onChange={(event) => { setChannel(event.target.value); setFrameIndex(0); setPlaying(false); }}>
                    {channels.length ? channels.map((item) => <option key={item} value={item}>{item.replace("SPHEREx-", "")}</option>) : <option value="">—</option>}
                  </select></span></div>
                  <div className="frame-caption"><span>{frame ? `${formatDate(frame.observed_at)} — ${formatDate(frame.observed_end)}` : message}</span><span>{frame ? `${frame.wavelength_min_um.toFixed(3)}–${frame.wavelength_max_um.toFixed(3)} μm` : "— μm"}</span></div>
                </section>
                <aside className="deck-aside">
                  <section className="card frame-meta"><div className="card-heading"><div><span className="micro-label">FRAME DETAILS</span><h2>Observation context</h2></div><span className="meta-number">01</span></div>
                    {frame ? <dl className="meta-list"><div><dt>PRODUCT ID</dt><dd>{frame.id}</dd></div><div><dt>DATA RELEASE</dt><dd>{frame.release}</dd></div><div><dt>CHANNEL</dt><dd>{frame.channel}</dd></div><div><dt>WAVELENGTH RANGE</dt><dd>{frame.wavelength_min_um.toFixed(3)}–{frame.wavelength_max_um.toFixed(3)} μm</dd></div><div><dt>VARIANCE</dt><dd>{frame.variance_available == null ? "Not reported" : frame.variance_available ? "Available" : "Not available"}</dd></div></dl> : <EmptyState title="No frame selected" detail="Frame metadata will appear when the archive returns observations." />}
                    {safeUrl(frame?.product_url) && <a className="record-link" href={safeUrl(frame?.product_url)!} target="_blank" rel="noreferrer">Open source product <span aria-hidden="true">↗</span></a>}
                  </section>
                  <div className="caution-note"><span className="caution-icon" aria-hidden="true">i</span><p><strong>Position is not propagated.</strong> This cutout uses a fixed sky coordinate. Barnard’s Star proper motion has not been applied, so centering on the star is not verified at each epoch.</p></div>
                </aside>
              </div>
              <section className="card sequence-strip"><div className="card-heading"><div><span className="micro-label">TIME ORDERED</span><h2>Frames in this channel</h2></div><span className="record-count">{channelObservations.length} RECORDS</span></div>
                {channelObservations.length ? <div className="sequence-list">{channelObservations.slice(Math.max(0, frameIndex - 2), frameIndex + 6).map((item, localIndex) => { const index = Math.max(0, frameIndex - 2) + localIndex; return <button type="button" key={item.id} className={`sequence-item ${index === frameIndex ? "is-selected" : ""}`} onClick={() => { setPlaying(false); setFrameIndex(index); }} aria-current={index === frameIndex ? "true" : undefined}><span className="sequence-node" /><span className="sequence-date">{formatDate(item.observed_at, false)}</span><span className="sequence-id">{item.id}</span><span className="sequence-wave">{item.wavelength_min_um.toFixed(2)}–{item.wavelength_max_um.toFixed(2)} μm</span></button>; })}</div> : <EmptyState title="No frames in this channel" detail={message} />}
              </section>
            </>
          )}

          {view === "evidence" && (
            <section className="evidence-layout">
              <div className="card evidence-card"><div className="card-heading"><div><span className="micro-label">PAIRWISE REVIEW</span><h2>Choose two observations</h2></div><span className="meta-number">02</span></div><p className="section-copy">The API checks release and wavelength compatibility before returning a comparison. Similar-looking image cutouts alone do not establish a change.</p>
                <form className="compare-form" onSubmit={compare}><label>EARLIER OBSERVATION<select value={epochA} disabled={channelObservations.length < 2} onChange={(event) => setEpochA(event.target.value)}><option value="">Select an observation</option>{channelObservations.map((item) => <option key={item.id} value={item.id}>{formatDate(item.observed_at)} · {item.release}</option>)}</select></label><span className="compare-connector" aria-hidden="true">→</span><label>LATER OBSERVATION<select value={epochB} disabled={channelObservations.length < 2} onChange={(event) => setEpochB(event.target.value)}><option value="">Select an observation</option>{channelObservations.map((item) => <option key={item.id} value={item.id}>{formatDate(item.observed_at)} · {item.release}</option>)}</select></label><button className="button-primary" type="submit" disabled={channelObservations.length < 2 || loadingComparison}>{loadingComparison ? "Reviewing…" : "Review compatibility"}<span aria-hidden="true">↗</span></button></form>
                {comparisonMessage && <p className="inline-message" role="status">{comparisonMessage}</p>}
              </div>
              <aside className="evidence-aside"><div className="evidence-principle"><span className="eyebrow">AETHERTRACE PRINCIPLE</span><blockquote>“A change is a question, not a conclusion.”</blockquote><p>Evidence quality depends on calibration, registration, uncertainty, and comparable coverage.</p></div><div className="evidence-state"><span className="micro-label">CURRENT READINESS</span><strong>{observations.length ? `${channelObservations.length} ${channel} observations` : "Waiting for archive records"}</strong><p>Candidate generation waits for calibrated, registered measurements.</p><Link href="/method">Read the method <span aria-hidden="true">↗</span></Link></div></aside>
              {comparison && <section className="card comparison-result"><div className="card-heading"><div><span className="micro-label">API ASSESSMENT</span><h2>{comparison.status.replaceAll("_", " ")}</h2></div><span className="status-pill">{comparison.status === "INSUFFICIENT_DATA" ? "NO CHANGE CLAIM" : "REVIEW REQUIRED"}</span></div><div className="comparison-pair"><div><span>EARLIER</span><strong>{formatDate(comparison.observation_a.observed_at)}</strong><code>{comparison.observation_a.id}</code></div><span aria-hidden="true">→</span><div><span>LATER</span><strong>{formatDate(comparison.observation_b.observed_at)}</strong><code>{comparison.observation_b.id}</code></div></div><div className="limitations"><h3>Limitations returned by the API</h3>{comparison.limitations.length ? <ul>{comparison.limitations.map((item) => <li key={item}>{item}</li>)}</ul> : <p>No limitations were listed in this response.</p>}</div><p className="no-measurement">{comparison.uncertainty ? `Uncertainty: ${JSON.stringify(comparison.uncertainty)}` : "No calibrated difference measurement or uncertainty is available for this pair."}</p></section>}
            </section>
          )}

          {view === "archive" && (
            <section className="card archive-card"><div className="archive-toolbar"><div><span className="micro-label">SOURCE: IRSA SPHEREx SIA</span><h2>{loadingObservations ? "Loading records…" : `${filteredObservations.length} observations`}</h2></div><div className="archive-filters"><label className="search-box"><span aria-hidden="true">⌕</span><span className="sr-only">Search archive records</span><input type="search" placeholder="Search IDs, channel, date…" value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(24); }} /></label><label className="filter-select"><span className="sr-only">Filter by detector channel</span><select value={archiveChannel} onChange={(event) => { setArchiveChannel(event.target.value); setVisibleCount(24); }}><option>All channels</option>{channels.map((item) => <option key={item}>{item}</option>)}</select></label></div></div>
              <div className="archive-table-wrap"><table className="archive-table"><thead><tr><th>Observation</th><th>Observed · UTC</th><th>Channel</th><th>Wavelength</th><th>Release</th><th>Variance</th></tr></thead><tbody>{filteredObservations.slice(0, visibleCount).map((item) => <tr key={item.id}><td><details className="record-disclosure"><summary><code>{item.id}</code></summary><div className="record-provenance"><p><strong>Archive provenance</strong></p><pre>{JSON.stringify(item.provenance, null, 2)}</pre>{item.quality_flags?.length ? <p>Quality flags: {item.quality_flags.join(", ")}</p> : <p>No quality flags reported.</p>}{safeUrl(item.product_url) && <a href={safeUrl(item.product_url)!} target="_blank" rel="noreferrer">Open source product ↗</a>}</div></details></td><td>{formatDate(item.observed_at)}</td><td>{item.channel.replace("SPHEREx-", "")}</td><td>{item.wavelength_min_um.toFixed(3)}–{item.wavelength_max_um.toFixed(3)} μm</td><td><span className="table-release">{item.release}</span></td><td>{item.variance_available == null ? "—" : item.variance_available ? "Available" : "No"}</td></tr>)}</tbody></table></div>
              {filteredObservations.length === 0 && <EmptyState title="No matching records" detail="Try a different product ID, date, or channel." />}
              {filteredObservations.length > visibleCount && <button className="load-more" type="button" onClick={() => setVisibleCount((count) => count + 24)}>Load more records <span aria-hidden="true">↓</span></button>}
              <p className="archive-footnote">Archive metadata are shown as returned. Missing fields are not inferred; provenance expands from each observation ID.</p>
            </section>
          )}

          {view === "method" && (
            <>
              <section className="method-intro card"><div><span className="micro-label">THE EVIDENCE STANDARD</span><h2>Every result should leave a trail.</h2></div><p>AETHERTRACE connects each display and comparison to its archive source. When a measurement is unavailable, the interface says so plainly.</p></section>
              <div className="method-steps"><article className="method-step"><span>01</span><div><h2>Start with the archive</h2><p>Observations are retrieved from the IRSA SPHEREx SIA service. Product identifiers, UTC time bounds, wavelength intervals, and source parameters travel with the record.</p></div><small>SOURCE RECORD</small></article><article className="method-step"><span>02</span><div><h2>Inspect the observation</h2><p>Image previews use a display stretch for visual inspection only. They are not calibrated photometry and are not a change measurement.</p></div><small>DISPLAY ONLY</small></article><article className="method-step"><span>03</span><div><h2>Check comparability</h2><p>The API rejects products from incompatible releases or wavelength intervals. A compatible pair can still be insufficient for a scientific change claim.</p></div><small>PAIRWISE CHECK</small></article><article className="method-step"><span>04</span><div><h2>Keep limitations visible</h2><p>Calibration, registration, uncertainty, and target motion matter. For Barnard’s Star, the current query uses a fixed coordinate and has not applied proper motion.</p></div><small>NO OVERCLAIM</small></article></div>
              <div className="method-links"><div><span className="micro-label">CURRENT DATASET</span><strong>SPHEREx Data Release 1</strong><p>One supported target · archive-backed metadata and image cutouts.</p></div><a href="https://irsa.ipac.caltech.edu/Missions/spherex.html" target="_blank" rel="noreferrer">SPHEREx at IRSA <span aria-hidden="true">↗</span></a></div>
            </>
          )}
        </div>
      )}
    </main>
  );
}
