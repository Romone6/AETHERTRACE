import numpy as np
from astropy.io import fits
from astropy.wcs import WCS

from services.api.alignment import align_pair


def frame(shift, value, flags=0):
    wcs = WCS(naxis=2)
    wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    wcs.wcs.crval = [100, 20]
    wcs.wcs.cdelt = [-0.001, 0.001]
    wcs.wcs.crpix = [5 + shift, 5]
    shape = (9, 9)
    return fits.HDUList([
        fits.PrimaryHDU(),
        fits.ImageHDU(np.full(shape, value), header=wcs.to_header(), name="IMAGE"),
        fits.ImageHDU(np.full(shape, 1 << 21 | flags, dtype=np.int32), name="FLAGS"),
        fits.ImageHDU(np.full(shape, 4.0), name="VARIANCE"),
    ])


def test_alignment_propagates_weights_and_preserves_source_flag():
    result = align_pair(frame(0, 2.0), frame(0.5, 5.0))
    assert result.common.sum() > 25
    assert np.isclose(result.b[4, 4] - result.a[4, 4], 3)
    assert np.isclose(result.variance[4, 4], 6)


def test_overflow_never_appears_in_common_pixels():
    result = align_pair(frame(0, 2.0), frame(0, 5.0, flags=2))
    assert not result.common.any()
