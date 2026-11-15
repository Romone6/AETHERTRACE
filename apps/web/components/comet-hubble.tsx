const hubbleImage = "/observations/comet/hubble-july-2025.jpg";

export function CometHubble() {
  return (
    <section className="card comet-hubble" aria-labelledby="comet-hubble">
      <h2 id="comet-hubble">A closer look with Hubble</h2>
      <p>Hubble’s visible-light observation from <time dateTime="2025-07-21">21 July 2025</time> shows the teardrop-shaped dust cloud around 3I/ATLAS. The background stars appear as streaks because Hubble followed the moving comet.</p>
      <figure>
        <a href={hubbleImage} aria-label="Open the full-size annotated Hubble image">
          <img
            src={hubbleImage}
            width={1546}
            height={1140}
            loading="lazy"
            alt="Hubble image of 3I/ATLAS with a teardrop-shaped blue dust cloud and streaked background stars. A three-arcsecond scale bar and orientation arrows are annotated."
          />
        </a>
        <figcaption>
          <span>Hubble WFC3/UVIS · 21 Jul 2025 · Blue tint applied to visible-light brightness</span>
          <a href="https://esahubble.org/images/heic2509b/">NASA, ESA, D. Jewitt (UCLA); Image Processing: J. DePasquale (STScI)</a> · <a href="https://esahubble.org/copyright/">CC BY 4.0</a>
        </figcaption>
      </figure>
      <p>The replay above uses December SPHEREx infrared exposures. <a href="https://science.nasa.gov/photojournal/nasas-spherex-examines-comet-3i-atlass-coma/">See NASA’s wavelength views of the coma from that campaign</a>.</p>
      <a className="comet-detail-jump" href="#comet-title">Back to the SPHEREx replay <span aria-hidden="true">↑</span></a>
    </section>
  );
}
