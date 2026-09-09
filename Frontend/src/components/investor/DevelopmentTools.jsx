import { Bug, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { configureNextMockFailure } from '@/services/investor';

export function DevelopmentTools({ onClear }) {
  if (!import.meta.env.DEV) return null;
  return (
    <details className="investor-dev-tools">
      <summary><Bug size={15} /> Development tools</summary>
      <div>
        <p>Exercise retry and recovery paths. The selected action fails once.</p>
        <div className="investor-dev-tools__buttons">
          {['upload', 'selfie', 'wallet', 'profile', 'request'].map((action) => (
            <Button key={action} size="sm" variant="secondary" onClick={() => configureNextMockFailure(action)}>
              Fail next {action}
            </Button>
          ))}
          <Button size="sm" variant="danger" icon={RotateCcw} onClick={onClear}>Clear Draft</Button>
        </div>
      </div>
    </details>
  );
}
