# How to Launch the Application

## Prerequisites

- Node.js 18+ installed
- npm installed
- Docker and Docker Compose (for MongoDB and Redis) - OR have MongoDB and Redis running locally

## Step-by-Step Launch Instructions

### 1. Start Database Services (MongoDB & Redis)

**Option A: Using Docker Compose (Recommended)**
```bash
cd backend
docker-compose up -d
```

**Option B: Manual Setup**
- Start MongoDB on port 27017
- Start Redis on port 6379

### 2. Set Up Backend Environment

```bash
cd backend
npm install
```

Create a `.env` file in the `backend` directory (copy from `example.env`):
```bash
cp example.env .env
```

The `.env` file should contain:
```env
PORT=4000
MONGO_URI=mongodb://localhost:27017/app
REDIS_URL=redis://localhost:6379
JWT_PRIVATE_KEY=dev-secret
JWT_PUBLIC_KEY=dev-secret
S3_BUCKET=dev-bucket
AWS_REGION=us-east-1
OPENAI_API_KEY=your-openai-key
```

### 3. Start Backend Services

You need to start 5 backend services. Open 5 separate terminal windows/tabs:

**Terminal 1 - Auth Service:**
```bash
cd backend
npm run dev:auth
```
Should show: `Auth service listening on :4000`

**Terminal 2 - Project Service:**
```bash
cd backend
npm run dev:project
```
Should show: `Project service listening on :4001`

**Terminal 3 - Collab Service:**
```bash
cd backend
npm run dev:collab
```
Should show: `Collaboration service listening on :4002`

**Terminal 4 - File Service:**
```bash
cd backend
npm run dev:file
```
Should show: `File service listening on :4003`

**Terminal 5 - AI Service:**
```bash
cd backend
npm run dev:ai
```
Should show: `AI service listening on :4004`

### 4. Set Up and Start Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend will start on `http://localhost:3000`

### 5. Access the Application

Open your browser and navigate to:
```
http://localhost:3000
```

## Quick Launch Script (Alternative)

If you prefer, you can use this script to start all services at once:

**For macOS/Linux:**
```bash
# Save as start-all.sh
#!/bin/bash
cd backend && docker-compose up -d
cd backend && npm run dev:auth &
cd backend && npm run dev:project &
cd backend && npm run dev:collab &
cd backend && npm run dev:file &
cd backend && npm run dev:ai &
cd frontend && npm run dev
```

## Verification Checklist

✅ MongoDB is running (port 27017)
✅ Redis is running (port 6379)
✅ Auth service is running (port 4000)
✅ Project service is running (port 4001)
✅ Collab service is running (port 4002)
✅ File service is running (port 4003)
✅ AI service is running (port 4004)
✅ Frontend is running (port 3000)

## Troubleshooting

### Port Already in Use
If you get "port already in use" errors:
- Check what's using the port: `lsof -i :PORT_NUMBER`
- Kill the process or change the port in `.env`

### Database Connection Issues
- Ensure MongoDB and Redis are running
- Check connection strings in `.env`
- Verify Docker containers are up: `docker ps`

### Frontend Can't Connect to Backend
- Verify all backend services are running
- Check browser console for CORS errors
- Ensure backend services are on correct ports

## Stopping the Application

1. Stop frontend: `Ctrl+C` in frontend terminal
2. Stop backend services: `Ctrl+C` in each backend terminal
3. Stop Docker services: `cd backend && docker-compose down`

