import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="fatal-error">
        <div className="fatal-error__icon">
          <AlertTriangle size={30} />
        </div>
        <p className="eyebrow">Application error</p>
        <h1>We hit an unexpected problem.</h1>
        <p>Your data is safe. Reload the page to restore the application.</p>
        <Button onClick={() => window.location.reload()}>Reload application</Button>
      </main>
    );
  }
}
