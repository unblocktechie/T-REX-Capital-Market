import { Camera, Mail, MapPin, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function ProfilePage() {
  useDocumentTitle('Profile');
  const { user } = useAuth();
  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Personal workspace</span>
          <h1>Your profile</h1>
          <p>Manage your identity and account preferences.</p>
        </div>
        <Button>Save changes</Button>
      </header>
      <div className="settings-grid">
        <Card className="profile-summary">
          <div className="profile-avatar">
            {user?.name
              ?.split(' ')
              .map((part) => part[0])
              .slice(0, 2)
              .join('')}
            <button aria-label="Change profile photo">
              <Camera size={16} />
            </button>
          </div>
          <h2>{user?.name}</h2>
          <p>{user?.email}</p>
          <span className="verified-pill">
            <ShieldCheck size={15} /> Verified account
          </span>
          <div className="profile-facts">
            <span>
              <Mail size={16} />
              {user?.email}
            </span>
            <span>
              <MapPin size={16} /> Ahmedabad, India
            </span>
          </div>
        </Card>
        <Card className="settings-form">
          <h2>Personal information</h2>
          <p>Keep your profile details accurate and up to date.</p>
          <div className="form-grid">
            <Input label="Full name" defaultValue={user?.name} />
            <Input label="Work email" type="email" defaultValue={user?.email} />
            <Input label="Job title" defaultValue="Product Administrator" />
            <Input label="Phone number" defaultValue="+91 98765 43210" />
          </div>
        </Card>
      </div>
    </div>
  );
}
