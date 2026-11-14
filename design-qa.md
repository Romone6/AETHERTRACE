# Design QA

## Multipage branch review

Playwright verified the production build of `feat/multipage-aethertrace` at `427e2c3` on 2026-11-14. All five pages rendered at 390 × 844 without page-wide horizontal overflow. The home page and observation deck were captured at 1488 × 1054 and 390 × 844 with live SPHEREx imagery.

- The archive returned 240 records across six detector channels, with 42 frames in D3. The first two D3 cutouts rendered. Keyboard scrubbing, playback, and switching to D4 worked.
- The evidence review returned `INSUFFICIENT_DATA` for a compatible D3 pair and displayed the API limitations.
- Archive pagination, detector filtering, product ID search, and provenance disclosure worked.
- The production build, all 11 Python tests, and OpenAPI lint passed.

The original concept image is referenced by a path on the previous machine. A side-by-side comparison still needs that image. The older review below records the original layout before the branch split it into separate pages.

## Original Option 1 review

**Findings**

- No P0, P1, or P2 implementation defects were found in the browser-rendered mobile-width view.
- P3: The live SPHEREx cutout is low contrast and pixelated compared with the generated concept image. The implementation keeps the archive preview unchanged and labels it as display-only; visual treatment must not imply calibrated photometry.

**Comparison evidence**

- Source visual truth: `/home/m/.codex/generated_images/01a1d75a-98c2-7961-b208-9ac411ee92e1/exec-c7005a17-2c52-4d41-91a0-51dfe513a16a.png` (1488 × 1054 px).
- Implementation: `http://localhost:3001/`, captured in the Codex In-app Browser at approximately 600 × 1200 px. The selected state was Barnard's Star, SPHEREx-D3, frame 1 of 42.
- The browser tool displayed the screenshot in its output but did not provide a filesystem path to persist it. Its viewport controls are not exposed in this environment, so the screenshot could not be normalized to the source image's dimensions for a valid side-by-side comparison.
- The rendered view showed the centered serif headline, cobalt CTA, pale sky background, live observation panel, accurate archive facts, and unchanged caveat. The lower observation explorer and archive controls remained present and readable at this viewport.
- A focused-region comparison was not completed because the desktop viewport could not be matched and the browser screenshot could not be saved for a combined comparison input.

**Implementation checklist**

- [x] Replace the previous decorative hero with the selected editorial layout.
- [x] Use the real selected archive preview and data-derived metadata.
- [x] Keep observation provenance and science limitations visible.
- [x] Style the existing explorer, evidence, archive, and method sections in the new palette.
- [x] Review the rendered page and selected-target state in the browser.
- [ ] Capture and compare a persisted screenshot at the source viewport.

**Follow-up polish**

- Review the desktop viewport against the source concept when an explicit browser viewport and screenshot export are available.

**final result: blocked**

Blocker: the available CUA browser cannot set the source viewport or save its screenshot to a path, so the required normalized visual comparison could not be completed.
