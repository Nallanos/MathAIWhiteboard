/**
 * Stripe Hooks
 * 
 * React hooks for Stripe subscription and credits management.
 */

import { useState, useCallback, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import type { SubscriptionState, CreditsState, TopUpPackage } from '@mathboard/shared';

/**
 * Hook to manage subscription state
 */
export function useSubscription() {
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscription = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('authToken');
      const response = await apiFetch('/api/stripe/subscription', { token });
      
      if (response.ok) {
        const data = await response.json();
        setSubscription(data);
      } else {
        throw new Error('Failed to fetch subscription');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  return {
    subscription,
    loading,
    error,
    refetch: fetchSubscription
  };
}

/**
 * Hook to manage credits state
 */
export function useCredits() {
  const [credits, setCredits] = useState<CreditsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCredits = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('authToken');
      const response = await apiFetch('/api/me/credits', { token });
      
      if (response.ok) {
        const data = await response.json();
        setCredits(data);
      } else {
        throw new Error('Failed to fetch credits');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCredits();
    
    // Refresh credits every 30 seconds
    const interval = setInterval(fetchCredits, 30000);
    return () => clearInterval(interval);
  }, [fetchCredits]);

  return {
    credits,
    loading,
    error,
    refetch: fetchCredits
  };
}

/**
 * Hook to handle checkout flow
 */
export function useCheckout() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCheckout = useCallback(async (
    priceId: string,
    mode: 'subscription' | 'payment'
  ) => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('authToken');
      const response = await apiFetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        token,
        body: JSON.stringify({
          priceId,
          mode,
          successUrl: `${window.location.origin}/settings/billing`,
          cancelUrl: `${window.location.origin}/app`
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLoading(false);
    }
  }, []);

  return {
    startCheckout,
    loading,
    error
  };
}

/**
 * Hook to handle customer portal
 */
export function useCustomerPortal() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openPortal = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('authToken');
      const response = await apiFetch('/api/stripe/portal', {
        method: 'POST',
        token
      });

      if (!response.ok) {
        throw new Error('Failed to create portal session');
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLoading(false);
    }
  }, []);

  return {
    openPortal,
    loading,
    error
  };
}

/**
 * Hook to fetch available top-up packages
 */
export function useTopUpPackages() {
  const [packages, setPackages] = useState<TopUpPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPackages() {
      try {
        const response = await apiFetch('/api/stripe/topups');
        
        if (response.ok) {
          const data = await response.json();
          setPackages(data);
        } else {
          throw new Error('Failed to fetch top-up packages');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchPackages();
  }, []);

  return {
    packages,
    loading,
    error
  };
}

/**
 * Hook to handle payment success callback
 */
export function usePaymentSuccess() {
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    const success = urlParams.get('success');

    if (success === 'true' && sessionId) {
      setStatus('pending');
      
      // Poll for subscription update
      let attempts = 0;
      const maxAttempts = 10;
      
      const checkSubscription = async () => {
        try {
          const token = localStorage.getItem('authToken');
          const response = await apiFetch('/api/stripe/subscription', { token });
          
          if (response.ok) {
            const data = await response.json();
            if (data.status === 'active' || data.status === 'trialing') {
              setStatus('success');
              // Clean up URL
              window.history.replaceState({}, '', window.location.pathname);
              return;
            }
          }
          
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(checkSubscription, 2000);
          } else {
            setStatus('success'); // Assume success after timeout
            window.history.replaceState({}, '', window.location.pathname);
          }
        } catch {
          setStatus('error');
        }
      };

      checkSubscription();
    }
  }, []);

  return { status };
}
