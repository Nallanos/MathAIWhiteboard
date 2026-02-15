/**
 * Email Service - Resend + React Email
 * 
 * Handles all email sending operations:
 * - Welcome emails (with verification link)
 * - Verification emails
 * - Retention/engagement emails
 * - Unsubscribe handling
 */

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, lt, isNull } from 'drizzle-orm';
import { Resend } from 'resend';
import crypto from 'node:crypto';
import * as schema from '../db/schema.js';

// Import email templates
import { WelcomeEmail } from './emails/welcome.js';
import { VerificationEmail } from './emails/verification.js';
import { RetentionDigestEmail } from './emails/retention-digest.js';

type Database = NodePgDatabase<typeof schema>;

export interface EmailConfig {
  resendApiKey: string;
  fromEmail: string;
  fromName: string;
  appUrl: string;
}

export interface SendEmailResult {
  success: boolean;
  resendId?: string;
  error?: string;
}

export class EmailService {
  private readonly db: Database;
  private readonly resend: Resend;
  private readonly config: EmailConfig;

  constructor(db: Database, config: EmailConfig) {
    this.db = db;
    this.resend = new Resend(config.resendApiKey);
    this.config = config;
  }

  // ============================================
  // TOKEN GENERATION
  // ============================================

  private generateSecureToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  private async createEmailToken(
    userId: string,
    type: 'verification' | 'unsubscribe',
    expiresInHours: number = 24
  ): Promise<string> {
    const token = this.generateSecureToken();
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    await this.db.insert(schema.emailTokens).values({
      userId,
      token,
      type,
      expiresAt
    });

    return token;
  }

  // ============================================
  // WELCOME EMAIL (with verification link)
  // ============================================

