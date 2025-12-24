import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { CreateCapturePayload } from '@mathboard/shared';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';

type Database = NodePgDatabase<typeof schema>;

interface CaptureServiceDeps {
  db: Database;
  baseDir: string;
}

export class CaptureService {
  private readonly db: Database;
  private readonly baseDir: string;

  constructor({ db, baseDir }: CaptureServiceDeps) {
    this.db = db;
    this.baseDir = baseDir;
  }

  async save(userId: string, payload: CreateCapturePayload) {
    await mkdir(this.baseDir, { recursive: true });
    const captureId = randomUUID();
    const createdAt = new Date().toISOString();
    const imageExt = this.inferImageExtension(payload.image.dataUrl);
    const imagePath = path.join(this.baseDir, `${captureId}.${imageExt}`);

    const buffer = this.decodeBase64(payload.image.dataUrl);
    await writeFile(imagePath, buffer);

    await this.db
      .insert(schema.conversations)
      .values({
        id: payload.conversationId,
        userId: userId,
        boardId: payload.boardId
      })
      .onConflictDoNothing();

    await this.db.insert(schema.captures).values({
      id: captureId,
      conversationId: payload.conversationId,
      userId: userId,
      boardId: payload.boardId,
      scene: payload.scene,
      imageUrl: imagePath,
      width: payload.image.width,
      height: payload.image.height,
      byteSize: payload.image.byteSize
    });

    return { id: captureId, createdAt };
  }

  private inferImageExtension(dataUrl: string): 'png' | 'jpg' | 'webp' {
    const match = /^data:image\/(png|jpeg|webp);base64,/i.exec(dataUrl);
    const mime = (match?.[1] ?? 'png').toLowerCase();
    if (mime === 'jpeg') return 'jpg';
    if (mime === 'webp') return 'webp';
    return 'png';
  }

  private decodeBase64(dataUrl: string): Buffer {
    const [, base64] = dataUrl.split(',');
    if (!base64) {
      throw new Error('Invalid data URL payload');
    }
    return Buffer.from(base64, 'base64');
  }
}
