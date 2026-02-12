/**
 * Login Page
 *
 * Public page for user authentication.
 * Redirects to dashboard on successful login.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useAuth } from '../context/AuthContext';
import { env } from '../lib/env';
import { DiscordLoginButton } from '../components/DiscordLoginButton';
import { apiFetch } from '../lib/api';

declare global {
  interface Window {
    google?: any;
  }
}

export function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [discordLoading, setDiscordLoading] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const search = useSearch({ from: '/login' }) as { token?: string };

  useEffect(() => {
    const handleUrlToken = async () => {
      if (search.token) {
        setDiscordLoading(true);
        try {
          const res = await apiFetch('/api/me', { token: search.token });
          if (!res.ok) throw new Error('Failed to verify token');
          
          const data = await res.json();
          login(search.token, data.user);
          navigate({ to: '/app' });
        } catch (err: any) {
          setError(err.message);
          // Remove token from URL to avoid repeating the error
          navigate({ to: '/login', search: { token: undefined }, replace: true });
        } finally {
          setDiscordLoading(false);
        }
      }
    };

    handleUrlToken();
  }, [search.token, login, navigate]);

  const handleGoogleCredential = useCallback(
    async (credential: string) => {
      setError('');
      setGoogleLoading(true);
      try {
        const res = await fetch(`${env.backendUrl}/api/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Google login failed');
        }

        login(data.token, data.user);
        navigate({ to: '/app' });
      } catch (err: any) {
        setError(err.message);
      } finally {
        setGoogleLoading(false);
      }
    },
    [login, navigate]
  );

  useEffect(() => {
    if (!env.googleClientId) return;

    const scriptId = 'google-identity-services';

    const initializeGoogle = () => {
      if (!window.google || !googleButtonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: env.googleClientId,
        callback: (response: { credential?: string }) => {
          if (response.credential) {
            handleGoogleCredential(response.credential);
          }
        },
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        width: '100%',
      });
    };

    const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (existingScript) {
      if (existingScript.dataset.loaded) {
        initializeGoogle();
      } else {
        existingScript.addEventListener('load', initializeGoogle, { once: true });
      }
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.id = scriptId;
    script.dataset.loaded = 'false';
    script.onload = () => {
      script.dataset.loaded = 'true';
      initializeGoogle();
    };
    document.body.appendChild(script);

    return () => {
      script.onload = null;
    };
  }, [handleGoogleCredential]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
            Continue to WhiteboardAI
          </h2>
        </div>
        <div className="mt-8 space-y-6">
          <p className="text-center text-sm text-gray-600">
            Email authentication is temporarily disabled.
          </p>

          {error && <div className="text-red-500 text-sm text-center">{error}</div>}

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs uppercase tracking-wide text-gray-400">sign in with</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <div className="space-y-3 max-w-[320px] mx-auto w-full">
            <div className="w-full">
              {env.googleClientId ? (
                <div ref={googleButtonRef} className="w-full min-h-[40px]" aria-busy={googleLoading} />
              ) : (
                <div className="rounded-md bg-gray-100 px-3 py-2 text-center text-sm text-gray-500 w-full">
                  Google login unavailable
                </div>
              )}
            </div>
            
            <DiscordLoginButton loading={discordLoading || googleLoading} />
          </div>

        </div>
      </div>
    </div>
  );
}
