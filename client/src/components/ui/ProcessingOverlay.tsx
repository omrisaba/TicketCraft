import { Loader2 } from 'lucide-react';

interface ProcessingOverlayProps {
  message: string;
}

export function ProcessingOverlay({ message }: ProcessingOverlayProps) {
  return (
    <div role="status" aria-live="polite" className="rounded-lg bg-blue-50 border border-blue-200 p-4 flex items-center gap-3 animate-in fade-in duration-300">
      <div className="relative">
        <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
        <div className="absolute inset-0 w-5 h-5 rounded-full bg-blue-400 animate-ping opacity-20" />
      </div>
      <span className="text-sm font-medium text-blue-700">{message}</span>
    </div>
  );
}
