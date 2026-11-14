import unittest

from services.api.science import comparison, compatible_epochs, observation_from_row


class ObservationMappingTests(unittest.TestCase):
    def test_maps_dr1_archive_fields_without_losing_source_values(self):
        # Fixture tests field mapping; the example URL and row are not archive output.
        row = {
            "obs_id": "2025W33_2C_0321_1", "t_min": "60902.864715", "t_max": "60902.864900",
            "em_min": "1.63010e-6", "em_max": "2.43460e-6",
            "obs_publisher_did": "ivo://irsa.ipac/spherex_dr1?2025W33_2C_0321_1/D3",
            "energy_bandpassname": "SPHEREx-D3",
            "access_url": "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/example.fits",
            "quality_flags": "0",
        }
        item = observation_from_row(row, "https://irsa.ipac.caltech.edu/SIA")
        self.assertEqual(item["id"], "ivo://irsa.ipac/spherex_dr1?2025W33_2C_0321_1/D3")
        self.assertEqual(item["channel"], "SPHEREx-D3")
        self.assertEqual(item["release"], "DR1")
        self.assertEqual(item["observed_at"], "2025-08-15T20:45:11.376000Z")
        self.assertEqual(item["observed_end"], "2025-08-15T20:45:27.360000Z")
        self.assertAlmostEqual(item["wavelength_um"], (1.63010 + 2.43460) / 2)
        self.assertAlmostEqual(item["wavelength_min_um"], 1.63010)
        self.assertAlmostEqual(item["wavelength_max_um"], 2.43460)
        self.assertEqual(item["provenance"]["archive_fields"], row)
        self.assertEqual(item["product_url"], row["access_url"])
        self.assertEqual(item["quality_flags"], ["quality_flags=0"])
        self.assertTrue(item["variance_available"])

    def test_comparison_never_claims_change_before_measurement(self):
        a = observation_from_row({"obs_id":"a","obs_publisher_did":"a/D3","energy_bandpassname":"SPHEREx-D3","t_min":"60902","t_max":"60902.1","em_min":"1e-6","em_max":"2e-6"}, "https://irsa.ipac.caltech.edu/SIA")
        b = observation_from_row({"obs_id":"b","obs_publisher_did":"b/D3","energy_bandpassname":"SPHEREx-D3","t_min":"61165","t_max":"61165.1","em_min":"1e-6","em_max":"2e-6"}, "https://irsa.ipac.caltech.edu/SIA")
        result = comparison("barnards-star", a, b)
        self.assertEqual(result["status"], "INSUFFICIENT_DATA")
        self.assertNotIn("statistics", result)
        self.assertIn("no variability result", " ".join(result["limitations"]))

    def test_comparison_requires_same_archive_wavelength_bounds(self):
        a = observation_from_row({"obs_id":"a","energy_bandpassname":"SPHEREx-D3","t_min":"60902","t_max":"60902.1","em_min":"1e-6","em_max":"2e-6"}, "https://irsa.ipac.caltech.edu/SIA")
        b = observation_from_row({"obs_id":"b","energy_bandpassname":"SPHEREx-D4","t_min":"61165","t_max":"61165.1","em_min":"1e-6","em_max":"2e-6"}, "https://irsa.ipac.caltech.edu/SIA")
        self.assertFalse(compatible_epochs(a, b))

    def test_rejects_rows_missing_required_archive_semantics(self):
        with self.assertRaises(ValueError):
            observation_from_row({"obs_id":"missing-wavelength","t_min":"60902"}, "https://irsa.ipac.caltech.edu/SIA")


if __name__ == "__main__":
    unittest.main()
