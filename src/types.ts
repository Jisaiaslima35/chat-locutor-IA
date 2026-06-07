export type MessageType = "usuario" | "hermes" | "sistema";

export interface ChatMessage {
  id: string; // uuid or sequence id
  usuario: string;
  mensagem: string;
  datahora: string; // ISO format string
  tipo: MessageType;
}

export interface UserSession {
  socketId: string;
  usuario: string;
  isModerator: boolean;
  silencedUntil?: string; // ISO string if silenced
  isBanned?: boolean;
}

export interface ServerState {
  onlineCount: number;
  users: Record<string, UserSession>;
  silencedUsers: Record<string, boolean>; // usuario -> true
  bannedUsers: Record<string, boolean>; // usuario -> true
}
