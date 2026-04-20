#!/bin/bash

# PartySpark Deployment Script 🚀

echo "📦 Installing Dependencies..."
npm install

echo "🛠️  Building Project..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build Failed! Fix errors before deploying."
    exit 1
fi

echo "✅ Build Successful!"

# Check if Vercel CLI is installed
if [ -f "./node_modules/.bin/vercel" ]; then
    echo "☁️  Deploying with local vercel..."
    ./node_modules/.bin/vercel --prod
elif command -v vercel &> /dev/null; then
    echo "☁️  Deploying with global vercel..."
    vercel --prod
else
    echo "☁️  Deploying with npx vercel --prod..."
    echo "IMPORTANT: During setup, say 'Y' to set up and deploy."
    npx --yes vercel --prod
fi
