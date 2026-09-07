import { z } from 'zod';

const password = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .regex(/[a-z]/, 'Include a lowercase letter.')
  .regex(/[A-Z]/, 'Include an uppercase letter.')
  .regex(/\d/, 'Include a number.')
  .regex(/[^A-Za-z0-9]/, 'Include a special character.');

export const loginSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
  remember: z.boolean().default(false),
});

export const signupSchema = z
  .object({
    role: z.string().refine((value) => ['issuer', 'investor'].includes(value), {
      message: 'Select Issuer or Investor to continue.',
    }),
    name: z.string().min(2, 'Enter your full name.'),
    email: z.email('Enter a valid email address.'),
    password,
    confirmPassword: z.string(),
    terms: z.literal(true, { error: 'Accept the terms to continue.' }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.object({
  email: z.email('Enter a valid email address.'),
});

export const resetPasswordSchema = z
  .object({ password, confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

