import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowRight,
  Building2,
  Check,
  CircleAlert,
  Mail,
  ShieldCheck,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { authApi } from '@/api/auth';
import { PasswordStrength } from '@/components/forms/PasswordStrength';
import { AuthButton } from '@/components/auth/AuthButton';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { authRedirectService } from '@/services/auth-redirect.service';
import { cn } from '@/utils/cn';
import { signupSchema } from '@/validations/auth.schemas';

const accountNotFoundMessages = {
  login:
    'We could not find an account matching those sign-in details. Create an account to continue.',
  'forgot-password':
    'No account was found for that email address. Create an account to start using T-REX Capital Market.',
  'resend-verification':
    'We could not find an account that needs email verification. Create an account to continue.',
  'verify-email':
    'The verification request is not linked to an existing account. Create a new account to continue.',
  'verify-reset-token':
    'The password reset request is not linked to an existing account. Create a new account to continue.',
  'reset-password':
    'We could not find the account for this password reset request. Create a new account to continue.',
  auth: 'We could not find an account for that request. Create a new account to continue.',
};

const accountTypes = [
  {
    value: 'issuer',
    title: 'I am an Issuer',
    description:
      'Create compliant token offerings, manage investor eligibility and operate digital securities.',
    helper: 'For funds, sponsors, startups and asset owners',
    icon: Building2,
  },
  {
    value: 'investor',
    title: 'I am an Investor',
    description:
      'Explore compliant offerings, complete identity verification and manage your investment access.',
    helper: 'For individual and institutional investors',
    icon: TrendingUp,
  },
];

