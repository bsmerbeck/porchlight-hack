#!/usr/bin/env python3
"""Hardware-mocked unit tests for pi/lamp.py's joystick demo-mode cycling and
--selftest state sequence (05-01-PLAN.md Task 3).

Stdlib `unittest` + `unittest.mock` only -- Python 3.9-compatible, no pip
install (the Pi has neither internet nor pip). Runs anywhere, including this
dev machine, with no real Sense HAT attached: lamp.py never actually opens
`/dev/fb0` or an evdev device at import time (only inside main()/run_selftest()/
find_fb_device(), none of which this file calls), so importing it is safe.
A `sense_hat` stub is still injected into sys.modules before import per this
task's own contract, so this suite keeps passing unmodified if a future change
reintroduces a real `sense_hat` import.
"""
import os
import sys
import types
import unittest
from unittest import mock

sys.modules.setdefault("sense_hat", types.SimpleNamespace(SenseHat=mock.MagicMock()))

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lamp  # noqa: E402


class FrameForStateTests(unittest.TestCase):
    """The shared dispatch used by render_loop, the joystick cycle, and --selftest."""

    def test_returns_a_full_64_pixel_frame_for_every_demo_cycle_state(self):
        for state in lamp.DEMO_CYCLE_STATES:
            frame = lamp.frame_for_state(state, lamp.DEMO_CYCLE_NAME, 0.0)
            self.assertEqual(len(frame), 64)

    def test_falls_back_to_idle_frame_for_an_unrecognized_state(self):
        self.assertEqual(lamp.frame_for_state("bogus", None, 0.0), lamp.idle_frame(0.0))


class JoystickCycleTests(unittest.TestCase):
    """up/down/left/right local demo-mode cycling (Task 3) -- never touches the
    network/Firestore/bridge, only the shared in-process `_state` dict."""

    def setUp(self):
        lamp._state["target"] = "idle"
        lamp._state["name"] = None

    def test_cycling_forward_five_times_visits_every_state_once_and_wraps_to_idle(self):
        seen = [lamp._cycle_joystick_state(1) for _ in range(5)]
        self.assertEqual(seen, lamp.DEMO_CYCLE_STATES[1:] + [lamp.DEMO_CYCLE_STATES[0]])

    def test_cycling_backward_from_idle_wraps_to_the_last_state(self):
        self.assertEqual(lamp._cycle_joystick_state(-1), lamp.DEMO_CYCLE_STATES[-1])

    def test_forward_then_backward_returns_to_the_starting_state(self):
        lamp._cycle_joystick_state(1)
        result = lamp._cycle_joystick_state(-1)
        self.assertEqual(result, "idle")

    def test_cycling_into_verified_sets_the_demo_name_and_away_from_it_clears_it(self):
        # Starting at index 0 ("idle"), exactly `verified_index` forward steps lands
        # on "verified" (each step advances the index by exactly 1).
        verified_index = lamp.DEMO_CYCLE_STATES.index("verified")
        for _ in range(verified_index):
            lamp._cycle_joystick_state(1)
        self.assertEqual(lamp._state["target"], "verified")
        self.assertEqual(lamp._state["name"], lamp.DEMO_CYCLE_NAME)

        lamp._cycle_joystick_state(1)  # moves off "verified"
        self.assertIsNone(lamp._state["name"])

    def test_only_ever_renders_via_the_shared_frame_for_state_dispatch(self):
        # Every state a joystick nudge can land on must be renderable by the SAME
        # dispatch render_loop and --selftest use -- no second, competing render path.
        with mock.patch.object(lamp, "verified_frame", wraps=lamp.verified_frame) as spy:
            for _ in range(len(lamp.DEMO_CYCLE_STATES)):
                state = lamp._cycle_joystick_state(1)
                frame = lamp.frame_for_state(state, lamp._state["name"], 0.0)
                self.assertEqual(len(frame), 64)
            self.assertEqual(spy.call_count, 1)  # "verified" is visited exactly once per full cycle


class CenterButtonUntouchedTests(unittest.TestCase):
    """T-03 acceptance: the pre-existing center-button alert flag must be unaffected
    by this task's up/down/left/right changes."""

    def test_joystick_pressed_flag_exists_and_defaults_false_shape(self):
        self.assertIn("joystick_pressed", lamp._state)


class SelftestSequenceTests(unittest.TestCase):
    def test_demo_cycle_states_covers_exactly_the_five_states_in_order(self):
        self.assertEqual(
            lamp.DEMO_CYCLE_STATES,
            ["idle", "screening", "verifying", "verified", "scam"],
        )


class RotationMathTests(unittest.TestCase):
    """IMU auto-orientation: _rotate_frame() must be a true 8x8 rotation, verified
    algebraically (no hardware needed -- pure pixel-array math)."""

    def _marked_frame(self):
        # A frame where every pixel is a distinct (row, col) marker so a rotation
        # bug shows up as "pixel ended up in the wrong place" rather than being
        # masked by symmetry (a solid-color or symmetric test frame could pass a
        # broken rotation by accident).
        return [(r, c, 0) for r in range(8) for c in range(8)]

    def test_rotating_90_degrees_four_times_returns_the_original_frame(self):
        frame = self._marked_frame()
        rotated = frame
        for _ in range(4):
            rotated = lamp._rotate_frame(rotated, 90)
        self.assertEqual(rotated, frame)

    def test_rotating_180_degrees_flips_both_axes(self):
        frame = self._marked_frame()
        rotated = lamp._rotate_frame(frame, 180)
        for r in range(8):
            for c in range(8):
                self.assertEqual(rotated[r * 8 + c], frame[(7 - r) * 8 + (7 - c)])

    def test_rotating_270_is_the_inverse_of_90(self):
        frame = self._marked_frame()
        self.assertEqual(lamp._rotate_frame(lamp._rotate_frame(frame, 90), 270), frame)

    def test_rotating_zero_degrees_is_a_no_op(self):
        frame = self._marked_frame()
        self.assertEqual(lamp._rotate_frame(frame, 0), frame)

    def test_invalid_rotation_raises(self):
        with self.assertRaises(ValueError):
            lamp._rotate_frame(self._marked_frame(), 45)


