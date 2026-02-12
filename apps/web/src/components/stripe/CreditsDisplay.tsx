/**
 * CreditsDisplay Component
 * 
 * Shows the user's current AI credits balance.
 */

import { useCredits } from '../../hooks/useStripe';

interface CreditsDisplayProps {
  compact?: boolean;
}

export function CreditsDisplay({ compact = false }: CreditsDisplayProps) {
  const { credits, loading } = useCredits();

  if (loading || !credits) {
    return (
      <div className={`animate-pulse ${compact ? 'h-6 w-16' : 'h-10 w-24'} bg-gray-200 rounded`} />
    );
  }

  const formatResetTime = (resetAt: string | null) => {
    if (!resetAt) return null;
    const date = new Date(resetAt);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffHours > 0) {
      return `${diffHours}h ${diffMinutes}m`;
    }
    return `${diffMinutes}m`;
  };

  const resetTimeStr = formatResetTime(credits.resetAt);

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 text-sm">
        <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
          <path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" />
        </svg>
        <span className="font-medium text-gray-700">{credits.available}</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
            <path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" />
          </svg>
          <span className="text-sm font-medium text-gray-500">Crédits IA</span>
        </div>
        <span className="text-2xl font-bold text-gray-900">{credits.available}</span>
      </div>
      
      {credits.plan === 'free' && resetTimeStr && (
        <p className="mt-2 text-xs text-gray-500">
          Renouvellement dans {resetTimeStr}
        </p>
      )}
      
      {credits.available === 0 && (
        <div className="mt-3 p-2 bg-amber-50 rounded-md">
          <p className="text-xs text-amber-700">
            Plus de crédits disponibles. 
            {credits.plan === 'free' 
              ? ' Passez à Pro pour plus de crédits !' 
              : ' Achetez des crédits supplémentaires.'}
          </p>
        </div>
      )}
    </div>
  );
}
