import { AuthForm } from '@/views/components/auth/AuthForm';
import { AuthLayout } from '@/views/components/auth/AuthLayout';

export function LoginPage() {
  return (
    <AuthLayout>
      <AuthForm mode="login" />
    </AuthLayout>
  );
}
