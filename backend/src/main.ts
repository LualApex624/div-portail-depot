import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppConfigService } from './config/app-config.service';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AppLogger } from './common/logger/app-logger.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  const logger = app.get(AppLogger);
  const config = app.get(AppConfigService);
  app.useLogger(logger);
  app.useGlobalFilters(new AllExceptionsFilter(logger));

  // Derriere Nginx : necessaire pour que req.ip soit l'IP reelle du client,
  // donc pour que le throttler et l'audit portent sur la bonne adresse.
  app.set('trust proxy', 1);

  app.use(cookieParser());

  // L'API ne sert pas de HTML : la CSP la plus restrictive possible suffit,
  // et coupe court a toute tentative d'injection dans une reponse d'erreur.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  // Allowlist stricte : le cookie de session ne part que vers le front connu.
  app.enableCors({
    origin: config.get('CORS_ORIGINS'),
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  const port = config.get('PORT');
  // Ecoute sur toutes les interfaces du conteneur ; l'exposition reelle est
  // limitee a 127.0.0.1 par le mapping de ports de docker-compose.
  await app.listen(port, '0.0.0.0');

  logger.log(`API demarree sur le port ${port}`, 'Bootstrap');
}

void bootstrap();
