// Thin isolation wrapper around @simplewebauthn/browser — mirrors the lazy-import isolation
// pattern apps/web/src/lib/firebase.ts already established, so Verify.tsx never imports the
// vendor package directly. Re-exported as a named async loader so the vendor package is only
// ever pulled into the bundle once /verify is actually visited (matches Sim.tsx's dynamic
// `await import('@/lib/firebase')` convention).
export async function startRegistration(
  ...args: Parameters<typeof import('@simplewebauthn/browser').startRegistration>
): ReturnType<typeof import('@simplewebauthn/browser').startRegistration> {
  const { startRegistration: real } = await import('@simplewebauthn/browser');
  return real(...args);
}

export async function startAuthentication(
  ...args: Parameters<typeof import('@simplewebauthn/browser').startAuthentication>
): ReturnType<typeof import('@simplewebauthn/browser').startAuthentication> {
  const { startAuthentication: real } = await import('@simplewebauthn/browser');
  return real(...args);
}

export async function platformAuthenticatorIsAvailable(): Promise<boolean> {
  try {
    const { platformAuthenticatorIsAvailable: real } = await import('@simplewebauthn/browser');
    return await real();
  } catch {
    return false;
  }
}
