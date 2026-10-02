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


def function_attribute_calls(path: Path, function_name: str) -> set[str]:
    module = parse_python(path)
    for node in module.body:
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) and node.name == function_name:
            return attribute_calls(node)
    raise AssertionError(f"Missing function {function_name} in {path}")


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

    def test_every_location_mode_routes_through_the_shared_command_engine(self) -> None:
        """Keep every public mode on the Direct-bound device_session path."""
        expected_entrypoints = {
            ("navigator.py", "start_navigate"): {"start"},
            ("route_loop.py", "start_route_loop"): {"start"},
            ("multi_stop.py", "start_multi_stop"): {"start", "start_jump"},
            ("random_walk.py", "start_random_walk"): {"start_dynamic"},
            ("joystick.py", "start_joystick"): {"joystick_start"},
        }
        violations: list[str] = []
        for (filename, function_name), required_calls in expected_entrypoints.items():
            calls = function_attribute_calls(BACKEND_ROOT / "core" / filename, function_name)
            missing = required_calls - calls
            if missing:
                violations.append(f"{filename}:{function_name} missing {sorted(missing)}")

        # Teleport/restore and Flower intentionally write directly through the
        # same session boundary instead of scheduling a simulation runner.
        for filename, function_name, required_calls in (
            ("teleport.py", "set_location", {"set_location"}),
            ("teleport.py", "clear_location", {"clear_location"}),
            ("flower.py", "_move_phase", {"set_location"}),
        ):
            calls = function_attribute_calls(BACKEND_ROOT / "core" / filename, function_name)
            missing = required_calls - calls
            if missing:
                violations.append(f"{filename}:{function_name} missing {sorted(missing)}")

        self.assertEqual(violations, [], "A location mode bypassed the shared command boundary")

    def test_only_device_session_can_create_dvt_location_channels(self) -> None:
        violations: list[str] = []
        for path in sorted((BACKEND_ROOT / "core").rglob("*.py")):
            if path.name == "device_session.py":
                continue
            for node in ast.walk(parse_python(path)):
                if isinstance(node, ast.ImportFrom) and node.module and ".services.dvt" in node.module:
                    violations.append(str(path.relative_to(REPOSITORY_ROOT)))
                    break
        self.assertEqual(violations, [], "A feature opened a second DVT channel outside device_session")


if __name__ == "__main__":
    unittest.main()
