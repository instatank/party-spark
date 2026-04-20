#!/bin/bash

# Vercel Environment Setup Script 🛠️
# This script reads your local .env file and pushes the variables to Vercel production.

# Load .env file
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
else
  echo "❌ .env file not found!"
  exit 1
fi

echo "🚀 Adding variables to Vercel Production..."

# Helper function to add env var
add_env() {
    echo "Adding $1..."
    echo -n "$2" | npx vercel env add $1 production
}

# Add Keys (User has to confirm overwrites if they exist)
# API Keys Disabled for Safety Build
# add_env VITE_API_KEY "$VITE_API_KEY"
# add_env VITE_TEXT_MODEL "$VITE_TEXT_MODEL"
# add_env VITE_IMAGE_MODEL "$VITE_IMAGE_MODEL"
# add_env VITE_ROAST_LIMIT "$VITE_ROAST_LIMIT"

echo "✅ Environment variables pushed! (API Key Disabled)"
echo "🔄 Redeploying safety build..."

npx vercel --prod
