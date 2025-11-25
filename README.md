# MathBoard - AI-Powered Collaborative Whiteboard for Math

## 🎯 Product Vision

A digital whiteboard optimized for doing math homework with real-time AI guidance. Think Excalidraw + GPT-4 Vision + Google Docs collaboration.

**Core use case:** Student draws math problems on infinite canvas, AI copilot watches and provides hints/guidance in sidebar chat. Students can share links to collaborate in real-time.

**Target market:** French high school students (lycée), ages 15-18, doing math homework on iPad with Apple Pencil.

## 🏗️ Architecture Overview
```
Frontend (React + TypeScript)
├── Excalidraw (forked) - Canvas/drawing engine
├── AI Sidebar - Chat interface with Claude API
├── Collaboration - WebSockets for real-time sync
└── Auth/Storage - Supabase

Backend (Node.js + Express)
├── API routes for AI calls
├── WebSocket server (Socket.io)
├── Supabase client for DB
└── Stripe webhooks

Database (Supabase/Postgres)
├── users table
├── boards table (canvas state + metadata)
├── messages table (AI chat history)
└── subscriptions table
```

## 📋 MVP Features (Phase 1-3, ~10 weeks)

### Phase 1: Solo AI Whiteboard (Weeks 1-3)
- [ ] Fork Excalidraw repository
- [ ] Create AI Sidebar component (right side, 30% width)
- [ ] Screenshot canvas → send to Claude API
- [ ] Display AI response in chat interface
- [ ] Auto-capture every 10 seconds (optional toggle)
- [ ] Deploy to Vercel for testing on iPad

### Phase 2: Save & Auth (Weeks 4-7)
- [ ] Supabase auth (email/password)
- [ ] Save/load board state to database
- [ ] Board metadata (title, created_at, updated_at)
- [ ] List view of user's boards
- [ ] Export to PDF
- [ ] Chat history persistence

### Phase 3: Collaboration (Weeks 8-10)
- [ ] Generate shareable links (UUID)
- [ ] WebSocket server setup (Socket.io)
- [ ] Real-time drawing sync between users
- [ ] Real-time cursor positions + names
- [ ] Permissions (view-only vs can-edit)
- [ ] AI context awareness for multiple users

### Phase 4: Launch (Weeks 11-12)
- [ ] Landing page (Next.js)
- [ ] Pricing page (Free: 3 boards/day, Pro: 9.99€/month unlimited)
- [ ] Stripe checkout integration
- [ ] Freemium paywall logic
- [ ] Demo video (60s screen recording)
- [ ] Bug fixes & polish

## 🔧 Tech Stack

**Frontend:**
- React 18 + TypeScript
- Excalidraw library (forked)
- TailwindCSS for UI
- Zustand for state management
- Socket.io-client for real-time

**Backend:**
- Node.js + Express
- Socket.io for WebSockets
- Anthropic API (Claude 3.5 Sonnet)
- Stripe API
- Supabase client

**Infrastructure:**
- Frontend: Vercel
- Backend: Railway or Render
- Database: Supabase (Postgres)
- File storage: Supabase Storage (for canvas exports)

**APIs:**
- Anthropic Claude API (vision + text)
- Stripe (payments)
- Supabase (auth + db)

## 🚀 Setup Instructions

### Prerequisites
- Node.js 18+
- Yarn or npm
- Anthropic API key
- Supabase project
- Stripe account (for Phase 4)

### Installation
```bash
# Clone Excalidraw
git clone https://github.com/excalidraw/excalidraw.git mathboard
cd mathboard

# Install dependencies
yarn install

# Create .env.local
cp .env.example .env.local
# Add your API keys:
# VITE_ANTHROPIC_API_KEY=your_key
# VITE_SUPABASE_URL=your_url
# VITE_SUPABASE_ANON_KEY=your_key
```

### Development
```bash
# Start frontend dev server
yarn start

# Start backend dev server (separate terminal)
cd backend
yarn dev
```

### Monorepo layout (npm workspaces)

The repo now uses npm workspaces so everything (frontend fork, backend, shared packages) lives together:

