import './config/load-env';
import 'reflect-metadata';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { setupApp } from './setup-app';

async function bootstrap() {
  const json = ['true', '1'].includes(String(process.env.LOG_JSON).toLowerCase());
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({ json, colors: !json }),
  });
  setupApp(app);
  const config = app.get(AppConfigService);
  await app.listen(config.env.PORT);
  Logger.log(
    `API escuchando en puerto ${config.env.PORT} (modo ${config.env.DEPLOYMENT_MODE}, ${config.env.NODE_ENV})`,
    'Bootstrap',
  );
}

void bootstrap();
