# Frontend - Collaboration Platform

A modern, aesthetic React frontend for the collaboration platform backend.

## Features

- 🔐 Authentication with JWT tokens
- 📁 Project management (create, update, delete)
- 👥 Real-time collaboration with Socket.IO
- 📝 Rich text editor with live sync
- 📎 File upload and management
- 🤖 AI-powered suggestions
- 🎨 Beautiful, modern UI with Tailwind CSS

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Backend services running (see backend README)

### Installation

```bash
cd frontend
npm install
```

### Development

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

### Build

```bash
npm run build
```

## Project Structure

```
src/
├── pages/          # Page components
│   ├── LoginPage.tsx
│   ├── DashboardPage.tsx
│   └── ProjectPage.tsx
├── store/          # Zustand state management
│   ├── authStore.ts
│   └── projectStore.ts
├── lib/             # Utilities and API client
│   └── api.ts
├── App.tsx          # Main app component with routing
├── main.tsx         # Entry point
└── index.css        # Global styles
```

## Backend Integration

The frontend connects to the following backend services:

- **Auth Service**: `http://localhost:4000`
- **Project Service**: `http://localhost:4001`
- **Collab Service**: `http://localhost:4002` (WebSocket)
- **File Service**: `http://localhost:4003`
- **AI Service**: `http://localhost:4004`

API proxy is configured in `vite.config.ts` for development.

## Usage

1. **Login**: Enter your email to authenticate (no password required for demo)
2. **Create Project**: Click "New Project" to create a new collaboration project
3. **Edit**: Open a project to start editing with real-time collaboration
4. **Collaborate**: Add collaborators via the Collaborators button
5. **Upload Files**: Use the file sidebar to upload and manage files
6. **AI Assistant**: Click the AI button for AI-powered suggestions

## Technologies

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **React Router** - Client-side routing
- **Zustand** - State management
- **Socket.IO Client** - Real-time collaboration
- **Axios** - HTTP client
- **Tailwind CSS** - Styling
- **Lucide React** - Icons
- **React Hot Toast** - Notifications

