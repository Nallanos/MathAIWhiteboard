#!/bin/bash
# ===========================================
# Deployment Script for MathBoard AI
# ===========================================

set -e

echo "🚀 Deploying MathBoard AI..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "   Copy .env.example to .env and fill in your values:"
    echo "   cp .env.example .env"
    exit 1
fi

# Pull latest changes
echo "📦 Pulling latest changes..."
git pull origin main

# Build and start containers
echo "🔨 Building containers..."
docker compose build --no-cache

echo "🚀 Starting containers..."
docker compose up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to start..."
sleep 10

# Run database migrations
echo "📊 Running database migrations..."
docker compose exec -T backend pnpm db:push

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🌐 Your app is available at: https://mathbordai.duckdns.org"
echo ""
echo "📋 Useful commands:"
echo "   docker compose logs -f          # View logs"
echo "   docker compose ps               # Check status"
echo "   docker compose down             # Stop services"
echo "   docker compose restart backend  # Restart backend"
