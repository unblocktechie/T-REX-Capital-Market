import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, CircleAlert, Mail, MailCheck, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { authApi } from '@/api/auth';
import { AuthButton } from '@/components/auth/AuthButton';
import { TrexLoader } from '@/components/loaders/TrexLoader';
import { Input } from '@/components/ui/Input';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { getErrorMessage } from '@/utils/error';

const LOGIN_REDIRECT_DELAY = 1500;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function VerifyEmailPage() {
  useDocumentTitle('Verify email');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token')?.trim() || '';
  const email = searchParams.get('email')?.trim() || '';
  const [resendEmail, setResendEmail] = useState(email);
  const hasEmailInUrl = EMAIL_PATTERN.test(email);
  const canResend = EMAIL_PATTERN.test(resendEmail.trim());

  const verification = useQuery({
    queryKey: ['verify-email', token],
    queryFn: () => authApi.verifyEmail({ token }),
    enabled: Boolean(token),
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    meta: { silent: true },
  });

  const resend = useMutation({
    mutationFn: authApi.resendVerification,
    onSuccess: () => toast.success('A new verification email has been sent.'),
  });

  useEffect(() => {
    if (!token || (!verification.isSuccess && !verification.isError)) return;

    // Remove the one-time token from the visible URL after the backend has processed it.
    window.history.replaceState(window.history.state, '', ROUTES.verifyEmail);
  }, [token, verification.isError, verification.isSuccess]);

  useEffect(() => {
    if (!token || !verification.isSuccess) return undefined;

    const redirectTimer = window.setTimeout(() => {
      navigate(`${ROUTES.login}?verified=true`, { replace: true });
    }, LOGIN_REDIRECT_DELAY);

    return () => window.clearTimeout(redirectTimer);
  }, [navigate, token, verification.isSuccess]);

  const verificationError = useMemo(
    () =>
      getErrorMessage(
        verification.error,
        'This verification link is invalid, expired, or has already been used.',
      ),
    [verification.error],
  );

  const resendControls = (
    <div className="grid gap-3">
      {!hasEmailInUrl ? (
        <Input
          label="Email address"
          className="text-left"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          leading={Mail}
          value={resendEmail}
          onChange={(event) => setResendEmail(event.target.value)}
        />
      ) : null}
      <AuthButton
        type="button"
        loading={resend.isPending}
        disabled={!canResend}
        className="w-full"
        onClick={() => resend.mutate({ email: resendEmail.trim() })}
      >
        Resend verification email
      </AuthButton>
    </div>
  );

  if (token && verification.isPending) {
    return (
      <TrexLoader
        variant="verification"
        eyebrow="Email security check"
        title="Verifying your email"
        message="We are validating your secure link and activating your T-REX Capital Market account."
      />
    );
  }

  if (token && verification.isSuccess) {
    return (
      <div className="verification-result verification-result--success" role="status" aria-live="polite">
        <div className="verification-result__icon" aria-hidden="true">
          <span className="verification-result__ring" />
          <MailCheck size={34} />
        </div>
        <span className="verification-result__eyebrow">
          <ShieldCheck size={14} /> Verification complete
        </span>
        <h2>Your email is verified</h2>
        <p>
          Your account is active. We are securely redirecting you to the sign-in page.
        </p>
        <div className="verification-result__redirect" aria-hidden="true">
          <span />
        </div>
        <Link className="verification-result__link" to={`${ROUTES.login}?verified=true`} replace>
          Continue to sign in now
          <ArrowRight size={17} />
        </Link>
      </div>
    );
  }

  if (token && verification.isError) {
    return (
      <div className="verification-result verification-result--error">
        <div className="verification-result__icon" aria-hidden="true">
          <CircleAlert size={31} />
        </div>
        <span className="verification-result__eyebrow">Verification failed</span>
        <h2>We could not verify this link</h2>
        <p>{verificationError}</p>
        <p className="verification-result__hint">
          Request a fresh email and use only the newest verification link from your inbox.
        </p>
        {resendControls}
        <Link className="verification-result__back" to={ROUTES.login}>
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="verification-result verification-result--inbox">
      <div className="verification-result__icon" aria-hidden="true">
        <MailCheck size={30} />
      </div>
      <span className="verification-result__eyebrow">One final step</span>
      <h2>Check your inbox</h2>
      <p>
        We sent a secure verification link
        {hasEmailInUrl ? (
          <>
            {' '}to <strong>{email}</strong>
          </>
        ) : null}
        . Open that link to activate your account.
      </p>
      {resendControls}
      <Link className="verification-result__back" to={ROUTES.login}>
        Back to sign in
      </Link>
    </div>
  );
}
