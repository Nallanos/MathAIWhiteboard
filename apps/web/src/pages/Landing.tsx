import { Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import whiteboardImg from '../assets/whiteboard.png';
import { apiFetch } from '../lib/api';

const FRANCOPHONE_LANGUAGES = ['fr', 'fr-FR', 'fr-CA', 'fr-BE', 'fr-CH'];

function detectFrancophone(): boolean {
  return false; // Default to English
}

const content = {
  fr: {
    headline: 'Bloqué sur un exo ?',
    subheadline: "L'IA qui te guide sans te donner la réponse.",
    cta: 'Essayer gratuitement',
    howItWorks: 'Comment ça marche',
    step1Title: 'Tu écris',
    step1Desc: 'Travaille sur le tableau comme sur une feuille.',
    step2Title: "L'IA observe",
    step2Desc: 'Elle analyse ton raisonnement en temps réel.',
    step3Title: 'Elle te relance',
    step3Desc: 'Des questions ciblées pour débloquer ta réflexion.',
    forWho: 'Pour qui ?',
    audience1: 'Collège · Lycée · Fac',
    audience2: 'Maths · Physique · Info',
    audience3: 'Ceux qui veulent comprendre, pas copier.',
    beta: 'Beta gratuite',
    betaDesc: 'On cherche des retours. Ton avis compte.',
  },
  en: {
    headline: 'Stuck on a problem?',
    subheadline: 'AI that guides you without giving the answer.',
    cta: 'Try for free',
    howItWorks: 'How it works',
    step1Title: 'You write',
    step1Desc: 'Work on the board like you would on paper.',
    step2Title: 'AI observes',
    step2Desc: 'It analyzes your reasoning in real-time.',
    step3Title: 'It guides you',
    step3Desc: 'Targeted questions to unblock your thinking.',
    forWho: 'Who is it for?',
    audience1: 'Middle school · High school · College',
    audience2: 'Math · Physics · CS',
    audience3: 'Those who want to understand, not copy.',
    beta: 'Free beta',
    betaDesc: "We're looking for feedback. Your opinion matters.",
  },
};

export function Landing() {
  const fallbackLocale = useMemo((): 'fr' | 'en' => (detectFrancophone() ? 'fr' : 'en'), []);
  const [locale, setLocale] = useState<'fr' | 'en'>(fallbackLocale);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await apiFetch('/api/locale', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { locale?: unknown };
        const next = data?.locale;
        if (cancelled) return;
        if (next === 'fr' || next === 'en') {
          setLocale(next);
        }
      } catch {
        // ignore; keep fallback
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const t = locale === 'fr' ? content.fr : content.en;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 overflow-x-hidden">
      {/* Hero Section - Above the fold */}
      <section className="min-h-[100svh] flex flex-col justify-center px-5 py-12 sm:py-16">
        <div className="max-w-4xl mx-auto w-full">
          {/* Badge */}
          <div className="mb-6 sm:mb-8">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-xs sm:text-sm font-medium">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              {t.beta}
            </span>
          </div>

          {/* Headline - Dominant element */}
          <h1 className="text-[2.5rem] sm:text-6xl lg:text-7xl font-bold leading-[1.1] tracking-tight text-slate-900">
            {t.headline}
          </h1>

          {/* Subheadline */}
          <p className="mt-4 sm:mt-6 text-lg sm:text-xl lg:text-2xl text-slate-600 max-w-xl leading-relaxed">
            {t.subheadline}
          </p>

          {/* Single CTA - High contrast */}
          <div className="mt-8 sm:mt-10">
            <Link
              to="/app"
              className="inline-flex items-center justify-center w-full sm:w-auto px-8 py-4 text-base sm:text-lg font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all duration-200 shadow-lg shadow-indigo-600/20 hover:shadow-indigo-500/25 hover:scale-[1.02] active:scale-[0.98]"
            >
              {t.cta}
              <svg className="ml-2 w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>

          {/* Product Screenshot - Visual proof - ZOOMED */}
          <div className="mt-12 sm:mt-16 relative -mx-5 sm:mx-0">
            <div className="relative rounded-xl sm:rounded-2xl overflow-hidden border border-slate-200 shadow-2xl shadow-slate-900/10 bg-white">
              <img
                src={whiteboardImg}
                alt="Whiteboard AI interface"
                className="w-full h-auto scale-110 origin-top-left sm:scale-100"
                loading="eager"
              />
            </div>
          </div>
        </div>
      </section>

      {/* How it works - Scannable */}
      <section className="py-16 sm:py-24 px-5 bg-white border-y border-slate-100">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-sm font-semibold text-indigo-600 uppercase tracking-wider mb-8 sm:mb-12">
            {t.howItWorks}
          </h2>

          <div className="grid gap-8 sm:gap-6 sm:grid-cols-3">
            {/* Step 1 */}
            <div className="flex sm:flex-col gap-4 sm:gap-3">
              <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                <span className="text-indigo-600 text-lg sm:text-xl font-bold">1</span>
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-semibold text-slate-900">{t.step1Title}</h3>
                <p className="mt-1 sm:mt-2 text-slate-600 text-sm sm:text-base leading-relaxed">{t.step1Desc}</p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex sm:flex-col gap-4 sm:gap-3">
              <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                <span className="text-indigo-600 text-lg sm:text-xl font-bold">2</span>
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-semibold text-slate-900">{t.step2Title}</h3>
                <p className="mt-1 sm:mt-2 text-slate-600 text-sm sm:text-base leading-relaxed">{t.step2Desc}</p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex sm:flex-col gap-4 sm:gap-3">
              <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                <span className="text-indigo-600 text-lg sm:text-xl font-bold">3</span>
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-semibold text-slate-900">{t.step3Title}</h3>
                <p className="mt-1 sm:mt-2 text-slate-600 text-sm sm:text-base leading-relaxed">{t.step3Desc}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* For who - Quick scan */}
      <section className="py-16 sm:py-24 px-5">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-sm font-semibold text-indigo-600 uppercase tracking-wider mb-8 sm:mb-10">
            {t.forWho}
          </h2>

          <div className="space-y-4 sm:space-y-5">
            <p className="text-xl sm:text-2xl lg:text-3xl font-medium text-slate-900">{t.audience1}</p>
            <p className="text-xl sm:text-2xl lg:text-3xl font-medium text-slate-500">{t.audience2}</p>
            <p className="text-xl sm:text-2xl lg:text-3xl font-medium text-slate-400">{t.audience3}</p>
          </div>
        </div>
      </section>

      {/* Final CTA - Full width on mobile */}
      <section className="py-16 sm:py-24 px-5 bg-white border-t border-slate-100">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-slate-600 text-sm sm:text-base mb-6 sm:mb-8">
            {t.betaDesc}
          </p>
          <Link
            to="/app"
            className="inline-flex items-center justify-center w-full sm:w-auto px-10 py-4 text-base sm:text-lg font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all duration-200 shadow-lg shadow-indigo-600/20 hover:shadow-indigo-500/25 hover:scale-[1.02] active:scale-[0.98]"
          >
            {t.cta}
            <svg className="ml-2 w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </section>

      {/* Minimal footer */}
      <footer className="py-8 px-5 border-t border-slate-100">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs text-slate-400">
            © {new Date().getFullYear()} WhiteboardAI
          </p>
        </div>
      </footer>
    </div>
  );
}
