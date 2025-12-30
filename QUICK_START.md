# Quick Start Guide

## 🚀 Fastest Way to Launch

### 1. Start Databases
```bash
cd backend
docker-compose up -d
```

### 2. Install Dependencies (if not done)
```bash
# Backend
cd backend
npm install

# Frontend  
cd ../frontend
npm install
```

### 3. Start Backend Services

**Option A: Use the script**
```bash
./start-backend.sh
```

**Option B: Manual (5 terminals)**
```bash
cd backend
npm run dev:auth      # Terminal 1
npm run dev:project   # Terminal 2
npm run dev:collab    # Terminal 3
npm run dev:file      # Terminal 4
npm run dev:ai        # Terminal 5
```

### 4. Start Frontend
```bash
cd frontend
npm run dev
```

### 5. Open Browser
Navigate to: **http://localhost:3000**

## 📋 Service Ports

- Frontend: http://localhost:3000
- Auth Service: http://localhost:4000
- Project Service: http://localhost:4001
- Collab Service: http://localhost:4002
- File Service: http://localhost:4003
- AI Service: http://localhost:4004

## ✅ Verify Everything is Running

Check each service health endpoint:
```bash
curl http://localhost:4000/health  # Auth
curl http://localhost:4001/health  # Project
curl http://localhost:4002/health  # Collab
curl http://localhost:4003/health  # File
curl http://localhost:4004/health  # AI
```

All should return: `{"status":"ok"}`

## 🎯 First Steps After Launch

1. Go to http://localhost:3000
2. Enter any email to login (e.g., `user@example.com`)
3. Click "New Project" to create your first project
4. Start collaborating!

