#!/bin/bash
# Start auth service with proper environment loading

cd "$(dirname "$0")"

# Load .env file
export $(cat .env | grep -v '^#' | xargs)

# Start the service with dotenv
node -r dotenv/config node_modules/.bin/ts-node-dev --respawn services/auth/src/index.ts

