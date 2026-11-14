"use client";

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
  wavelength_um: number;
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
  status:
    | "NO_SIGNIFICANT_CHANGE"
    | "CANDIDATE_CHANGE"
    | "INCONCLUSIVE"
    | "INSUFFICIENT_DATA"
    | "PROCESSING_ERROR";
  difference_url?: string;
  uncertainty?: Record<string, unknown>;
  limitations: string[];
};

const statuses: Comparison["status"][] = [
  "NO_SIGNIFICANT_CHANGE",
  "CANDIDATE_CHANGE",
  "INCONCLUSIVE",
  "INSUFFICIENT_DATA",
  "PROCESSING_ERROR",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTarget(value: unknown): value is Target {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.ra_deg === "number" &&
    typeof value.dec_deg === "number" &&
    (value.source === undefined || typeof value.source === "string")
  );
}

function isObservation(value: unknown): value is Observation {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.observed_at === "string" &&
    typeof value.observed_end === "string" &&
    typeof value.release === "string" &&
    typeof value.channel === "string" &&
    typeof value.wavelength_um === "number" &&
    typeof value.wavelength_min_um === "number" &&
    typeof value.wavelength_max_um === "number" &&
    isRecord(value.provenance) &&
    (value.variance_available == null ||
      typeof value.variance_available === "boolean") &&
    (value.quality_flags == null ||
      (Array.isArray(value.quality_flags) &&
        value.quality_flags.every((flag) => typeof flag === "string"))) &&
    (value.product_url == null || typeof value.product_url === "string")
  );
}

function isTargets(value: unknown): value is Target[] {
  return Array.isArray(value) && value.every(isTarget);
}

function isObservations(value: unknown): value is Observation[] {
  return Array.isArray(value) && value.every(isObservation);
}

function isComparison(
  value: unknown,
  targetId: string,
  epochA: string,
  epochB: string,
): value is Comparison {
  return (
    isRecord(value) &&
    value.target === targetId &&
    typeof value.status === "string" &&
    statuses.includes(value.status as Comparison["status"]) &&
    Array.isArray(value.limitations) &&
    value.limitations.every((item) => typeof item === "string") &&
    isObservation(value.observation_a) &&
    isObservation(value.observation_b) &&
    value.observation_a.id === epochA &&
    value.observation_b.id === epochB &&
    (value.uncertainty == null || isRecord(value.uncertainty)) &&
    (value.difference_url == null ||
      typeof value.difference_url === "string")
  );
}

function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? value
    : `${new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(parsed)} UTC`;
}

function display(value: unknown, fallback = "Not provided") {
  return value == null || value === "" ? fallback : String(value);
}

function safeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden="true">
        ⌕
      </span>
      <p>{title}</p>
      <span>{detail}</span>
    </div>
  );
}

