"use client";

import Link from "next/link";
import { ShareLink } from "./share-link";
import { BarnardValidation, BarnardMethod, Blink, CometWalkthrough, WorkedExampleLink, verifiedBarnardFrames } from "./guided-observations";
import { useEffect, useRef, useState, type FormEvent } from "react";
import savedDemo from "../public/observations/barnard/saved-exposures.json";
import { composites, DisplayMethodLink, ImageryMethods, SkyComposite } from "./sky-composites";

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
  saved?: boolean;
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
const savedExposures = new Map(savedDemo.exposures.map((entry) => [entry.observation.id, entry]));
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

function ComparisonCutout({ observation, targetId, label, inspection, savedOnly }: {
  observation: Observation;
  targetId: string;
  label: string;
  inspection: unknown;
  savedOnly?: boolean;
}) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const params = new URLSearchParams({ target: targetId, observation_id: observation.id, size: "0.05" });
  const savedPreview = targetId === savedDemo.target && (previewFailed || savedOnly) ? savedExposures.get(observation.id)?.preview : undefined;
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
        {previewFailed && !savedPreview ? (
          <EmptyState title="Preview unavailable" detail="The source record remains available below." />
        ) : (
          <img src={savedPreview ?? `/api/preview?${params}`} alt={`Display-only SPHEREx cutout from ${formatDate(observation.observed_at)}`} onError={() => setPreviewFailed(true)} />
        )}
      </div>
      {savedPreview && <p className="saved-preview-note">Saved DR1 preview</p>}
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
        {!savedOnly && <a href={`/api/archive/cutout?${params}`}>Download FITS cutout</a>}
        {sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer">Open source product <span aria-hidden="true">↗</span></a>}
      </div>
    </figure>
  );
}

function previewUrl(target: string, observation: string) {
  return `/api/preview?${new URLSearchParams({ target, observation_id: observation, size: "0.05" })}`;
}

function viewLink(view: "explorer" | "evidence", target: string, channel: string, a: string, b?: string) {
  const params = new URLSearchParams({ target, channel, [view === "explorer" ? "frame" : "a"]: a });
  if (b) params.set("b", b);
  return `/${view}?${params}`;
}

function ArchivePreviewLink({ target, observation }: { target: Target; observation: Observation }) {
  const id = observation.id.split("?").at(-1);
  return (
    <Link
      className="archive-preview-link"
      href={viewLink("explorer", target.id, observation.channel, observation.id)}
      prefetch={false}
      aria-label={`Open enhanced preview for ${id}`}
    >
      View preview <span aria-hidden="true">↗</span>
    </Link>
  );
}

