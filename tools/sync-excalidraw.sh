#!/usr/bin/env bash
set -euo pipefail

FORK_REMOTE=${FORK_REMOTE:-origin}
UPSTREAM_REMOTE=${UPSTREAM_REMOTE:-upstream}
FORK_DIR="$(dirname "$0")/../apps/excalidraw"

if [[ ! -d "$FORK_DIR/.git" ]]; then
  echo "apps/excalidraw must be a git clone of your Excalidraw fork." >&2
  exit 1
fi

pushd "$FORK_DIR" >/dev/null

git fetch "$UPSTREAM_REMOTE"
git checkout main

git merge --no-edit "$UPSTREAM_REMOTE"/main || {
  echo "Merge conflicts detected. Please resolve them inside apps/web." >&2
  exit 1
}

git push "$FORK_REMOTE" main

popd >/dev/null

echo "Excalidraw fork synced successfully."
