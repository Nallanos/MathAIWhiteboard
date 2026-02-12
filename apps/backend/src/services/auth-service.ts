import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, sql } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

type Database = NodePgDatabase<typeof schema>;

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-do-not-use-in-prod';

export interface DiscordUser {
  id: string;
  username: string;
  email?: string;
  verified?: boolean;
  avatar?: string;
  global_name?: string;
}

export interface DiscordTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

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
    return { 
      user: { 
        id: user.id, 
        email: user.email, 
        displayName: user.displayName,
        emailVerified: user.emailVerified
      }, 
      token 
    };
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

    // Update last login
    await this.db
      .update(schema.users)
      .set({ lastLoginAt: new Date() })
      .where(eq(schema.users.id, user.id));

    const token = this.generateToken(user.id);
    return { 
      user: { 
        id: user.id, 
        email: user.email, 
        displayName: user.displayName,
        emailVerified: user.emailVerified,
        aiCredits: user.aiCredits,
        plan: user.plan,
        avatarUrl: user.avatarUrl
      }, 
      token 
    };
  }

  async loginWithGoogle(email: string, displayName: string, avatarUrl?: string) {
    const existing = await this.db.query.users.findFirst({
      where: eq(schema.users.email, email)
    });

    if (existing) {
      // Update last login and avatar if provided
      await this.db
        .update(schema.users)
        .set({ 
          lastLoginAt: new Date(),
          ...(avatarUrl && !existing.avatarUrl ? { avatarUrl } : {})
        })
        .where(eq(schema.users.id, existing.id));

      return {
        user: { 
          id: existing.id, 
          email: existing.email, 
          displayName: existing.displayName,
          emailVerified: existing.emailVerified,
          aiCredits: existing.aiCredits,
          plan: existing.plan,
          avatarUrl: avatarUrl || existing.avatarUrl
        },
        token: this.generateToken(existing.id),
        isNewUser: false
      };
    }

    const passwordHash = await this.createPlaceholderPasswordHash();
    const [user] = await this.db
      .insert(schema.users)
      .values({
        email,
        displayName,
        passwordHash,
        emailVerified: true, // Google emails are verified
        avatarUrl
      })
      .returning();

    // Create OAuth account link
    await this.createOAuthAccount(user.id, 'google', email, {
      email,
      username: displayName,
      avatar: avatarUrl
    });

    const token = this.generateToken(user.id);
    return { 
      user: { 
        id: user.id, 
        email: user.email, 
        displayName: user.displayName,
        emailVerified: user.emailVerified,
        aiCredits: user.aiCredits,
        plan: user.plan,
        avatarUrl: user.avatarUrl
      }, 
      token,
      isNewUser: true 
    };
  }

  // ============================================
  // DISCORD OAUTH
  // ============================================

  async loginWithDiscord(discordUser: DiscordUser, tokens: DiscordTokens) {
    // Check if Discord account is already linked
    const existingOAuth = await this.db.query.oauthAccounts.findFirst({
      where: and(
        eq(schema.oauthAccounts.provider, 'discord'),
        eq(schema.oauthAccounts.providerAccountId, discordUser.id)
      )
    });

    if (existingOAuth) {
      // User already has Discord linked, login
      const user = await this.db.query.users.findFirst({
        where: eq(schema.users.id, existingOAuth.userId)
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Update last login and OAuth tokens
      await this.db
        .update(schema.users)
        .set({ lastLoginAt: new Date() })
        .where(eq(schema.users.id, user.id));

      await this.updateOAuthTokens(existingOAuth.id, tokens);

      return {
        user: { 
          id: user.id, 
          email: user.email, 
          displayName: user.displayName,
          emailVerified: user.emailVerified,
          aiCredits: user.aiCredits,
          plan: user.plan,
          avatarUrl: user.avatarUrl
        },
        token: this.generateToken(user.id),
        isNewUser: false
      };
    }

    // Check if email exists (link account scenario)
    if (discordUser.email) {
      const existingUser = await this.db.query.users.findFirst({
        where: eq(schema.users.email, discordUser.email)
      });

      if (existingUser) {
        // Link Discord to existing account
        await this.createOAuthAccount(existingUser.id, 'discord', discordUser.id, {
          email: discordUser.email,
          username: discordUser.username,
          avatar: discordUser.avatar ? this.getDiscordAvatarUrl(discordUser.id, discordUser.avatar) : undefined
        }, tokens);

        // Update user with Discord ID and potentially verify email
        const [updatedUser] = await this.db
          .update(schema.users)
          .set({
            discordId: discordUser.id,
            lastLoginAt: new Date(),
            // If Discord email is verified, mark our email as verified too
            ...(discordUser.verified ? { emailVerified: true } : {})
          })
          .where(eq(schema.users.id, existingUser.id))
          .returning();

        return {
          user: { 
            id: updatedUser.id, 
            email: updatedUser.email, 
            displayName: updatedUser.displayName,
            emailVerified: updatedUser.emailVerified,
            aiCredits: updatedUser.aiCredits,
            plan: updatedUser.plan,
            avatarUrl: updatedUser.avatarUrl
          },
          token: this.generateToken(updatedUser.id),
          isNewUser: false,
          linkedAccount: true
        };
      }
    }

    // Create new user with Discord
    const displayName = discordUser.global_name || discordUser.username;
    const avatarUrl = discordUser.avatar 
      ? this.getDiscordAvatarUrl(discordUser.id, discordUser.avatar)
      : undefined;
    
    const passwordHash = await this.createPlaceholderPasswordHash();

    const [user] = await this.db
      .insert(schema.users)
      .values({
        email: discordUser.email || `discord_${discordUser.id}@placeholder.local`,
        displayName,
        passwordHash,
        discordId: discordUser.id,
        avatarUrl,
        // If Discord email is verified, mark as verified
        emailVerified: discordUser.verified || false
      })
      .returning();

    // Create OAuth account link
    await this.createOAuthAccount(user.id, 'discord', discordUser.id, {
      email: discordUser.email,
      username: discordUser.username,
      avatar: avatarUrl
    }, tokens);

    const token = this.generateToken(user.id);
    return {
      user: { 
        id: user.id, 
        email: user.email, 
        displayName: user.displayName,
        emailVerified: user.emailVerified,
        aiCredits: user.aiCredits,
        plan: user.plan,
        avatarUrl: user.avatarUrl
      },
      token,
      isNewUser: true
    };
  }

  private getDiscordAvatarUrl(userId: string, avatarHash: string): string {
    const extension = avatarHash.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${extension}`;
  }

  // ============================================
  // OAUTH ACCOUNT MANAGEMENT
  // ============================================

  private async createOAuthAccount(
    userId: string,
    provider: 'google' | 'discord',
    providerAccountId: string,
    profile: { email?: string; username?: string; avatar?: string },
    tokens?: DiscordTokens
  ) {
    const expiresAt = tokens 
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : undefined;

    await this.db.insert(schema.oauthAccounts).values({
      userId,
      provider,
      providerAccountId,
      providerEmail: profile.email,
      providerUsername: profile.username,
      providerAvatar: profile.avatar,
      accessToken: tokens?.access_token,
      refreshToken: tokens?.refresh_token,
      expiresAt
    });
  }

  private async updateOAuthTokens(oauthAccountId: string, tokens: DiscordTokens) {
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await this.db
      .update(schema.oauthAccounts)
      .set({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined,
        expiresAt,
        updatedAt: new Date()
      })
      .where(eq(schema.oauthAccounts.id, oauthAccountId));
  }

  async getLinkedAccounts(userId: string) {
    return this.db.query.oauthAccounts.findMany({
      where: eq(schema.oauthAccounts.userId, userId),
      columns: {
        id: true,
        provider: true,
        providerUsername: true,
        providerAvatar: true,
        createdAt: true
      }
    });
  }

  async unlinkOAuthAccount(userId: string, provider: 'google' | 'discord') {
    // Ensure user has another way to login (password or other OAuth)
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.id, userId)
    });

    if (!user) {
      throw new Error('User not found');
    }

    const linkedAccounts = await this.getLinkedAccounts(userId);
    const hasPassword = user.passwordHash && !user.passwordHash.startsWith('placeholder_');
    const otherProviders = linkedAccounts.filter(a => a.provider !== provider);

    if (!hasPassword && otherProviders.length === 0) {
      throw new Error('Cannot unlink: you need at least one login method');
    }

    await this.db
      .delete(schema.oauthAccounts)
      .where(and(
        eq(schema.oauthAccounts.userId, userId),
        eq(schema.oauthAccounts.provider, provider)
      ));

    // If unlinking Discord, remove discordId from user
    if (provider === 'discord') {
      await this.db
        .update(schema.users)
        .set({ discordId: null })
        .where(eq(schema.users.id, userId));
    }
  }

  // ============================================
  // USER ACTIVITY
  // ============================================

  async updateLastActivity(userId: string) {
    await this.db
      .update(schema.users)
      .set({ lastActivityAt: new Date() })
      .where(eq(schema.users.id, userId));
  }

  // ============================================
  // HELPERS
  // ============================================

  private generateToken(userId: string) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
  }

  private async createPlaceholderPasswordHash() {
    const randomPassword = crypto.randomBytes(32).toString('hex');
    return bcrypt.hash(`placeholder_${randomPassword}`, 10);
  }

  verifyToken(token: string) {
    try {
      return jwt.verify(token, JWT_SECRET) as { userId: string };
    } catch (e) {
      return null;
    }
  }
}
