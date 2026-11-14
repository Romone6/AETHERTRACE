# AETHERTRACE functional and observation audit

## Existing site

Verified the home, Explorer, Evidence, Archive and Method routes at 320, 390, 768 and 1488 px. Checked all four original sky fields, field selection, detector selection, scrubber, playback, selectable sequence buttons, same-frame rejection, successful comparison, a real FITS download, archive keyboard scrolling, filters, search, pagination, source disclosure and source links. The mobile stylesheet had hidden two visible-range frame controls. The archive overflow container lacked a keyboard focus target. Both were corrected. The preview endpoint now has one route registration.

## 3I/ATLAS walkthrough

Downloaded the IRSA [exposure table](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/comet3iatlas/obscore_3I_Atlas.vot), which supplies the predicted coordinates. The table's image links refer to the older release. The shipped PNGs use DR1 products matched via SIA on exposure ID, detector and exposure time. The three exposure start times are 17:26:06, 17:28:15 and 17:32:33 UTC on 14 December 2025. Source product IDs, original URLs, full timestamps, cutout checksums and the image grid live in the [sequence manifest](../apps/web/components/comet-data.json).

For each source, request a 0.08° FITS cutout at the common archive request center 166.679549°, 5.330285°. Resample finite IMAGE values bilinearly to the 41 × 41 tangent-plane grid in the manifest. Show only the footprint shared by all three, north up, east left. The display uses a common asinh stretch (scale factor 5; 3rd and 99.5th combined percentiles). In each frame, an image peak within 2.5 output pixels of the predicted position exceeds the local annulus median by more than four scaled median absolute deviations. This is a visual screening check. The display retains finite flagged pixels, including the archive outlier bit at each predicted center. It supports visual inspection; a centroid fit or calibrated motion or brightness measurement would require further processing. The marker is the IRSA prediction mapped through the output WCS. All three archive astrometry flags report good solutions.

## Barnard’s Star worked comparison

The [worked example manifest](../apps/web/components/barnard-data.json) records source IDs, UTC exposures, FITS cutout checksums, Gaia astrometry, calibrated wavelength and bandwidth, and rejected flag bits. Use the Gaia archive TAP query `SELECT source_id,ref_epoch,ra,dec,parallax,pmra,pmdec,radial_velocity FROM gaiadr3.gaia_source WHERE source_id=4472832130942575872`. Propagate the Gaia ICRS vector and space motion to the midpoint of each exposure, including radial velocity. Apparent parallax from the spacecraft viewpoint and centroid measurement are outside this propagation.

Both images use 0.05° cutouts centered on ICRS 269.446280°, 4.768000°. Use the celestial WCS to locate the propagated position. Convert it to the native detector coordinates with the documented CRPIX*A offset and sample the nearest pixel in the DR1 D3 CWAVE and CBAND maps. The central wavelengths are 2.306 and 2.155 μm with respective bandwidths 0.057 and 0.054 μm. Both predicted centers have overflow, readout error and bloom flags. The pair fails the wavelength and pixel-quality gates.

The displayed pair uses the first image’s celestial WCS and a common mask. Both archive astrometry flags report good solutions. Independent background-star residuals were not fitted. The common footprint has 663 of 841 pixels. Bilinear variance propagation uses squared interpolation weights and assumes independent input samples. The median conditional difference variance is 0.001041 (MJy/sr)². No calibrated difference or significance is reported. A flux uncertainty would also need background and covariance terms.

- [IRSA comet observations](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/comet3iatlas/index.html)
- [SPHEREx DR1 and its spectral image citation](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_dr1.html)
- [SPHEREx archive data products and calibration](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products/)
- [SPHEREx Explanatory Supplement, table 16](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/SPHEREx_Expsupp.pdf)
- [ESA Gaia Archive](https://gea.esac.esa.int/archive/)

## Added workflows verified

- Decoded all three comet images in Chromium and checked that the predicted position advances with each exposure. Verified navigation bounds and the marker visibility control.
- Reopened an exact Orion D4 frame in a new tab and reopened the Barnard pair from Evidence. Checked invalid pair handling, A/B toggling by keyboard and button, shared zoom, and the 320 px layout.
- Recomputed the Barnard alignment from real IRSA cutouts and verified the live endpoint returned 663 common pixels. During a separate upstream failure run, the exact pair could use its saved alignment. Other pairs retain source details and show an availability message when the aligned preview cannot be generated.
- Automated checks cover cache reuse through an upstream failure, aligned PNG output, variance propagation, flagged pixels, source identifiers, preview integrity, and the worked example’s failed wavelength and quality gates.
