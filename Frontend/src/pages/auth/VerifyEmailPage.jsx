import { useMutation } from '@tanstack/react-query';
import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  Mail,
  MailCheck,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { authApi, authService } from '@/api/auth';
import { AuthButton } from '@/components/auth/AuthButton';
import { Input } from '@/components/ui/Input';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { resolveAuthenticatedLandingRoute } from '@/services/auth-landing.service';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFICATION_TOKEN_PATTERN = /^[A-Fa-f0-9]{64}$/;
const SUCCESS_REDIRECT_DELAY = 900;

const VERIFY_STATES = Object.freeze({
  inbox: 'INBOX',
  ready: 'READY',
  verifying: 'VERIFYING',
  success: 'SUCCESS',
  invalid: 'INVALID',
  inactive: 'INACTIVE',
  failed: 'FAILED',
});

export default function VerifyEmailPage() {
  useDocumentTitle('Verify email');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hasTokenParam = searchParams.has('token');
  const token = searchParams.get('token')?.trim() || '';
  const email = searchParams.get('email')?.trim() || '';
  const verificationRequired = searchParams.get('reason') === 'verification-required';
  const tokenIsValid = VERIFICATION_TOKEN_PATTERN.test(token);
  const [state, setState] = useState(() => {
    if (!hasTokenParam) return VERIFY_STATES.inbox;
    return tokenIsValid ? VERIFY_STATES.ready : VERIFY_STATES.invalid;
  });
  const [resendEmail, setResendEmail] = useState(email);
  const [landingRoute, setLandingRoute] = useState(ROUTES.dashboard);
  const redirectTimerRef = useRef(null);
  const verifyInFlightRef = useRef(false);

  const hasEmailInUrl = EMAIL_PATTERN.test(email);
  const canResend = EMAIL_PATTERN.test(resendEmail.trim());
  const isVerifying = state === VERIFY_STATES.verifying;

  const resend = useMutation({
    mutationFn: authApi.resendVerification,
    onSuccess: (data) => {
      if (String(data?.status || '').toUpperCase() === 'ALREADY_VERIFIED') {
        toast.success('User is already verified. You can log in.');
        navigate(ROUTES.login, { replace: true });
        return;
      }

      toast.success('A new verification email has been sent.');
    },
  });

  useEffect(
    () => () => {
      if (redirectTimerRef.current) window.clearTimeout(redirectTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    verifyInFlightRef.current = false;
    if (!hasTokenParam) {
      setState(VERIFY_STATES.inbox);
      return;
    }
    setState(tokenIsValid ? VERIFY_STATES.ready : VERIFY_STATES.invalid);
  }, [hasTokenParam, token, tokenIsValid]);

  const verifyAndContinue = async () => {
    if (!tokenIsValid || isVerifying || verifyInFlightRef.current) return;

    verifyInFlightRef.current = true;
    setState(VERIFY_STATES.verifying);

    try {
      // Verification returns a complete authenticated session. Do not call /auth/login.
      const session = await authService.verifyEmail({ token });
      const destination = resolveAuthenticatedLandingRoute(session?.user?.role);
      setLandingRoute(destination);
      setState(VERIFY_STATES.success);

      // Remove the one-time token from visible browser history as soon as it is consumed.
      window.history.replaceState(window.history.state, '', ROUTES.verifyEmail);

      redirectTimerRef.current = window.setTimeout(() => {
        navigate(destination, { replace: true });
      }, SUCCESS_REDIRECT_DELAY);
    } catch (error) {
      const status = error?.response?.status;

      verifyInFlightRef.current = false;

      if (status === 400 || status === 422) {
        setState(VERIFY_STATES.invalid);
        return;
      }

      if (status === 403) {
        setState(VERIFY_STATES.inactive);
        return;
      }

      setState(VERIFY_STATES.failed);
    }
  };

  const resendControls = useMemo(
    () => (
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
    ),
    [canResend, hasEmailInUrl, resend, resendEmail],
  );

  if (state === VERIFY_STATES.success) {
    return (
      <div
        className="verification-result verification-result--success"
        role="status"
        aria-live="polite"
      >
        <div className="verification-result__icon" aria-hidden="true">
          <span className="verification-result__ring" />
          <CircleCheck size={34} />
        </div>
        <span className="verification-result__eyebrow">
          <ShieldCheck size={14} /> Email verified
        </span>
        <h2>Email verified — redirecting…</h2>
        <p>
          Your account is verified and you are signed in. We are opening your T-REX Capital Market
          workspace now.
        </p>
        <div className="verification-result__redirect" aria-hidden="true">
          <span />
        </div>
        <button
          className="verification-result__link border-0 bg-transparent p-0"
          type="button"
          onClick={() => {
            if (redirectTimerRef.current) window.clearTimeout(redirectTimerRef.current);
            navigate(landingRoute, { replace: true });
          }}
        >
          Continue now
          <ArrowRight size={17} />
        </button>
      </div>
    );
  }

  if (state === VERIFY_STATES.invalid) {
    return (
      <div className="verification-result verification-result--error" role="alert">
        <div className="verification-result__icon" aria-hidden="true">
          <CircleAlert size={31} />
        </div>
        <span className="verification-result__eyebrow">Link unavailable</span>
        <h2>Invalid or expired verification link</h2>
        <p>
          This link cannot be used. Request a new verification email and use the newest link from
          your inbox.
        </p>
        {resendControls}
        <Link className="verification-result__back" to={ROUTES.login}>
          Go to sign in
        </Link>
      </div>
    );
  }

  if (state === VERIFY_STATES.inactive) {
    return (
      <div className="verification-result verification-result--error" role="alert">
        <div className="verification-result__icon" aria-hidden="true">
          <CircleAlert size={31} />
        </div>
        <span className="verification-result__eyebrow">Account unavailable</span>
        <h2>Account inactive</h2>
        <p>Your email cannot be verified because this account is inactive. Please contact support.</p>
        <Link className="verification-result__back" to={ROUTES.login}>
          Go to sign in
        </Link>
      </div>
    );
  }

  if (state === VERIFY_STATES.failed) {
    return (
      <div className="verification-result verification-result--error" role="alert">
        <div className="verification-result__icon" aria-hidden="true">
          <CircleAlert size={31} />
        </div>
        <span className="verification-result__eyebrow">Verification interrupted</span>
        <h2>We could not verify your email</h2>
        <p>Something interrupted verification. Your link has not been retried automatically.</p>
        <AuthButton type="button" className="w-full" onClick={verifyAndContinue}>
          Try verification again
        </AuthButton>
        <Link className="verification-result__back" to={ROUTES.login}>
          Go to sign in
        </Link>
      </div>
    );
  }

  if (state === VERIFY_STATES.ready || state === VERIFY_STATES.verifying) {
    return (
      <div className="verification-result verification-result--inbox" aria-live="polite">
        <div className="verification-result__icon" aria-hidden="true">
          <MailCheck size={30} />
        </div>
        <span className="verification-result__eyebrow">Secure email verification</span>
        <h2>Verify your email</h2>
        <p>
          Select the button below to verify your email and sign in. Verification only starts when
          you choose to continue.
        </p>
        <AuthButton
          type="button"
          loading={isVerifying}
          disabled={!tokenIsValid || isVerifying}
          className="w-full"
          onClick={verifyAndContinue}
        >
          {isVerifying ? 'Verifying email…' : 'Verify and continue'}
          {!isVerifying ? <ArrowRight className="size-[18px]" aria-hidden="true" /> : null}
        </AuthButton>
        <Link className="verification-result__back" to={ROUTES.login}>
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="verification-result verification-result--inbox">
      <div className="verification-result__icon" aria-hidden="true">
        <MailCheck size={30} />
      </div>
      <span className="verification-result__eyebrow">
        {verificationRequired ? 'Email verification required' : 'One final step'}
      </span>
      <h2>{verificationRequired ? 'Verify your email to continue' : 'Check your inbox'}</h2>
      {verificationRequired ? (
        <p>
          Your account is ready, but your email still needs to be verified. If your previous link
          expired, send a new verification email
          {hasEmailInUrl ? (
            <>
              {' '}to <strong>{email}</strong>
            </>
          ) : null}
          , then open the newest link and select <strong>Verify and continue</strong>.
        </p>
      ) : (
        <p>
          We sent a verification link
          {hasEmailInUrl ? (
            <>
              {' '}to <strong>{email}</strong>
            </>
          ) : null}
          . Open the email, then select <strong>Verify and continue</strong> on the verification page.
        </p>
      )}
      {resendControls}
      <Link className="verification-result__back" to={ROUTES.login}>
        Go to sign in
      </Link>
    </div>
  );
}
