import { Bell, LockKeyhole, MonitorCheck, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const Setting = ({ icon: Icon, title, text, children }) => (
  <div className="setting-row">
    <span className="setting-row__icon">
      <Icon size={19} />
    </span>
    <div>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
    {children}
  </div>
);

export default function SettingsPage() {
  useDocumentTitle('Settings');

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Workspace controls</span>
          <h1>Settings</h1>
          <p>Configure workspace, security and notification preferences.</p>
        </div>
      </header>
      <div className="settings-columns">
        <Card className="settings-section">
          <header>
            <span>
              <MonitorCheck size={20} />
            </span>
            <div>
              <h2>Workspace</h2>
              <p>A consistent light interface is used across every screen and device.</p>
            </div>
          </header>
          <Setting
            icon={MonitorCheck}
            title="Interface style"
            text="The launchpad uses a fixed white workspace for consistent readability."
          >
            <span className="settings-value">Light</span>
          </Setting>
        </Card>

        <Card className="settings-section">
          <header>
            <span>
              <ShieldCheck size={20} />
            </span>
            <div>
              <h2>Security</h2>
              <p>Control sign-in and session protection.</p>
            </div>
          </header>
          <Setting
            icon={LockKeyhole}
            title="Two-factor authentication"
            text="Require an authenticator during sign in."
          >
            <button className="text-button">Configure</button>
          </Setting>
          <Setting
            icon={Bell}
            title="Security alerts"
            text="Receive alerts for unusual account activity."
          >
            <button className="switch is-on" role="switch" aria-checked="true">
              <span />
            </button>
          </Setting>
        </Card>
      </div>
    </div>
  );
}
