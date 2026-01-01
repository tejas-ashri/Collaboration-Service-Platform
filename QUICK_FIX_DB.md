
## Quick Fix for 'DB unavailable' Error

MongoDB is not running. Here are the quickest ways to fix it:

### If you have Docker installed:
```bash
cd backend
docker-compose up -d mongo
```

Wait a few seconds, then try creating a project again.

### If you don't have Docker:
1. Install MongoDB locally (see MONGODB_SETUP.md)
2. Or use MongoDB Atlas (cloud - free tier available)

### Verify MongoDB is running:
```bash
# Check if port 27017 is accessible
nc -z localhost 27017 && echo '✅ MongoDB is running' || echo '❌ MongoDB not running'
```

### After starting MongoDB:
The project service should automatically reconnect. If not, restart it:
```bash
pkill -f 'ts-node-dev.*project'
cd backend
PORT=4001 bash start-project-service.sh
```

