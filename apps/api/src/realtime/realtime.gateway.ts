import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@mitrede/contracts";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import type { Socket } from "socket.io";

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
  @SubscribeMessage("session:join")
  joinSession(
    @MessageBody() data: { sessionId: string; knownVersion?: number },
    @ConnectedSocket() client: RealtimeSocket,
  ) {
    client.data.sessionId = data.sessionId;
    void client.join(`session:${data.sessionId}`);
    return { accepted: true };
  }
}