function ComparisonResult({ comparison }: { comparison: Comparison }) {
  const fits = isRecord(comparison.statistics) && comparison.statistics.fits_inspection;
  const alignment = isRecord(comparison.statistics) && comparison.statistics.visual_alignment;
  const a = comparison.observation_a;
  const b = comparison.observation_b;
  const freshAlignment = isRecord(alignment) && alignment.status === "available" &&
    typeof alignment.png_a === "string" && typeof alignment.png_b === "string";
  const cachedFrames = verifiedBarnardFrames(comparison.target, a.id, b.id);
  const blinkFrames = freshAlignment ? [
    { image: `data:image/png;base64,${alignment.png_a}`, date: a.observed_at },
    { image: `data:image/png;base64,${alignment.png_b}`, date: b.observed_at },
  ] as [{ image: string; date: string }, { image: string; date: string }] : cachedFrames;
  return (
    <section className="card comparison-result" aria-labelledby="comparison-status">
      <div className="card-heading">
        <div>
          <h2 id="comparison-status">{comparison.status === "INSUFFICIENT_DATA" ? "Visual comparison" : "Comparison results"}</h2>
        </div>
      </div>
      <ShareLink href={viewLink("evidence", comparison.target, a.channel, a.id, b.id)} />
      {comparison.saved && <p className="saved-preview-note">Saved DR1 comparison · previews and FITS inspection from the verified cutouts.</p>}
      {blinkFrames ? (
        <>
          {!freshAlignment && <p className="comparison-caveat">Showing the saved alignment for these exact exposures.</p>}
          <Blink key={`${a.id}:${b.id}`} frames={blinkFrames} />
        </>
      ) : <p className="comparison-caveat">Aligned blink preview unavailable. You can still inspect the original cutouts below.</p>}
      <div className="original-observations">
        <h3>Source observations</h3>
        <p className="comparison-caveat">Each 0.05° cutout uses its original pixel grid and an individual grayscale stretch. <DisplayMethodLink kind="previews" /></p>
      </div>
      <div className="comparison-cutouts">
        <ComparisonCutout key={`a:${comparison.observation_a.id}`} observation={comparison.observation_a} targetId={comparison.target} label="Observation A" savedOnly={comparison.saved} inspection={isRecord(fits) ? fits.observation_a : undefined} />
        <ComparisonCutout key={`b:${comparison.observation_b.id}`} observation={comparison.observation_b} targetId={comparison.target} label="Observation B" savedOnly={comparison.saved} inspection={isRecord(fits) ? fits.observation_b : undefined} />
      </div>
      <p className="comparison-caveat">
        FITS counts describe each plane independently. Nonzero flags can record detector status or processing information.
      </p>
      <p className="comparison-caveat">This visual comparison cannot establish a change in brightness or position. A measurement requires aligned images, matched wavelengths and propagated uncertainty.</p>
    </section>
  );
}

const pageCopy: Record<Exclude<View, "home">, { title: string; intro: string }> = {
  explorer: { title: "Observation explorer", intro: "Browse SPHEREx images by sky field, detector and date." },
  evidence: { title: "Compare observations", intro: "View two exposures and inspect the quality of their source images." },
  archive: { title: "Archive records", intro: "Browse SPHEREx exposures by date and detector, and open the enhanced preview for any record." },
  method: { title: "How to read the images", intro: "Understand SPHEREx cutouts and what a visual comparison can tell you." },
};

