# MathBoard Web

React 18 + Vite shell that wraps the Excalidraw canvas and renders the AI sidebar/collaboration UI.

## Local development

```bash
npm install
npm --workspace apps/web run dev
```

## Forking Excalidraw

1. Fork https://github.com/excalidraw/excalidraw to your GitHub account.
2. Replace the npm dependency with your fork by pointing to the git URL in `package.json`, or add the fork as a git subtree inside `apps/web/excalidraw` and update import paths accordingly.
3. Keep MathBoard-specific components under `src` so upstream merges stay conflict-free.
``` bash
cd apps/web
git remote add upstream https://github.com/excalidraw/excalidraw.git
```
