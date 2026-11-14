"""Display transfer functions for measured infrared brightness."""

import numpy as np


def percentile_limits(values, percentiles=(1, 99.5)):
    low, high = np.percentile(values, percentiles)
    return float(low), float(high if high > low else low + 1)


def asinh_grayscale(pixels, valid, low, high, *, strength=10):
    scaled = np.clip((np.where(valid, pixels, low) - low) / (high - low), 0, 1)
    return (255 * np.arcsinh(strength * scaled) / np.arcsinh(strength)).astype(np.uint8)


def render_cutout_png(payload):
    """Render a native-grid FITS cutout with the individual exposure stretch."""
    from io import BytesIO

    from astropy.io import fits
    from PIL import Image

    with fits.open(BytesIO(payload), memmap=False) as hdus:
        pixels = np.asarray(hdus["IMAGE"].data, dtype=np.float32)
        finite = np.isfinite(pixels)
        if pixels.ndim != 2 or not finite.any():
            raise ValueError("FITS IMAGE extension has no finite 2D pixels")
        low, high = percentile_limits(pixels[finite])
        grayscale = asinh_grayscale(pixels, finite, low, high)
    height, width = grayscale.shape
    preview = Image.fromarray(grayscale).resize((width * 8, height * 8), Image.Resampling.NEAREST)
    output = BytesIO()
    preview.save(output, format="PNG", optimize=True)
    return output.getvalue()
