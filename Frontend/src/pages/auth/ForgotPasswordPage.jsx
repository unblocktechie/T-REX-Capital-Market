import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Mail } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { authApi } from '@/api/auth';
import { AuthButton } from '@/components/auth/AuthButton';
import { Input } from '@/components/ui/Input';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { forgotPasswordSchema } from '@/validations/auth.schemas';

export default function ForgotPasswordPage() {
  useDocumentTitle('Forgot password');
  const [sentTo, setSentTo] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } });
  const requestReset = useMutation({
    mutationFn: authApi.forgotPassword,
    onSuccess: (_data, variables) => setSentTo(variables.email),
  });

  if (sentTo)
    return (
      <div className="mx-auto w-full max-w-[430px] text-center">
        <div className="mx-auto mb-4 grid size-[58px] place-items-center rounded-[18px] bg-[var(--primary-50)] text-[var(--primary-600)]">
          <Mail size={27} />
        </div>
        <div className="mb-5">
          <span className="text-[11px] font-extrabold tracking-[0.12em] text-[var(--primary-500)] uppercase">
            Check your inbox
          </span>
          <h2 className="my-[7px] font-[var(--font-display)] text-[clamp(28px,3vw,38px)] leading-[1.16] tracking-[-0.025em] text-[var(--text)]">
            Reset link sent
          </h2>
          <p className="m-0 text-sm leading-6 text-[var(--text-soft)]">
            We sent password reset instructions to <strong>{sentTo}</strong>.
          </p>
        </div>
        <Link
          className="inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl border border-transparent bg-[linear-gradient(135deg,var(--primary-500),var(--primary-600))] px-[17px] text-[15px] font-bold text-white shadow-[0_8px_20px_rgba(22,119,210,0.24)] transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:text-white hover:shadow-[0_12px_28px_rgba(22,119,210,0.32)]"
          to={ROUTES.login}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            Return to sign in
            <ArrowRight className="size-[18px] shrink-0 self-center" aria-hidden="true" />
          </span>
        </Link>
      </div>
    );

  return (
    <div className="mx-auto w-full max-w-[430px]">
      <div className="mb-5">
        <span className="text-[11px] font-extrabold tracking-[0.12em] text-[var(--primary-500)] uppercase">
          Account recovery
        </span>
        <h2 className="my-[7px] font-[var(--font-display)] text-[clamp(28px,3vw,38px)] leading-[1.16] tracking-[-0.025em] text-[var(--text)]">
          Forgot your password?
        </h2>
        <p className="m-0 text-sm leading-6 text-[var(--text-soft)]">
          Enter your work email and we’ll send secure reset instructions.
        </p>
      </div>
      <form
        className="grid gap-3.5"
        onSubmit={handleSubmit((values) => requestReset.mutate(values))}
        noValidate
      >
        <Input
          label="Work email"
          placeholder="you@company.com"
          leading={Mail}
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <AuthButton type="submit" loading={requestReset.isPending} className="w-full">
          Send reset instructions
          <ArrowRight className="size-[18px] shrink-0 self-center" aria-hidden="true" />
        </AuthButton>
      </form>
      <Link
        className="mt-5 inline-flex w-full items-center justify-center gap-1.5 font-bold text-[var(--text-soft)]"
        to={ROUTES.login}
      >
        <ArrowLeft className="size-4 shrink-0 self-center" aria-hidden="true" /> Back to sign in
      </Link>
    </div>
  );
}
