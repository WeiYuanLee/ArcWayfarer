import math
import unittest

from core.flower import _estimate_seconds
from core.flower_geometry import flower_perimeter_path, flower_spiral_path, spiral_radii
from models.schemas import FlowerOptions


class FlowerGeometryTests(unittest.TestCase):
    center = (25.0330, 121.5650)

    def test_two_rings_shrink_from_outer_to_inner(self) -> None:
        self.assertEqual(spiral_radii(30, 2), [30, 18.0])

    def test_spiral_starts_at_center_and_is_repeatable(self) -> None:
        first = flower_spiral_path(self.center, 30, 2, 8, seed="session-1")
        second = flower_spiral_path(self.center, 30, 2, 8, seed="session-1")
        self.assertEqual(first, second)
        self.assertEqual(first[0], self.center)
        self.assertGreater(len(first), 1)

    def test_partial_second_ring_uses_inner_radius(self) -> None:
        path = flower_spiral_path(self.center, 30, 1.5, 8, jitter_m=0, seed="partial")
        # center + 1 full 8-segment ring + 4-segment partial inner ring
        self.assertEqual(len(path), 1 + 9 + 5)

    def test_perimeter_keeps_legacy_shape(self) -> None:
        self.assertEqual(len(flower_perimeter_path(self.center, 30, 1, 8)), 9)

    def test_inner_radius_never_falls_below_safe_floor(self) -> None:
        self.assertTrue(all(radius >= 5 for radius in spiral_radii(6, 3)))

    def test_eta_estimate_includes_each_flower_wait(self) -> None:
        base = FlowerOptions(radius_m=10, circles=1, segments=8, pre_wait_seconds=0, post_wait_seconds=0)
        with_waits = base.model_copy(update={"pre_wait_seconds": 7, "post_wait_seconds": 11})
        flowers = [self.center, (25.0342, 121.5650)]

        base_seconds = _estimate_seconds(flowers, base, speed=5 / 3.6, rounds=1, jump_mode=False)
        waited_seconds = _estimate_seconds(flowers, with_waits, speed=5 / 3.6, rounds=1, jump_mode=False)

        self.assertEqual(waited_seconds - base_seconds, 36)


if __name__ == "__main__":
    unittest.main()
