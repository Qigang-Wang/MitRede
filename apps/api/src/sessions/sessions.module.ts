import { Module } from "@nestjs/common";
import { RealtimeModule } from "../realtime/realtime.module";
import { SessionsController } from "./sessions.controller";
import { SessionsService } from "./sessions.service";

@Module({
  imports: [RealtimeModule],
  controllers: [SessionsController],
  providers: [SessionsService],
})
export class SessionsModule {}

