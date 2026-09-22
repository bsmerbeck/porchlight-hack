import { lazy, Suspense } from 'react';
import Landing from '@/pages/Landing';
import AppPlaceholder from '@/pages/AppPlaceholder';
import Stage from '@/pages/Stage';

// Lazy-loaded: this debug/demo route pulls in Firebase and never needs to land in the
// landing page's default chunk (matches the Phase 1 lazy-Firebase pattern).
const Sim = lazy(() => import('@/pages/Sim'));
// Lazy-loaded: the member phone app pulls in Firebase + @simplewebauthn/browser, neither of
// which should land in the landing page's default chunk.
const Verify = lazy(() => import('@/pages/Verify'));

function App() {
  const pathname = window.location.pathname.replace(/\/$/, '') || '/';

  if (pathname.startsWith('/app')) {
    return <AppPlaceholder />;
  }

  if (pathname === '/stage') {
    return <Stage />;
  }

  if (pathname === '/sim') {
    return (
      <Suspense fallback={null}>
        <Sim />
      </Suspense>
    );
  }

  if (pathname === '/verify') {
    return (
      <Suspense fallback={null}>
        <Verify />
      </Suspense>
    );
  }

  return <Landing />;
}

export default App;
