#!/bin/bash
# Start project service with proper environment loading

cd "$(dirname "$0")"

# Load .env file
export $(cat .env | grep -v '^#' | xargs)

# Set PORT to 4001 for project service
export PORT=4001

# Start the service with dotenv
node -r dotenv/config node_modules/.bin/ts-node-dev --respawn services/project/src/index.ts

