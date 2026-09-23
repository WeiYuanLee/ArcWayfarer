import unittest
from unittest.mock import patch

from core.support_diagnostics import runtime_diagnostic


class SupportDiagnosticTests(unittest.TestCase):
    def test_runtime_report_contains_tls_and_packaging_versions_without_secrets(self) -> None:
        with patch("core.support_diagnostics.version", return_value="9.9.9"):
            report = runtime_diagnostic()

        self.assertEqual(report["pymobiledevice3_version"], "9.9.9")
        self.assertIn("OpenSSL", report["openssl_version"])
        self.assertTrue(report["python_version"])
        self.assertEqual(
            set(report),
            {"platform", "platform_release", "machine", "python_version", "openssl_version", "pymobiledevice3_version"},
        )


if __name__ == "__main__":
    unittest.main()
