import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';

export function VerificationBanner() {
  const { user, token, refreshMe } = useAuth();
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!user || user.emailVerified) return null;

  const resendVerification = async () => {
    if (loading || sent) return;
    setLoading(true);
    try {
      const response = await apiFetch('/api/email/resend-verification', {
        method: 'POST',
        token
      });

      if (response.ok) {
        setSent(true);
        return;
      }

      if (response.status === 400) {
        const payload = await response.json().catch(() => null);
        if (payload?.error === 'Email already verified') {
          await refreshMe();
          return;
        }
      }

      throw new Error(`Resend failed with status ${response.status}`);
    } catch (err) {
      console.error('Failed to resend verification email', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-amber-800">
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <p>
            Votre email <strong>{user.email}</strong> n'est pas encore vérifié.
          </p>
        </div>
        <button
          onClick={resendVerification}
          disabled={loading || sent}
          className="font-medium underline hover:text-amber-600 disabled:opacity-50 disabled:no-underline"
        >
          {loading ? 'Envoi...' : sent ? 'Email envoyé !' : 'Renvoyer le lien de vérification'}
        </button>
      </div>
    </div>
  );
}
