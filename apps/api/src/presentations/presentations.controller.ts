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
import { CreateContentPageDto } from "./dto/create-content-page.dto";
import { CreateFreeformPageDto } from "./dto/create-freeform-page.dto";
import { UpdateFreeformPageDto } from "./dto/update-freeform-page.dto";
import { UpdateGroupPageDto } from "./dto/update-group-page.dto";
import { UpdateGroupDiscussionDto } from "./dto/update-group-discussion.dto";
import { UpdateGroupPresentationDto } from "./dto/update-group-presentation.dto";
import { UpdatePriorityVoteDto } from "./dto/update-priority-vote.dto";
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

  @Delete(":id")
  @ApiOperation({ summary: "Löscht eine Präsentation einschließlich ihrer Sitzungen und Ergebnisse" })
  removePresentation(@Param("id") id: string) {
    return this.presentations.removePresentation(id);
  }

  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 100 * 1024 * 1024 } }))
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["title"],
      properties: {
        title: { type: "string" },
        file: { type: "string", format: "binary" },
      },
    },
  })
  @ApiOperation({ summary: "Erstellt eine Präsentation, optional aus einer PDF-Datei" })
  create(
    @Body() body: CreatePresentationDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return file
      ? this.presentations.createFromPdf(body.title, file)
      : this.presentations.createBlank(body.title);
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

  @Post(":id/content-pages")
  @ApiOperation({ summary: "Fügt eine Informationsseite hinzu" })
  addContentPage(@Param("id") id: string) {
    return this.presentations.addContentPage(id);
  }

  @Post(":id/freeform-pages")
  @ApiOperation({ summary: "Fügt eine frei gestaltbare Seite hinzu" })
  addFreeformPage(@Param("id") id: string, @Body() body: CreateFreeformPageDto) {
    return this.presentations.addFreeformPage(id, body?.template);
  }

  @Post(":id/group-pages")
  @ApiOperation({ summary: "Fügt eine Seite für selbst organisierte Gruppen hinzu" })
  addGroupPage(@Param("id") id: string) {
    return this.presentations.addGroupPage(id);
  }

  @Post(":id/group-discussions")
  @ApiOperation({ summary: "Fügt eine Gruppendiskussion auf Basis einer Gruppenseite hinzu" })
  addGroupDiscussion(@Param("id") id: string) {
    return this.presentations.addGroupDiscussion(id);
  }

  @Post(":id/group-presentations")
  @ApiOperation({ summary: "Fügt eine Seite zur Präsentation der Gruppenergebnisse hinzu" })
  addGroupPresentation(@Param("id") id: string) {
    return this.presentations.addGroupPresentation(id);
  }

  @Post(":id/priority-votes")
  @ApiOperation({ summary: "Fügt eine Priorisierung mit drei Stimmen pro Person hinzu" })
  addPriorityVote(@Param("id") id: string) {
    return this.presentations.addPriorityVote(id);
  }

  @Post(":id/images")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Lädt ein Bild für eine frei gestaltbare Seite hoch" })
  uploadImage(
    @Param("id") id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("Bilddatei fehlt");
    return this.presentations.uploadImage(id, file);
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

  @Patch(":id/nodes/:nodeId/content")
  @ApiOperation({ summary: "Aktualisiert eine Informationsseite" })
  updateContentPage(
    @Param("id") id: string,
    @Param("nodeId") nodeId: string,
    @Body() body: CreateContentPageDto,
  ) {
    return this.presentations.updateContentPage(id, nodeId, body);
  }

  @Patch(":id/nodes/:nodeId/freeform")
  @ApiOperation({ summary: "Aktualisiert eine frei gestaltbare Seite" })
  updateFreeformPage(
    @Param("id") id: string,
    @Param("nodeId") nodeId: string,
    @Body() body: UpdateFreeformPageDto,
  ) {
    return this.presentations.updateFreeformPage(id, nodeId, body);
  }

  @Patch(":id/nodes/:nodeId/group")
  @ApiOperation({ summary: "Aktualisiert eine Gruppendiskussionsseite" })
  updateGroupPage(
    @Param("id") id: string,
    @Param("nodeId") nodeId: string,
    @Body() body: UpdateGroupPageDto,
  ) {
    return this.presentations.updateGroupPage(id, nodeId, body);
  }

  @Patch(":id/nodes/:nodeId/group-discussion")
  @ApiOperation({ summary: "Aktualisiert eine Gruppendiskussion" })
  updateGroupDiscussion(
    @Param("id") id: string,
    @Param("nodeId") nodeId: string,
    @Body() body: UpdateGroupDiscussionDto,
  ) {
    return this.presentations.updateGroupDiscussion(id, nodeId, body);
  }

  @Patch(":id/nodes/:nodeId/group-presentation")
  @ApiOperation({ summary: "Aktualisiert eine Seite zur Präsentation der Gruppenergebnisse" })
  updateGroupPresentation(
    @Param("id") id: string,
    @Param("nodeId") nodeId: string,
    @Body() body: UpdateGroupPresentationDto,
  ) {
    return this.presentations.updateGroupPresentation(id, nodeId, body);
  }

  @Patch(":id/nodes/:nodeId/priority-vote")
  @ApiOperation({ summary: "Aktualisiert eine Priorisierungsseite" })
  updatePriorityVote(
    @Param("id") id: string,
    @Param("nodeId") nodeId: string,
    @Body() body: UpdatePriorityVoteDto,
  ) {
    return this.presentations.updatePriorityVote(id, nodeId, body);
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
