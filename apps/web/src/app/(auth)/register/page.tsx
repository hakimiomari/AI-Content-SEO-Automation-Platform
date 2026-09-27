import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthFormSkeleton } from '@/components/auth/auth-form-skeleton';
import { RegisterForm } from '@/components/auth/register-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Create your account',
  description: 'Create a workspace for your company and start generating content.',
};

export default function RegisterPage() {
  return (
    <Card className="shadow-xl shadow-primary/5">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Create your workspace</CardTitle>
        <CardDescription>Free plan, no credit card. You will be the company admin.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<AuthFormSkeleton fields={4} />}>
          <RegisterForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