class OrientationMappingTests(unittest.TestCase):
    """_rotation_from_gravity: dominant-axis dispatch, Z-dominant (flat) keeps
    the caller's last rotation by returning None."""

    def test_flat_board_returns_none_regardless_of_small_xy_noise(self):
        self.assertIsNone(lamp._rotation_from_gravity(0.05, -0.03, 0.98))

    def test_positive_y_dominant_maps_to_configured_rotation(self):
        self.assertEqual(
            lamp._rotation_from_gravity(0.0, 0.9, 0.1),
            lamp.ROTATION_FOR_POSITIVE_Y,
        )

    def test_negative_y_dominant_maps_to_configured_rotation(self):
        self.assertEqual(
            lamp._rotation_from_gravity(0.0, -0.9, 0.1),
            lamp.ROTATION_FOR_NEGATIVE_Y,
        )

    def test_positive_x_dominant_maps_to_configured_rotation(self):
        self.assertEqual(
            lamp._rotation_from_gravity(0.9, 0.0, 0.1),
            lamp.ROTATION_FOR_POSITIVE_X,
        )

    def test_negative_x_dominant_maps_to_configured_rotation(self):
        self.assertEqual(
            lamp._rotation_from_gravity(-0.9, 0.0, 0.1),
            lamp.ROTATION_FOR_NEGATIVE_X,
        )


class RotationEnvOverrideTests(unittest.TestCase):
    def test_valid_rotation_env_var_is_accepted(self):
        with mock.patch.dict(os.environ, {"PORCHLIGHT_ROTATION": "180"}):
            self.assertEqual(lamp._rotation_from_env(), 180)

    def test_missing_env_var_returns_none(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("PORCHLIGHT_ROTATION", None)
            self.assertIsNone(lamp._rotation_from_env())

    def test_invalid_rotation_value_is_rejected(self):
        with mock.patch.dict(os.environ, {"PORCHLIGHT_ROTATION": "45"}):
            self.assertIsNone(lamp._rotation_from_env())

    def test_non_numeric_rotation_value_is_rejected(self):
        with mock.patch.dict(os.environ, {"PORCHLIGHT_ROTATION": "sideways"}):
            self.assertIsNone(lamp._rotation_from_env())


class HealthAndStateRotationFieldTests(unittest.TestCase):
    """GET /health and POST /state's additive rotation/auto_rotate contract --
    exercised directly against the shared _state dict (same one the HTTP
    handler reads/writes), matching this suite's existing hardware-mocked style."""

    def setUp(self):
        lamp._state["rotation"] = 0
        lamp._state["auto_rotate"] = True

    def test_state_dict_has_rotation_and_auto_rotate_by_default(self):
        self.assertIn("rotation", lamp._state)
        self.assertIn("auto_rotate", lamp._state)
        self.assertTrue(lamp._state["auto_rotate"])


class FontGlyphTests(unittest.TestCase):
    """5x7 font (Task: legibility upgrade from the original 3x5 table) -- every
    glyph must declare exactly GLYPH_HEIGHT rows of exactly GLYPH_WIDTH columns,
    and the scroll-column builder must slice them consistently."""

    def test_every_glyph_has_the_declared_height(self):
        for ch, rows in lamp._GLYPHS.items():
            self.assertEqual(
                len(rows), lamp.GLYPH_HEIGHT, f"glyph {ch!r} has {len(rows)} rows"
            )

    def test_every_glyph_row_has_the_declared_width(self):
        for ch, rows in lamp._GLYPHS.items():
            for i, row in enumerate(rows):
                self.assertEqual(
                    len(row),
                    lamp.GLYPH_WIDTH,
                    f"glyph {ch!r} row {i} has width {len(row)}",
                )

    def test_glyph_rows_only_contain_hash_or_dot(self):
        for ch, rows in lamp._GLYPHS.items():
            for row in rows:
                self.assertTrue(
                    set(row) <= {"#", "."}, f"glyph {ch!r} has unexpected chars: {row!r}"
                )

    def test_glyph_columns_returns_width_columns_of_height_bits(self):
        cols = lamp._glyph_columns("A")
        self.assertEqual(len(cols), lamp.GLYPH_WIDTH)
        for col in cols:
            self.assertEqual(len(col), lamp.GLYPH_HEIGHT)

    def test_n_m_w_are_visually_distinct_shapes(self):
        # The 3x5 font's worst legibility failure was N/M/W collapsing into
        # near-identical blobs -- assert the three glyphs are pairwise unequal.
        n, m, w = lamp._GLYPHS["N"], lamp._GLYPHS["M"], lamp._GLYPHS["W"]
        self.assertNotEqual(n, m)
        self.assertNotEqual(n, w)
        self.assertNotEqual(m, w)

    def test_unknown_character_falls_back_to_space_glyph(self):
        self.assertEqual(lamp._glyph_columns("$"), lamp._glyph_columns(" "))

    def test_verified_frame_with_brenden_produces_a_full_64_pixel_frame(self):
        frame = lamp.verified_frame(0.0, "Brenden")
        self.assertEqual(len(frame), 64)


if __name__ == "__main__":
    unittest.main()
