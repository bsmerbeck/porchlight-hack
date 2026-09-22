import { defineSecret } from 'firebase-functions/params';

// Declared once, here, so both index.ts and any other module (e.g. screening/simulateTurn.ts)
// can import the SecretParam objects directly without a circular import through index.ts —
// index.ts itself imports several screening modules, so those modules importing secrets back
// from index.ts would create an import cycle where the secret bindings are still undefined
// at the time they're read (module evaluation order hazard).
export const anthropicKey = defineSecret('ANTHROPIC_API_KEY');
export const twilioAccountSid = defineSecret('TWILIO_ACCOUNT_SID');
export const twilioAuthToken = defineSecret('TWILIO_AUTH_TOKEN');
export const elevenLabsKey = defineSecret('ELEVENLABS_API_KEY');
