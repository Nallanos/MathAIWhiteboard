import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import type { AuthService } from '../services/auth-service.js';
import { OAuth2Client } from 'google-auth-library';
import { captureServerEvent } from '../lib/posthog.js';
import https from 'node:https';
import dns from 'node:dns';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().min(2)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

const googleAuthSchema = z.object({
  credential: z.string().min(20)
});

interface Dependencies {
  app: Express;
  authService: AuthService;
  googleClientId: string;
}

export function registerAuthRoutes({ app, authService, googleClientId }: Dependencies): void {
  const allowedAudiences = String(googleClientId || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const oauthClient = new OAuth2Client(allowedAudiences[0]);

  const getJsonOverHttpsIPv4 = async (url: string, timeoutMs: number) => {
    return await new Promise<{
      ok: boolean;
      status: number;
      json: any;
      text: string;
      error?: { name?: string; code?: string; message?: string };
    }>((resolve) => {
      const u = new URL(url);

      const req = https.request(
        {
          protocol: u.protocol,
          hostname: u.hostname,
          port: u.port ? Number(u.port) : undefined,
          path: `${u.pathname}${u.search}`,
          method: 'GET',
          headers: { accept: 'application/json' },
          family: 4,
          lookup: (hostname, options, cb) => {
            dns.lookup(hostname, { ...options, family: 4 }, cb);
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            let json: any = null;
            try {
              json = text ? JSON.parse(text) : null;
            } catch {
              json = null;
            }

            const status = res.statusCode ?? 0;
            resolve({ ok: status >= 200 && status < 300, status, json, text });
          });
        }
      );

      req.on('error', (err: any) => {
        resolve({
          ok: false,
          status: 0,
          json: null,
          text: '',
          error: {
            name: typeof err?.name === 'string' ? err.name : undefined,
            code: typeof err?.code === 'string' ? err.code : undefined,
            message: typeof err?.message === 'string' ? err.message : String(err),
          },
        });
      });

      req.setTimeout(timeoutMs, () => {
        try {
          req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }));
        } catch {
          req.destroy();
        }
      });

      req.end();
    });
  };

  type GoogleTokenInfo = {
    aud?: string;
    iss?: string;
    email?: string;
    email_verified?: string | boolean;
    name?: string;
    exp?: string | number;
    iat?: string | number;
    sub?: string;
  };

  const coerceBoolean = (v: unknown): boolean | undefined => {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') {
      if (v.toLowerCase() === 'true') return true;
      if (v.toLowerCase() === 'false') return false;
    }
    return undefined;
  };

  const coerceNumber = (v: unknown): number | undefined => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = Number.parseInt(v, 10);
      if (Number.isFinite(n)) return n;
    }
    return undefined;
  };

  const isAllowedIssuer = (iss: unknown): boolean => {
    return iss === 'https://accounts.google.com' || iss === 'accounts.google.com';
  };

  const verifyViaTokenInfo = async (idToken: string) => {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    let ok: boolean;
    let status: number;
    let json: any;
    let text: string;

    try {
      const res = await getJsonOverHttpsIPv4(url, 3500);
      ok = res.ok;
      status = res.status;
      json = res.json;
      text = res.text;
    } catch (error: any) {
      // Network / DNS / TLS errors should not hard-fail Google login because
      // we can still validate the JWT via google-auth-library (certs endpoint).
      const message =
        typeof error?.message === 'string' && error.message
          ? error.message.slice(0, 300)
          : 'tokeninfo_fetch_failed';
      return { ok: false as const, status: 0, message };
    }

    if (!ok) {
      const message = typeof text === 'string' && text ? text.slice(0, 300) : undefined;
      return { ok: false as const, status, message };
    }

    const info = (json || {}) as GoogleTokenInfo;
    const aud = info.aud;
    const iss = info.iss;
    const email = info.email;
    const emailVerified = coerceBoolean(info.email_verified);
    const exp = coerceNumber(info.exp);
    const iat = coerceNumber(info.iat);

    if (!aud || !allowedAudiences.includes(aud)) {
      return { ok: false as const, status: 401, message: 'audience_mismatch' };
    }

    if (!isAllowedIssuer(iss)) {
      return { ok: false as const, status: 401, message: 'issuer_mismatch' };
    }

    if (!email) {
      return { ok: false as const, status: 400, message: 'token_missing_email' };
    }

    if (emailVerified === false) {
      return { ok: false as const, status: 401, message: 'email_not_verified' };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof exp === 'number' && exp < nowSec - 30) {
      return { ok: false as const, status: 401, message: 'token_expired' };
    }

    if (typeof iat === 'number' && iat > nowSec + 300) {
      return { ok: false as const, status: 401, message: 'token_not_yet_valid' };
    }

    const displayName = info.name || email;
    return {
      ok: true as const,
      payload: {
        email,
        email_verified: emailVerified,
        name: displayName,
        aud,
        iss,
      },
    };
  };

  const tryDecodeJwtPayload = (token: string): Record<string, unknown> | null => {
    try {
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const payload = parts[1]
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
      const json = Buffer.from(padded, 'base64').toString('utf8');
      return JSON.parse(json);
    } catch {
      return null;
    }
  };

  const classifyGoogleVerifyError = (message: string): string => {
    if (/aud|audience|Wrong recipient|recipient/i.test(message)) return 'audience_mismatch';
    if (/expired|expir/i.test(message)) return 'token_expired';
    if (/used too early|not active|nbf|iat/i.test(message)) return 'token_not_yet_valid';
    if (
      /cert|certificate|public keys|jwks|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|fetch/i.test(
        message
      )
    ) {
      return 'cert_fetch_failed';
    }
    return 'unknown';
  };

  const classifyByErrorCode = (code: string | undefined): string | undefined => {
    if (!code) return undefined;
    if (code === 'ECONNREFUSED') return 'network_refused';
    if (code === 'ETIMEDOUT') return 'network_timeout';
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dns_failed';
    return undefined;
  };

  const getBuildCommit = (): string | undefined => {
    return (
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      process.env.GITHUB_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      undefined
    );
  };

  app.post('/api/auth/register', async (req: Request, res: Response) => {
    const payload = registerSchema.safeParse(req.body);
    if (!payload.success) {
      return res.status(400).json({ errors: payload.error.flatten() });
    }

    try {
      const result = await authService.register(
        payload.data.email,
        payload.data.password,
        payload.data.displayName
      );

      captureServerEvent('user_registered', result.user.id, {
        email: result.user.email,
        displayName: result.user.displayName,
        method: 'password',
      });

      res.status(201).json(result);
    } catch (error: any) {
      if (error.message === 'User already exists') {
        return res.status(409).json({ error: 'User already exists' });
      }
      console.error('Registration failed', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const payload = loginSchema.safeParse(req.body);
    if (!payload.success) {
      return res.status(400).json({ errors: payload.error.flatten() });
    }

    try {
      const result = await authService.login(payload.data.email, payload.data.password);

      captureServerEvent('user_logged_in', result.user.id, {
        email: result.user.email,
        displayName: result.user.displayName,
        method: 'password',
      });

      res.json(result);
    } catch (error: any) {
      if (error.message === 'Invalid credentials') {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      console.error('Login failed', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/auth/google', async (req: Request, res: Response) => {
    const payload = googleAuthSchema.safeParse(req.body);
    if (!payload.success) {
      return res.status(400).json({ errors: payload.error.flatten() });
    }

    if (allowedAudiences.length === 0) {
      return res.status(503).json({
        error: 'Google OAuth is not configured (missing GOOGLE_CLIENT_ID)',
      });
    }

    try {
      // Prefer tokeninfo endpoint first (uses oauth2.googleapis.com). In some hosted environments
      // google-auth-library fails to fetch certs/JWKS with ECONNREFUSED.
      const tokenInfo = await verifyViaTokenInfo(payload.data.credential);

      let email: string | undefined;
      let displayName: string | undefined;

      if (tokenInfo.ok) {
        email = tokenInfo.payload.email;
        displayName = tokenInfo.payload.name;
      } else {
        // Fallback to local JWT verification via Google's certs
        const ticket = await oauthClient.verifyIdToken({
          idToken: payload.data.credential,
          audience: allowedAudiences,
        });

        const tokenPayload = ticket.getPayload();
        if (!tokenPayload?.email) {
          return res.status(400).json({ error: 'Google token missing email' });
        }

        if (tokenPayload.email_verified === false) {
          return res.status(401).json({ error: 'Google email not verified' });
        }

        email = tokenPayload.email;
        displayName = tokenPayload.name || tokenPayload.email;
      }

      if (!email || !displayName) {
        return res.status(401).json({ error: 'Invalid Google token' });
      }

      const result = await authService.loginWithGoogle(email, displayName);

      captureServerEvent('user_logged_in', result.user.id, {
        email: result.user.email,
        displayName: result.user.displayName,
        method: 'google',
      });

      res.json(result);
    } catch (error: any) {
      const decoded = tryDecodeJwtPayload(payload.data.credential);
      const decodedAud =
        decoded && typeof decoded === 'object' ? (decoded as any).aud : undefined;
      const decodedIss =
        decoded && typeof decoded === 'object' ? (decoded as any).iss : undefined;
      const decodedIat =
        decoded && typeof decoded === 'object' ? (decoded as any).iat : undefined;
      const decodedExp =
        decoded && typeof decoded === 'object' ? (decoded as any).exp : undefined;

      console.error('Google login failed', {
        message: error?.message,
        name: error?.name,
        aud: decodedAud,
        iss: decodedIss,
      });

      const message = typeof error?.message === 'string' ? error.message : '';
      const reason = classifyGoogleVerifyError(message);
      const hint = reason === 'audience_mismatch' ? ' (client id mismatch)' : '';

      const fallbackString = (() => {
        try {
          return String(error);
        } catch {
          return '';
        }
      })();

      const safeMessage = (message || fallbackString || '').slice(0, 500) || undefined;
      const safeName = typeof error?.name === 'string' ? error.name : undefined;
      const safeCode = typeof error?.code === 'string' ? error.code : undefined;

      res.status(401).json({
        error: `Invalid Google token${hint}`,
        details: {
          reason: classifyByErrorCode(safeCode) ?? reason,
          message: safeMessage,
          errorName: safeName,
          errorCode: safeCode,
          buildCommit: getBuildCommit(),
          tokenAud: decodedAud,
          tokenIss: decodedIss,
          tokenIat: decodedIat,
          tokenExp: decodedExp,
          serverTime: new Date().toISOString(),
          expectedAudiences: allowedAudiences,
          proxy: {
            httpProxySet: Boolean(process.env.HTTP_PROXY || process.env.http_proxy),
            httpsProxySet: Boolean(process.env.HTTPS_PROXY || process.env.https_proxy),
            noProxySet: Boolean(process.env.NO_PROXY || process.env.no_proxy),
          },
        },
      });
    }
  });
}
