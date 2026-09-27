'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { registerSchema, type RegisterInput } from '@acsp/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { userKeys } from '@/hooks/use-user';
import { getErrorMessage, isApiClientError } from '@/lib/api-client';
import { register as registerAccount } from '@/lib/auth';
import { cn, safeRedirectPath } from '@/lib/utils';
import { describedBy, FormField } from './form-field';

const PASSWORD_RULES = [
  { label: '8+ characters', test: (value: string) => value.length >= 8 },
  { label: 'Uppercase letter', test: (value: string) => /[A-Z]/.test(value) },
  { label: 'Lowercase letter', test: (value: string) => /[a-z]/.test(value) },
  { label: 'A number', test: (value: string) => /[0-9]/.test(value) },
];

export function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const nextPath = safeRedirectPath(searchParams.get('next'));
  const [showPassword, setShowPassword] = React.useState(false);

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', companyName: '' },
  });

  const password = watch('password') ?? '';

  const onSubmit = handleSubmit(async (values) => {
    try {
      const response = await registerAccount(values);
      queryClient.setQueryData(userKeys.me, response.user);
      toast.success(`Workspace created. Welcome, ${response.user.name.split(' ')[0]}!`);
      router.replace(nextPath);
      router.refresh();
    } catch (error) {
      if (isApiClientError(error) && error.status === 409) {
        setError('email', { message: 'An account with this email already exists.' });
      }
      toast.error(getErrorMessage(error, 'Unable to create your account right now.'));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField id="name" label="Your name" error={errors.name?.message}>
          <Input
            id="name"
            autoComplete="name"
            placeholder="Jane Doe"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={describedBy('name', errors.name?.message)}
            {...register('name')}
          />
        </FormField>
        <FormField id="companyName" label="Company" error={errors.companyName?.message}>
          <Input
            id="companyName"
            autoComplete="organization"
            placeholder="Acme Inc."
            aria-invalid={Boolean(errors.companyName)}
            aria-describedby={describedBy('companyName', errors.companyName?.message)}
            {...register('companyName')}
          />
        </FormField>
      </div>

      <FormField id="email" label="Work email" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={describedBy('email', errors.email?.message)}
          {...register('email')}
        />
      </FormField>

      <FormField id="password" label="Password" error={errors.password?.message}>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Create a strong password"
            className="pr-10"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={describedBy('password', errors.password?.message) ?? 'password-rules'}
            {...register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <ul
          id="password-rules"
          className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1"
          aria-live="polite"
        >
          {PASSWORD_RULES.map((rule) => {
            const passed = rule.test(password);
            return (
              <li
                key={rule.label}
                className={cn(
                  'flex items-center gap-1.5 text-xs transition-colors',
                  passed ? 'text-success' : 'text-muted-foreground',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid size-3.5 place-items-center rounded-full border transition-colors',
                    passed ? 'border-success bg-success text-white' : 'border-border',
                  )}
                >
                  {passed ? <Check className="size-2.5" strokeWidth={3} /> : null}
                </span>
                {rule.label}
                <span className="sr-only">{passed ? ' — met' : ' — not yet met'}</span>
              </li>
            );
          })}
        </ul>
      </FormField>

      <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <LoaderCircle className="animate-spin" aria-hidden="true" />
            Creating workspace…
          </>
        ) : (
          'Create account'
        )}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        By continuing you agree to our terms of service and privacy policy.
      </p>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link
          href={
            nextPath === '/dashboard' ? '/login' : `/login?next=${encodeURIComponent(nextPath)}`
          }
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
