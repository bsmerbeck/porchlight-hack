# Porchlight Lamp Bridge (placeholder)

A small Node script that will run on the Mac, watch `calls/{id}` documents in
Firestore, and push the resulting lamp state to the Pi over the direct
ethernet link.

- Imports call state types (`CallState`, `CallDoc`) from `@porchlight/shared`
  so the bridge and the rest of the app agree on the state machine.
- Talks to the Pi via HTTP POST over the link-local ethernet cable — no
  dependency on venue Wi-Fi.
- Filled in during Phase 3.
