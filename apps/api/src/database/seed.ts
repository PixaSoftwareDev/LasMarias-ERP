// Seed inicial: crea un usuario admin si no existe ningún usuario.
// Permite arrancar el smoke test sin endpoint público de registro
// (la creación de usuarios en producción se hace desde Administración con rol admin).

import 'reflect-metadata';
import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import AppDataSource from './data-source';
import { UserEntity } from '../users/user.entity';

const SEED_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@lasmarias.local';
const SEED_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!Cambiar';

async function seed() {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(UserEntity);
  const existing = await repo.findOne({ where: { email: SEED_EMAIL } });
  if (existing) {
    // eslint-disable-next-line no-console
    console.log(`[seed] El usuario ${SEED_EMAIL} ya existe — nada que hacer.`);
    await AppDataSource.destroy();
    return;
  }
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);
  const user = repo.create({
    email: SEED_EMAIL,
    passwordHash,
    fullName: 'Administrador',
    role: 'admin',
    isActive: true,
  });
  await repo.save(user);
  // eslint-disable-next-line no-console
  console.log(`[seed] Admin creado: ${SEED_EMAIL} (contraseña inicial: ${SEED_PASSWORD})`);
  await AppDataSource.destroy();
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed] Error:', err);
  process.exit(1);
});
