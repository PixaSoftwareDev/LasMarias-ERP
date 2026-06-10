// DataSource standalone para correr migraciones desde CLI.
// Usa las mismas variables de entorno que la app NestJS.

import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { loadEnv } from '../config/env.schema';
import { entities } from './entities';

const env = loadEnv();

const AppDataSource = new DataSource({
  type: 'postgres',
  host: env.POSTGRES_HOST,
  port: env.POSTGRES_PORT,
  username: env.POSTGRES_USER,
  password: env.POSTGRES_PASSWORD,
  database: env.POSTGRES_DB,
  entities,
  synchronize: true,
});

export default AppDataSource;
