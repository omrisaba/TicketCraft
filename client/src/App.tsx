import { SessionProvider, useSession } from './context/SessionContext';
import { SessionStart } from './components/SessionStart/SessionStart';
import { TicketWorkspace } from './components/TicketWorkspace/TicketWorkspace';

function AppContent() {
  const { isActive } = useSession();

  if (!isActive) {
    return <SessionStart />;
  }

  return <TicketWorkspace />;
}

export default function App() {
  return (
    <SessionProvider>
      <AppContent />
    </SessionProvider>
  );
}
