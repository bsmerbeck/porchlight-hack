import { onDocumentWritten } from 'firebase-functions/firestore';
import { anthropicKey } from '../secrets.js';

const REGION = 'us-central1';

// RED stub (05-01 Task 2, TDD): the real RISK-04 behavior (guard + Claude call + Firestore
// write + fallback) is implemented in the GREEN commit that follows the failing tests in
// writeFamilyReport.test.ts.
export const writeFamilyReport = onDocumentWritten({ document: 'calls/{callId}', region: REGION, secrets: [anthropicKey] }, async () => {
  return;
});
