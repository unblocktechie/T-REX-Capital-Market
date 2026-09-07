import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ROUTES } from '@/config/routes';

export default function UnauthorizedPage() {
  return (
    <main className="error-page">
      <div className="error-code">401</div>
      <span className="error-icon">
        <ShieldAlert size={28} />
      </span>
      <h1>Authentication required.</h1>
      <p>Sign in with an authorized account to continue.</p>
      <Link to={ROUTES.login}>
        <Button>Sign in</Button>
      </Link>
    </main>
  );
}
