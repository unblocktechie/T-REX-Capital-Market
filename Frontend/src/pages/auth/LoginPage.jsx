import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, CircleCheck, Mail, ShieldCheck } from 'lucide-react';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { authService } from '@/api/auth';
import { AuthButton } from '@/components/auth/AuthButton';
import { AuthRecoveryNotice } from '@/components/auth/AuthRecoveryNotice';
import { OTPInput } from '@/components/forms/OTPInput';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { ROUTES } from '@/config/routes';
import { ROLES } from '@/config/permissions';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePrivyEmailAuth } from '@/hooks/usePrivyEmailAuth';
import { isInvestorWorkspaceUnlocked, loadInvestorDraft } from '@/services/investor';
import { pendingDeploymentService } from '@/services/pendingDeployment.service';
import { resolveAuthenticatedLandingRoute } from '@/services/auth-landing.service';
import { getErrorMessage } from '@/utils/error';
import { loginSchema } from '@/validations/auth.schemas';

export default function LoginPage() {
  useDocumentTitle('Sign in');
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const from = location.state?.from?.pathname || null;
  const sessionExpired = searchParams.get('reason') === 'session-expired';
  const pendingDeployment = pendingDeploymentService.get();
  const [step, setStep] = useState('credentials');
  const [pendingCredentials, setPendingCredentials] = useState(null);
  const [otp, setOtp] = useState('');
  const [working, setWorking] = useState(false);
  const [resending, setResending] = useState(false);
  const [otpDeliveryIssue, setOtpDeliveryIssue] = useState(false);
  const [resumeAvailable, setResumeAvailable] = useState(false);
  const pendingIdentityRef = useRef(null);
  const {
    beginEmailVerification,
    verifyEmailCode,
    ensureIdentityTokenWithWallet,
    recoveryState,
  } = usePrivyEmailAuth();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', remember: false },
  });

  const finishLogin = (session) => {
    const recoverableDeployment =
      session?.user?.role === ROLES.issuer
        ? pendingDeploymentService.getForUser(session.user)
        : null;

    if (recoverableDeployment) {
      toast.success('Welcome back — resuming token creation', {
        description:
          'Your previous asset setup will continue from where it stopped using the same Privy secure account.',
      });
      navigate(ROUTES.tokenDeploying, { replace: true });
      return;
    }

    if (pendingDeploymentService.belongsToAnotherUser(session?.user)) {
      toast.warning('A pending token-creation attempt belongs to a different account.');
    } else if ([ROLES.issuer, ROLES.investor].includes(session?.user?.role)) {
      toast.success('Welcome back. Your Privy secure account is ready to use.');
    } else {
      toast.success('Welcome back.');
    }

    const investorState =
      session?.user?.role === ROLES.investor ? loadInvestorDraft(session.user).draft : null;
    const destination =
      session?.user?.role === ROLES.investor && !isInvestorWorkspaceUnlocked(investorState)
        ? ROUTES.investors
        : from || resolveAuthenticatedLandingRoute(session?.user?.role);
    navigate(destination, { replace: true });
  };

  const completeVerifiedLogin = async (identity) => {
    pendingIdentityRef.current = identity;
    const session = await authService.completeLogin({
      ...pendingCredentials,
      identityToken: identity.identityToken,
    });
    pendingIdentityRef.current = null;
    setResumeAvailable(false);
    finishLogin(session);
  };

  const submitCredentials = async (values) => {
    if (working) return;
    setWorking(true);
    try {
      const result = await authService.prepareLogin(values);
      if (!result?.privyVerificationRequired) {
        finishLogin(result);
        return;
      }

      const next = {
        ...values,
        email: String(result.email || values.email).trim().toLowerCase(),
      };
      setPendingCredentials(next);
      setOtp('');
      setOtpDeliveryIssue(false);
      setResumeAvailable(false);
      pendingIdentityRef.current = null;

      // Move forward as soon as the password is accepted. If Privy's send-code call is
      // temporarily limited, the user can retry it here without re-running /auth/login.
      setStep('otp');
      try {
        await beginEmailVerification(next.email);
        toast.success('Password accepted. Privy sent a verification code to your email.');
      } catch (error) {
        setOtpDeliveryIssue(true);
        toast.error(getErrorMessage(error, 'Privy could not send the verification code.'), {
          description: 'Your password step is complete. Resend the Privy verification code to continue.',
        });
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to sign in.'));
    } finally {
      setWorking(false);
    }
  };

  const submitOtp = async () => {
    if (!pendingCredentials || otp.length !== 6 || working) return;
    setWorking(true);
    let identity = null;
    try {
      identity = await verifyEmailCode(otp);
      await completeVerifiedLogin(identity);
    } catch (error) {
      const canResume = Boolean(identity || error?.privyAuthenticated);
      setResumeAvailable(canResume);
      if (!canResume) setOtp('');
      toast.error(getErrorMessage(error, 'Unable to confirm the Privy verification code.'));
    } finally {
      setWorking(false);
    }
  };

  const resumeLogin = async () => {
    if (!pendingCredentials || working) return;
    setWorking(true);
    try {
      const identity = pendingIdentityRef.current || (await ensureIdentityTokenWithWallet());
      await completeVerifiedLogin(identity);
    } catch (error) {
      setResumeAvailable(true);
      toast.error(getErrorMessage(error, 'Unable to finish preparing your Privy secure account.'));
    } finally {
      setWorking(false);
    }
  };

  const resendOtp = async () => {
    if (!pendingCredentials?.email || resending || working) return;
    setResending(true);
    setResumeAvailable(false);
    setOtpDeliveryIssue(false);
    pendingIdentityRef.current = null;
    setOtp('');
    try {
      await beginEmailVerification(pendingCredentials.email);
      toast.success('Privy sent a new verification code.');
    } catch (error) {
      setOtpDeliveryIssue(true);
      toast.error(getErrorMessage(error, 'Unable to resend the Privy verification code.'));
    } finally {
      setResending(false);
    }
  };

  const useDifferentCredentials = () => {
    setStep('credentials');
    setOtp('');
    setPendingCredentials(null);
    setOtpDeliveryIssue(false);
    setResumeAvailable(false);
    pendingIdentityRef.current = null;
  };

  if (step === 'otp') {
    return (
      <div className="mx-auto w-full max-w-[430px]">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-[var(--primary-50)] text-[var(--primary-600)]">
            <ShieldCheck size={24} />
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--primary-500)]">
            Secure sign in with Privy
          </span>
          <h2 className="my-2 font-[var(--font-display)] text-3xl text-[var(--text)]">
            {resumeAvailable ? 'Finish secure sign in' : 'Verify your email'}
          </h2>
          <p className="m-0 text-sm leading-6 text-[var(--text-soft)]">
            {resumeAvailable ? (
              <>
                Privy has already verified your email. Continue to finish preparing your secure account
                without requesting another code.
              </>
            ) : (
              <>
                Enter the 6-digit Privy code sent to <strong>{pendingCredentials?.email}</strong>.
                Privy uses this check to restore the secure account linked to your T-REX profile.
              </>
            )}
          </p>
        </div>

        <div className="grid gap-4">
          {otpDeliveryIssue && !resumeAvailable ? (
            <div className="rounded-xl border border-[color-mix(in_srgb,var(--warning-500)_30%,transparent)] bg-[color-mix(in_srgb,var(--warning-500)_8%,transparent)] px-3.5 py-3 text-[13px] leading-5 text-[#965f0b]">
              <strong className="block text-[var(--text)]">Your sign-in progress is saved</strong>
              Privy could not deliver the code this time. If no code arrived, resend it below. You do
              not need to enter your password again.
            </div>
          ) : null}

          {resumeAvailable ? (
            <div className="rounded-xl border border-[color-mix(in_srgb,var(--success-500)_24%,transparent)] bg-[color-mix(in_srgb,var(--success-500)_7%,transparent)] px-3.5 py-3 text-[13px] leading-5 text-[var(--text-soft)]">
              <strong className="block text-[var(--text)]">Your verification progress is saved</strong>
              Privy has already verified your email. Continue to finish preparing your secure account.
              You do not need another code.
            </div>
          ) : (
            <OTPInput value={otp} onChange={setOtp} length={6} />
          )}

          <AuthRecoveryNotice state={recoveryState} />

          {resumeAvailable ? (
            <AuthButton type="button" className="w-full" loading={working} onClick={resumeLogin}>
              Resume secure sign in <ArrowRight className="size-[18px]" />
            </AuthButton>
          ) : (
            <AuthButton
              type="button"
              className="w-full"
              loading={working}
              disabled={otp.length !== 6}
              onClick={submitOtp}
            >
              Confirm securely with Privy <ArrowRight className="size-[18px]" />
            </AuthButton>
          )}

          <button
            type="button"
            className="text-sm font-semibold text-[var(--primary-600)]"
            disabled={resending || working}
            onClick={resendOtp}
          >
            {resending
              ? 'Sending code…'
              : resumeAvailable
                ? 'Send a new code instead'
                : 'Resend Privy verification code'}
          </button>
          <button
            type="button"
            className="text-sm text-[var(--text-soft)]"
            disabled={working || resending}
            onClick={useDifferentCredentials}
          >
            Use different sign-in details
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[430px]">
      <div className="mb-5">
        <span className="text-[11px] font-semibold tracking-[0.12em] text-[var(--primary-500)] uppercase">
          Welcome back
        </span>
        <h2 className="my-[7px] font-[var(--font-display)] text-[clamp(28px,3vw,38px)] leading-[1.16] tracking-[-0.025em] text-[var(--text)]">
          Sign in to T-REX Capital Market
        </h2>
        <p className="m-0 text-sm leading-6 text-[var(--text-soft)]">
          After your password, Privy confirms your email and securely manages the account linked
          to your T-REX profile.
        </p>
      </div>
      {sessionExpired ? (
        <div className="mb-4 rounded-xl border border-[color-mix(in_srgb,var(--warning-500)_30%,transparent)] bg-[color-mix(in_srgb,var(--warning-500)_9%,transparent)] px-3.5 py-3 text-[13px] leading-5 text-[#a5670a]">
          {pendingDeployment
            ? 'Your session expired while your asset setup was being confirmed. Sign in again with the same issuer account to continue from where you stopped.'
            : 'Your session expired. Sign in again to continue.'}
        </div>
      ) : null}
      <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-[color-mix(in_srgb,var(--success-500)_24%,transparent)] bg-[color-mix(in_srgb,var(--success-500)_7%,transparent)] px-3.5 py-3 text-[13px] leading-5 text-[var(--text-soft)]">
        <CircleCheck className="mt-0.5 size-[17px] shrink-0 text-[var(--success-500)]" />
        <span>
          You do not need to connect another account. Your Privy secure account is already linked
          to your T-REX profile.
        </span>
      </div>
      <form className="grid gap-3.5" onSubmit={handleSubmit(submitCredentials)} noValidate>
        <Input
          label="Email address"
          placeholder="you@company.com"
          autoComplete="email"
          leading={Mail}
          error={errors.email?.message}
          {...register('email')}
        />
        <PasswordInput
          label="Password"
          placeholder="Enter your password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-[var(--text-soft)]">
            <input
              className="size-4 accent-[var(--primary-500)]"
              type="checkbox"
              {...register('remember')}
            />
            <span>Keep me signed in</span>
          </label>
          <Link className="text-[13px] font-bold" to={ROUTES.forgotPassword}>
            Forgot password?
          </Link>
        </div>
        <AuthButton type="submit" loading={working} className="w-full">
          Continue securely with Privy <ArrowRight className="size-[18px] shrink-0 self-center" />
        </AuthButton>
        <AuthRecoveryNotice state={recoveryState} />
      </form>
      <p className="mt-5 mb-0 text-center text-sm text-[var(--text-soft)]">
        New to T-REX Capital Market?{' '}
        <Link className="font-bold" to={ROUTES.signup}>
          Create an account
        </Link>
      </p>
    </div>
  );
}
