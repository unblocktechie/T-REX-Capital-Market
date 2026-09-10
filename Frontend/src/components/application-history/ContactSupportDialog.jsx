import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, CircleCheck, Info, Mail, ShieldCheck } from 'lucide-react';
import { MarketplaceDropdown } from '@/components/investor-marketplace/MarketplaceDropdown';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { appConfig } from '@/config/app.config';
import { cn } from '@/utils/cn';

const SUBJECT_OPTIONS = [
  {
    value: 'Token / Investment',
    label: 'Token / Investment',
    description: 'Questions about a token or your investment.',
  },
  {
    value: 'Identity & Verification',
    label: 'Identity & Verification',
    description: 'Help with identity checks or verification details.',
  },
  {
    value: 'Claim Submission',
    label: 'Claim Submission',
    description: 'Support for claim signing, submission, or verification.',
  },
  {
    value: 'Transaction Issue',
    label: 'Transaction Issue',
    description: 'Pending, failed, or unexpected blockchain transactions.',
  },
  {
    value: 'Other',
    label: 'Other',
    description: 'Anything else our support team can help with.',
  },
];

const clean = (value) => String(value ?? '').trim();
const displayValue = (value) => clean(value) || 'Not available';

export function ContactSupportDialog({ open, onClose, context = {} }) {
  const accountName = clean(context.name);
  const accountEmail = clean(context.email);
  const [name, setName] = useState(accountName);
  const [email, setEmail] = useState(accountEmail);
  const [subject, setSubject] = useState('Claim Submission');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    setName(accountName);
    setEmail(accountEmail);
    setSubject('Claim Submission');
    setMessage('');
    setSubmitted(false);
    setShowContext(false);
    setErrors({});
  }, [open, accountName, accountEmail]);

  const attachedDetails = useMemo(() => ([
    ['Investor account / user ID', context.userId],
    ['Investor wallet address', context.walletAddress],
    ['ONCHAINID address', context.onchainIdAddress],
    ['Token address', context.tokenAddress],
    ['Token name', context.tokenName],
    ['Application / subscription ID', context.applicationId],
    ['Current application status', context.applicationStatus],
  ]), [context]);

  const validate = () => {
    const next = {};
    if (!clean(name)) next.name = 'Name is required.';
    if (!/^\S+@\S+\.\S+$/.test(clean(email))) next.email = 'Enter a valid email address.';
    if (!clean(subject)) next.subject = 'Select a subject.';
    if (clean(message).length < 10) next.message = 'Please add at least 10 characters so our team can understand the issue.';
    setErrors(next);
    return !Object.keys(next).length;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!validate()) return;

    const metadata = attachedDetails
      .map(([label, value]) => `${label}: ${displayValue(value)}`)
      .join('\n');
    const body = [
      `Name: ${clean(name)}`,
      `Email: ${clean(email)}`,
      `Topic: ${subject}`,
      '',
      'Message:',
      clean(message),
      '',
      '--- Automatically attached application context ---',
      metadata,
    ].join('\n');

    const mailSubject = `[T-REX Support] ${subject}${clean(context.tokenName) ? ` - ${clean(context.tokenName)}` : ''}`;
    setSubmitted(true);
    window.location.href = `mailto:${appConfig.supportEmail}?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Contact Us"
      trapFocus
      className="support-contact-modal"
      bodyClassName="support-contact-modal__body"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="support-contact-form" icon={Mail}>Contact Us</Button>
        </>
      )}
    >
      <form id="support-contact-form" className="support-contact-form" onSubmit={handleSubmit} noValidate>
        <div className="support-contact-lead">
          <span className="support-contact-lead__icon"><ShieldCheck size={19} /></span>
          <div>
            <strong>Need help with your token, verification, or investment application? Our team is here to help.</strong>
            <p>Send us a short message. Your investor and application details are attached automatically.</p>
          </div>
        </div>

        <div className="support-contact-grid">
          <label className="support-contact-field">
            <span>Name {accountName ? <small>Auto-filled</small> : null}</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              readOnly={Boolean(accountName)}
              aria-invalid={Boolean(errors.name)}
              placeholder="Your name"
            />
            {errors.name ? <em>{errors.name}</em> : null}
          </label>

          <label className="support-contact-field">
            <span>Email {accountEmail ? <small>Auto-filled</small> : null}</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              readOnly={Boolean(accountEmail)}
              aria-invalid={Boolean(errors.email)}
              placeholder="you@example.com"
            />
            {errors.email ? <em>{errors.email}</em> : null}
          </label>
        </div>

        <div className="support-contact-field">
          <span>Subject</span>
          <MarketplaceDropdown
            value={subject}
            options={SUBJECT_OPTIONS}
            onChange={(nextSubject) => {
              setSubject(nextSubject);
              if (errors.subject) setErrors((current) => ({ ...current, subject: '' }));
            }}
            ariaLabel="Support request subject"
            className={cn('support-contact-subject-dropdown', errors.subject && 'is-invalid')}
            menuClassName="support-contact-subject-menu"
            portal
          />
          {errors.subject ? <em>{errors.subject}</em> : null}
        </div>

        <label className="support-contact-field">
          <span>Message</span>
          <textarea
            rows={4}
            maxLength={2000}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            aria-invalid={Boolean(errors.message)}
            placeholder="Tell us what happened, what you expected, and where you need help."
          />
          <div className="support-contact-field__helper">
            {errors.message ? <em>{errors.message}</em> : <small>{message.length}/2000 characters</small>}
          </div>
        </label>

        <div className={cn('support-contact-context', showContext && 'is-expanded')}>
          <button
            type="button"
            className="support-contact-context__toggle"
            onClick={() => setShowContext((current) => !current)}
            aria-expanded={showContext}
          >
            <span className="support-contact-context__icon"><Info size={16} /></span>
            <span className="support-contact-context__copy">
              <strong>Application details included automatically</strong>
              <small>No need to re-enter wallet, token, ONCHAINID, or application information.</small>
            </span>
            <ChevronDown size={17} className="support-contact-context__chevron" aria-hidden="true" />
          </button>

          {showContext ? (
            <dl>
              {attachedDetails.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd title={displayValue(value)}>{displayValue(value)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>

        {submitted ? (
          <div className="support-contact-mail-notice" role="status">
            <CircleCheck size={16} />
            <span>Your email app should open with the support request and application context already prepared.</span>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
