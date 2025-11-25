import { useEffect, useState } from 'react';
import { env } from '../lib/env';
import { useAuth } from '../context/AuthContext';

interface Board {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  updatedAt: string;
}

export function Dashboard({ onSelectBoard }: { onSelectBoard: (id: string) => void }) {
  const { token, user, logout } = useAuth();
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!token) return;

    fetch(`${env.backendUrl}/api/boards`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.boards) {
          setBoards(data.boards);
        }
      })
      .catch((err) => console.error('Failed to load boards', err))
      .finally(() => setLoading(false));
  }, [token]);

  const createBoard = async () => {
    setCreating(true);
    try {
      const res = await fetch(`${env.backendUrl}/api/boards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ title: 'Untitled Board' })
      });
      const data = await res.json();
      if (data.board?.id) {
        onSelectBoard(data.board.id);
      }
    } catch (e) {
      console.error('Failed to create board', e);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center">Loading boards...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">My Whiteboards</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">Welcome, {user?.displayName}</span>
            <button
              onClick={logout}
              className="text-sm font-semibold text-indigo-600 hover:text-indigo-500"
            >
              Logout
            </button>
          </div>
        </div>
      </header>
      <main>
        <div className="mx-auto max-w-7xl py-6 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {/* Create New Card */}
            <button
              onClick={createBoard}
              disabled={creating}
              className="group relative flex h-64 flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white hover:border-indigo-500 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              <div className="text-center">
                <span className="block text-4xl text-gray-400 group-hover:text-indigo-500">+</span>
                <span className="mt-2 block text-sm font-semibold text-gray-900">
                  {creating ? 'Creating...' : 'Create New Board'}
                </span>
              </div>
            </button>

            {/* Board Cards */}
            {boards.map((board) => (
              <div
                key={board.id}
                className="group relative flex h-64 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                <div 
                  onClick={() => onSelectBoard(board.id)}
                  className="flex-1 bg-gray-100 cursor-pointer overflow-hidden"
                >
                  {board.thumbnailUrl ? (
                    <img
                      src={board.thumbnailUrl}
                      alt={board.title}
                      className="h-full w-full object-contain bg-white"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-gray-400">
                      No Preview
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between border-t border-gray-100 p-4 bg-white">
                  <div className="min-w-0 flex-1 mr-2">
                    <h3 className="text-sm font-medium text-gray-900 truncate">{board.title}</h3>
                    <p className="text-xs text-gray-500">
                      {new Date(board.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Are you sure you want to delete this board?')) {
                        fetch(`${env.backendUrl}/api/boards/${board.id}`, {
                          method: 'DELETE',
                          headers: { Authorization: `Bearer ${token}` }
                        })
                          .then((res) => {
                            if (res.ok) {
                              setBoards((prev) => prev.filter((b) => b.id !== board.id));
                            }
                          })
                          .catch((err) => console.error('Failed to delete board', err));
                      }
                    }}
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    title="Delete board"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