export default function SignupPage() {
  useDocumentTitle('Create account');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const accountNotFound = searchParams.get('reason') === 'account-not-found';
  const [redirectContext] = useState(() =>
    accountNotFound ? authRedirectService.getAccountNotFoundContext() : null,
  );
  const accountNotFoundMessage =
    accountNotFoundMessages[redirectContext?.source] || accountNotFoundMessages.auth;

  useEffect(() => {
    if (accountNotFound) authRedirectService.clearAccountNotFoundContext();
  }, [accountNotFound]);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      role: '',
      name: '',
      email: accountNotFound ? redirectContext?.email || '' : '',
      password: '',
      confirmPassword: '',
      terms: false,
    },
  });
  const password = useWatch({ control, name: 'password' });
  const selectedRole = useWatch({ control, name: 'role' });

  const signup = useMutation({
    mutationFn: authApi.register,
    onSuccess: (_data, variables) => {
      toast.success(
        `${variables.role === 'issuer' ? 'Issuer' : 'Investor'} account created. Check your email for the verification link.`,
      );
      navigate(`${ROUTES.verifyEmail}?email=${encodeURIComponent(variables.email)}`);
    },
  });

  const onSubmit = ({ confirmPassword: _confirmPassword, terms: _terms, ...payload }) => {
    signup.mutate(payload);
  };

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <div className="mb-4">
        <span className="text-[11px] font-semibold tracking-[0.12em] text-[var(--primary-500)] uppercase">
          Join T-REX Capital Market
        </span>
        <h2 className="my-1.5 font-[var(--font-display)] text-[clamp(27px,3vw,36px)] leading-[1.14] tracking-[-0.025em] text-[var(--text)]">
          Create your account
        </h2>
        <p className="m-0 text-sm leading-[22px] text-[var(--text-soft)]">
          Choose how you will use the platform, then complete your secure profile.
        </p>
      </div>

      {accountNotFound ? (
        <div
          className="mb-4 flex items-start gap-2.5 rounded-xl border border-[color-mix(in_srgb,var(--warning-500)_34%,transparent)] bg-[color-mix(in_srgb,var(--warning-500)_9%,transparent)] px-3.5 py-3 text-[13px] leading-5 text-[#965f0b]"
          role="alert"
        >
          <CircleAlert className="mt-0.5 size-[17px] shrink-0" aria-hidden="true" />
          <span>
            <strong className="block text-[var(--text)]">Account not found</strong>
            {accountNotFoundMessage}
          </span>
        </div>
      ) : null}

      <form className="grid gap-2.5 sm:gap-3" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Controller
          name="role"
          control={control}
          render={({ field }) => (
            <fieldset className="m-0 min-w-0 border-0 p-0">
              <legend className="mb-2 text-[13px] font-bold text-[var(--text)]">
                How will you use T-REX Capital Market?
              </legend>
              <div
                className="grid gap-2 sm:grid-cols-2 sm:gap-2.5"
                role="radiogroup"
                aria-label="Account type"
              >
                {accountTypes.map(({ value, title, description, helper, icon: Icon }) => {
                  const selected = field.value === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={cn(
                        'relative grid min-h-[92px] min-w-0 grid-cols-[38px_minmax(0,1fr)] items-start gap-2.5 overflow-hidden rounded-2xl border bg-[var(--surface)] px-3 py-3 pr-8 text-left text-[var(--text)] shadow-[var(--shadow-sm)] transition-[transform,border-color,box-shadow,background] duration-200 hover:-translate-y-px hover:border-[color-mix(in_srgb,var(--primary-500)_42%,var(--border))] hover:shadow-[0_12px_28px_rgba(31,37,64,0.10)] sm:min-h-[100px]',
                        selected
                          ? 'border-[var(--primary-500)] bg-[color-mix(in_srgb,var(--primary-50)_58%,var(--surface))] shadow-[0_0_0_3px_rgba(22,119,210,0.12),0_12px_28px_rgba(22,119,210,0.14)]'
                          : 'border-[var(--border)]',
                      )}
                      onClick={() => field.onChange(value)}
                      onBlur={field.onBlur}
                    >
                      <span
                        className={cn(
                          'absolute top-2.5 right-2.5 z-10 grid size-5 place-items-center rounded-full border transition-colors',
                          selected
                            ? 'border-[var(--primary-500)] bg-[var(--primary-500)] text-white'
                            : 'border-[var(--border-strong)] bg-[var(--surface)] text-transparent',
                        )}
                        aria-hidden="true"
                      >
                        {selected ? <Check size={12} strokeWidth={3} /> : null}
                      </span>
                      <span
                        className={cn(
                          'relative z-[1] grid size-[38px] place-items-center rounded-[11px] transition-colors',
                          selected
                            ? 'bg-[var(--primary-500)] text-white shadow-[0_7px_16px_rgba(22,119,210,0.22)]'
                            : 'bg-[color-mix(in_srgb,var(--primary-500)_12%,var(--surface))] text-[var(--primary-600)]',
                        )}
                      >
                        <Icon size={20} />
                      </span>
                      <span className="relative z-[1] grid min-w-0 gap-0.5">
                        <strong className="pr-1 font-[var(--font-display)] text-sm leading-5 tracking-[-0.02em]">
                          {title}
                        </strong>
                        <span className="text-[10px] leading-[1.35] text-[var(--text-soft)] sm:text-[10.5px]">
                          {description}
                        </span>
                        <small className="mt-0.5 flex items-start gap-1 text-[8.5px] font-bold leading-[1.3] text-[var(--text-muted)]">
                          <ShieldCheck
                            className="mt-px size-3 shrink-0 text-[var(--primary-500)]"
                            aria-hidden="true"
                          />
                          {helper}
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
              {errors.role ? (
                <p className="mt-1.5 mb-0 text-xs font-semibold text-[var(--danger-500)]">
                  {errors.role.message}
                </p>
              ) : null}
              {selectedRole ? (
                <p
                  className="mt-1.5 mb-0 flex items-center gap-1 text-[10px] font-bold text-[var(--success-500)]"
                  aria-live="polite"
                >
                  <Check size={13} /> {selectedRole === 'issuer' ? 'Issuer' : 'Investor'} account
                  selected
                </p>
              ) : null}
            </fieldset>
          )}
        />

        <div className="grid min-w-0 gap-2.5 sm:grid-cols-2 sm:gap-3">
          <Input
            label="Full name"
            placeholder="Alex Morgan"
            leading={UserRound}
            autoComplete="name"
            error={errors.name?.message}
            {...register('name')}
          />
          <Input
            label="Work email"
            placeholder="you@company.com"
            leading={Mail}
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />
        </div>

        <PasswordInput
          label="Password"
          placeholder="Create a strong password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <PasswordStrength value={password} />
        <PasswordInput
          label="Confirm password"
          placeholder="Repeat your password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <label className="inline-flex cursor-pointer items-start gap-2 text-[13px] text-[var(--text-soft)]">
          <input
            className="mt-px size-4 shrink-0 accent-[var(--primary-500)]"
            type="checkbox"
            {...register('terms')}
          />
          <span>
            I agree to the <a href="/terms">Terms</a> and{' '}
            <a href="/privacy">Privacy Policy</a>.
          </span>
        </label>
        {errors.terms ? (
          <p className="-mt-1.5 mb-0 text-xs font-semibold text-[var(--danger-500)]">
            {errors.terms.message}
          </p>
        ) : null}
        <AuthButton type="submit" loading={signup.isPending} className="w-full">
          Create {selectedRole ? `${selectedRole} ` : ''}account
          <ArrowRight className="size-[18px] shrink-0 self-center" aria-hidden="true" />
        </AuthButton>
      </form>
      <p className="mt-3 mb-0 text-center text-sm text-[var(--text-soft)]">
        Already have an account?{' '}
        <Link className="font-bold" to={ROUTES.login}>
          Sign in
        </Link>
      </p>
    </div>
  );
}
