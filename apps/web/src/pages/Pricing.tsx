import React, { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { PricingCard } from '../components/stripe/PricingCard';
import { useOptionalAuth } from '../context/AuthContext';
import { useCheckout, useTopUpPackages } from '../hooks/useStripe';

export default function PricingPage() {
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly');
  const auth = useOptionalAuth();
  const user = auth?.user ?? null;
  const isAuthenticated = auth?.isAuthenticated ?? false;
  const navigate = useNavigate();
  const { packages, loading: topupLoading, error: topupError } = useTopUpPackages();
  const { startCheckout, loading: checkoutLoading } = useCheckout();

  const handleLoginRequired = () => {
    navigate({ to: '/login', search: { token: undefined } });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="relative overflow-hidden border-b border-slate-200 bg-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.12),_transparent_60%)]" />
        <div className="relative mx-auto max-w-6xl px-6 py-12 sm:py-16">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Pricing</p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Simple plans for focused learning
              </h1>
              <p className="mt-3 max-w-2xl text-base text-slate-600 sm:text-lg">
                Pick the plan that matches your study pace. Upgrade any time.
              </p>
            </div>
            <Link
              to="/app"
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              Back to app
            </Link>
          </div>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <div className="relative flex rounded-full bg-slate-100 p-1">
              <button
                onClick={() => setBillingInterval('monthly')}
                className={`${
                  billingInterval === 'monthly'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                } rounded-full px-5 py-2 text-sm font-semibold transition`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingInterval('yearly')}
                className={`${
                  billingInterval === 'yearly'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                } rounded-full px-5 py-2 text-sm font-semibold transition`}
              >
                Yearly
              </button>
            </div>
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Switch any time
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <PricingCard
            plan="free"
            isCurrentPlan={user?.plan === 'free' || !isAuthenticated}
            billingCycle={billingInterval}
            isAuthenticated={isAuthenticated}
            onLoginRequired={handleLoginRequired}
          />

          <PricingCard
            plan="pro"
            isCurrentPlan={user?.plan === 'pro'}
            billingCycle={billingInterval}
            isAuthenticated={isAuthenticated}
            onLoginRequired={handleLoginRequired}
          />
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
            <h2 className="text-lg font-semibold text-slate-900">Buy credits (no subscription)</h2>
            <p className="mt-2 text-sm text-slate-600">
              Prefer not to subscribe? Grab a one-off credits pack and keep full access until you run out.
            </p>
            <div className="mt-4">
              {topupLoading && (
                <p className="text-xs text-slate-500">Loading credit packs...</p>
              )}
              {topupError && (
                <p className="text-xs text-red-600">Unable to load credit packs right now.</p>
              )}
              {!topupLoading && !topupError && packages.length === 0 && (
                <p className="text-xs text-slate-500">No credit packs available yet.</p>
              )}
              <div className="mt-3 flex flex-wrap gap-3">
                {packages.map((pack) => (
                  <button
                    key={pack.id}
                    onClick={() => {
                      if (!isAuthenticated) {
                        handleLoginRequired();
                        return;
                      }
                      startCheckout(pack.stripePriceId, 'payment');
                    }}
                    disabled={!isAuthenticated || checkoutLoading}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-60"
                  >
                    <span>{pack.credits} credits</span>
                    <span className="text-slate-400">•</span>
                    <span>{(pack.priceInCents / 100).toFixed(2)} {pack.currency.toUpperCase()}</span>
                  </button>
                ))}
              </div>
              {!isAuthenticated && (
                <p className="mt-3 text-xs text-slate-500">
                  Log in to purchase credits.
                </p>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">Buy credits in the app</p>
              <p className="mt-2 text-sm text-slate-600">
                You can purchase credits from your dashboard whenever you need them.
              </p>
            </div>
            <Link
              to="/app"
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
            >
              Go to dashboard
            </Link>
          </div>
        </div>

        <div className="mt-12 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          <p>
            All plans include the core whiteboard experience and real-time collaboration. Stripe checkout handles
            billing securely. You can cancel at any time.
          </p>
          <p className="mt-2">
            Need more AI credits later? You can top up directly from your dashboard.
          </p>
        </div>
      </div>
    </div>
  );
}
