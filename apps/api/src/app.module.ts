import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { PresentationsModule } from "./presentations/presentations.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { SessionsModule } from "./sessions/sessions.module";
import { SettingsModule } from "./settings/settings.module";
import { AuthModule } from "./auth/auth.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    HealthModule,
    RealtimeModule,
    PresentationsModule,
    SessionsModule,
    SettingsModule,
  ],
})
export class AppModule {}
