import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { requestIdMiddleware } from './common/interceptors/request-id.middleware';
import { AppConfigService } from './config/app-config.service';

/** Configuración común de la aplicación (usada por main.ts y por las pruebas de integración). */
export function setupApp(app: INestApplication): void {
  const config = app.get(AppConfigService);
  const express = app as NestExpressApplication;

  express.set('trust proxy', 1);
  app.use(requestIdMiddleware);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.env.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableShutdownHooks();

  if (!config.isProduction || process.env.SWAGGER_ENABLED === 'true') {
    const doc = new DocumentBuilder()
      .setTitle('Sistema Integral de Gestión y Facturación — API')
      .setDescription('API REST multiempresa con facturación electrónica ARCA (WSAA / WSFEv1).')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));
  }
}
