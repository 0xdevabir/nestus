import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { config as loadDotenv } from 'dotenv';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { patchNestJsSwagger } from 'nestjs-zod';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';

function loadRootEnv(): void {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
    resolve(__dirname, '../../../.env'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      loadDotenv({ path });
      return;
    }
  }
}

loadRootEnv();

async function bootstrap() {
  const config = loadEnv();

  try {
    patchNestJsSwagger();
  } catch (err) {
    console.warn(
      'nestjs-zod Swagger patch unavailable; OpenAPI will omit Zod schemas.',
      err instanceof Error ? err.message : err,
    );
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'metrics'],
  });

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.enableCors({
    origin: config.APP_URL,
    credentials: true,
  });

  const swagger = new DocumentBuilder()
    .setTitle('NESTUS API')
    .setDescription('Control plane REST API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(config.PORT);
}

bootstrap().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
