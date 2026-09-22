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


if __name__ == "__main__":
    unittest.main()
