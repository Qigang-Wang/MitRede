import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/public.decorator";

@ApiTags("system")
@Public()
@Controller("health")
export class HealthController {
  @Get()
  @ApiOperation({ summary: "Prüft, ob die API erreichbar ist" })
  check() {
    return {
      status: "ok",
      service: "mitrede-api",
      timestamp: new Date().toISOString(),
    };
  }
}
