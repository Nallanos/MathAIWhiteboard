interface Props {
  boardId: string;
  peerCount: number;
}

export function CollaborationStatus({ boardId, peerCount }: Props) {
  return (
    <div className="absolute left-4 top-4 flex items-center gap-3 rounded-full bg-slate-900/80 px-4 py-2 text-xs text-white shadow-lg">
      <span className="font-semibold">Board: {boardId}</span>
      <span className="text-slate-300">{peerCount} en ligne</span>
    </div>
  );
}
