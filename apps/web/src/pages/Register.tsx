/**
 * Register Page
 * 
 * Public page for user registration.
 * Redirects to dashboard on successful registration.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from '@tanstack/react-router';
import { useAuth } from '../context/AuthContext';
import { env } from '../lib/env';

declare global {
  interface Window {
    google?: any;
  }
}

export function Register() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${env.backendUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      login(data.token, data.user);
      navigate({ to: '/app' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleCredential = useCallback(async (credential: string) => {
    setError('');
    setGoogleLoading(true);
    try {
      const res = await fetch(`${env.backendUrl}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential })
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
  }, [login, navigate]);

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
        }
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        width: '100%'
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
  }, [handleGoogleCredential, env.googleClientId]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
            Créer un compte
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="-space-y-px rounded-md shadow-sm">
            <div>
              <input
                type="text"
                required
                className="relative block w-full rounded-t-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 px-3"
                placeholder="Nom d’affichage"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div>
              <input
                type="email"
                required
                className="relative block w-full border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 px-3"
                placeholder="Adresse e-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <input
                type="password"
                required
                className="relative block w-full rounded-b-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 px-3"
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && <div className="text-red-500 text-sm text-center">{error}</div>}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
            >
              {loading ? 'Création du compte…' : 'Créer un compte'}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs uppercase tracking-wide text-gray-400">ou</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <div>
            {env.googleClientId ? (
              <div ref={googleButtonRef} className="flex justify-center" aria-busy={googleLoading} />
            ) : (
              <div className="rounded-md bg-gray-100 px-3 py-2 text-center text-sm text-gray-500">
                Connexion Google non configurée
              </div>
            )}
          </div>
          
          <div className="text-center">
            <Link to="/login" className="text-sm text-indigo-600 hover:text-indigo-500">
              Déjà un compte ? Se connecter
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
