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
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const search = useSearch({ from: '/login' }) as { token?: string };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
      const body = isRegister 
        ? { email, password, displayName } 
        : { email, password };

      const res = await fetch(`${env.backendUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || (data.errors ? 'Validation failed' : 'Authentication failed'));
      }

      login(data.token, data.user);
      navigate({ to: '/app' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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
            {isRegister ? 'Create an account' : 'Continue to WhiteboardAI'}
          </h2>
        </div>
        <div className="mt-8 space-y-6">
          <form className="space-y-4" onSubmit={handleSubmit}>
            {isRegister && (
              <div>
                <label htmlFor="displayName" className="sr-only">Display Name</label>
                <input
                  id="displayName"
                  type="text"
                  required={isRegister}
                  className="relative block w-full rounded-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6 px-3"
                  placeholder="Display Name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
            )}
            <div>
              <label htmlFor="email-address" className="sr-only">Email address</label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="relative block w-full rounded-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6 px-3"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="relative block w-full rounded-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6 px-3"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="group relative flex w-full justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
              >
                {loading ? 'Processing...' : (isRegister ? 'Sign up' : 'Sign in')}
              </button>
            </div>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setIsRegister(!isRegister)}
                className="text-sm text-blue-600 hover:text-blue-500"
              >
                {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
              </button>
            </div>
          </form>

          {error && <div className="text-red-500 text-sm text-center">{error}</div>}

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs uppercase tracking-wide text-gray-400">or continue with</span>
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
