'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { loginInputSchema, type LoginInput } from '@lasmarias/shared-schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Field } from '@/components/ui/field';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';

// Credenciales del seed de desarrollo (apps/api/src/database/seed.ts).
// Sólo se ofrece como acceso rápido fuera de producción.
const DEV_USER = { email: 'admin@lasmarias.local', password: 'Admin123!Cambiar' };
const IS_DEV = process.env.NODE_ENV !== 'production';

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
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Panel de marca — arriba en mobile, a la izquierda en desktop.
          Verde bosque profundo (desaturado) con el verde vivo sólo como acento. */}
      <div
        className="relative flex flex-col items-center justify-center overflow-hidden px-6 py-16 lg:w-1/2 lg:px-16 lg:py-0"
        style={{ background: 'linear-gradient(155deg, #0C3D2D 0%, #08291E 58%, #041E17 100%)' }}
      >
        {/* Halos suaves de acento */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl lg:h-96 lg:w-96" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-emerald-500/10 blur-3xl lg:h-80 lg:w-80" aria-hidden="true" />

        <div className="relative z-10 max-w-xs text-center">
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-emerald-300/80">Lácteos</p>
          <h1 className="mt-2 font-display text-4xl font-semibold leading-none tracking-tight text-white lg:text-5xl">
            Las Marías
          </h1>
          <div className="mx-auto mt-6 h-px w-12 bg-emerald-400/60" aria-hidden="true" />
          <p className="mt-6 text-sm text-emerald-100/70">Industria Láctea Especializada</p>
        </div>
      </div>

      {/* Panel de formulario */}
      <div className="flex flex-1 items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">Bienvenido</h2>
            <p className="mt-1 text-sm text-foreground-muted">Ingresá tus credenciales para continuar</p>
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
              <PasswordInput
                autoComplete="current-password"
                placeholder="••••••••"
                {...register('password')}
              />
            </Field>

            <Button type="submit" size="lg" block loading={isSubmitting} loadingText="Entrando...">
              Entrar
            </Button>
          </form>

          {IS_DEV && (
            <div className="mt-6 border-t border-border-subtle pt-5">
              <p className="mb-2 text-xs text-foreground-subtle">Acceso rápido (sólo desarrollo)</p>
              <button
                type="button"
                onClick={() => {
                  setValue('email', DEV_USER.email);
                  setValue('password', DEV_USER.password);
                }}
                className="rounded-md border border-border-subtle bg-surface-elevated px-3 py-1.5 text-xs text-foreground-muted transition-colors hover:border-primary-300 hover:text-primary-700"
              >
                Administrador
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
