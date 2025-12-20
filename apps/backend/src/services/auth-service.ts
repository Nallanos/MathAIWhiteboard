import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

type Database = NodePgDatabase<typeof schema>;

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-do-not-use-in-prod';

export class AuthService {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async register(email: string, password: string, displayName: string) {
    const existing = await this.db.query.users.findFirst({
      where: eq(schema.users.email, email)
    });

    if (existing) {
      throw new Error('User already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [user] = await this.db
      .insert(schema.users)
      .values({
        email,
        passwordHash,
        displayName
      })
      .returning();

    const token = this.generateToken(user.id);
    return { user: { id: user.id, email: user.email, displayName: user.displayName }, token };
  }

  async login(email: string, password: string) {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.email, email)
    });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new Error('Invalid credentials');
    }

    const token = this.generateToken(user.id);
    return { user: { id: user.id, email: user.email, displayName: user.displayName }, token };
  }

  async loginWithGoogle(email: string, displayName: string) {
    const existing = await this.db.query.users.findFirst({
      where: eq(schema.users.email, email)
    });

    if (existing) {
      return {
        user: { id: existing.id, email: existing.email, displayName: existing.displayName },
        token: this.generateToken(existing.id)
      };
    }

    const passwordHash = await this.createPlaceholderPasswordHash();
    const [user] = await this.db
      .insert(schema.users)
      .values({
        email,
        displayName,
        passwordHash
      })
      .returning();

    const token = this.generateToken(user.id);
    return { user: { id: user.id, email: user.email, displayName: user.displayName }, token };
  }

  private generateToken(userId: string) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
  }

  private async createPlaceholderPasswordHash() {
    const randomPassword = crypto.randomBytes(32).toString('hex');
    return bcrypt.hash(randomPassword, 10);
  }

  verifyToken(token: string) {
    try {
      return jwt.verify(token, JWT_SECRET) as { userId: string };
    } catch (e) {
      return null;
    }
  }
}
