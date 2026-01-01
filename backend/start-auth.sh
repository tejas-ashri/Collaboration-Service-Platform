#!/bin/bash
# Start auth service with .env file loaded

cd "$(dirname "$0")"

# Load .env file
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
    echo "✅ Loaded .env file"
    echo "   PORT: $PORT"
    echo "   JWT_PRIVATE_KEY: ${JWT_PRIVATE_KEY:0:10}..."
else
    echo "⚠️  .env file not found"
fi

# Start the service
npm run dev:auth

