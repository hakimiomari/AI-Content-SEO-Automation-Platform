import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthFormSkeleton } from '@/components/auth/auth-form-skeleton';
import { LoginForm } from '@/components/auth/login-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your workspace.',
};

export default function LoginPage() {
  return (
    <Card className="shadow-xl shadow-primary/5">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Welcome back</CardTitle>
        <CardDescription>Sign in to your workspace to continue.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<AuthFormSkeleton fields={2} />}>
          <LoginForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
