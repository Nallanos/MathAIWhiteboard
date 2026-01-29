import type { Express, Request, Response } from 'express';
import geoip from 'geoip-lite';

function getFirstHeaderValue(value: undefined | string | string[]): string | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

function normalizeIp(raw: string | undefined): string | undefined {
  if (!raw) return undefined;

  // X-Forwarded-For can be a list: client, proxy1, proxy2
  const first = raw.split(',')[0]?.trim();
  if (!first) return undefined;

  // Remove IPv6 brackets (rare, but can happen)
  const withoutBrackets = first.replace(/^\[(.*)\]$/, '$1');

  // Handle IPv6-mapped IPv4 addresses like ::ffff:1.2.3.4
  const v6MappedPrefix = '::ffff:';
  if (withoutBrackets.toLowerCase().startsWith(v6MappedPrefix)) {
    return withoutBrackets.slice(v6MappedPrefix.length);
  }

  return withoutBrackets;
}

function getClientIp(req: Request): string | undefined {
  const forwardedFor = getFirstHeaderValue(req.headers['x-forwarded-for']);
  const realIp = getFirstHeaderValue(req.headers['x-real-ip']);
  const cfConnectingIp = getFirstHeaderValue(req.headers['cf-connecting-ip']);

  // Prefer explicitly forwarded values; fall back to express-derived ip.
  return (
    normalizeIp(cfConnectingIp) ||
    normalizeIp(realIp) ||
    normalizeIp(forwardedFor) ||
    normalizeIp(req.ip) ||
    normalizeIp(req.socket?.remoteAddress)
  );
}

function getCountryFromHeaders(req: Request): string | undefined {
  const candidates = [
    'cf-ipcountry',
    'x-vercel-ip-country',
    'x-appengine-country',
    'cloudfront-viewer-country',
    'x-geo-country',
    'x-country-code',
    'x-country',
  ] as const;

  for (const key of candidates) {
    const v = getFirstHeaderValue(req.headers[key]);
    if (!v) continue;
    const upper = v.trim().toUpperCase();

    // Cloudflare uses "XX" when unknown
    if (upper.length === 2 && upper !== 'XX') return upper;
  }

  return undefined;
}

function localeFromAcceptLanguage(req: Request): 'fr' | 'en' {
  const header = getFirstHeaderValue(req.headers['accept-language']);
  if (!header) return 'en';

  // Very small heuristic: if French appears anywhere in the priority list.
  const normalized = header.toLowerCase();
  if (normalized.includes('fr')) return 'fr';
  return 'en';
}

function resolveLocale(req: Request): { locale: 'fr' | 'en'; country?: string; source: string } {
  const headerCountry = getCountryFromHeaders(req);
  if (headerCountry) {
    return {
      locale: headerCountry === 'FR' ? 'fr' : 'en',
      country: headerCountry,
      source: 'country_header',
    };
  }

  const ip = getClientIp(req);
  if (ip) {
    const geo = geoip.lookup(ip);
    const country = geo?.country?.toUpperCase();
    if (country) {
      return {
        locale: country === 'FR' ? 'fr' : 'en',
        country,
        source: 'geoip',
      };
    }
  }

  return { locale: localeFromAcceptLanguage(req), source: 'accept_language' };
}

export function registerLocaleRoutes({ app }: { app: Express }) {
  app.get('/api/locale', (req: Request, res: Response) => {
    const { locale, country, source } = resolveLocale(req);

    // Cache at the edge for a short time; IP-based results can vary by user.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');

    return res.status(200).json({ locale, country, source });
  });
}
