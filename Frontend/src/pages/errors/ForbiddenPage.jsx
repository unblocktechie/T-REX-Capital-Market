import { LockKeyhole } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function ForbiddenPage() {
  useDocumentTitle('Access denied');
  return (
    <main className="error-page">
      <div className="error-code">403</div>
      <span className="error-icon">
        <LockKeyhole size={28} />
      </span>
      <h1>You don’t have access.</h1>
      <p>
        Your current role cannot open this page. Contact a workspace administrator if this seems
        incorrect.
      </p>
      <Link to={ROUTES.dashboard}>
        <Button>Return to dashboard</Button>
      </Link>
    </main>
  );
}
