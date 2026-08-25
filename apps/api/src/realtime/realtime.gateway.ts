import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@mitrede/contracts";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, type Socket } from "socket.io";
import type { SessionEvent } from "@mitrede/contracts";

type RealtimeSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  { sessionId?: string }
>;

@WebSocketGateway({
  namespace: "/sessions",
  cors: { origin: process.env.WEB_ORIGIN ?? "http://localhost:5173" },
  transports: ["websocket", "polling"],
})
export class RealtimeGateway {
  @WebSocketServer()
  private server!: Server<ClientToServerEvents, ServerToClientEvents>;

  @SubscribeMessage("session:join")
  joinSession(
    @MessageBody() data: { sessionId: string; knownVersion?: number },
    @ConnectedSocket() client: RealtimeSocket,
  ) {
    client.data.sessionId = data.sessionId;
    void client.join(`session:${data.sessionId}`);
    return { accepted: true };
  }

  emitSessionEvent(sessionId: string, event: SessionEvent) {
    this.server.to(`session:${sessionId}`).emit("session:event", event);
  }
}
