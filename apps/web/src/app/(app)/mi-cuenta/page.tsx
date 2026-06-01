'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KeyRound, Save, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/password-input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { authApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';

const MIN_PASSWORD = 8;

export default function MiCuentaPage() {
  const { user, hydrated, updateLocalUser } = useAuth();

  // Datos
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');

  // Contraseña
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');

  useEffect(() => {
    if (user) {
      setFullName(user.fullName);
      setEmail(user.email);
    }
  }, [user]);

  const saveProfile = useMutation({
    mutationFn: () => authApi.updateMe({ fullName: fullName.trim(), email: email.trim() }),
    onSuccess: (updated) => {
      updateLocalUser(updated);
      toast.success('Datos actualizados.');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudieron guardar los datos.'),
  });

  const changePassword = useMutation({
    mutationFn: () => authApi.changePassword({ currentPassword, newPassword }),
    onSuccess: () => {
      toast.success('Contraseña actualizada.');
      setCurrentPassword('');
      setNewPassword('');
      setRepeatPassword('');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo cambiar la contraseña.'),
  });

  // Validación en vivo de la contraseña.
  const tooShort = newPassword.length > 0 && newPassword.length < MIN_PASSWORD;
  const mismatch = repeatPassword.length > 0 && newPassword !== repeatPassword;
  const canChangePassword =
    currentPassword.length > 0 &&
    newPassword.length >= MIN_PASSWORD &&
    newPassword === repeatPassword &&
    !changePassword.isPending;

  const profileDirty =
    !!user && (fullName.trim() !== user.fullName || email.trim() !== user.email);
  const canSaveProfile = fullName.trim().length > 0 && email.trim().length > 0 && profileDirty && !saveProfile.isPending;

  if (!hydrated || !user) {
    return <Card className="h-64 animate-pulse bg-surface-subtle" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Mi cuenta" description="Tus datos de acceso y tu contraseña." />

      {/* Datos del usuario */}
      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <UserCog className="h-5 w-5 text-primary-700" aria-hidden="true" />
          <CardTitle>Mis datos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nombre" htmlFor="fullName">
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </Field>
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => saveProfile.mutate()}
              loading={saveProfile.isPending}
              loadingText="Guardando..."
              disabled={!canSaveProfile}
            >
              <Save className="h-4 w-4" /> Guardar datos
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cambio de contraseña */}
      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary-700" aria-hidden="true" />
          <CardTitle>Cambiar contraseña</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field label="Contraseña actual" htmlFor="currentPassword" required>
            <PasswordInput
              id="currentPassword"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Nueva contraseña"
              htmlFor="newPassword"
              required
              error={tooShort ? `Tiene que tener al menos ${MIN_PASSWORD} caracteres.` : undefined}
            >
              <PasswordInput
                id="newPassword"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </Field>
            <Field
              label="Repetir nueva contraseña"
              htmlFor="repeatPassword"
              required
              error={mismatch ? 'Las contraseñas no coinciden.' : undefined}
            >
              <PasswordInput
                id="repeatPassword"
                autoComplete="new-password"
                value={repeatPassword}
                onChange={(e) => setRepeatPassword(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => changePassword.mutate()}
              loading={changePassword.isPending}
              loadingText="Cambiando..."
              disabled={!canChangePassword}
            >
              <KeyRound className="h-4 w-4" /> Cambiar contraseña
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