```
apps/
  web/        # Excalidraw fork + AI sidebar shell (Vite + React)
  backend/    # Express + Socket.io service
packages/
  shared/     # Types shared across tiers
  config/     # tsconfig/eslint/prettier bases
tools/
  sync-excalidraw.sh  # Helper to pull from upstream Excalidraw
```

Install once at the repo root:

```bash
npm install
```

Then run either target individually or both at once:

```bash
npm run dev:web     # Vite + Excalidraw shell
npm run dev:backend # Express API + Socket.io
npm run dev         # runs both via concurrently
```

To keep your Excalidraw fork up to date:

```bash
# apps/web must be cloned from your fork first
UPSTREAM_REMOTE=upstream tools/sync-excalidraw.sh
```

### Project Structure
```
mathboard/
├── src/
│   ├── components/
│   │   ├── AISidebar/          # AI chat interface
│   │   │   ├── AISidebar.tsx
│   │   │   ├── ChatMessage.tsx
│   │   │   └── InputBox.tsx
│   │   ├── Collaboration/      # Real-time features
│   │   │   ├── ShareButton.tsx
│   │   │   ├── UserCursors.tsx
│   │   │   └── CollabProvider.tsx
│   │   └── Auth/               # Auth components
│   ├── lib/
│   │   ├── anthropic.ts        # Claude API wrapper
│   │   ├── supabase.ts         # Supabase client
│   │   └── stripe.ts           # Stripe integration
│   ├── hooks/
│   │   ├── useAI.ts            # AI logic
│   │   ├── useCollab.ts        # WebSocket logic
│   │   └── useAuth.ts          # Auth logic
│   └── types/
│       ├── ai.ts
│       ├── board.ts
│       └── user.ts
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── ai.ts           # AI API routes
│   │   │   ├── boards.ts       # Board CRUD
│   │   │   └── stripe.ts       # Webhooks
│   │   ├── socket/
│   │   │   └── collaboration.ts # Socket.io handlers
│   │   └── index.ts
│   └── package.json
└── README.md
```

## 🤖 AI Integration Details

### Canvas Screenshot → Claude API
```typescript
// src/lib/anthropic.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.VITE_ANTHROPIC_API_KEY,
});

export async function analyzeCanvas(imageBase64: string, userMessage: string) {
  const response = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: `You are a math tutor. The student is working on math problems on a whiteboard. Analyze what they've drawn and respond to their question: "${userMessage}". 

Rules:
- Give HINTS, not direct answers
- Guide step-by-step
- If they're stuck, ask guiding questions
- Be encouraging
- Respond in French if the user writes in French`,
          },
        ],
      },
    ],
  });

  return response.content[0].text;
}
```

### Auto-capture Logic
```typescript
// src/hooks/useAI.ts
import { useEffect, useRef } from 'react';
import { exportToBlob } from '@excalidraw/excalidraw';

export function useAutoCapture(excalidrawAPI, enabled: boolean, interval = 10000) {
  const intervalRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!enabled || !excalidrawAPI) return;

    intervalRef.current = setInterval(async () => {
      const blob = await exportToBlob({
        elements: excalidrawAPI.getSceneElements(),
        appState: excalidrawAPI.getAppState(),
        files: excalidrawAPI.getFiles(),
      });

      const base64 = await blobToBase64(blob);
      // Send to AI for contextual analysis
      // Store in context for chat
    }, interval);

    return () => clearInterval(intervalRef.current);
  }, [excalidrawAPI, enabled, interval]);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      resolve(base64.split(',')[1]); // Remove data:image/png;base64, prefix
    };
    reader.readAsDataURL(blob);
  });
}
```

## 🔄 Real-time Collaboration

### WebSocket Events
```typescript
// backend/src/socket/collaboration.ts
import { Server } from 'socket.io';

export function setupCollaboration(io: Server) {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-board', (boardId: string, userId: string, userName: string) => {
      socket.join(boardId);
      socket.to(boardId).emit('user-joined', { userId, userName });
    });

    socket.on('drawing-update', (boardId: string, elements: any[]) => {
      socket.to(boardId).emit('drawing-update', elements);
    });

    socket.on('cursor-move', (boardId: string, position: { x: number; y: number }) => {
      socket.to(boardId).emit('cursor-move', {
        userId: socket.id,
        position,
      });
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });
}
```

