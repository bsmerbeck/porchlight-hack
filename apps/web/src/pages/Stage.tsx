import { Lamp } from '@/components/Lamp';
import { Badge } from '@/components/ui/badge';
import { CALL_STATES } from '@/lib/schema';

export default function Stage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[oklch(0.2_0.03_60)] p-6 text-center text-white">
      <Lamp className="w-72 md:w-96" />
      <h1 className="text-3xl font-bold md:text-5xl">Porchlight — stage view</h1>
      <div className="flex flex-wrap justify-center gap-2 opacity-70">
        {CALL_STATES.map((state) => (
          <Badge key={state} variant="outline" className="border-white/30 text-white">
            {state}
          </Badge>
        ))}
      </div>
    </div>
  );
}
