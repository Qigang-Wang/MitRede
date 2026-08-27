import { Module } from "@nestjs/common";
import { PresentationsController } from "./presentations.controller";
import { PresentationsService } from "./presentations.service";
import { AssetsController } from "./assets.controller";
import { RealtimeModule } from "../realtime/realtime.module";

@Module({
  imports: [RealtimeModule],
  controllers: [PresentationsController, AssetsController],
  providers: [PresentationsService],
  exports: [PresentationsService],
})
export class PresentationsModule {}
