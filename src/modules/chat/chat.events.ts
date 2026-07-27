// Emitted by ChatService after any message (text/image/system) is persisted.
// ChatGateway listens and pushes it out over the socket — decouples the
// "save it" path (REST or gateway) from the "broadcast it live" path, same
// pattern as Jobs -> Payments.
export const CHAT_MESSAGE_CREATED = 'chat.message.created';
// emitted when a participant marks a job's thread as read — lets the
// gateway push a live "seen" receipt to the other side
export const CHAT_MESSAGE_SEEN = 'chat.message.seen';

export interface ChatMessageCreatedEvent {
  jobId: string;
  recipientId: string | null; // the other participant — null means broadcast to the whole room (e.g. a SYSTEM message)
  message: Record<string, unknown>;
}

export interface ChatMessageSeenEvent {
  jobId: string;
  seenBy: string;
  otherUserId: string;
}
