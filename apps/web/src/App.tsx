import { WaitlistForm } from '@/components/WaitlistForm';
import { LiveCounter } from '@/components/LiveCounter';

function App() {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-8 p-6 text-center">
      <h1 className="text-4xl font-bold">Porchlight</h1>
      <WaitlistForm />
      <LiveCounter />
    </div>
  );
}

export default App;
