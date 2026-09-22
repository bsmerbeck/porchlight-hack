// DEMO-05: the canonical "grandchild in jail" scam-call script. Lives in packages/shared
// (rather than functions/src/screening/fixtures/) so both the Vitest fixture (functions)
// and the /sim page (apps/web) share one source without a functions -> shared -> functions
// import cycle.
export const JAIL_SCRIPT: string[] = [
  "Hi grandma, it's me, Brenden.",
  "I'm okay but I'm in trouble — I got arrested and I'm in jail.",
  "Please don't tell mom, she'll be so upset.",
  'I need bail money, can you get me some gift cards? Like Google Play or Apple cards.',
  "I can't talk long, the officer said I only get one call. Please hurry.",
];

// Phase 5 (05-CLIPS): the "Attacker soundboard" fallback lines -- generated as
// plain ElevenLabs Text-to-Speech clips in the consented cloned voice (see
// functions/src/demo/attackClips.ts), because the ElevenLabs conversational
// "Attacker" agent itself is blocked by vendor moderation ("Agent ... is
// unsafe"). Distinct wording from JAIL_SCRIPT (a police-station bail scenario,
// not jail) so the soundboard reads as its own five-line arc when played
// through a speaker held up to the calling phone's mic.
export const ATTACK_LINES: string[] = [
  "Hi grandma, it's me, Brenden.",
  "I'm in a bit of trouble — I got into a car accident this morning and I'm at the police station.",
  'They said I can get out today if someone pays four thousand dollars in bail, and gift cards are the fastest way.',
  "Please don't tell mom, I'm so embarrassed. Can you help me right now?",
  'Okay… okay. I have to go. Bye grandma.',
];
