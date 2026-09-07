import { ArrowLeft, Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <main className="error-page">
      <div className="error-code">404</div>
      <span className="error-icon">
        <Compass size={28} />
      </span>
      <h1>This page is off the map.</h1>
      <p>The address may be incorrect, or the page may have moved.</p>
      <Link to={ROUTES.dashboard}>
        <Button icon={ArrowLeft}>Back to dashboard</Button>
      </Link>
    </main>
  );
}
