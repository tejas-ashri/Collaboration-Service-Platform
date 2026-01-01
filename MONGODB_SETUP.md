# MongoDB Setup Guide

## The Error: "DB unavailable"

This error means MongoDB is not running. You need to start MongoDB before the project service can work.

## Option 1: Using Docker (Recommended)

If you have Docker installed:

```bash
cd backend
docker-compose up -d mongo
```

This will start MongoDB on port 27017.

To verify it's running:
```bash
docker ps | grep mongo
```

## Option 2: Install MongoDB Locally

### macOS (using Homebrew):
```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

### Linux:
```bash
# Ubuntu/Debian
sudo apt-get install -y mongodb

# Start MongoDB
sudo systemctl start mongodb
sudo systemctl enable mongodb
```

### Windows:
Download and install from: https://www.mongodb.com/try/download/community

## Option 3: Use MongoDB Atlas (Cloud)

1. Sign up at https://www.mongodb.com/cloud/atlas
2. Create a free cluster
3. Get your connection string
4. Update `backend/.env`:
   ```
   MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/app
   ```

## Verify MongoDB is Running

Test the connection:
```bash
# Check if port 27017 is open
nc -z localhost 27017 && echo "✅ MongoDB is running" || echo "❌ MongoDB is not running"
```

Or test with MongoDB client:
```bash
mongosh mongodb://localhost:27017
```

## After Starting MongoDB

1. Restart the project service:
   ```bash
   pkill -f 'ts-node-dev.*project'
   cd backend
   PORT=4001 bash start-project-service.sh
   ```

2. Try creating a project again from the frontend.

## Quick Start Script

If you have Docker, you can use:
```bash
cd backend
docker-compose up -d
```

This starts both MongoDB and Redis.

