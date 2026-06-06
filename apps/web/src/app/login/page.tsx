'use client';

import Image from 'next/image';
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
// Acceso rápido: siempre en desarrollo, y en producción solo si se activa la demo
// (NEXT_PUBLIC_DEMO_LOGIN=1 al buildear). Apagado por defecto en producción real.
const SHOW_QUICK_LOGIN = IS_DEV || process.env.NEXT_PUBLIC_DEMO_LOGIN === '1';

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
          Verde profundo de marca con un "mesh" de manchas verdes difuminadas que le dan
          profundidad y un aire moderno, sin recargar. */}
      <div
        className="relative flex flex-col items-center justify-center overflow-hidden px-6 py-16 lg:w-1/2 lg:px-16 lg:py-0"
        style={{ backgroundColor: '#064E3B' }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              'radial-gradient(45% 45% at 18% 18%, rgba(52,211,153,0.45), transparent 70%),' +
              'radial-gradient(45% 45% at 88% 25%, rgba(16,185,129,0.40), transparent 70%),' +
              'radial-gradient(55% 55% at 65% 100%, rgba(6,95,70,0.60), transparent 70%)',
          }}
        />

        <div className="relative z-10 flex max-w-xs flex-col items-center text-center">
          {/* Logo en blanco sobre el verde de marca: la vaca es un recorte que deja ver
              el verde del fondo, así el logo se integra sin recuadro. */}
          <Image
            src="/logo-las-marias-white.png"
            alt="Lácteos Las Marías"
            width={548}
            height={484}
            priority
            className="h-auto w-52 lg:w-64"
          />
        </div>
      </div>

      {/* Panel de formulario */}
      <div className="flex flex-1 items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground">Bienvenido</h2>
            <p className="mt-1.5 text-sm text-foreground-muted">Ingresá tus credenciales para continuar</p>
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

          {SHOW_QUICK_LOGIN && (
            <div className="mt-6 border-t border-border-subtle pt-5">
              <p className="mb-2 text-xs text-foreground-subtle">Acceso rápido (demo)</p>
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
