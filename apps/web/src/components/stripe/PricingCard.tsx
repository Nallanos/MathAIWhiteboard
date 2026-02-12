/**
 * PricingCard Component
 * 
 * Displays a subscription plan with pricing and features.
 */

import { useState } from 'react';
import { PLAN_CONFIGS, type SubscriptionPlan } from '@mathboard/shared';
import { useCheckout } from '../../hooks/useStripe';
import { env } from '../../lib/env';

interface PricingCardProps {
  plan: SubscriptionPlan;
  isCurrentPlan: boolean;
  billingCycle: 'monthly' | 'yearly';
  isAuthenticated: boolean;
  onLoginRequired: () => void;
}

export function PricingCard({ 
  plan, 
  isCurrentPlan, 
  billingCycle,
  isAuthenticated,
  onLoginRequired
}: PricingCardProps) {
  const { startCheckout, loading } = useCheckout();
  const config = PLAN_CONFIGS[plan];

  const getPriceId = () => {
    if (billingCycle === 'monthly') {
      return env.stripeProMonthlyPriceId;
    }
    return env.stripeProYearlyPriceId;
  };

  const handleSubscribe = async () => {
    if (!isAuthenticated) {
      onLoginRequired();
      return;
    }

    const priceId = getPriceId();
    if (priceId) {
      await startCheckout(priceId, 'subscription');
    }
  };

  const price = billingCycle === 'monthly' 
    ? config.priceMonthly 
    : config.priceYearly;
  
  const monthlyPrice = billingCycle === 'yearly' 
    ? Math.round(config.priceYearly / 12) 
    : config.priceMonthly;

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(cents / 100);
  };

  if (plan === 'free') {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <h3 className="text-2xl font-bold text-gray-900">{config.name}</h3>
        <p className="mt-4 text-4xl font-bold text-gray-900">Free</p>
        <p className="mt-2 text-sm text-gray-500">Forever</p>
        
        <ul className="mt-8 space-y-4">
          <FeatureItem included>{config.features.aiCreditsPerDay} AI credits per day</FeatureItem>
          <FeatureItem included>Core whiteboard tools</FeatureItem>
          <FeatureItem included>Real-time collaboration</FeatureItem>
          <FeatureItem included={false}>Advanced AI models</FeatureItem>
          <FeatureItem included={false}>Priority support</FeatureItem>
        </ul>

        {isCurrentPlan && (
          <div className="mt-8">
            <span className="block w-full py-3 text-center text-sm font-medium text-gray-500 bg-gray-100 rounded-lg">
              Current plan
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl shadow-xl p-8 text-white relative overflow-hidden">
      {/* Popular badge */}
      <div className="absolute top-4 right-4">
        <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-3 py-1 rounded-full">
          MOST POPULAR
        </span>
      </div>

      <h3 className="text-2xl font-bold">{config.name}</h3>
      
      <div className="mt-4">
        <span className="text-4xl font-bold">{formatPrice(monthlyPrice)}</span>
        <span className="text-white/80">/month</span>
      </div>
      
      {billingCycle === 'yearly' && (
        <p className="mt-2 text-sm text-white/70">
          Billed {formatPrice(price)}/year
        </p>
      )}

      <ul className="mt-8 space-y-4">
        <FeatureItem included light>{config.features.aiCreditsPerMonth} AI credits per month</FeatureItem>
        <FeatureItem included light>Advanced AI models</FeatureItem>
        <FeatureItem included light>Priority support</FeatureItem>
        <FeatureItem included light>Team collaboration</FeatureItem>
      </ul>

      <div className="mt-8">
        {isCurrentPlan ? (
          <span className="block w-full py-3 text-center text-sm font-medium text-white/80 bg-white/20 rounded-lg">
            Current plan
          </span>
        ) : (
          <button
            onClick={handleSubscribe}
            disabled={loading}
            className="w-full py-3 text-center text-sm font-semibold text-indigo-600 bg-white rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Start free trial'}
          </button>
        )}
      </div>
    </div>
  );
}

interface FeatureItemProps {
  children: React.ReactNode;
  included: boolean;
  light?: boolean;
}

function FeatureItem({ children, included, light }: FeatureItemProps) {
  return (
    <li className="flex items-center gap-3">
      {included ? (
        <svg className={`w-5 h-5 ${light ? 'text-white' : 'text-green-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      <span className={included ? (light ? 'text-white' : 'text-gray-900') : 'text-gray-400'}>
        {children}
      </span>
    </li>
  );
}
