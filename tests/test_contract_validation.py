"""Contract-level guardrails for evidence-bearing comparison responses."""

from pathlib import Path

import yaml


CONTRACT = Path(__file__).parents[1] / "packages/contracts/openapi.yaml"


def test_observations_keep_comparison_provenance():
    spec = yaml.safe_load(CONTRACT.read_text())
    observation = spec["components"]["schemas"]["Observation"]

    assert {
        "id", "observed_at", "observed_end", "release", "channel",
        "wavelength_min_um", "wavelength_max_um", "provenance",
    } <= set(
        observation["required"]
    )
    assert observation["properties"]["wavelength_um"]["type"] == ["number", "null"]
    assert observation["properties"]["observed_at"]["format"] == "date-time"
    assert observation["properties"]["variance_available"]["type"] == "boolean"
    assert observation["properties"]["quality_flags"]["type"] == "array"


def test_comparison_cannot_omit_limitations_or_use_unrecognized_status():
    spec = yaml.safe_load(CONTRACT.read_text())
    comparison = spec["components"]["schemas"]["Comparison"]

    assert {"observation_a", "observation_b", "status", "limitations"} <= set(
        comparison["required"]
    )
    assert comparison["properties"]["status"]["enum"] == [
        "NO_SIGNIFICANT_CHANGE",
        "CANDIDATE_CHANGE",
        "INCONCLUSIVE",
        "INSUFFICIENT_DATA",
        "PROCESSING_ERROR",
    ]


def test_incompatible_comparison_has_a_contract_error_response():
    spec = yaml.safe_load(CONTRACT.read_text())
    responses = spec["paths"]["/compare"]["get"]["responses"]

    assert "422" in responses
    assert "502" in responses
