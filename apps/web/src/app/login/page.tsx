'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Milk } from 'lucide-react';
import { loginInputSchema, type LoginInput } from '@lasmarias/shared-schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginInputSchema),
    mode: 'onBlur',
  });

  async function onSubmit(values: LoginInput) {
    try {
      await login(values);
      toast.success('¡Bienvenido!');
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error('No se pudo iniciar sesión. Probá de nuevo.');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-lg bg-primary-50">
            <Milk className="h-7 w-7 text-primary-600" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Lácteos Las Marías</h1>
          <p className="mt-1 text-sm text-foreground-muted">Ingresá para entrar al sistema</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <Field label="Email" htmlFor="email" required error={errors.email?.message}>
            <Input
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="tunombre@lasmarias.local"
              {...register('email')}
            />
          </Field>

          <Field label="Contraseña" htmlFor="password" required error={errors.password?.message}>
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              {...register('password')}
            />
          </Field>

          <Button type="submit" size="lg" block loading={isSubmitting} loadingText="Entrando...">
            Entrar
          </Button>
        </form>
      </div>
    </div>
  );
}
