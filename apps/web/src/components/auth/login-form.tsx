'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { loginSchema, type LoginInput } from '@acsp/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { userKeys } from '@/hooks/use-user';
import { getErrorMessage, isApiClientError } from '@/lib/api-client';
import { login } from '@/lib/auth';
import { safeRedirectPath } from '@/lib/utils';
import { describedBy, FormField } from './form-field';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const nextPath = safeRedirectPath(searchParams.get('next'));
  const [showPassword, setShowPassword] = React.useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const response = await login(values);
      queryClient.setQueryData(userKeys.me, response.user);
      toast.success(`Welcome back, ${response.user.name.split(' ')[0]}.`);
      router.replace(nextPath);
      router.refresh();
    } catch (error) {
      if (isApiClientError(error) && error.status === 401) {
        setError('password', { message: 'Incorrect email or password.' });
      }
      toast.error(getErrorMessage(error, 'Unable to sign in right now.'));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormField id="email" label="Email" error={errors.email?.message}>
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

      <FormField
        id="password"
        label="Password"
        error={errors.password?.message}
        labelAction={
          <Link
            href="/login"
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            aria-disabled="true"
            title="Password reset arrives in Phase 2"
          >
            Forgot password?
          </Link>
        }
      >
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            className="pr-10"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={describedBy('password', errors.password?.message)}
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
      </FormField>

      <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <LoaderCircle className="animate-spin" aria-hidden="true" />
            Signing in…
          </>
        ) : (
          'Sign in'
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        New here?{' '}
        <Link
          href={
            nextPath === '/dashboard'
              ? '/register'
              : `/register?next=${encodeURIComponent(nextPath)}`
          }
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}