### Client-side Socket Hook
```typescript
// src/hooks/useCollab.ts
import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

export function useCollab(boardId: string, excalidrawAPI: any) {
  useEffect(() => {
    const socket = io(process.env.VITE_WS_URL);

    socket.emit('join-board', boardId, userId, userName);

    socket.on('drawing-update', (elements) => {
      excalidrawAPI.updateScene({ elements });
    });

    socket.on('cursor-move', ({ userId, position }) => {
      // Update cursor position in state
    });

    return () => socket.disconnect();
  }, [boardId, excalidrawAPI]);
}
```

## 💳 Stripe Integration (Phase 4)

### Subscription Tiers
```typescript
// src/lib/stripe.ts
export const PRICING_PLANS = {
  FREE: {
    name: 'Free',
    price: 0,
    limits: {
      boardsPerDay: 3,
      aiMessagesPerDay: 20,
    },
  },
  PRO: {
    name: 'Pro',
    price: 999, // cents
    priceId: 'price_xxx', // Stripe price ID
    limits: {
      boardsPerDay: Infinity,
      aiMessagesPerDay: Infinity,
    },
  },
};
```

## 📱 Mobile Optimization

### Apple Pencil Support

Excalidraw already handles Pointer Events API, which includes Apple Pencil pressure/tilt on iPad Safari.

### PWA Setup
```json
// public/manifest.json
{
  "name": "MathBoard",
  "short_name": "MathBoard",
  "description": "AI-powered whiteboard for math homework",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#6366f1",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

## 🎨 UI/UX Principles

1. **Canvas first**: Whiteboard takes 70% width, sidebar 30%
2. **Minimal chrome**: Hide UI elements when drawing (like Procreate)
3. **Fast**: Real-time should feel instant (<100ms latency)
4. **Mobile-optimized**: Touch targets 44px minimum, large buttons
5. **Familiar**: Keep Excalidraw's shortcuts and UX

## 📊 Success Metrics

**Week 1-3 (Proto):**
- [ ] Can draw equation + get AI response
- [ ] Works on iPad Safari

**Week 4-7 (MVP):**
- [ ] Use it myself for homework 3+ times
- [ ] 5 friends test it and provide feedback
- [ ] At least 1 friend uses it voluntarily (not just to help me)

**Week 8-10 (Collab):**
- [ ] Successfully collaborate with 1 friend on real homework
- [ ] No major bugs during 30min session
- [ ] Both of us find it useful

**Week 11-12 (Launch):**
- [ ] 50 signups
- [ ] 3 paying customers
- [ ] 1 organic share (someone shares without me asking)

## 🚧 Known Technical Challenges

1. **Real-time sync conflicts**: When 2 users draw at same time
   - Solution: Operational Transformation or CRDT (Excalidraw uses their own)

2. **AI API costs**: Claude Vision ~$0.01/image
   - Solution: Rate limit to 1 capture/10s, cache responses

3. **WebSocket scaling**: Socket.io can handle ~10k connections/server
   - Solution: Start with 1 server, add Redis adapter later if needed

4. **Canvas size**: Large boards = big images = slow uploads
   - Solution: Compress images, or crop to viewport only

5. **Mobile keyboard**: Sidebar chat on mobile covers canvas
   - Solution: Detect keyboard, resize canvas temporarily

## 📚 Resources

- [Excalidraw GitHub](https://github.com/excalidraw/excalidraw)
- [Anthropic API Docs](https://docs.anthropic.com/claude/reference/messages_post)
- [Socket.io Docs](https://socket.io/docs/v4/)
- [Supabase Docs](https://supabase.com/docs)
- [Stripe Docs](https://stripe.com/docs/api)

## 🎯 Launch Plan

**Week 12:**
1. Post on r/france (authentically, not spammy)
2. Create 3 TikTok videos showcasing collaboration
3. Share in Discord servers for lycéens
4. DM 20 classmates directly for beta testing

**Goal:** 50 signups, 3 paying customers to validate product-market fit.

---

## 💪 Motivation

This isn't just a side project. I NEED this tool for my own homework. Even if it doesn't become a business, I'll use it every day.

That's the best validation.

Let's build.