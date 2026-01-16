import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, desc } from 'drizzle-orm';
import * as schema from '../db/schema.js';

type Database = NodePgDatabase<typeof schema>;

interface BoardServiceDeps {
  db: Database;
}

export class BoardService {
  private readonly db: Database;

  constructor({ db }: BoardServiceDeps) {
    this.db = db;
  }

  async getBoard(id: string, userId: string) {
    const [board] = await this.db
      .select()
      .from(schema.boards)
      .where(eq(schema.boards.id, id));

    if (!board) {
      return null;
    }

    // Simple authorization check
    if (board.userId !== userId) {
      throw new Error('Unauthorized access to board');
    }

    return board;
  }

  async createBoard(userId: string, title: string = 'Untitled Board') {
    const [board] = await this.db
      .insert(schema.boards)
      .values({
        userId,
        title,
        scene: {}
      })
      .returning();
    return board;
  }

  async updateBoardScene(id: string, userId: string, scene: unknown, thumbnailUrl?: string) {
    const updateData: any = {
      scene,
      updatedAt: new Date()
    };
    if (thumbnailUrl) {
      updateData.thumbnailUrl = thumbnailUrl;
    }

    const [board] = await this.db
      .update(schema.boards)
      .set(updateData)
      .where(and(eq(schema.boards.id, id), eq(schema.boards.userId, userId)))
      .returning();
    return board;
  }

  async updateBoardTitle(id: string, userId: string, title: string) {
    const [board] = await this.db
      .update(schema.boards)
      .set({
        title,
        updatedAt: new Date()
      })
      .where(and(eq(schema.boards.id, id), eq(schema.boards.userId, userId)))
      .returning();
    return board;
  }

  async listBoards(userId: string) {
    return this.db
      .select()
      .from(schema.boards)
      .where(eq(schema.boards.userId, userId))
      .orderBy(desc(schema.boards.updatedAt));
  }

  async deleteBoard(id: string, userId: string) {
    const [deleted] = await this.db
      .delete(schema.boards)
      .where(and(eq(schema.boards.id, id), eq(schema.boards.userId, userId)))
      .returning();
    return deleted;
  }
}
