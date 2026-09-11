import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, CircleCheck, Mail } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { authService } from '@/api/auth';
import { AuthButton } from '@/components/auth/AuthButton';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { ROUTES } from '@/config/routes';
import { ROLES } from '@/config/permissions';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  isInvestorWorkspaceUnlocked,
  loadInvestorDraft,
} from '@/services/investor';
import { pendingDeploymentService } from '@/services/pendingDeployment.service';
import { loginSchema } from '@/validations/auth.schemas';

export default function LoginPage() {
  useDocumentTitle('Sign in');
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const from = location.state?.from?.pathname || ROUTES.dashboard;
  const sessionExpired = searchParams.get('reason') === 'session-expired';
  const emailVerified = searchParams.get('verified') === 'true';
  const pendingDeployment = pendingDeploymentService.get();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', remember: false },
  });

  const login = useMutation({
    mutationFn: authService.login,
    onSuccess: (session) => {
      const recoverableDeployment =
        session?.user?.role === ROLES.issuer
          ? pendingDeploymentService.getForUser(session.user)
          : null;

      if (recoverableDeployment) {
        toast.success('Welcome back — resuming your deployment', {
          description:
            'Your blockchain transaction was recovered. Secure Sepolia verification will resume automatically; MetaMask will not open again.',
        });
        navigate(ROUTES.tokenDeploying, { replace: true });
        return;
      }

      if (pendingDeploymentService.belongsToAnotherUser(session?.user)) {
        toast.warning('A pending deployment belongs to a different account', {
          description:
            'Sign in with the issuer account that created the blockchain transaction to complete synchronization.',
        });
      } else {
        toast.success('Welcome back.');
      }

      const investorState =
        session?.user?.role === ROLES.investor
          ? loadInvestorDraft(session.user).draft
          : null;
      const destination =
        session?.user?.role === ROLES.admin
          ? ROUTES.adminReviewQueue
          : session?.user?.role === ROLES.investor &&
              !isInvestorWorkspaceUnlocked(investorState)
            ? ROUTES.investors
            : from;
      navigate(destination, { replace: true });
    },
  });

  return (
    <div className="mx-auto w-full max-w-[430px]">
      <div className="mb-5">
        <span className="text-[11px] font-semibold tracking-[0.12em] text-[var(--primary-500)] uppercase">
          Welcome back
        </span>
        <h2 className="my-[7px] font-[var(--font-display)] text-[clamp(28px,3vw,38px)] leading-[1.16] tracking-[-0.025em] text-[var(--text)]">
          Sign in to T-REX Capital Market
        </h2>
      </div>
      {emailVerified ? (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-[color-mix(in_srgb,var(--success-500)_30%,transparent)] bg-[color-mix(in_srgb,var(--success-500)_9%,transparent)] px-3.5 py-3 text-[13px] leading-5 text-[var(--success-500)]" role="status">
          <CircleCheck className="mt-0.5 size-[17px] shrink-0" aria-hidden="true" />
          <span>Your email is verified. Sign in to access your T-REX workspace.</span>
        </div>
      ) : null}
      {sessionExpired ? (
        <div className="mb-4 rounded-xl border border-[color-mix(in_srgb,var(--warning-500)_30%,transparent)] bg-[color-mix(in_srgb,var(--warning-500)_9%,transparent)] px-3.5 py-3 text-[13px] leading-5 text-[#a5670a]">
          {pendingDeployment
            ? 'Your session expired after the wallet transaction. Its hash is safely stored in this browser. Sign in with the same issuer account so verification can resume without another wallet transaction.'
            : 'Your session expired. Sign in again to continue.'}
        </div>
      ) : null}
      <form
        className="grid gap-3.5"
        onSubmit={handleSubmit((values) => login.mutate(values))}
        noValidate
      >
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
        <AuthButton type="submit" loading={login.isPending} className="w-full">
          Sign in
          <ArrowRight className="size-[18px] shrink-0 self-center" aria-hidden="true" />
        </AuthButton>
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
