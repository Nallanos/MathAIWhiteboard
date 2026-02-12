import { useEffect, useRef, useState } from 'react';

interface Props {
  boardId: string;
  peerCount: number;
}

export function CollaborationStatus({ boardId, peerCount }: Props) {
  const inviteUrl = `${window.location.origin}/app/board/${encodeURIComponent(boardId)}`;
  const [inviteCopied, setInviteCopied] = useState(false);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }
    };
  }, []);

  const handleInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
    } catch {
      // Fallback for environments without clipboard permission.
      const ta = document.createElement('textarea');
      ta.value = inviteUrl;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }

    setInviteCopied(true);
    if (copiedTimeoutRef.current) {
      clearTimeout(copiedTimeoutRef.current);
    }
    copiedTimeoutRef.current = setTimeout(() => setInviteCopied(false), 1200);
  };

  return (
    <div className="absolute right-4 top-16 z-20 flex items-center gap-3 rounded-full bg-slate-900/80 px-4 py-2 text-xs text-white shadow-lg">
      <span className="font-semibold">Board: {boardId}</span>
      <span className="text-slate-300">{peerCount} online</span>
      <button
        type="button"
        onClick={handleInvite}
        className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white hover:bg-white/20"
      >
        {inviteCopied ? 'Link copied' : 'Invite'}
      </button>
    </div>
  );
}
