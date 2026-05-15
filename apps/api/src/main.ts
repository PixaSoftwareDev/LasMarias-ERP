import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { EnvService } from './config/env.service';
import { HttpExceptionFilter } from './common/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const env = app.get(EnvService);
  const logger = new Logger('Bootstrap');

  app.use(helmet());
  app.enableCors({
    origin: env.corsOrigins,
    credentials: true,
  });

  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen(env.apiPort, env.apiHost);
  logger.log(`Las Marías API escuchando en http://${env.apiHost}:${env.apiPort}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Error al arrancar la API:', err);
  process.exit(1);
});
