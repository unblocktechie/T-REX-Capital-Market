import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, CircleAlert, KeyRound } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { authApi } from '@/api/auth';
import { PasswordStrength } from '@/components/forms/PasswordStrength';
import { AuthButton } from '@/components/auth/AuthButton';
import { TrexLoader } from '@/components/loaders/TrexLoader';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { resetPasswordSchema } from '@/validations/auth.schemas';

export default function ResetPasswordPage() {
  useDocumentTitle('Reset password');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });
  const password = useWatch({ control, name: 'password' });

  const tokenValidation = useQuery({
    queryKey: ['verify-reset-token', token],
    queryFn: () => authApi.verifyResetToken({ token }),
    enabled: Boolean(token),
    retry: false,
    staleTime: Infinity,
    meta: { silent: true },
  });

  const reset = useMutation({
    mutationFn: authApi.resetPassword,
    onSuccess: () => {
      toast.success('Password updated successfully.');
      navigate(ROUTES.login, { replace: true });
    },
  });

  if (!token || tokenValidation.isError) {
    return (
      <div className="mx-auto w-full max-w-[430px] text-center">
        <div className="mx-auto mb-4 grid size-[58px] place-items-center rounded-[18px] bg-[color-mix(in_srgb,var(--danger-500)_10%,var(--surface))] text-[var(--danger-500)]">
          <CircleAlert size={27} />
        </div>
        <h2 className="my-[7px] font-[var(--font-display)] text-[clamp(28px,3vw,38px)] leading-[1.16] tracking-[-0.025em] text-[var(--text)]">
          Reset link unavailable
        </h2>
        <p className="mb-5 text-sm leading-6 text-[var(--text-soft)]">
          This password reset link is missing, invalid, or expired. Request a new link to continue.
        </p>
        <Link
          className="inline-flex min-h-[50px] w-full items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--primary-500),var(--primary-600))] px-[17px] text-[15px] font-bold text-white hover:text-white"
          to={ROUTES.forgotPassword}
        >
          Request a new reset link
        </Link>
      </div>
    );
  }

  if (tokenValidation.isPending) {
    return (
      <TrexLoader
        variant="verification"
        eyebrow="Password security check"
        title="Validating your reset link"
        message="We are securely checking this request before allowing a password change."
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-[430px]">
      <div className="mb-4 grid size-[58px] place-items-center rounded-[18px] bg-[var(--primary-50)] text-[var(--primary-600)]">
        <KeyRound size={25} />
      </div>
      <div className="mb-5">
        <span className="text-[11px] font-semibold tracking-[0.12em] text-[var(--primary-500)] uppercase">
          Create a new password
        </span>
        <h2 className="my-[7px] font-[var(--font-display)] text-[clamp(28px,3vw,38px)] leading-[1.16] tracking-[-0.025em] text-[var(--text)]">
          Reset your password
        </h2>
        <p className="m-0 text-sm leading-6 text-[var(--text-soft)]">
          Use a unique password that you don’t use elsewhere.
        </p>
      </div>
      <form
        className="grid gap-3.5"
        onSubmit={handleSubmit(({ password: newPassword }) =>
          reset.mutate({ token, newPassword }),
        )}
        noValidate
      >
        <PasswordInput
          label="New password"
          autoComplete="new-password"
          placeholder="Enter a strong password"
          error={errors.password?.message}
          {...register('password')}
        />
        <PasswordStrength value={password} />
        <PasswordInput
          label="Confirm new password"
          autoComplete="new-password"
          placeholder="Repeat your password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <AuthButton type="submit" loading={reset.isPending} className="w-full">
          Update password
          <ArrowRight className="size-[18px] shrink-0 self-center" aria-hidden="true" />
        </AuthButton>
      </form>
    </div>
  );
}
