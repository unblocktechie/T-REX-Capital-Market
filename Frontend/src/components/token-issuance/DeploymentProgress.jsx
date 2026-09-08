import { Check, Circle, LoaderCircle, XCircle } from 'lucide-react';
import { DEPLOYMENT_STAGES } from '@/config/tokenIssuance';
import { cn } from '@/utils/cn';

export function DeploymentProgress({ activeStage, status }) {
  return (
    <ol className="deployment-stage-list">
      {DEPLOYMENT_STAGES.map((stage, index) => {
        const complete = index < activeStage || status === 'success';
        const active = index === activeStage && status === 'processing';
        const failed = index === activeStage && status === 'error';
        return (
          <li key={stage} className={cn(complete && 'is-complete', active && 'is-active', failed && 'is-failed')}>
            <span className="deployment-stage-list__icon">
              {complete ? <Check size={17} /> : active ? <LoaderCircle size={17} className="animate-spin" /> : failed ? <XCircle size={17} /> : <Circle size={15} />}
            </span>
            <div>
              <strong>{stage}</strong>
              <small>{complete ? 'Completed' : active ? 'In progress' : failed ? 'Needs attention' : 'Waiting'}</small>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
