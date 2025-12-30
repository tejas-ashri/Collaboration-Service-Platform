# Collaboration Platform Service

A full-stack collaboration platform with real-time editing, file management, and AI integration.

## Architecture

This project consists of:

- **Backend**: Microservices architecture with 5 services
- **Frontend**: Modern React application with real-time collaboration

## Quick Start

### Backend Setup

```bash
cd backend
npm install
```

Set up environment variables (copy `example.env` to `.env`):

```bash
PORT=4000
MONGO_URI=mongodb://localhost:27017/app
REDIS_URL=redis://localhost:6379
JWT_PRIVATE_KEY=dev-secret
JWT_PUBLIC_KEY=dev-secret
S3_BUCKET=dev-bucket
AWS_REGION=us-east-1
OPENAI_API_KEY=your-openai-key
```

Start services:

```bash
# Start all services in separate terminals
npm run dev:auth      # Port 4000
npm run dev:project   # Port 4001
npm run dev:collab    # Port 4002
npm run dev:file      # Port 4003
npm run dev:ai        # Port 4004
```

Or use Docker Compose for MongoDB and Redis:

```bash
docker-compose up -d
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at `http://localhost:3000`

## Features

### Backend Services

1. **Auth Service** (Port 4000)
   - JWT-based authentication
   - Token refresh
   - User management

2. **Project Service** (Port 4001)
   - CRUD operations for projects
   - Collaborator management
   - Role-based access control

3. **Collab Service** (Port 4002)
   - Real-time collaboration via WebSocket
   - Operational transforms
   - Presence tracking
   - Snapshot management

4. **File Service** (Port 4003)
   - S3 presigned URLs for file upload/download
   - File metadata management
   - File deletion

5. **AI Service** (Port 4004)
   - AI-powered suggestions
   - Code analysis
   - Response caching

### Frontend Features

- 🔐 Email-based authentication
- 📁 Project dashboard
- ✏️ Real-time collaborative editor
- 👥 Collaborator management
- 📎 File upload and management
- 🤖 AI assistant integration
- 🎨 Modern, responsive UI

## API Endpoints

### Auth Service

- `POST /auth/login` - Login with email
- `POST /auth/refresh` - Refresh access token
- `GET /auth/me` - Get current user

### Project Service

- `GET /projects` - List projects
- `POST /projects` - Create project
- `GET /projects/:id` - Get project
- `PUT /projects/:id` - Update project
- `DELETE /projects/:id` - Delete project
- `GET /projects/:id/collaborators` - List collaborators
- `POST /projects/:id/collaborators` - Add collaborator
- `DELETE /projects/:id/collaborators/:userId` - Remove collaborator

### Collab Service

- `GET /presence/:projectId` - Get online users
- `GET /snapshots/:projectId` - Get latest snapshot
- `GET /snapshots/:projectId/history` - Get snapshot history
- WebSocket events: `cursor`, `op`, `snapshot`, `refreshToken`

### File Service

- `GET /files` - List files
- `GET /files/meta` - Get file metadata
- `POST /files/presign` - Get presigned URL
- `DELETE /files` - Delete file

### AI Service

- `POST /ai/suggest` - Get AI suggestion
- `POST /ai/analyze` - Stream AI analysis

## Development

### Running Tests

```bash
cd backend
npm test
```

### Building

```bash
# Backend
cd backend
npm run build

# Frontend
cd frontend
npm run build
```

## Tech Stack

### Backend
- Node.js + TypeScript
- Express.js
- MongoDB
- Redis
- Socket.IO
- AWS SDK (S3)
- OpenAI API
- Zod (validation)

### Frontend
- React 18
- TypeScript
- Vite
- React Router
- Zustand
- Socket.IO Client
- Axios
- Tailwind CSS

## License

MIT




