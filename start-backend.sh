#!/bin/bash

# Start Backend Services
# This script starts all 5 backend services in the background

echo "🚀 Starting Backend Services..."

cd "$(dirname "$0")/backend"

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Copying from example.env..."
    cp example.env .env
    echo "✅ Created .env file. Please update it with your configuration."
fi

# Start services in background
echo "📦 Starting Auth Service (port 4000)..."
npm run dev:auth > /tmp/auth-service.log 2>&1 &
AUTH_PID=$!

echo "📦 Starting Project Service (port 4001)..."
npm run dev:project > /tmp/project-service.log 2>&1 &
PROJECT_PID=$!

echo "📦 Starting Collab Service (port 4002)..."
npm run dev:collab > /tmp/collab-service.log 2>&1 &
COLLAB_PID=$!

echo "📦 Starting File Service (port 4003)..."
npm run dev:file > /tmp/file-service.log 2>&1 &
FILE_PID=$!

echo "📦 Starting AI Service (port 4004)..."
npm run dev:ai > /tmp/ai-service.log 2>&1 &
AI_PID=$!

echo ""
echo "✅ All backend services started!"
echo "📋 Service PIDs:"
echo "   Auth:    $AUTH_PID (port 4000)"
echo "   Project: $PROJECT_PID (port 4001)"
echo "   Collab:  $COLLAB_PID (port 4002)"
echo "   File:    $FILE_PID (port 4003)"
echo "   AI:      $AI_PID (port 4004)"
echo ""
echo "📝 Logs are available in /tmp/*-service.log"
echo ""
echo "To stop all services, run: kill $AUTH_PID $PROJECT_PID $COLLAB_PID $FILE_PID $AI_PID"
echo "Or use: pkill -f 'ts-node-dev'"

