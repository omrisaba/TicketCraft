import { useState } from 'react';
import { SessionProvider, useSession } from './context/SessionContext';
import { SessionStart } from './components/SessionStart/SessionStart';
import { TicketWorkspace } from './components/TicketWorkspace/TicketWorkspace';
import { ComposeWorkspace } from './components/ComposeWorkspace/ComposeWorkspace';
import { ClipboardCheck, PenLine } from 'lucide-react';

type AppMode = 'improve' | 'compose';

function AppContent() {
  const { isActive } = useSession();
  const [mode, setMode] = useState<AppMode>('improve');

  if (!isActive) {
    return <SessionStart />;
  }

  return (
    <>
      <div className="flex justify-center pt-3 pb-1">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
          <button
            onClick={() => setMode('improve')}
            className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-all cursor-pointer ${
              mode === 'improve'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            Improve Existing
          </button>
          <button
            onClick={() => setMode('compose')}
            className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-all cursor-pointer ${
              mode === 'compose'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <PenLine className="w-4 h-4" />
            Create from Scratch
          </button>
        </div>
      </div>
      {mode === 'improve' ? <TicketWorkspace /> : <ComposeWorkspace />}
    </>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <AppContent />
    </SessionProvider>
  );
}
