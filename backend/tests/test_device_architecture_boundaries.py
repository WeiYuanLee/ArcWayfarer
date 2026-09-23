import ast
from pathlib import Path
import unittest


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = REPOSITORY_ROOT / "backend"


def parse_python(path: Path) -> ast.Module:
    return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


def attribute_calls(node: ast.AST) -> set[str]:
    return {
        call.func.attr
        for call in ast.walk(node)
        if isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute)
    }


def is_get_handler(node: ast.AsyncFunctionDef | ast.FunctionDef) -> bool:
    return any(
        isinstance(decorator, ast.Call)
        and isinstance(decorator.func, ast.Attribute)
        and decorator.func.attr == "get"
        for decorator in node.decorator_list
    )


class DeviceArchitectureBoundaryTests(unittest.TestCase):
    """Static guards for the destructive capability boundaries in D4/D8.

    These checks intentionally inspect production source instead of mocking a
    transport. A future refactor therefore cannot make discovery or an HTTP
    GET close a tunnel while leaving behavior mocks green.
    """

    def test_discovery_modules_cannot_close_or_disconnect_transports(self) -> None:
        forbidden_calls = {"close", "aclose", "disconnect", "disconnect_direct"}
        violations: list[str] = []
        for path in sorted((BACKEND_ROOT / "core" / "discovery").glob("*.py")):
            calls = attribute_calls(parse_python(path)) & forbidden_calls
            if calls:
                violations.append(f"{path.relative_to(REPOSITORY_ROOT)}: {sorted(calls)}")
        self.assertEqual(violations, [], "Discovery acquired destructive transport capability")

    def test_device_get_handlers_are_query_only(self) -> None:
        forbidden_calls = {
            "close",
            "aclose",
            "connect_direct",
            "disconnect_direct",
            "enable_direct_pairing",
            "refresh_device_discovery",
            "remove_direct_pairing",
        }
        module = parse_python(BACKEND_ROOT / "api" / "device.py")
        violations: list[str] = []
        for node in module.body:
            if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) and is_get_handler(node):
                calls = attribute_calls(node) & forbidden_calls
                if calls:
                    violations.append(f"{node.name}: {sorted(calls)}")
        self.assertEqual(violations, [], "A GET handler acquired command or cleanup capability")

    def test_removed_legacy_state_and_feature_flag_do_not_return(self) -> None:
        forbidden_names = {
            "DEVICE_REGISTRY_READS",
            "_direct_addresses",
            "_direct_rsd_devices",
            "_direct_rsd_tunnels",
            "_direct_usb_present",
            "_discovered_direct_endpoints",
            "_last_usb_discovery_diagnostic",
            "_system_routes",
        }
        violations: list[str] = []
        production_paths = [
            BACKEND_ROOT / "main.py",
            *sorted((BACKEND_ROOT / "api").rglob("*.py")),
            *sorted((BACKEND_ROOT / "core").rglob("*.py")),
            *sorted((BACKEND_ROOT / "models").rglob("*.py")),
        ]
        for path in production_paths:
            names = {
                node.id for node in ast.walk(parse_python(path)) if isinstance(node, ast.Name)
            }
            found = names & forbidden_names
            if found:
                violations.append(f"{path.relative_to(REPOSITORY_ROOT)}: {sorted(found)}")
        self.assertEqual(violations, [], "Removed global state or read-mode flag was reintroduced")


if __name__ == "__main__":
    unittest.main()
