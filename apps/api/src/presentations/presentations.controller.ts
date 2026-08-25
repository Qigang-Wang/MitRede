import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CreatePollDto } from "./dto/create-poll.dto";
import { CreatePresentationDto } from "./dto/create-presentation.dto";
import { PresentationsService } from "./presentations.service";

@ApiTags("presentations")
@Controller("presentations")
export class PresentationsController {
  constructor(private readonly presentations: PresentationsService) {}

  @Get()
  @ApiOperation({ summary: "Listet die zuletzt bearbeiteten Präsentationen" })
  list() {
    return this.presentations.list();
  }

  @Get(":id")
  @ApiOperation({ summary: "Lädt eine Präsentation mit ihren Knoten" })
  get(@Param("id") id: string) {
    return this.presentations.get(id);
  }

  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 100 * 1024 * 1024 } }))
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["title", "file"],
      properties: {
        title: { type: "string" },
        file: { type: "string", format: "binary" },
      },
    },
  })
  @ApiOperation({ summary: "Erstellt eine Präsentation aus einer PDF-Datei" })
  create(
    @Body() body: CreatePresentationDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("PDF-Datei fehlt");
    return this.presentations.createFromPdf(body.title, file);
  }

  @Post(":id/polls")
  @ApiOperation({ summary: "Fügt eine Single-Choice-Frage hinzu" })
  addPoll(@Param("id") id: string, @Body() body: CreatePollDto) {
    return this.presentations.addPoll(id, body);
  }
}

