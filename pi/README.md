# Porchlight Lamp Controller (placeholder)

This will run on the Raspberry Pi 4 + Sense HAT beside the phone, showing call
state as a color: amber idle, blue screening, green verified (scrolling name),
red flashing scam.

- Python 3.9, standard library plus the preinstalled `sense_hat` module only —
  the Pi has no internet on the link-local ethernet cable and cannot
  `pip install` anything.
- Driven from the Mac's bridge script over the direct ethernet link
  (`en8` / `169.254.x.x`), never over venue Wi-Fi.
- Filled in during Phase 3.
