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
          Verde bosque profundo (desaturado) con el verde vivo sólo como acento. */}
      <div
        className="relative flex flex-col items-center justify-center overflow-hidden px-6 py-16 lg:w-1/2 lg:px-16 lg:py-0"
        style={{ background: 'linear-gradient(155deg, #0C3D2D 0%, #08291E 58%, #041E17 100%)' }}
      >
        {/* Textura sutil: grilla de puntos tenue que se desvanece hacia los bordes,
            para dar profundidad al panel sin recargarlo. */}
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
            maskImage: 'radial-gradient(ellipse at center, #000 35%, transparent 78%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, #000 35%, transparent 78%)',
          }}
        />

        {/* Halos suaves de acento */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl lg:h-96 lg:w-96" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-emerald-500/10 blur-3xl lg:h-80 lg:w-80" aria-hidden="true" />

        <div className="relative z-10 flex max-w-xs flex-col items-center text-center">
          {/* Logo sobre tarjeta blanca: el isologo es verde, así contrasta sobre el panel oscuro. */}
          <div className="rounded-2xl bg-white p-5 shadow-xl shadow-black/20 lg:p-6">
            <Image
              src="/logo-las-marias.png"
              alt="Lácteos Las Marías"
              width={220}
              height={195}
              priority
              className="h-auto w-40 lg:w-48"
            />
          </div>
          <div className="mx-auto mt-7 h-px w-12 bg-emerald-400/60" aria-hidden="true" />
          <p className="mt-6 text-sm text-emerald-100/70">Industria Láctea Especializada</p>
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
