import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, asc, and, isNull } from 'drizzle-orm';
import * as schema from '../db/schema.js';

type Database = NodePgDatabase<typeof schema>;

interface MessageServiceDeps {
  db: Database;
}

export class MessageService {
  private readonly db: Database;

  constructor({ db }: MessageServiceDeps) {
    this.db = db;
  }

  async getMessages(conversationId: string) {
    return this.db
      .select()
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.conversationId, conversationId),
          isNull(schema.messages.deletedAt)
        )
      )
      .orderBy(asc(schema.messages.createdAt));
  }

  async createMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    captureId?: string
  ) {
    const [message] = await this.db
      .insert(schema.messages)
      .values({
        conversationId,
        role,
        content,
        captureId
      })
      .returning();
    return message;
  }

  async softDeleteMessage(id: string) {
    await this.db
      .update(schema.messages)
      .set({ deletedAt: new Date() })
      .where(eq(schema.messages.id, id));
  }

  async editMessage(id: string, newContent: string) {
    // Note: This is a simple edit. For "Truncate & Regenerate", logic would be more complex.
    const [message] = await this.db
      .update(schema.messages)
      .set({ content: newContent })
      .where(eq(schema.messages.id, id))
      .returning();
    return message;
  }

  async getOrCreateConversation(boardId: string, userId: string) {
    const [existing] = await this.db
      .select()
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.boardId, boardId),
          eq(schema.conversations.status, 'active')
        )
      )
      .limit(1);

    if (existing) {
      return existing;
    }

    const [created] = await this.db
      .insert(schema.conversations)
      .values({
        boardId,
        userId,
        status: 'active'
      })
      .returning();
    
    return created;
  }

  async archiveActiveConversations(boardId: string) {
    await this.db
      .update(schema.conversations)
      .set({ status: 'archived' })
      .where(
        and(
          eq(schema.conversations.boardId, boardId),
          eq(schema.conversations.status, 'active')
        )
      );
  }
}
