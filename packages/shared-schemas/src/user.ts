import { z } from 'zod';
import { uuidSchema, isoDateTimeSchema } from './common';

// Roles del sistema (CLAUDE.md §4.10)
export const userRoleSchema = z.enum([
  'admin',
  'gerente',
  'operario',
  'vendedor',
  'repartidor',
  'contable',
]);

export type UserRole = z.infer<typeof userRoleSchema>;

export const userSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  fullName: z.string().min(1).max(120),
  role: userRoleSchema,
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type User = z.infer<typeof userSchema>;

export const createUserInputSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z
    .string()
    .min(8, 'La contraseña tiene que tener al menos 8 caracteres')
    .max(128),
  fullName: z.string().min(1, 'Ingresá el nombre completo').max(120),
  role: userRoleSchema,
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const updateUserInputSchema = createUserInputSchema
  .partial()
  .omit({ password: true })
  .extend({ isActive: z.boolean().optional() });

export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;

// "Mi cuenta": el usuario edita sus propios datos (nombre/email).
export const updateMeInputSchema = z.object({
  fullName: z.string().min(1, 'Ingresá el nombre completo').max(120).optional(),
  email: z.string().email('Email inválido').optional(),
});
export type UpdateMeInput = z.infer<typeof updateMeInputSchema>;

// "Mi cuenta": cambio de contraseña (verifica la actual antes de aplicar la nueva).
export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1, 'Ingresá tu contraseña actual'),
  newPassword: z
    .string()
    .min(8, 'La nueva contraseña tiene que tener al menos 8 caracteres')
    .max(128),
});
export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;