function ObservationCard({
  item,
  source,
}: {
  item: Observation;
  source?: string;
}) {
  const productUrl = item.product_url ? safeHttpUrl(item.product_url) : null;
  const details: [string, string][] = [
    ["SOURCE", display(source)],
    ["OBSERVED (UTC)", formatDate(item.observed_at)],
    ["WAVELENGTH", `${item.wavelength_um} μm`],
    ["CHANNEL", item.channel],
    [
      "VARIANCE",
      item.variance_available == null
        ? "Not provided"
        : item.variance_available
          ? "Available"
          : "Not available",
    ],
  ];

  return (
    <article className="observation-card">
      <div className="observation-top">
        <span className="observation-id">{item.id}</span>
        <span className="release-tag">{item.release}</span>
      </div>
      <dl className="observation-details">
        {details.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {item.quality_flags?.length ? (
        <p className="quality-flags">
          Quality flags: {item.quality_flags.join(", ")}
        </p>
      ) : null}
      <p className="provenance">
        Provenance: {JSON.stringify(item.provenance)}
      </p>
      {productUrl ? (
        <a
          className="record-link"
          href={productUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open archive product ↗
        </a>
      ) : null}
    </article>
  );
}

export default function Explorer() {
  const [targets, setTargets] = useState<Target[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [selectedChannel, setSelectedChannel] = useState("SPHEREx-D3");
  const [serviceReady, setServiceReady] = useState(false);
  const [serviceLoading, setServiceLoading] = useState(true);
  const [serviceMessage, setServiceMessage] = useState(
    "Connecting to the observation service…",
  );
  const [targetMessage, setTargetMessage] = useState(
    "Targets appear here when the API is ready.",
  );
  const [observationMessage, setObservationMessage] = useState(
    "Select a target to inspect its archive observations.",
  );
  const [comparisonMessage, setComparisonMessage] = useState(
    "Comparison results, uncertainty, and limitations will appear here when available from the API.",
  );
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [loadingObservations, setLoadingObservations] = useState(false);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const [epochA, setEpochA] = useState("");
  const [epochB, setEpochB] = useState("");
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const observationRequest = useRef<AbortController | null>(null);
  const channels = Array.from(new Set(observations.map((item) => item.channel))).sort();
  const channelObservations = observations.filter((item) => item.channel === selectedChannel);
  const frame = channelObservations[frameIndex];

  useEffect(() => {
    if (!playing || channelObservations.length < 2) return;
    const timer = window.setInterval(() => {
      setFrameIndex((index) => (index + 1) % channelObservations.length);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [playing, channelObservations.length]);

  useEffect(() => {
    setPreviewFailed(false);
  }, [frame?.id]);

  useEffect(() => {
    const request = new AbortController();
    fetch("/api/targets", {
      headers: { Accept: "application/json" },
      signal: request.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Target service returned ${response.status}`);
        const data: unknown = await response.json();
        if (!isTargets(data)) {
          throw new Error("Target response did not match the API contract");
        }
        setTargets(data);
        setServiceReady(true);
        setServiceLoading(false);
        setTargetMessage(
          data.length
            ? `${data.length} catalog ${data.length === 1 ? "target" : "targets"} available.`
            : "The API is ready but has no catalog targets yet.",
        );
        setServiceMessage(
          data.length
            ? "Connected to the archive service. Select a target to load its observations."
            : "API connected. No targets are currently available.",
        );
      })
      .catch(() => {
        if (request.signal.aborted) return;
        setServiceReady(false);
        setServiceLoading(false);
        setTargetMessage("Target catalog will appear when the API is ready.");
        setServiceMessage(
          "Live archive data is not available yet. This explorer does not show sample observations.",
        );
      });
    return () => request.abort();
  }, []);

  async function selectTarget(id: string) {
    observationRequest.current?.abort();
    const request = new AbortController();
    observationRequest.current = request;
    const selected = targets.find((item) => item.id === id) ?? null;
    setTarget(selected);
    setObservations([]);
    setComparison(null);
    setEpochA("");
    setEpochB("");
    setFrameIndex(0);
    setPlaying(false);
    setSelectedChannel("SPHEREx-D3");
    setComparisonMessage(
      selected
        ? "Choose two observations to request an evidence-bearing comparison."
        : "Comparison results, uncertainty, and limitations will appear here when available from the API.",
    );
    if (!selected) {
      setLoadingObservations(false);
      setObservationMessage("Select a target to inspect its archive observations.");
      return;
    }

    setLoadingObservations(true);
    setObservationMessage("Retrieving archive observations…");
    try {
      const response = await fetch(
        `/api/observations?target=${encodeURIComponent(selected.id)}`,
        { headers: { Accept: "application/json" }, signal: request.signal },
      );
      if (!response.ok) {
        throw new Error(`Observation service returned ${response.status}`);
      }
      const data: unknown = await response.json();
      if (!isObservations(data)) {
        throw new Error("Observation response did not match the API contract");
      }
      setObservations(data);
      setObservationMessage(
        data.length
          ? ""
          : "No observations returned for this target. The archive may not contain records for it.",
      );
    } catch {
      if (request.signal.aborted) return;
      setObservations([]);
      setObservationMessage(
        "Could not load observations. The API response was unavailable or did not match the published contract.",
      );
    } finally {
      if (!request.signal.aborted) setLoadingObservations(false);
    }
  }

  async function compare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target || !epochA || !epochB || epochA === epochB) {
      setComparison(null);
      setComparisonMessage("Select two different observations before comparing.");
      return;
    }
    setLoadingComparison(true);
    setComparison(null);
    setComparisonMessage("Checking compatibility and retrieving evidence…");
    try {
      const params = new URLSearchParams({
        target: target.id,
        epoch_a: epochA,
        epoch_b: epochB,
      });
      const response = await fetch(`/api/compare?${params}`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(
          response.status === 422
            ? "These observations are invalid or scientifically incompatible."
            : `Comparison service returned ${response.status}`,
        );
      }
      const data: unknown = await response.json();
      if (!isComparison(data, target.id, epochA, epochB)) {
        throw new Error("Comparison response did not match the API contract");
      }
      setComparison(data);
      setComparisonMessage("");
    } catch (error) {
      setComparison(null);
      setComparisonMessage(
        `${error instanceof Error ? error.message : "Comparison unavailable."} No change claim is shown.`,
      );
    } finally {
      setLoadingComparison(false);
    }
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to explorer
      </a>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="Aethertrace home">
          AETHERTRACE
        </a>
        <nav aria-label="Main navigation">
          <a href="#explorer">Explorer</a>
          <a href="#comparison">Evidence</a>
          <a href="#archive">Archive</a>
          <a href="#method">How to read this</a>
        </nav>
        <a className="header-cta" href="#explorer">Explore observations</a>
      </header>

      <main id="main">
        <section className="hero" id="top" aria-labelledby="hero-title">
          <div className="hero-copy">
            <h1 id="hero-title">
              A closer look at
              <br />
              the <em>infrared sky.</em>
            </h1>
            <p className="hero-intro">
              Explore SPHEREx observations across the sky, with clear context and provenance.
            </p>
            <a className="hero-cta" href="#explorer">Explore observations</a>
          </div>
          <figure className="hero-observation">
            {frame && target && !previewFailed ? (
              <img
                key={`hero-${frame.id}`}
                src={`/api/preview?target=${encodeURIComponent(target.id)}&observation_id=${encodeURIComponent(frame.id)}`}
                alt={`SPHEREx ${frame.release} display preview for ${target.name}, observed ${formatDate(frame.observed_at)}. Not calibrated photometry.`}
                onError={() => setPreviewFailed(true)}
              />
            ) : (
              <div className="hero-empty" role="status">
                {previewFailed ? "Archive preview unavailable" : "Select a target to load an archive preview"}
              </div>
            )}
          </figure>
          <div className="hero-facts" aria-label="Selected observation details">
            <div><strong>{frame?.release ?? "SPHEREx"}</strong><span>Data release</span></div>
            <div><strong>{channelObservations.length ? `${channelObservations.length} ${selectedChannel} frames` : "Select a target"}</strong><span>Observation sequence</span></div>
            <div><strong>{channelObservations.length ? `${Math.min(...channelObservations.map((item) => item.wavelength_min_um)).toFixed(2)}–${Math.max(...channelObservations.map((item) => item.wavelength_max_um)).toFixed(2)} μm` : "Wavelength range varies"}</strong><span>Selected channel coverage</span></div>
          </div>
          <p className="hero-caveat">Display preview · not calibrated photometry.</p>
        </section>

        <section
          className="explorer-section"
          id="explorer"
          aria-labelledby="explorer-title"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">The observation desk</p>
              <h2 id="explorer-title">Explore a target</h2>
            </div>
            <p className="section-note">
              Real archive records only. When the service is unavailable, this
              view stays empty instead of inventing observations.
            </p>
          </div>

          <div className="explorer-grid">
            <aside className="target-panel" aria-label="Target selection">
              <div className="panel-topline">
                <span>01 — TARGET</span>
                <span className="live-label">
                  <i className={serviceReady ? "is-ready" : ""} />
                  {serviceLoading
                    ? "CONNECTING"
                    : serviceReady
                      ? "SERVICE READY"
                      : "API UNAVAILABLE"}
                </span>
              </div>
              <label htmlFor="target-select">Choose a catalog target</label>
              <select
                id="target-select"
                value={target?.id ?? ""}
                disabled={!serviceReady || targets.length === 0}
                onChange={(event) => void selectTarget(event.target.value)}
              >
                <option value="">
                  {!serviceReady
                    ? "Archive service unavailable"
                    : targets.length
                      ? "Choose a catalog target"
                      : "No catalog targets available"}
                </option>
                {targets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <p className="target-hint">{targetMessage}</p>
              {target ? (
                <div className="target-meta">
                  {target.name} · RA {target.ra_deg}° · Dec {target.dec_deg}°
                </div>
              ) : null}
              <div className="service-message" role="status" aria-live="polite">
                {serviceMessage}
              </div>
              <p className="panel-footnote">
                Catalog availability does not guarantee multiple comparable
                observations.
              </p>
            </aside>

            <div className="records-panel" id="archive">
              <div className="panel-topline">
                <span>02 — ARCHIVE RECORDS</span>
                <span>
                  {loadingObservations
                    ? "LOADING"
                    : target
                      ? `${observations.length} ${observations.length === 1 ? "RECORD" : "RECORDS"}`
                      : "NO TARGET SELECTED"}
                </span>
              </div>
              <details className="archive-records">
                <summary>Open archive products and full provenance</summary>
                <div className="observation-list" aria-live="polite">
                {loadingObservations ? (
                  <p className="loading-state">Retrieving archive observations…</p>
                ) : observations.length ? (
                  observations.map((item) => (
                    <ObservationCard
                      key={item.id}
                      item={item}
                      source={target?.source}
                    />
                  ))
                ) : (
                  <EmptyState
                    title={
                      target
                        ? observationMessage.startsWith("No observations")
                          ? "No observations returned for this target."
                          : observationMessage.startsWith("Could not load")
                            ? "Could not load observations."
                            : "No observations returned for this target."
                        : "Select a target to inspect its archive observations."
                    }
                    detail={
                      target
                        ? observationMessage
                        : "Source · release · observation time · wavelength"
                    }
                  />
                )}
                </div>
              </details>
            </div>
          </div>

          <section className="sequence-viewer" aria-labelledby="sequence-title">
            <div className="sequence-heading">
              <div>
                <p className="eyebrow">03 — TIME ORDERED IMAGE CUTOUTS</p>
                <h3 id="sequence-title">The sky, frame by frame</h3>
              </div>
              <div className="sequence-filter">
                <label htmlFor="channel-select">Detector channel</label>
                <select
                  id="channel-select"
                  value={selectedChannel}
                  disabled={!channels.length}
                  onChange={(event) => {
                    setSelectedChannel(event.target.value);
                    setFrameIndex(0);
                    setPlaying(false);
                    setComparison(null);
                  }}
                >
                  {(channels.length ? channels : [selectedChannel]).map((channel) => (
                    <option key={channel} value={channel}>{channel}</option>
                  ))}
                </select>
                <p>One detector channel · display stretch only · not calibrated photometry</p>
              </div>
            </div>
            {frame && target ? (
              <>
                <div className="sequence-stage">
                  {previewFailed ? (
                    <EmptyState title="Image preview unavailable" detail="The archive cutout could not be rendered. Observation metadata remain available below." />
                  ) : (
                    <img
                      key={frame.id}
                      className="sequence-image"
                      src={`/api/preview?target=${encodeURIComponent(target.id)}&observation_id=${encodeURIComponent(frame.id)}`}
                      alt={`SPHEREx ${frame.release} image cutout for ${target.name}, observed ${formatDate(frame.observed_at)}. Display-scaled pixels; not a calibrated measurement.`}
                      onError={() => setPreviewFailed(true)}
                    />
                  )}
                </div>
                <div className="sequence-controls">
                  <button type="button" onClick={() => setPlaying((value) => !value)} disabled={channelObservations.length < 2}>
                    {playing ? "Pause" : "Play sequence"}
                  </button>
                  <label htmlFor="frame-select">Observation frame</label>
                  <input
                    id="frame-select"
                    type="range"
                    min="0"
                    max={channelObservations.length - 1}
                    value={frameIndex}
                    onChange={(event) => { setPlaying(false); setFrameIndex(Number(event.target.value)); }}
                    aria-valuetext={formatDate(frame.observed_at)}
                  />
                  <span>{frameIndex + 1} / {channelObservations.length}</span>
                </div>
                <p className="sequence-caption">
                  {formatDate(frame.observed_at)} – {formatDate(frame.observed_end)} · {frame.wavelength_min_um.toFixed(3)}–{frame.wavelength_max_um.toFixed(3)} μm · {frame.id}
                </p>
                <p className="sequence-warning">The query uses a fixed sky coordinate. Barnard’s Star proper motion has not been applied; these cutouts are not yet verified as centered on the star at each epoch.</p>
              </>
            ) : (
              <EmptyState title="Select a target to load its image sequence" detail="Only archive images returned by the API appear here. No sample imagery is substituted." />
            )}
          </section>

          <section className="comparison" id="comparison" aria-labelledby="comparison-title">
            <div className="compare-heading">
              <div className="panel-topline">
                <span>04 — EVIDENCE REVIEW</span>
                <span>NO CLAIMS WITHOUT COMPARABLE DATA</span>
              </div>
              <h3 id="comparison-title">Compare two observations</h3>
              <p>
                Only compatible observations can support a meaningful
                comparison. Raw image differences alone are not evidence of
                astrophysical change.
              </p>
            </div>
            <form className="compare-controls" onSubmit={compare}>
              <label>
                Earlier observation
                <select
                  value={epochA}
                  disabled={channelObservations.length === 0}
                  onChange={(event) => setEpochA(event.target.value)}
                >
                  <option value="">Select an observation</option>
                  {channelObservations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {formatDate(item.observed_at)} · {item.wavelength_min_um.toFixed(2)}–{item.wavelength_max_um.toFixed(2)} μm ·{" "}
                      {item.release}
                    </option>
                  ))}
                </select>
              </label>
              <span className="compare-arrow" aria-hidden="true">
                →
              </span>
              <label>
                Later observation
                <select
                  value={epochB}
                  disabled={channelObservations.length === 0}
                  onChange={(event) => setEpochB(event.target.value)}
                >
                  <option value="">Select an observation</option>
                  {channelObservations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {formatDate(item.observed_at)} · {item.wavelength_um} μm ·{" "}
                      {item.release}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={channelObservations.length < 2 || loadingComparison}
              >
                {loadingComparison ? "Reviewing…" : "Review comparison"}{" "}
                <span aria-hidden="true">↗</span>
              </button>
            </form>
            <div className="comparison-result" role="status" aria-live="polite">
              {comparison ? (
                <>
                  <span className="result-status">
                    {comparison.status.replaceAll("_", " ")}
                  </span>
                  <div className="result-content">
                    <p>
                      <strong>Uncertainty</strong>{" "}
                      {comparison.uncertainty
                        ? JSON.stringify(comparison.uncertainty)
                        : "Not provided by the API."}
                    </p>
                    <p>
                      <strong>Limitations</strong>{" "}
                      {comparison.limitations.length
                        ? comparison.limitations.join(" · ")
                        : "None listed in the API response."}
                    </p>
                    {comparison.difference_url &&
                    safeHttpUrl(comparison.difference_url) ? (
                      <a
                        href={safeHttpUrl(comparison.difference_url)!}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open difference product ↗
                      </a>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <span className="result-mark" aria-hidden="true">
                    {loadingComparison ? "…" : "i"}
                  </span>
                  <p>{comparisonMessage}</p>
                </>
              )}
            </div>
          </section>
        </section>

        <section
          className="method-section"
          id="method"
          aria-labelledby="method-title"
        >
          <div>
            <p className="eyebrow">Read the signal carefully</p>
            <h2 id="method-title">
              A change is a question,
              <br />
              not a conclusion.
            </h2>
          </div>
          <div className="method-copy">
            <p>
              Different observation times can reveal a candidate change.
              Instrument response, calibration, wavelength coverage, image
              registration, and uncertainty all shape what a comparison can tell
              us.
            </p>
            <p>
              AETHERTRACE reports only what the archive and analysis support.
              Missing variance, quality flags, or provenance stay visible as
              limitations.
            </p>
            <a
              href="https://irsa.ipac.caltech.edu/Missions/spherex.html"
              className="text-link"
              target="_blank"
              rel="noreferrer"
            >
              About the SPHEREx archive <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div className="method-stamp" aria-hidden="true">
            <span>TRACEABLE</span>
            <span>BY DESIGN</span>
            <i>✳</i>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <a className="wordmark" href="#top">
          <span className="mark" aria-hidden="true">
            ✳
          </span>{" "}
          AETHERTRACE
        </a>
        <p>Evidence-aware exploration of the infrared sky.</p>
        <span>NO DETECTION CLAIMS WITHOUT VERIFIED DATA</span>
      </footer>
    </>
  );
}
