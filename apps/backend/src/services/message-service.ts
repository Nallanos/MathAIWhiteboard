import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, asc, and, isNull, desc } from 'drizzle-orm';
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

  async getMessages(conversationId: string, opts?: { limit?: number }) {
    const limit = typeof opts?.limit === 'number' ? opts.limit : undefined;

    if (limit && limit > 0) {
      const rows = await this.db
        .select()
        .from(schema.messages)
        .where(
          and(
            eq(schema.messages.conversationId, conversationId),
            isNull(schema.messages.deletedAt)
          )
        )
        .orderBy(desc(schema.messages.createdAt))
        .limit(limit);

      // Return chronological order for the UI.
      return rows.reverse();
    }

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
          eq(schema.conversations.userId, userId),
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

  async archiveActiveConversations(boardId: string, userId: string) {
    await this.db
      .update(schema.conversations)
      .set({ status: 'archived' })
      .where(
        and(
          eq(schema.conversations.boardId, boardId),
          eq(schema.conversations.userId, userId),
          eq(schema.conversations.status, 'active')
        )
      );
  }

  async listConversations(boardId: string, userId: string) {
    return this.db
      .select()
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.boardId, boardId),
          eq(schema.conversations.userId, userId)
        )
      )
      .orderBy(desc(schema.conversations.createdAt));
  }

  async setActiveConversation(boardId: string, userId: string, conversationId: string) {
    const [existing] = await this.db
      .select()
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.id, conversationId),
          eq(schema.conversations.boardId, boardId),
          eq(schema.conversations.userId, userId)
        )
      )
      .limit(1);

    if (!existing) {
      return null;
    }

    await this.archiveActiveConversations(boardId, userId);

    const [updated] = await this.db
      .update(schema.conversations)
      .set({ status: 'active' })
      .where(eq(schema.conversations.id, conversationId))
      .returning();

    return updated ?? null;
  }
}
