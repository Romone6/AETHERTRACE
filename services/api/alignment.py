"""WCS reprojection for visual comparison and conditional variance checks."""

from dataclasses import dataclass

import numpy as np
from astropy.wcs import WCS

# IRSA Explanatory Supplement v2.1, table 16. SOURCE (21) is informational.
REJECT_FLAGS = sum(1 << bit for bit in (0, 1, 2, 6, 7, 9, 10, 11, 12, 14, 15, 17, 19, 20, 22, 23, 24, 25, 26, 27, 28, 29))


@dataclass
class AlignedPair:
    a: np.ndarray
    b: np.ndarray
    common: np.ndarray
    variance: np.ndarray


def usable_planes(hdus):
    image = hdus["IMAGE"].data
    variance = hdus["VARIANCE"].data
    flags = hdus["FLAGS"].data
    if image.ndim != 2 or image.shape != variance.shape or image.shape != flags.shape or flags.dtype.kind not in "iu":
        raise ValueError("The image, variance and flags must share a pixel grid.")
    good = np.isfinite(image) & np.isfinite(variance) & (variance > 0) & ((flags & REJECT_FLAGS) == 0)
    return image, variance, good


def align_pair(a, b, output_wcs=None, shape=None):
    """Bilinearly sample each exposure onto one sky grid, requiring all contributing pixels."""
    image_a, variance_a, good_a = usable_planes(a)
    image_b, variance_b, good_b = usable_planes(b)
    wcs_a = WCS(a["IMAGE"].header, naxis=2).celestial
    wcs_b = WCS(b["IMAGE"].header, naxis=2).celestial
    shape = image_a.shape if shape is None else shape
    y, x = np.indices(shape)
    sky = (wcs_a if output_wcs is None else output_wcs).pixel_to_world(x, y)
    aligned_a, var_a, valid_a = _sample(image_a, variance_a, good_a, *wcs_a.world_to_pixel(sky))
    aligned_b, var_b, valid_b = _sample(image_b, variance_b, good_b, *wcs_b.world_to_pixel(sky))
    return AlignedPair(aligned_a, aligned_b, valid_a & valid_b, var_a + var_b)


def _sample(image, variance, good, x, y):
    height, width = image.shape
    inside = np.isfinite(x) & np.isfinite(y) & (x >= -1e-7) & (y >= -1e-7) & (x <= width - 1 + 1e-7) & (y <= height - 1 + 1e-7)
    x = np.clip(np.where(inside, x, 0), 0, width - 1)
    y = np.clip(np.where(inside, y, 0), 0, height - 1)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    dx, dy = x - x0, y - y0
    result = np.zeros_like(x)
    propagated = np.zeros_like(x)
    for i, j, weight in ((0,0,(1-dx)*(1-dy)), (1,0,dx*(1-dy)), (0,1,(1-dx)*dy), (1,1,dx*dy)):
        ix, iy = np.minimum(x0+i, width-1), np.minimum(y0+j,height-1)
        contributes = weight > 1e-7
        valid = good[iy, ix]
        inside &= ~contributes | valid
        result += np.where(contributes & valid, image[iy, ix], 0) * weight
        propagated += np.where(contributes & valid, variance[iy, ix], 0) * weight**2
    return result, propagated, inside


def display_pair(pair):
    """Render both images with one linear display scale and identical masked footprint."""
    from io import BytesIO
    from PIL import Image

    if not pair.common.any():
        raise ValueError("The observations have no common usable pixels.")
    lo, hi = np.percentile(np.concatenate((pair.a[pair.common], pair.b[pair.common])), [1, 99.5])
    scale = hi - lo or 1
    outputs = []
    for image in (pair.a, pair.b):
        pixels = np.where(pair.common, np.clip((image - lo) / scale, 0, 1) * 255, 0).astype(np.uint8)
        out = BytesIO()
        Image.fromarray(pixels).save(out, format="PNG")
        outputs.append(out.getvalue())
    return outputs
