import { ArrowLeft, ArrowRight, CircleCheck, MailCheck, ShieldCheck } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { authService } from '@/api/auth';
import { AuthButton } from '@/components/auth/AuthButton';
import { AuthRecoveryNotice } from '@/components/auth/AuthRecoveryNotice';
import { OTPInput } from '@/components/forms/OTPInput';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePrivyEmailAuth } from '@/hooks/usePrivyEmailAuth';
import { resolveAuthenticatedLandingRoute } from '@/services/auth-landing.service';
import { getErrorMessage } from '@/utils/error';

const maskEmail = (value) => {
  const [localPart = '', domain = ''] = String(value || '').split('@');
  if (!localPart || !domain) return value;
  if (localPart.length <= 5) return `${localPart}@${domain}`;
  return `${localPart.slice(0, 5)}...@${domain}`;
};

export default function VerifyEmailPage() {
  useDocumentTitle('Confirm email');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = String(searchParams.get('email') || '').trim().toLowerCase();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [successWallet, setSuccessWallet] = useState('');
  const [resumeAvailable, setResumeAvailable] = useState(false);
  const pendingIdentityRef = useRef(null);
  const {
    beginEmailVerification,
    verifyEmailCode,
    ensureIdentityTokenWithWallet,
    recoveryState,
  } = usePrivyEmailAuth();

  const completeSignup = async (identity) => {
    pendingIdentityRef.current = identity;
    const session = await authService.completePrivySignup({
      email,
      identityToken: identity.identityToken,
    });
    setSuccessWallet(identity.walletAddress);
    pendingIdentityRef.current = null;
    setResumeAvailable(false);
    toast.success('Email confirmed. Your secure account is ready.');
    navigate(resolveAuthenticatedLandingRoute(session?.user?.role), { replace: true });
  };

  const resend = async () => {
    if (!email || resending || submitting) return;
    setResending(true);
    setResumeAvailable(false);
    pendingIdentityRef.current = null;
    setCode('');
    try {
      await beginEmailVerification(email);
      toast.success('A new code was sent to your email.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to send a new code. Please try again.'));
    } finally {
      setResending(false);
    }
  };

  const verify = async () => {
    if (code.length !== 6 || !email || submitting) return;
    setSubmitting(true);
    let identity = null;
    try {
      identity = await verifyEmailCode(code);
      await completeSignup(identity);
    } catch (error) {
      const canResume = Boolean(identity || error?.privyAuthenticated);
      setResumeAvailable(canResume);
      if (!canResume) setCode('');
      toast.error(getErrorMessage(error, 'The code is invalid or expired. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const resumeSecureSetup = async () => {
    if (!email || submitting) return;
    setSubmitting(true);
    try {
      const identity = pendingIdentityRef.current || (await ensureIdentityTokenWithWallet());
      await completeSignup(identity);
    } catch (error) {
      setResumeAvailable(true);
      toast.error(getErrorMessage(error, 'Unable to finish setting up your secure account.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!email) {
    return (
      <div className="verification-result verification-result--error" role="alert">
        <h2>Signup email is missing</h2>
        <p>Return to signup and enter your account details again.</p>
        <Link className="verification-result__back" to={ROUTES.signup}>
          Back to signup
        </Link>
      </div>
    );
  }

  if (successWallet) {
    return (
      <div className="verification-result verification-result--success" role="status">
        <div className="verification-result__icon">
          <CircleCheck size={34} />
        </div>
        <span className="verification-result__eyebrow">
          <ShieldCheck size={14} /> Email confirmed
        </span>
        <h2>Your secure account is ready to use</h2>
        <p>Your secure account is linked to your T-REX profile.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[430px]">
      <div className="mb-5 text-center">
        <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-[var(--primary-50)] text-[var(--primary-600)]">
          <MailCheck size={24} />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--primary-500)]">
          Email confirmation
        </span>
        <h2 className="my-2 font-[var(--font-display)] text-3xl text-[var(--text)]">
          {resumeAvailable ? 'Finish secure account setup' : 'Enter the 6-digit code'}
        </h2>
        <p className="m-0 text-sm leading-6 text-[var(--text-soft)]">
          {resumeAvailable ? (
            <>Your email is confirmed. Continue to finish setting up your secure account.</>
          ) : (
            <>
              We sent a 6-digit code to <strong>{maskEmail(email)}</strong>. Enter it below to confirm
              your email.
            </>
          )}
        </p>
      </div>

      <div className="grid gap-4">
        {resumeAvailable ? (
          <div className="rounded-xl border border-[color-mix(in_srgb,var(--success-500)_24%,transparent)] bg-[color-mix(in_srgb,var(--success-500)_7%,transparent)] px-3.5 py-3 text-[13px] leading-5 text-[var(--text-soft)]">
            <strong className="block text-[var(--text)]">Your confirmation progress is saved</strong>
            Your email is already confirmed. Continue below; you do not need another code.
          </div>
        ) : (
          <div className="grid gap-2.5">
            <OTPInput value={code} onChange={setCode} length={6} />
            <p className="m-0 text-center text-xs leading-5 text-[var(--text-muted)]">
              The code may take a minute to arrive. Check your spam folder if you don’t see it.
            </p>
          </div>
        )}

        <AuthRecoveryNotice state={recoveryState} />

        {resumeAvailable ? (
          <AuthButton
            type="button"
            className="w-full"
            loading={submitting}
            onClick={resumeSecureSetup}
          >
            Finish setup <ArrowRight className="size-[18px]" />
          </AuthButton>
        ) : (
          <AuthButton
            type="button"
            className="w-full"
            loading={submitting}
            disabled={code.length !== 6}
            onClick={verify}
          >
            Confirm email <ArrowRight className="size-[18px]" />
          </AuthButton>
        )}

        {!resumeAvailable ? (
          <button
            type="button"
            className="text-sm font-semibold text-[var(--primary-600)]"
            disabled={resending || submitting}
            onClick={resend}
          >
            {resending ? 'Sending code…' : 'Send a new code'}
          </button>
        ) : (
          <button
            type="button"
            className="text-sm font-semibold text-[var(--primary-600)]"
            disabled={resending || submitting}
            onClick={resend}
          >
            {resending ? 'Sending code…' : 'Send a new code instead'}
          </button>
        )}
      </div>

      <p className="mt-5 mb-0 text-center text-xs leading-5 text-[var(--text-muted)]">
        This helps keep your account secure.
      </p>
      <Link
        className="mt-4 flex items-center justify-center gap-1.5 text-center text-sm font-semibold"
        to={ROUTES.login}
      >
        <ArrowLeft size={15} aria-hidden="true" /> Back to sign in
      </Link>
    </div>
  );
}
