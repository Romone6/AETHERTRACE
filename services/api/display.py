"""Display transfer functions for measured infrared brightness."""

import numpy as np


def percentile_limits(values, percentiles=(1, 99.5)):
    low, high = np.percentile(values, percentiles)
    return float(low), float(high if high > low else low + 1)


def asinh_grayscale(pixels, valid, low, high, *, strength=10):
    scaled = np.clip((np.where(valid, pixels, low) - low) / (high - low), 0, 1)
    return (255 * np.arcsinh(strength * scaled) / np.arcsinh(strength)).astype(np.uint8)
