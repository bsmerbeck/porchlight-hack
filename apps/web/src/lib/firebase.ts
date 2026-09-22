import { initializeApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { WaitlistPayload, StatsWaitlistDoc } from '@porchlight/shared';

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});

export const db = getFirestore(app);
export const fns = getFunctions(app, 'us-central1');
export const joinWaitlist = httpsCallable<WaitlistPayload, { id: string }>(fns, 'joinWaitlist');

export function watchWaitlistCount(cb: (n: number) => void) {
  return onSnapshot(doc(db, 'stats', 'waitlist'), (snap) => {
    cb((snap.data() as StatsWaitlistDoc | undefined)?.count ?? 0);
  });
}

// Emulator wiring (only when running `pnpm dev` with emulators):
// import { connectFirestoreEmulator } from 'firebase/firestore';
// import { connectFunctionsEmulator } from 'firebase/functions';
// if (import.meta.env.VITE_USE_EMULATORS === '1') {
//   connectFirestoreEmulator(db, '127.0.0.1', 8080);
//   connectFunctionsEmulator(fns, '127.0.0.1', 5001);
// }
