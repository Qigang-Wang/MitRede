import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { SubmitAnswerDto } from "./dto/submit-answer.dto";
import { UpdateSessionDto } from "./dto/update-session.dto";
import { SessionsService } from "./sessions.service";

@ApiTags("sessions")
@Controller()
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post("presentations/:presentationId/sessions")
  @ApiOperation({ summary: "Startet eine neue Live-Sitzung" })
  create(@Param("presentationId") presentationId: string) {
    return this.sessions.create(presentationId);
  }

  @Get("sessions/:id/snapshot")
  @ApiOperation({ summary: "Lädt den aktuellen Sitzungsstand für Moderierende" })
  snapshot(@Param("id") id: string) {
    return this.sessions.snapshotById(id);
  }

  @Get("rooms/:roomCode/snapshot")
  @ApiOperation({ summary: "Lädt den aktuellen Sitzungsstand per Raumcode" })
  roomSnapshot(@Param("roomCode") roomCode: string) {
    return this.sessions.snapshotByRoom(roomCode);
  }

  @Post("rooms/:roomCode/answers")
  @ApiOperation({ summary: "Speichert oder aktualisiert eine anonyme Antwort" })
  answer(@Param("roomCode") roomCode: string, @Body() body: SubmitAnswerDto) {
    return this.sessions.submitAnswer(roomCode, body);
  }

  @Patch("sessions/:id")
  @ApiOperation({ summary: "Ändert den öffentlichen Zustand einer Sitzung" })
  update(@Param("id") id: string, @Body() body: UpdateSessionDto) {
    return this.sessions.update(id, body);
  }
}

