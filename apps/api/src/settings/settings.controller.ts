import { Body, Controller, Get, Patch } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { UpdateSettingsDto } from "./dto/update-settings.dto";
import { SettingsService } from "./settings.service";

@ApiTags("settings")
@Controller("settings")
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ApiOperation({ summary: "Lädt die Anwendungseinstellungen" })
  get() {
    return this.settings.get();
  }

  @Patch()
  @ApiOperation({ summary: "Speichert die Anwendungseinstellungen" })
  update(@Body() body: UpdateSettingsDto) {
    return this.settings.update(body);
  }
}