export default function Explorer({ view }: { view: View }) {
  const [barnardOpen, setBarnardOpen] = useState(false);
  const [showComposite, setShowComposite] = useState(true);
  const [targets, setTargets] = useState<Target[]>(savedDemo.targets);
  const [target, setTarget] = useState<Target | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const observationRequest = useRef(0);
  const [message, setMessage] = useState("Loading sky fields…");
  const [loadingObservations, setLoadingObservations] = useState(false);
  const [savedCatalog, setSavedCatalog] = useState(false);
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
  const [linkedPair, setLinkedPair] = useState<{ target: string; a: string; b: string } | null>(null);
  const comparisonRequest = useRef<AbortController | null>(null);
  const channels = Array.from(new Set(observations.map((item) => item.channel))).sort();
  const channelObservations = observations.filter((item) => item.channel === channel);
  const frame = channelObservations[frameIndex];
  const savedPreview = target?.id === savedDemo.target && frame && (savedCatalog || previewFailed)
    ? savedExposures.get(frame.id)?.preview : undefined;
  const previewUnavailable = previewFailed && !savedPreview;
  const compositeField = target?.id ?? "orion-nebula";
  const hasComposite = Boolean(composites[compositeField]);
  const showingComposite = showComposite && hasComposite;
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
        const params = new URLSearchParams(window.location.search);
        const requestedField = params.get("target");
        const savedTarget = window.sessionStorage.getItem("aethertrace-field");
        const first = savedDemo.targets.find((item) => item.id === requestedField)
          ?? savedDemo.targets.find((item) => item.id === savedTarget)
          ?? (view === "home" ? savedDemo.targets.find((item) => item.id === "orion-nebula") : undefined)
          ?? savedDemo.targets[0];
        if (!first) {
          setMessage("No sky fields are available.");
          return;
        }
        setTarget(first);
        void getTargets().then((data) => { if (active && data.length) setTargets(data); }).catch(() => {});
        await loadObservations(first, params);
      } catch {
        if (!active) return;
        setMessage("Sky fields are temporarily unavailable.");
      }
    }
    void load();
    return () => {
      active = false;
      observationRequest.current += 1;
    };
  }, [view]);

  async function loadObservations(selected: Target, selection?: URLSearchParams) {
    const request = ++observationRequest.current;
    setLoadingObservations(true);
    setMessage(`Loading observations for ${selected.name}…`);
    try {
      let usingSaved = false;
      const data = await getObservations(selected.id).catch((error) => {
        if (selected.id !== savedDemo.target) throw error;
        usingSaved = true;
        return savedDemo.exposures.map((entry) => entry.observation);
      });
      if (request !== observationRequest.current) return;
      setSavedCatalog(usingSaved);
      const sorted = [...data].sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at));
      setObservations(sorted);
      const initialChannel = data.some((item) => item.channel === "SPHEREx-D3") ? "SPHEREx-D3" : (data[0]?.channel ?? "");
      const requestedChannel = selection?.get("channel");
      const activeChannel = requestedChannel && data.some((item) => item.channel === requestedChannel)
        ? requestedChannel : initialChannel;
      setChannel(activeChannel);
      const activeFrames = sorted.filter((item) => item.channel === activeChannel);
      const linkedFrame = selection?.get("frame");
      const linkedIndex = activeFrames.findIndex((item) => item.id === linkedFrame);
      setFrameIndex(Math.max(0, linkedIndex));
      const a = selection?.get("a"), b = selection?.get("b");
      if (view === "evidence" && a && b) {
        if (a !== b && activeFrames.some((item) => item.id === a) && activeFrames.some((item) => item.id === b)) {
          setEpochA(a);
          setEpochB(b);
          setLinkedPair({ target: selected.id, a, b });
        } else {
          setComparisonMessage("The linked observations are unavailable for this field and detector.");
        }
      }
      if (view === "explorer" && linkedFrame && linkedIndex < 0) {
        setMessage("The linked exposure is unavailable. Showing the first available frame.");
        return;
      }
      setMessage(usingSaved ? "Archive unavailable · 2 saved DR1 exposures" : data.length ? `${data.length.toLocaleString()} observations · ${new Set(data.map((item) => item.channel)).size} detector channels` : "No observations found for this field.");
    } catch {
      if (request !== observationRequest.current) return;
      setObservations([]);
      setSavedCatalog(false);
      setMessage("Archive unavailable. The saved exposures are in the Barnard’s Star field.");
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
    setSavedCatalog(false);
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

  function compare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (target) void review(target.id, epochA, epochB);
  }

  async function review(targetId: string, epochA: string, epochB: string) {
    clearComparison();
    if (!epochA || !epochB || epochA === epochB) {
      setComparisonMessage("Choose two different observations before reviewing.");
      return;
    }
    const request = new AbortController();
    comparisonRequest.current = request;
    setLoadingComparison(true);
    setComparisonMessage("Checking compatibility and inspecting the source cutouts…");
    try {
      if (savedCatalog) throw new Error("Live comparison unavailable.");
      const params = new URLSearchParams({ target: targetId, epoch_a: epochA, epoch_b: epochB, align_cutouts: "true" });
      const response = await fetch(`/api/compare?${params}`, { headers: { Accept: "application/json" }, signal: request.signal });
      if (!response.ok) throw new Error(response.status === 422 ? "Choose observations with matching release, detector and wavelength coverage." : "Comparison is temporarily unavailable.");
      const data: unknown = await response.json();
      if (request.signal.aborted) return;
      if (!isRecord(data) || data.target !== targetId ||
        !isObservation(data.observation_a) || data.observation_a.id !== epochA ||
        !isObservation(data.observation_b) || data.observation_b.id !== epochB ||
        typeof data.status !== "string" || !Array.isArray(data.limitations) || !data.limitations.every((item) => typeof item === "string")) {
        throw new Error("Comparison results could not be loaded.");
      }
      setComparison(data as Comparison);
      setComparisonMessage("");
    } catch (error) {
      if (request.signal.aborted) return;
      const a = savedExposures.get(epochA);
      const b = savedExposures.get(epochB);
      if (targetId === savedDemo.target && a && b) {
        setComparison({
          target: targetId, observation_a: a.observation, observation_b: b.observation,
          status: "INSUFFICIENT_DATA", limitations: [], saved: true,
          statistics: { fits_inspection: { observation_a: a.inspection, observation_b: b.inspection } },
        });
        setComparisonMessage("");
      } else {
        setComparisonMessage(error instanceof Error ? error.message : "Comparison unavailable.");
      }
    } finally {
      if (comparisonRequest.current === request) {
        comparisonRequest.current = null;
        setLoadingComparison(false);
      }
    }
  }

  useEffect(() => {
    if (!linkedPair) return;
    setLinkedPair(null);
    void review(linkedPair.target, linkedPair.a, linkedPair.b);
  }, [linkedPair]);

  const nextFrame = channelObservations[frameIndex + 1];
  useEffect(() => {
    if (view !== "explorer" || savedCatalog || !frame || !nextFrame || !target) return;
    const current = new Image();
    current.onload = () => {
      const next = new Image();
      next.src = previewUrl(target.id, nextFrame.id);
    };
    current.src = previewUrl(target.id, frame.id);
    return () => { current.onload = null; };
  }, [view, target, frame, nextFrame, savedCatalog]);

  useEffect(() => {
    if (view !== "evidence") return;
    const openLinkedExample = () => {
      if (window.location.hash === "#barnard-example") setBarnardOpen(true);
    };
    openLinkedExample();
    window.addEventListener("hashchange", openLinkedExample);
    return () => window.removeEventListener("hashchange", openLinkedExample);
  }, [view]);

  const targetControls = (
    <div className="context-bar">
      <div className="context-target">
        <label htmlFor="target-select">Sky field</label>
        <select id="target-select" value={target?.id ?? ""} disabled={!target || targets.length === 0} onChange={(event) => void chooseTarget(event.target.value)}>
          {!targets.length && <option value="">{!target ? "Loading catalog…" : "No targets available"}</option>}
          {targets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>
      <span className="context-message" role="status">{message}</span>
      {message.startsWith("Archive unavailable") && target?.id !== savedDemo.target && (
        <button className="preview-retry" type="button" onClick={() => void chooseTarget(savedDemo.target)}>Open saved exposures</button>
      )}
    </div>
  );

  return (
    <main id="main" className={`app-main page-${view}`}>
      {view === "home" ? (
        <>
          <section className="home-hero" aria-labelledby="hero-title">
            <div className="home-copy">
              <h1 id="hero-title">
                A closer look at<br />
                the <em>infrared sky.</em>
              </h1>
              <p className="home-intro">
                Explore SPHEREx observations across the sky, with clear context and provenance.
              </p>
              <div className="home-actions">
                <Link className="home-cta" href="/explorer">Explore observations</Link>
                <Link className="home-comet-link" href="/comet">Watch 3I/ATLAS move <span aria-hidden="true">↗</span></Link>
              </div>
            </div>
            <div className="home-field-control">{targetControls}</div>
            {showingComposite ? (
              <SkyComposite field={compositeField} id="home-image" />
            ) : (
              <figure id="home-image" className="home-visual">
                {frame && target && !previewUnavailable ? (
                  <img
                    key={frame.id}
                    src={savedPreview ?? previewUrl(target.id, frame.id)}
                    alt={`SPHEREx ${frame.release} preview of ${target.name}, observed ${formatDate(frame.observed_at)}.`}
                    onError={() => setPreviewFailed(true)}
                  />
                ) : (
                  <p className="home-preview-status" role="status">
                    {loadingObservations || !target ? "Loading observation…" : "Preview unavailable"}
                  </p>
                )}
                {frame && target && (
                  <figcaption className="home-image-caption">
                    <strong>{target.name}</strong>
                    {savedPreview && <span>Saved DR1 preview</span>}
                    <time dateTime={frame.observed_at}>{formatDate(frame.observed_at)}</time>
                    <span>SPHEREx {frame.release} · {frame.channel.replace("SPHEREx-", "")} · {frame.wavelength_min_um.toFixed(2)}–{frame.wavelength_max_um.toFixed(2)} μm</span>
                    <Link href={viewLink("explorer", target.id, frame.channel, frame.id)}>Open this exposure <span aria-hidden="true">↗</span></Link>
                  </figcaption>
                )}
              </figure>
            )}
            {hasComposite && <button
              type="button"
              className="home-image-toggle"
              aria-controls="home-image"
              onClick={() => setShowComposite((value) => !value)}
            >
              {showingComposite ? "Show a single exposure" : "Show the false-color composite"}
            </button>}
            {!showingComposite && frame && (
              <dl className="home-facts" aria-label="Selected observation details">
                <div><dt>Data release</dt><dd>{frame.release}</dd></div>
                <div><dt>Observation sequence</dt><dd>{channelObservations.length} {frame.channel.replace("SPHEREx-", "")} frames</dd></div>
                <div><dt>Detector coverage</dt><dd>{frame.wavelength_min_um.toFixed(2)}–{frame.wavelength_max_um.toFixed(2)} μm</dd></div>
              </dl>
            )}
            {!showingComposite && <p className="home-caveat">Individual grayscale stretch. <DisplayMethodLink kind="previews" /></p>}
          </section>
          <div className="home-fields"><WorkedExampleLink /></div>
        </>
      ) : (
        <div className="workspace">
          <header className="page-heading">
            <div><h1>{pageCopy[view].title}</h1><p>{pageCopy[view].intro}</p></div>
            {view === "explorer" && <Link className="page-jump" href="/comet">Follow comet 3I/ATLAS <span aria-hidden="true">↗</span></Link>}
            {view === "evidence" && <a className="page-jump" href="#barnard-example" aria-controls="barnard-example" aria-expanded={barnardOpen} onClick={() => setBarnardOpen(true)}>Barnard’s Star example <span aria-hidden="true">↓</span></a>}
          </header>
          {view !== "method" && targetControls}

          {view === "explorer" && (
            <>
              <div className="deck-grid">
                <section className="deck-viewer card" aria-label="Observation sequence">
                  <div className="card-heading">
                    <div>
                      <h2>{target?.name ?? "Observations"}</h2>
                      {frame && <time className="deck-time" dateTime={frame.observed_at}>{formatDate(frame.observed_at)}</time>}
                    </div>
                    <span className="sequence-count">{frame ? `${frameIndex + 1} / ${channelObservations.length}` : "— / —"}</span>
                  </div>
                  <div className="playback-controls"><button type="button" className="play-button" onClick={() => setPlaying((value) => !value)} disabled={channelObservations.length < 2} aria-label={playing ? "Pause sequence" : "Play sequence"}>{playing ? "Ⅱ" : "▶"}</button><label htmlFor="frame-select">FRAME</label><input id="frame-select" type="range" min="0" max={Math.max(0, channelObservations.length - 1)} value={frameIndex} disabled={!channelObservations.length} onChange={(event) => { setPlaying(false); setFrameIndex(Number(event.target.value)); }} aria-valuetext={frame ? formatDate(frame.observed_at) : "No frame"} /><span className="channel-control"><label htmlFor="channel-select">CHANNEL</label><select id="channel-select" value={channel} disabled={!channels.length} onChange={(event) => { setChannel(event.target.value); setFrameIndex(0); setPlaying(false); }}>
                    {channels.length ? channels.map((item) => <option key={item} value={item}>{item.replace("SPHEREx-", "")}</option>) : <option value="">—</option>}
                  </select></span></div>
                  <figure className="deck-stage">
                    {frame && target && !previewUnavailable ? <img className="deck-image" src={savedPreview ?? previewUrl(target.id, frame.id)} alt={`Display-only SPHEREx cutout for ${target.name}, observed ${formatDate(frame.observed_at)}. Not a calibrated measurement.`} onError={() => setPreviewFailed(true)} /> : <EmptyState title={previewUnavailable ? "Preview unavailable" : loadingObservations ? "Retrieving archive frames" : "No exposure available"} detail={previewUnavailable ? "The archive cutout could not be loaded." : "Choose a field to view its images."} />}
                    {frame && !previewUnavailable && <figcaption className="deck-plate-caption">{frame.release} / {frame.channel.replace("SPHEREx-", "")}</figcaption>}
                  </figure>
                  {frame && (
                    <div className="frame-caption">
                      <span>{savedPreview ? "Saved DR1 preview · " : ""}Individual grayscale stretch</span>
                      {previewUnavailable && <button className="preview-retry" type="button" onClick={() => setPreviewFailed(false)}>Retry preview</button>}
                      <DisplayMethodLink kind="previews" />
                    </div>
                  )}
                </section>
                <aside className="deck-aside">
                  <section className="card frame-meta"><div className="card-heading"><div><h2>Observation details</h2></div></div>
                    {frame ? <dl className="meta-list"><div><dt>Exposure ends</dt><dd>{formatDate(frame.observed_end)}</dd></div><div><dt>Product ID</dt><dd>{frame.id}</dd></div><div><dt>DATA RELEASE</dt><dd>{frame.release}</dd></div><div><dt>CHANNEL</dt><dd>{frame.channel}</dd></div><div><dt>WAVELENGTH RANGE</dt><dd>{frame.wavelength_min_um.toFixed(3)}–{frame.wavelength_max_um.toFixed(3)} μm</dd></div><div><dt>VARIANCE</dt><dd>{frame.variance_available == null ? "Not reported" : frame.variance_available ? "Available" : "Not available"}</dd></div></dl> : <EmptyState title="No frame selected" detail="Frame metadata will appear when the archive returns observations." />}
                    {safeUrl(frame?.product_url) && <a className="record-link" href={safeUrl(frame?.product_url)!} target="_blank" rel="noreferrer">Open source product <span aria-hidden="true">↗</span></a>}
                    {frame && target && <ShareLink key={frame.id} href={viewLink("explorer", target.id, channel, frame.id)} />}
                  </section>
                  <div className="caution-note"><span className="caution-icon" aria-hidden="true">i</span><p>Each cutout uses the same sky coordinates.{target?.id === "barnards-star" && " The star’s motion can move it away from the center between exposures."}</p></div>
                </aside>
              </div>
              {target && hasComposite && (
                <details className="card explorer-composite" key={target.id}>
                  <summary>View the false-color composite of this field</summary>
                  <SkyComposite field={target.id} explorer />
                </details>
              )}
              <CometWalkthrough />
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
              <BarnardValidation open={barnardOpen} onToggle={setBarnardOpen} />
            </section>
          )}

          {view === "archive" && (
            <section className="card archive-card"><div className="archive-toolbar"><div><h2>{loadingObservations ? "Loading records…" : `${filteredObservations.length} ${filteredObservations.length === 1 ? "observation" : "observations"}`}</h2></div><div className="archive-filters"><label className="search-box"><span aria-hidden="true">⌕</span><span className="sr-only">Search archive records</span><input type="search" placeholder="Search IDs, channel, date…" value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(24); }} /></label><label className="filter-select"><span className="sr-only">Filter by detector channel</span><select value={archiveChannel} onChange={(event) => { setArchiveChannel(event.target.value); setVisibleCount(24); }}><option>All channels</option>{channels.map((item) => <option key={item}>{item}</option>)}</select></label></div></div>
              <div className="archive-display-note"><span>Enhanced previews</span><DisplayMethodLink kind="previews" /></div>
              <div className="archive-table-wrap" tabIndex={0} role="region" aria-label="Observation records table">
                <table className="archive-table">
                  <thead>
                    <tr>
                      {["Observation", "Observed · UTC", "Channel", "Wavelength", "Release", "Variance", "Preview"].map((label) => (
                        <th key={label} scope="col">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredObservations.slice(0, visibleCount).map((item) => (
                      <tr key={item.id}>
                        <td>
                          <details className="record-disclosure">
                            <summary><code>{item.id}</code></summary>
                            <div className="record-provenance">
                              <p><strong>Source record</strong></p>
                              {item.quality_flags?.length ? <p>Quality flags: {item.quality_flags.join(", ")}</p> : <p>No quality flags reported.</p>}
                              {safeUrl(item.product_url) && <a href={safeUrl(item.product_url)!} target="_blank" rel="noreferrer">Open source product ↗</a>}
                            </div>
                          </details>
                        </td>
                        <td><time dateTime={item.observed_at}>{formatDate(item.observed_at)}</time></td>
                        <td>{item.channel.replace("SPHEREx-", "")}</td>
                        <td>{item.wavelength_min_um.toFixed(3)}–{item.wavelength_max_um.toFixed(3)} μm</td>
                        <td><span className="table-release">{item.release}</span></td>
                        <td>{item.variance_available == null ? "—" : item.variance_available ? "Available" : "No"}</td>
                        <td>{target && <ArchivePreviewLink target={target} observation={item} />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="archive-mobile-list" aria-label="Observation records">
                {filteredObservations.slice(0, visibleCount).map((item) => (
                  <div key={item.id} className="archive-mobile-record">
                    <details>
                      <summary>
                        <time dateTime={item.observed_at}>{formatDate(item.observed_at)}</time>
                        <span>{item.channel.replace("SPHEREx-", "")} · {item.wavelength_min_um.toFixed(3)}–{item.wavelength_max_um.toFixed(3)} μm</span>
                      </summary>
                      <div className="archive-mobile-detail">
                        <dl>
                          <div><dt>Product ID</dt><dd><code>{item.id}</code></dd></div>
                          <div><dt>Release</dt><dd>{item.release}</dd></div>
                          <div><dt>Variance</dt><dd>{item.variance_available == null ? "Not reported" : item.variance_available ? "Available" : "Unavailable"}</dd></div>
                        </dl>
                        {item.quality_flags?.length ? <p>Quality flags: {item.quality_flags.join(", ")}</p> : <p>No quality flags reported.</p>}
                        {safeUrl(item.product_url) && <a href={safeUrl(item.product_url)!} target="_blank" rel="noreferrer">Open source product ↗</a>}
                      </div>
                    </details>
                    {target && <ArchivePreviewLink target={target} observation={item} />}
                  </div>
                ))}
              </div>
              {!loadingObservations && filteredObservations.length === 0 && <EmptyState title="No matching records" detail={observations.length ? "Try a different observation ID, date or detector." : message} />}
              {filteredObservations.length > visibleCount && <button className="load-more" type="button" onClick={() => setVisibleCount((count) => count + 24)}>Load more records <span aria-hidden="true">↓</span></button>}
            </section>
          )}

          {view === "method" && (
            <>
              <div className="method-steps">
                <article className="method-step"><div><h2>Source observations</h2><p>The NASA/IPAC Infrared Science Archive provides the SPHEREx Data Release 1 images. Each record includes the original observation ID, exposure time, detector and wavelength range.</p></div></article>
                <ImageryMethods />
                <article className="method-step"><div><h2>Scientific comparisons</h2><p>Measuring a change requires matching the wavelength at the target, aligning the images, interpreting pixel flags and accounting for uncertainty. A moving target may also need a different cutout center at each exposure.</p></div></article>
              </div>
              <BarnardMethod />
              <div className="method-links"><a href="https://irsa.ipac.caltech.edu/Missions/spherex.html" target="_blank" rel="noreferrer">SPHEREx at IRSA <span aria-hidden="true">↗</span></a></div>
            </>
          )}
        </div>
      )}
    </main>
  );
}
