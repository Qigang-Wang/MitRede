import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { SubmitAnswerDto } from "./dto/submit-answer.dto";
import { UpdateSessionDto } from "./dto/update-session.dto";
import { CreateGroupDto } from "./dto/create-group.dto";
import { JoinGroupDto } from "./dto/join-group.dto";
import { SubmitGroupResultDto } from "./dto/submit-group-result.dto";
import { SubmitPriorityVoteDto } from "./dto/submit-priority-vote.dto";
import { RegisterParticipantDto } from "./dto/register-participant.dto";
import { SessionsService } from "./sessions.service";
import { Public } from "../auth/public.decorator";

@ApiTags("sessions")
@Controller()
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get("sessions")
  @ApiOperation({ summary: "Listet frühere und laufende Sitzungen" })
  list() {
    return this.sessions.list();
  }

  @Post("presentations/:presentationId/sessions")
  @ApiOperation({ summary: "Startet eine neue Live-Sitzung" })
  create(@Param("presentationId") presentationId: string) {
    return this.sessions.create(presentationId);
  }

  @Post("presentations/:presentationId/preview-session")
  @ApiOperation({ summary: "Startet eine temporäre Vorschau-Sitzung" })
  createPreview(@Param("presentationId") presentationId: string) {
    return this.sessions.create(presentationId, true);
  }

  @Delete("sessions/:id/preview")
  @ApiOperation({ summary: "Entfernt eine temporäre Vorschau-Sitzung" })
  removePreview(@Param("id") id: string) {
    return this.sessions.removePreview(id);
  }

  @Get("sessions/:id/snapshot")
  @ApiOperation({ summary: "Lädt den aktuellen Sitzungsstand für Moderierende" })
  snapshot(@Param("id") id: string) {
    return this.sessions.snapshotById(id);
  }

  @Get("sessions/:id/results")
  @ApiOperation({ summary: "Lädt die vollständige Auswertung einer Sitzung" })
  results(@Param("id") id: string) {
    return this.sessions.results(id);
  }

  @Post("sessions/:id/end")
  @ApiOperation({ summary: "Beendet eine Live-Sitzung und fixiert ihre Auswertung" })
  end(@Param("id") id: string) {
    return this.sessions.end(id);
  }

  @Delete("sessions/:id")
  @ApiOperation({ summary: "Löscht eine Sitzung einschließlich ihrer Ergebnisse" })
  remove(@Param("id") id: string) {
    return this.sessions.remove(id);
  }

  @Get("rooms/:roomCode/snapshot")
  @Public()
  @ApiOperation({ summary: "Lädt den aktuellen Sitzungsstand per Raumcode" })
  roomSnapshot(@Param("roomCode") roomCode: string, @Query("participantToken") participantToken?: string) {
    return this.sessions.snapshotByRoom(roomCode, participantToken);
  }

  @Post("rooms/:roomCode/participants")
  @Public()
  @ApiOperation({ summary: "Registriert den Anzeigenamen einer teilnehmenden Person" })
  registerParticipant(@Param("roomCode") roomCode: string, @Body() body: RegisterParticipantDto) {
    return this.sessions.registerParticipant(roomCode, body);
  }

  @Post("rooms/:roomCode/answers")
  @Public()
  @ApiOperation({ summary: "Speichert oder aktualisiert eine anonyme Antwort" })
  answer(@Param("roomCode") roomCode: string, @Body() body: SubmitAnswerDto) {
    return this.sessions.submitAnswer(roomCode, body);
  }

  @Post("rooms/:roomCode/groups")
  @Public()
  @ApiOperation({ summary: "Erstellt eine Gruppe und tritt ihr bei" })
  createGroup(@Param("roomCode") roomCode: string, @Body() body: CreateGroupDto) {
    return this.sessions.createGroup(roomCode, body);
  }

  @Post("rooms/:roomCode/groups/:groupId/join")
  @Public()
  @ApiOperation({ summary: "Tritt einer vorhandenen Gruppe bei" })
  joinGroup(@Param("roomCode") roomCode: string, @Param("groupId") groupId: string, @Body() body: JoinGroupDto) {
    return this.sessions.joinGroup(roomCode, groupId, body);
  }

  @Post("rooms/:roomCode/groups/leave")
  @Public()
  @ApiOperation({ summary: "Verlässt die aktuelle Gruppe" })
  leaveGroup(@Param("roomCode") roomCode: string, @Body() body: JoinGroupDto) {
    return this.sessions.leaveGroup(roomCode, body);
  }

  @Patch("rooms/:roomCode/groups/:groupId/result")
  @Public()
  @ApiOperation({ summary: "Speichert das Ergebnis einer Gruppe" })
  submitGroupResult(@Param("roomCode") roomCode: string, @Param("groupId") groupId: string, @Body() body: SubmitGroupResultDto) {
    return this.sessions.submitGroupResult(roomCode, groupId, body);
  }

  @Post("rooms/:roomCode/priority-votes")
  @Public()
  @ApiOperation({ summary: "Speichert die Priorisierungsstimmen einer Person" })
  submitPriorityVote(@Param("roomCode") roomCode: string, @Body() body: SubmitPriorityVoteDto) {
    return this.sessions.submitPriorityVote(roomCode, body);
  }

  @Patch("sessions/:id")
  @ApiOperation({ summary: "Ändert den öffentlichen Zustand einer Sitzung" })
  update(@Param("id") id: string, @Body() body: UpdateSessionDto) {
    return this.sessions.update(id, body);
  }
}
