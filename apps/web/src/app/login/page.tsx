'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { BrandLogo } from '@/components/brand-logo';
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
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginInputSchema),
    mode: 'onBlur',
  });

  function fillDemo() {
    setValue('email', 'admin@lasmarias.local', { shouldValidate: false });
    setValue('password', 'Admin123!Cambiar', { shouldValidate: false });
  }

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
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-8">
      {/* Banda verde de marca arriba */}
      <div className="absolute inset-x-0 top-0 h-1.5 bg-primary-600" aria-hidden="true" />
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLogo size={64} />
          <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-secondary-700">Lácteos Las Marías</h1>
          <p className="mt-1 text-xs uppercase tracking-widest text-primary-700">Industria Láctea Especializada</p>
          <p className="mt-4 text-sm text-foreground-muted">Ingresá para entrar al sistema</p>
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

          <button
            type="button"
            onClick={fillDemo}
            className="text-xs text-foreground-muted underline underline-offset-2 hover:text-foreground transition-colors"
          >
            Usar credenciales de demo
          </button>
        </form>
      </div>
    </div>
  );
}
