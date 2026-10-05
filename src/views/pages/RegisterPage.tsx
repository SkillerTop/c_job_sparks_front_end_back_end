import { AuthForm } from '@/views/components/auth/AuthForm';
import { AuthLayout } from '@/views/components/auth/AuthLayout';

export function RegisterPage() {
  return (
    <AuthLayout>
      <AuthForm mode="register" />
    </AuthLayout>
  );
}
