# Kanban Board with Graph RAG - Setup Guide

This document provides detailed step-by-step instructions to set up and run the Kanban Board application with Neo4j Graph Database and RAG capabilities.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Quick Setup with Docker](#quick-setup-with-docker)
- [Manual Setup](#manual-setup)
- [Configuration](#configuration)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)
- [Development Workflow](#development-workflow)

## Prerequisites

### Required Software
- **Node.js** 18.0 or higher
- **Python** 3.11 or higher
- **Docker** 20.10 or higher
- **Docker Compose** 2.0 or higher
- **Git** 2.30 or higher

### Required API Keys
- **OpenAI API Key** - Get from [OpenAI Platform](https://platform.openai.com/api-keys)
- **GitHub Personal Access Token** - Create at [GitHub Settings](https://github.com/settings/tokens)

### System Requirements
- **RAM**: Minimum 8GB (16GB recommended)
- **Storage**: At least 10GB free space
- **OS**: Windows 10/11, macOS 10.15+, or Linux (Ubuntu 20.04+)

## Quick Setup with Docker

### Step 1: Clone the Repository
```bash
git clone https://github.com/yourusername/kanban-pr-agent.git
cd kanban-pr-agent
```

### Step 2: Create Environment File
```bash
cp .env.example .env
```

### Step 3: Configure Environment Variables
Edit `.env` file with your actual values:
```env
# Neo4j Database
NEO4J_URI=bolt://neo4j:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_secure_password_here
NEO4J_DATABASE=neo4j

# Redis Cache
REDIS_URL=redis://redis:6379

# Authentication
JWT_SECRET=your_very_long_random_string_here_at_least_32_chars
JWT_EXPIRY=7d

# GitHub Integration (Required for PR features)
GITHUB_TOKEN=ghp_your_github_personal_access_token
GITHUB_WEBHOOK_SECRET=your_webhook_secret

# OpenAI (Required for AI features)
OPENAI_API_KEY=sk-your_openai_api_key_here
OPENAI_MODEL=gpt-4

# MCP Configuration
MCP_SERVER_URL=http://mcp-server:8000
MCP_API_KEY=your_mcp_api_key_here

# Application
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173
```

### Step 4: Start All Services
```bash
docker-compose up -d
```

This will start:
- Neo4j database (port 7687 for Bolt, 7474 for Browser)
- Redis cache (port 6379)
- Backend API (port 3000)
- Frontend (port 5173)
- MCP Server (port 8000)

### Step 5: Wait for Services to Initialize
```bash
# Check if all services are running
docker-compose ps

# Check logs if needed
docker-compose logs -f backend
```

### Step 6: Access the Application
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **Neo4j Browser**: http://localhost:7474 (login: neo4j/your_password)
- **MCP Server**: http://localhost:8000

## Manual Setup

### Step 1: Install Neo4j

#### Option A: Using Docker
```bash
docker run -d \
  --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password123 \
  -e NEO4J_PLUGINS='["apoc", "graph-data-science"]' \
  -e NEO4J_ACCEPT_LICENSE_AGREEMENT=yes \
  -v $HOME/neo4j/data:/data \
  -v $HOME/neo4j/logs:/logs \
  neo4j:5-enterprise
```

#### Option B: Native Installation
1. Download Neo4j from [neo4j.com/download](https://neo4j.com/download/)
2. Install APOC and GDS plugins
3. Start Neo4j service

### Step 2: Install Redis

#### Option A: Using Docker
```bash
docker run -d \
  --name redis \
  -p 6379:6379 \
  redis:7-alpine
```

#### Option B: Native Installation
```bash
# macOS
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server

# Windows
# Download from https://github.com/microsoftarchive/redis/releases
```

### Step 3: Setup Backend

```bash
cd backend

# Install dependencies
npm install

# Create .env file
cp ../.env.example .env
# Edit .env with your configuration

# Start development server
npm run dev
```

The backend will:
- Connect to Neo4j and create necessary constraints/indexes
- Set up API endpoints on port 3000
- Initialize WebSocket server for real-time updates

### Step 4: Setup Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

The frontend will be available at http://localhost:5173

### Step 5: Setup MCP Server

```bash
cd mcp-server

# Create Python virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the server
uvicorn src.server:app --reload --host 0.0.0.0 --port 8000
```

## Configuration

### Neo4j Configuration

1. **Access Neo4j Browser**: http://localhost:7474
2. **Login**: Username: `neo4j`, Password: your configured password
3. **Verify Installation**:
```cypher
// Check if plugins are installed
CALL dbms.procedures() 
YIELD name 
WHERE name STARTS WITH 'apoc' OR name STARTS WITH 'gds'
RETURN name
LIMIT 10;
```

### Backend Configuration

Create or modify `backend/.env`:
```env
# Neo4j Connection
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_password

# Server Configuration
PORT=3000
NODE_ENV=development

# Security
JWT_SECRET=your_jwt_secret_at_least_32_characters_long
JWT_EXPIRY=7d
BCRYPT_ROUNDS=10

# External Services
OPENAI_API_KEY=sk-your_key
GITHUB_TOKEN=ghp_your_token
```

### Frontend Configuration

Create `frontend/.env.local`:
```env
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000
```

## Verification

### Step 1: Test Neo4j Connection
```bash
# Using curl
curl -u neo4j:password123 \
  -H "Content-Type: application/json" \
  -d '{"statements":[{"statement":"MATCH (n) RETURN count(n) as count"}]}' \
  http://localhost:7474/db/neo4j/tx/commit
```

### Step 2: Test Backend API
```bash
# Health check
curl http://localhost:3000/health

# Should return:
# {"status":"healthy","timestamp":"2024-..."}
```

### Step 3: Test MCP Server
```bash
# Health check
curl http://localhost:8000/health

# Should return:
# {"status":"healthy","services":{"pr_agent":"active",...}}
```

### Step 4: Create First User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "username": "admin",
    "password": "SecurePassword123!",
    "firstName": "Admin",
    "lastName": "User"
  }'
```

### Step 5: Login and Get Token
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "SecurePassword123!"
  }'

# Save the returned accessToken for API requests
```

## Troubleshooting

### Neo4j Connection Issues

**Problem**: Cannot connect to Neo4j
```bash
# Check if Neo4j is running
docker ps | grep neo4j

# Check Neo4j logs
docker logs neo4j

# Test connection
npm run test:neo4j
```

**Solution**:
1. Ensure Neo4j is running on port 7687
2. Check credentials in .env file
3. Verify network connectivity

### Backend Startup Issues

**Problem**: Backend fails to start
```bash
# Check for port conflicts
lsof -i :3000

# Check Node version
node --version  # Should be 18+

# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Frontend Build Issues

**Problem**: Frontend won't compile
```bash
# Clear cache
rm -rf node_modules/.vite
npm run dev

# Check for TypeScript errors
npm run typecheck
```

### Docker Issues

**Problem**: Services won't start
```bash
# Stop all services
docker-compose down

# Remove volumes (WARNING: deletes data)
docker-compose down -v

# Rebuild images
docker-compose build --no-cache

# Start again
docker-compose up -d
```

## Development Workflow

### Starting Development Environment
```bash
# Terminal 1: Start infrastructure
docker-compose up neo4j redis

# Terminal 2: Start backend
cd backend && npm run dev

# Terminal 3: Start frontend
cd frontend && npm run dev

# Terminal 4: Start MCP server
cd mcp-server && uvicorn src.server:app --reload
```

### Running Tests
```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test

# E2E tests
npm run test:e2e
```

### Database Management

#### Create Backup
```bash
# Backup Neo4j
docker exec neo4j neo4j-admin database dump neo4j --to-path=/data/backup

# Copy backup to host
docker cp neo4j:/data/backup ./backup
```

#### Restore Backup
```bash
# Copy backup to container
docker cp ./backup neo4j:/data/

# Restore
docker exec neo4j neo4j-admin database load neo4j --from-path=/data/backup
```

#### Clear Database
```cypher
// Connect to Neo4j Browser and run:
MATCH (n) DETACH DELETE n;
```

### Monitoring

#### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend

# Neo4j queries
docker exec neo4j tail -f /logs/query.log
```

#### Performance Monitoring
```bash
# Neo4j metrics
curl http://localhost:7474/db/neo4j/cluster/overview

# Redis info
docker exec redis redis-cli INFO
```

## Production Deployment

### Using Docker Compose
```bash
# Build production images
docker-compose -f docker-compose.yml -f docker-compose.prod.yml build

# Deploy
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Scale backend
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --scale backend=3
```

### Environment Variables for Production
```env
NODE_ENV=production
NEO4J_PASSWORD=very_secure_password_here
JWT_SECRET=production_secret_at_least_64_chars
ALLOWED_ORIGINS=https://yourdomain.com
```

### SSL/TLS Setup
1. Obtain SSL certificates
2. Update nginx configuration
3. Enable HTTPS in environment variables

## Useful Commands

### Neo4j Cypher Queries
```cypher
// Count all nodes by type
MATCH (n) 
RETURN labels(n)[0] as type, count(n) as count 
ORDER BY count DESC;

// View task relationships
MATCH (t:Task)-[r]-(connected)
RETURN t, r, connected
LIMIT 50;

// Find orphaned nodes
MATCH (n)
WHERE NOT (n)--()
RETURN n;

// Check graph statistics
CALL apoc.meta.graph();
```

### API Testing with curl
```bash
# Create a board
curl -X POST http://localhost:3000/api/boards \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Project","description":"Project board"}'

# Semantic search
curl -X POST http://localhost:3000/api/graph/search/semantic \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"How to implement authentication?"}'
```

## Additional Resources

- [Neo4j Documentation](https://neo4j.com/docs/)
- [Neo4j Cypher Manual](https://neo4j.com/docs/cypher-manual/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [React Documentation](https://react.dev/)

## Support

If you encounter issues:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review logs: `docker-compose logs -f`
3. Open an issue on GitHub with:
   - Error messages
   - Steps to reproduce
   - Environment details (OS, Node version, etc.)