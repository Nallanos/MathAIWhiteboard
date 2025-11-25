import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { CreateCapturePayload } from '@mathboard/shared';

export interface StoredCapture {
  id: string;
  imagePath: string;
  metadataPath: string;
  createdAt: string;
}

export class CaptureStorage {
  constructor(private readonly baseDir: string) {}

  async save(payload: CreateCapturePayload): Promise<StoredCapture> {
    await mkdir(this.baseDir, { recursive: true });
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const imagePath = path.join(this.baseDir, `${id}.png`);
    const metadataPath = path.join(this.baseDir, `${id}.json`);

    const buffer = this.decodeBase64(payload.image.dataUrl);
    await writeFile(imagePath, buffer);

    const metadata = {
      id,
      createdAt,
      boardId: payload.boardId,
      conversationId: payload.conversationId,
      scene: payload.scene,
      image: {
        width: payload.image.width,
        height: payload.image.height,
        byteSize: payload.image.byteSize
      }
    } satisfies Record<string, unknown>;
    await writeFile(metadataPath, JSON.stringify(metadata));

    return { id, imagePath, metadataPath, createdAt };
  }

  private decodeBase64(dataUrl: string): Buffer {
    const [, base64] = dataUrl.split(',');
    if (!base64) {
      throw new Error('Invalid data URL payload');
    }
    return Buffer.from(base64, 'base64');
  }
}
