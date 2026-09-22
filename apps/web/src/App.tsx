import { lazy, Suspense } from 'react';
import Landing from '@/pages/Landing';
import AppPlaceholder from '@/pages/AppPlaceholder';
import Stage from '@/pages/Stage';

// Lazy-loaded: this debug/demo route pulls in Firebase and never needs to land in the
// landing page's default chunk (matches the Phase 1 lazy-Firebase pattern).
const Sim = lazy(() => import('@/pages/Sim'));

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

  return <Landing />;
}

export default App;
