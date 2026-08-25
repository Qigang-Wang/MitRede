import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CreatePollDto } from "./dto/create-poll.dto";
import { CreateRatingDto } from "./dto/create-rating.dto";
import { CreatePresentationDto } from "./dto/create-presentation.dto";
import { ReorderNodesDto } from "./dto/reorder-nodes.dto";
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

  @Post(":id/ratings")
  @ApiOperation({ summary: "Fügt eine Skalenfrage hinzu" })
  addRating(@Param("id") id: string, @Body() body: CreateRatingDto) {
    return this.presentations.addRating(id, body);
  }

  @Post(":id/join-pages")
  @ApiOperation({ summary: "Fügt eine Teilnahmeseite hinzu" })
  addJoinPage(@Param("id") id: string) {
    return this.presentations.addJoinPage(id);
  }

  @Patch(":id/nodes/order")
  @ApiOperation({ summary: "Sortiert die Knoten einer Präsentation" })
  reorder(@Param("id") id: string, @Body() body: ReorderNodesDto) {
    return this.presentations.reorder(id, body.nodeIds);
  }

  @Patch(":id/nodes/:nodeId")
  @ApiOperation({ summary: "Aktualisiert eine Single-Choice-Frage" })
  updatePoll(
    @Param("id") id: string,
    @Param("nodeId") nodeId: string,
    @Body() body: CreatePollDto,
  ) {
    return this.presentations.updatePoll(id, nodeId, body);
  }

  @Patch(":id/nodes/:nodeId/rating")
  @ApiOperation({ summary: "Aktualisiert eine Skalenfrage" })
  updateRating(
    @Param("id") id: string,
    @Param("nodeId") nodeId: string,
    @Body() body: CreateRatingDto,
  ) {
    return this.presentations.updateRating(id, nodeId, body);
  }

  @Post(":id/nodes/:nodeId/duplicate")
  @ApiOperation({ summary: "Dupliziert eine Interaktionsseite" })
  duplicate(@Param("id") id: string, @Param("nodeId") nodeId: string) {
    return this.presentations.duplicate(id, nodeId);
  }

  @Delete(":id/nodes/:nodeId")
  @ApiOperation({ summary: "Löscht eine Interaktionsseite" })
  remove(@Param("id") id: string, @Param("nodeId") nodeId: string) {
    return this.presentations.remove(id, nodeId);
  }
}
