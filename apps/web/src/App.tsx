import Landing from '@/pages/Landing';
import AppPlaceholder from '@/pages/AppPlaceholder';
import Stage from '@/pages/Stage';

function App() {
  const pathname = window.location.pathname.replace(/\/$/, '') || '/';

  if (pathname.startsWith('/app')) {
    return <AppPlaceholder />;
  }

  if (pathname === '/stage') {
    return <Stage />;
  }

  return <Landing />;
}

export default App;