  async sendWelcomeEmail(userId: string, email: string, displayName: string): Promise<SendEmailResult> {
    try {
      const unsubscribeToken = await this.createEmailToken(userId, 'unsubscribe', 24 * 365); // 1 year

      const unsubscribeUrl = `${this.config.appUrl}/api/email/unsubscribe?token=${unsubscribeToken}`;

      const { data, error } = await this.resend.emails.send({
        from: `${this.config.fromName} <${this.config.fromEmail}>`,
        to: email,
        subject: `Bienvenue sur WhiteboardAI, ${displayName}! 🎨`,
        react: WelcomeEmail({
          displayName,
          verificationUrl: '', // No longer used in template
          unsubscribeUrl,
          appUrl: this.config.appUrl
        }),
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
        },
        tags: [
          { name: 'email_type', value: 'welcome' },
          { name: 'user_id', value: userId }
        ]
      });

      if (error) {
        console.error('[EmailService] Failed to send welcome email:', error);
        return { success: false, error: error.message };
      }

      // Log the event
      await this.logEmailEvent({
        resendId: data?.id || 'unknown',
        userId,
        emailTo: email,
        emailType: 'welcome',
        eventType: 'sent'
      });

      return { success: true, resendId: data?.id };
    } catch (err) {
      console.error('[EmailService] Welcome email exception:', err);
      return { success: false, error: String(err) };
    }
  }

  // ============================================
  // VERIFICATION EMAIL (resend)
  // ============================================

  async sendVerificationEmail(userId: string, email: string, displayName: string): Promise<SendEmailResult> {
    try {
      const verificationToken = await this.createEmailToken(userId, 'verification', 24);
      const verificationUrl = `${this.config.appUrl}/verify-email?token=${verificationToken}`;

      const { data, error } = await this.resend.emails.send({
        from: `${this.config.fromName} <${this.config.fromEmail}>`,
        to: email,
        subject: 'Vérifiez votre email - WhiteboardAI',
        react: VerificationEmail({
          displayName,
          verificationUrl,
          appUrl: this.config.appUrl
        }),
        tags: [
          { name: 'email_type', value: 'verification' },
          { name: 'user_id', value: userId }
        ]
      });

      if (error) {
        return { success: false, error: error.message };
      }

      await this.logEmailEvent({
        resendId: data?.id || 'unknown',
        userId,
        emailTo: email,
        emailType: 'verification',
        eventType: 'sent'
      });

      return { success: true, resendId: data?.id };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  // ============================================
  // RETENTION/ENGAGEMENT EMAILS
  // ============================================

  async sendRetentionDigest(
    userId: string,
    email: string,
    displayName: string,
    stats: { boardCount: number; lastBoardTitle?: string; daysInactive: number }
  ): Promise<SendEmailResult> {
    try {
      const unsubscribeToken = await this.createEmailToken(userId, 'unsubscribe', 24 * 365);
      const unsubscribeUrl = `${this.config.appUrl}/api/email/unsubscribe?token=${unsubscribeToken}`;

      const { data, error } = await this.resend.emails.send({
        from: `${this.config.fromName} <${this.config.fromEmail}>`,
        to: email,
        subject: `${displayName}, vos tableaux vous attendent! 📝`,
        react: RetentionDigestEmail({
          displayName,
          boardCount: stats.boardCount,
          lastBoardTitle: stats.lastBoardTitle,
          daysInactive: stats.daysInactive,
          unsubscribeUrl,
          appUrl: this.config.appUrl
        }),
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
        },
        tags: [
          { name: 'email_type', value: 'retention_digest' },
          { name: 'user_id', value: userId }
        ]
      });

      if (error) {
        return { success: false, error: error.message };
      }

      await this.logEmailEvent({
        resendId: data?.id || 'unknown',
        userId,
        emailTo: email,
        emailType: 'retention_digest',
        eventType: 'sent'
      });

      return { success: true, resendId: data?.id };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  // ============================================
  // TOKEN VERIFICATION
  // ============================================

  async verifyEmailToken(token: string): Promise<{ valid: boolean; userId?: string; type?: string; error?: string }> {
    const tokenRecord = await this.db.query.emailTokens.findFirst({
      where: and(
        eq(schema.emailTokens.token, token),
        isNull(schema.emailTokens.usedAt)
      )
    });

    if (!tokenRecord) {
      return { valid: false, error: 'Token not found or already used' };
    }

    if (new Date() > tokenRecord.expiresAt) {
      return { valid: false, error: 'Token expired' };
    }

    // Mark token as used
    await this.db
      .update(schema.emailTokens)
      .set({ usedAt: new Date() })
      .where(eq(schema.emailTokens.id, tokenRecord.id));

    // If verification token, mark email as verified
    if (tokenRecord.type === 'verification') {
      await this.db
        .update(schema.users)
        .set({ emailVerified: true })
        .where(eq(schema.users.id, tokenRecord.userId));
    }

    return { valid: true, userId: tokenRecord.userId, type: tokenRecord.type };
  }

  // ============================================
  // UNSUBSCRIBE
  // ============================================

  async handleUnsubscribe(token: string): Promise<{ success: boolean; error?: string }> {
    const result = await this.verifyEmailToken(token);
    
    if (!result.valid || result.type !== 'unsubscribe') {
      return { success: false, error: result.error || 'Invalid unsubscribe token' };
    }

    // Disable marketing emails for this user
    await this.db
      .update(schema.users)
      .set({ marketingOptIn: false })
      .where(eq(schema.users.id, result.userId!));

    return { success: true };
  }

  // ============================================
  // WEBHOOK HANDLING (Resend events)
  // ============================================

  async handleWebhook(event: {
    type: string;
    data: {
      email_id?: string;
      to?: string[];
      tags?: { name: string; value: string }[];
      bounce?: { type: string };
    };
  }): Promise<void> {
    const resendId = event.data.email_id || 'unknown';
    const emailTo = event.data.to?.[0] || 'unknown';
    const tags = event.data.tags || [];
    
    const emailTypeTag = tags.find(t => t.name === 'email_type');
    const userIdTag = tags.find(t => t.name === 'user_id');

    const emailType = emailTypeTag?.value || 'unknown';
    const userId = userIdTag?.value;

    // Map Resend event types
    let eventType: string;
    let bounceType: string | undefined;

    switch (event.type) {
      case 'email.delivered':
        eventType = 'delivered';
        break;
      case 'email.bounced':
        eventType = 'bounced';
        bounceType = event.data.bounce?.type; // 'hard' or 'soft'
        break;
      case 'email.complained':
        eventType = 'complained';
        break;
      case 'email.opened':
        eventType = 'opened';
        break;
      case 'email.clicked':
        eventType = 'clicked';
        break;
      default:
        eventType = event.type;
    }

    // Log the event
    await this.logEmailEvent({
      resendId,
      userId,
      emailTo,
      emailType,
      eventType,
      bounceType,
      payload: event.data
    });

    // Handle hard bounces - mark email as invalid
    if (eventType === 'bounced' && bounceType === 'hard') {
      // Find user by email and mark as bounced
      const user = await this.db.query.users.findFirst({
        where: eq(schema.users.email, emailTo)
      });

      if (user) {
        await this.db
          .update(schema.users)
          .set({ emailStatus: 'bounced' })
          .where(eq(schema.users.id, user.id));
        
        console.log(`[EmailService] Marked user ${user.id} email as bounced (hard bounce)`);
      }
    }

    // Handle complaints - mark as complained and unsubscribe
    if (eventType === 'complained') {
      const user = await this.db.query.users.findFirst({
        where: eq(schema.users.email, emailTo)
      });

      if (user) {
        await this.db
          .update(schema.users)
          .set({ 
            emailStatus: 'complained',
            marketingOptIn: false 
          })
          .where(eq(schema.users.id, user.id));
        
        console.log(`[EmailService] Marked user ${user.id} as complained and unsubscribed`);
      }
    }
  }

  // ============================================
  // RETENTION JOBS
  // ============================================

  async scheduleRetentionJob(
    userId: string,
    jobType: string,
    scheduledFor: Date
  ): Promise<void> {
    await this.db.insert(schema.retentionJobs).values({
      userId,
      jobType,
      scheduledFor,
      status: 'pending'
    });
  }

  async getAndProcessPendingRetentionJobs(limit: number = 50): Promise<number> {
    const now = new Date();
    
    const pendingJobs = await this.db.query.retentionJobs.findMany({
      where: and(
        eq(schema.retentionJobs.status, 'pending'),
        lt(schema.retentionJobs.scheduledFor, now)
      ),
      limit
    });

    let processed = 0;

    for (const job of pendingJobs) {
      try {
        const user = await this.db.query.users.findFirst({
          where: eq(schema.users.id, job.userId)
        });

        if (!user) {
          await this.markJobStatus(job.id, 'skipped', 'User not found');
          continue;
        }

        // Skip if user opted out or email is bounced
        if (!user.marketingOptIn || user.emailStatus !== 'valid') {
          await this.markJobStatus(job.id, 'skipped', 'User opted out or email invalid');
          continue;
        }

        // Get user stats for the digest
        const boards = await this.db.query.boards.findMany({
          where: eq(schema.boards.userId, user.id),
          limit: 10
        });

        const daysInactive = user.lastActivityAt 
          ? Math.floor((Date.now() - user.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24))
          : Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24));

        const result = await this.sendRetentionDigest(
          user.id,
          user.email,
          user.displayName,
          {
            boardCount: boards.length,
            lastBoardTitle: boards[0]?.title,
            daysInactive
          }
        );

        if (result.success) {
          await this.markJobStatus(job.id, 'sent');
        } else {
          await this.markJobStatus(job.id, 'failed', result.error);
        }

        processed++;
      } catch (err) {
        await this.markJobStatus(job.id, 'failed', String(err));
      }
    }

    return processed;
  }

  private async markJobStatus(jobId: string, status: string, errorMessage?: string): Promise<void> {
    await this.db
      .update(schema.retentionJobs)
      .set({
        status,
        executedAt: new Date(),
        errorMessage
      })
      .where(eq(schema.retentionJobs.id, jobId));
  }

  // ============================================
  // HELPERS
  // ============================================

  private async logEmailEvent(data: {
    resendId: string;
    userId?: string;
    emailTo: string;
    emailType: string;
    eventType: string;
    bounceType?: string;
    payload?: unknown;
  }): Promise<void> {
    try {
      await this.db.insert(schema.emailEvents).values({
        resendId: data.resendId,
        userId: data.userId,
        emailTo: data.emailTo,
        emailType: data.emailType,
        eventType: data.eventType,
        bounceType: data.bounceType,
        payload: data.payload
      }).onConflictDoNothing();
    } catch (err) {
      console.error('[EmailService] Failed to log email event:', err);
    }
  }

  // Check if user email is valid for sending
  async canSendTo(userId: string): Promise<boolean> {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.id, userId),
      columns: { emailStatus: true, marketingOptIn: true }
    });

    return user?.emailStatus === 'valid';
  }

  async canSendMarketingTo(userId: string): Promise<boolean> {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.id, userId),
      columns: { emailStatus: true, marketingOptIn: true }
    });

    return user?.emailStatus === 'valid' && user?.marketingOptIn === true;
  }
}
