import { WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function NetworkErrorPage() {
  return (
    <main className="error-page">
      <div className="error-code">OFFLINE</div>
      <span className="error-icon">
        <WifiOff size={28} />
      </span>
      <h1>Connection interrupted.</h1>
      <p>Check your internet connection, then try loading the application again.</p>
      <Button onClick={() => window.location.reload()}>Try again</Button>
    </main>
  );
}
