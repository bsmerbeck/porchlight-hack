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
