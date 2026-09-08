import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { CryptoModule } from './crypto/crypto.module';
import { ObjectStoreModule } from './object-store/object-store.module';
import { AuditModule } from './audit/audit.module';
import { MetricsModule } from './metrics/metrics.module';
import { LoggerModule } from './common/logger/logger.module';
import { AuthModule } from './auth/auth.module';
import { RequestsModule } from './requests/requests.module';
import { PublicDepositModule } from './public-deposit/public-deposit.module';
import { ReaperModule } from './reaper/reaper.module';
import { HealthModule } from './health/health.module';
import { MetricsInterceptor } from './common/interceptors/metrics.interceptor';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';

@Module({
  imports: [
    // La configuration est lue et validee une seule fois, au demarrage. Tout
    // le reste du code recoit des valeurs deja typees.
    AppConfigModule,
    // Garde-fou global. Les routes sensibles resserrent la limite avec
    // @Throttle ; /metrics, /health et /ready en sont exclues.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    LoggerModule,
    PrismaModule,
    CryptoModule,
    ObjectStoreModule,
    AuditModule,
    MetricsModule,
    AuthModule,
    RequestsModule,
    PublicDepositModule,
    ReaperModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
