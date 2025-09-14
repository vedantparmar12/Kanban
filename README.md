# Kanban Project Management Platform
## Complete Documentation & MCP Integration Guide

### Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
- [MCP Integration](#mcp-integration)
- [Claude CLI Integration](#claude-cli-integration)
- [Configuration](#configuration)
- [Usage Guide](#usage-guide)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## Overview

The Kanban Project Management Platform is a comprehensive, full-stack application that combines modern project management capabilities with AI-powered automation through Model Context Protocol (MCP) integration. Built with TypeScript/Node.js backend, React frontend, and Python-based MCP server, it provides seamless integration with Claude CLI and other AI assistants.

### Key Benefits

- **AI-Powered Automation**: Direct integration with Claude CLI through MCP protocol
- **Real-time Collaboration**: WebSocket-based real-time updates
- **Advanced Analytics**: Team velocity tracking and performance metrics
- **GitHub Integration**: Automated PR management and issue tracking
- **Flexible Architecture**: Microservices-based design with Docker support

---

## Architecture

### System Architecture Diagram

```mermaid
flowchart TB
    subgraph "Client Layer"
        FE[React Frontend]
        CLI[Claude CLI]
        MCP_CLIENT[MCP Client]
    end
    
    subgraph "API Gateway"
        NGINX[Nginx Reverse Proxy]
    end
    
    subgraph "Application Layer"
        BE[Node.js Backend]
        WS[WebSocket Service]
        AUTH[Auth Service]
    end
    
    subgraph "MCP Layer"
        MCP_SERVER[MCP Server]
        TOOLS[MCP Tools]
        AGENTS[AI Agents]
    end
    
    subgraph "Data Layer"
        MYSQL[(MySQL Database)]
        REDIS[(Redis Cache)]
    end
    
    subgraph "External Services"
        GITHUB[GitHub API]
        LLM[AI/LLM Services]
    end
    
    FE --> NGINX
    CLI --> MCP_CLIENT
    MCP_CLIENT --> MCP_SERVER
    NGINX --> BE
    BE --> WS
    BE --> AUTH
    BE --> MYSQL
    BE --> REDIS
    MCP_SERVER --> TOOLS
    TOOLS --> AGENTS
    MCP_SERVER --> BE
    TOOLS --> GITHUB
    AGENTS --> LLM
    
    classDef frontend fill:#e8f5e8,stroke:#4caf50
    classDef backend fill:#e3f2fd,stroke:#2196f3
    classDef mcp fill:#fff3e0,stroke:#ff9800
    classDef data fill:#fce4ec,stroke:#e91e63
    classDef external fill:#f3e5f5,stroke:#9c27b0
    
    class FE,CLI,MCP_CLIENT frontend
    class BE,WS,AUTH,NGINX backend
    class MCP_SERVER,TOOLS,AGENTS mcp
    class MYSQL,REDIS data
    class GITHUB,LLM external
```

### Technology Stack

```mermaid
graph LR
    subgraph "Frontend"
        A1[React 18]
        A2[TypeScript]
        A3[Vite]
        A4[Tailwind CSS]
    end
    
    subgraph "Backend"
        B1[Node.js]
        B2[Express.js]
        B3[TypeScript]
        B4[WebSocket.io]
    end
    
    subgraph "Database"
        C1[MySQL]
        C2[Prisma ORM]
        C3[Redis]
    end
    
    subgraph "MCP & AI"
        D1[MCP Protocol]
        D2[Claude API]
        D3[Python Tools]
        D4[TypeScript Server]
    end
    
    subgraph "DevOps"
        E1[Docker]
        E2[Docker Compose]
        E3[GitHub Actions]
    end
```

---

## Features

### Core Kanban Features
- **Multi-Board Management**: Create and manage multiple Kanban boards
- **Swimlane Support**: Organize tasks with custom swimlanes
- **Drag-and-Drop Interface**: Intuitive task movement between columns
- **Task Management**: Rich task creation with descriptions, assignments, and due dates
- **Real-time Updates**: Instant synchronization across all connected clients

### AI-Powered Automation
- **PR Agent**: Automated pull request analysis and management
- **Code Quality Analysis**: AI-driven code review and suggestions
- **Documentation Generation**: Automated API and project documentation
- **Task Creation**: Smart task generation from GitHub issues and PRs
- **Team Analytics**: AI-powered team performance insights

### Integration Features
- **GitHub Integration**: Seamless PR and issue management
- **Claude CLI Support**: Direct AI assistant integration
- **MCP Protocol**: Extensible tool ecosystem
- **WebSocket Real-time**: Live collaboration features
- **REST API**: Comprehensive API for external integrations

---

## Prerequisites

### System Requirements
- **Node.js**: v18.0.0 or higher
- **Python**: v3.9 or higher
- **MySQL**: v8.0 or higher
- **Redis**: v6.0 or higher (optional, for caching)
- **Docker**: v20.10 or higher (for containerized deployment)

### Development Tools
- **Git**: Version control
- **Claude CLI**: For AI integration
- **Postman/Thunder Client**: API testing
- **VS Code**: Recommended IDE with extensions:
  - TypeScript
  - Prisma
  - Python
  - Docker

---

## Installation & Setup

### 1. Clone the Repository

```bash
git clone https://github.com/vedantparmar12/Kanban.git
cd Kanban
```

### 2. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
nano .env
```

**Backend Environment Configuration (.env):**
```env
# Database Configuration
DATABASE_URL="mysql://username:password@localhost:3306/kanban_db"
REDIS_URL="redis://localhost:6379"

# JWT Configuration
JWT_SECRET="your-super-secret-jwt-key"
JWT_EXPIRES_IN="24h"

# API Configuration
PORT=3001
NODE_ENV=development

# GitHub Integration
GITHUB_TOKEN="ghp_your_github_token"
GITHUB_WEBHOOK_SECRET="your_webhook_secret"

# AI/LLM Configuration
OPENAI_API_KEY="sk-your-openai-key"
ANTHROPIC_API_KEY="sk-ant-your-anthropic-key"

# MCP Configuration
MCP_SERVER_PORT=3002
MCP_SERVER_HOST=localhost
```

```bash
# Set up database
npx prisma generate
npx prisma db push

# Start backend server
npm run dev
```

### 3. Frontend Setup

```bash
# Navigate to frontend directory
cd ../frontend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
nano .env
```

**Frontend Environment Configuration (.env):**
```env
VITE_API_BASE_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001
VITE_MCP_SERVER_URL=http://localhost:3002
VITE_GITHUB_CLIENT_ID=your_github_oauth_client_id
```

```bash
# Start frontend development server
npm run dev
```

### 4. MCP Server Setup

```bash
# Navigate to MCP server directory
cd ../mcp-server

# Create Python virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt

# Install Node.js dependencies (for TypeScript MCP server)
npm install

# Set up MCP environment
cp .env.example .env
nano .env
```

**MCP Server Environment Configuration (.env):**
```env
# MCP Server Configuration
MCP_PORT=3002
MCP_HOST=localhost

# Backend Integration
BACKEND_URL=http://localhost:3001
BACKEND_API_KEY=your_backend_api_key

# GitHub Integration
GITHUB_TOKEN=ghp_your_github_token

# AI Configuration
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key

# Neo4j Configuration (Optional)
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_neo4j_password
```

```bash
# Start MCP server (TypeScript version)
npm run dev

# Or start Python MCP server
python src/server.py
```

### 5. Docker Setup (Alternative)

```bash
# Start all services with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

---

## MCP Integration

The Model Context Protocol (MCP) integration enables seamless AI assistant connectivity with the Kanban platform.

### MCP Server Architecture

```mermaid
flowchart TD
    subgraph "MCP Server"
        SERVER[MCP Server Core]
        TOOLS[Tool Registry]
        CLIENTS[Client Manager]
    end
    
    subgraph "Tool Categories"
        GITHUB_TOOLS[GitHub Tools]
        KANBAN_TOOLS[Kanban Tools]
        DOC_TOOLS[Documentation Tools]
        ANALYSIS_TOOLS[Analysis Tools]
        PROJECT_TOOLS[Project Management]
    end
    
    subgraph "External Integrations"
        BACKEND[Kanban Backend]
        GITHUB_API[GitHub API]
        AI_SERVICES[AI/LLM Services]
        NEO4J[Neo4j Database]
    end
    
    SERVER --> TOOLS
    SERVER --> CLIENTS
    TOOLS --> GITHUB_TOOLS
    TOOLS --> KANBAN_TOOLS
    TOOLS --> DOC_TOOLS
    TOOLS --> ANALYSIS_TOOLS
    TOOLS --> PROJECT_TOOLS
    
    GITHUB_TOOLS --> GITHUB_API
    KANBAN_TOOLS --> BACKEND
    DOC_TOOLS --> AI_SERVICES
    ANALYSIS_TOOLS --> NEO4J
    PROJECT_TOOLS --> BACKEND
```

### Available MCP Tools

#### GitHub Integration Tools
- `analyze-pr`: Comprehensive PR analysis with AI insights
- `create-pr`: Create pull requests with auto-generated content
- `add-comment`: Add contextual comments to PRs
- `submit-review`: Submit detailed code reviews
- `create-issue`: Generate GitHub issues from analysis
- `list-pr-files`: List and analyze changed files
- `read-file-chunked`: Read large files with intelligent chunking

#### Kanban Management Tools
- `create-task-from-issue`: Convert GitHub issues to Kanban tasks
- `create-task-from-pr`: Generate tasks from pull requests
- `link-task-to-pr`: Connect Kanban tasks with GitHub PRs
- `sync-pr-status`: Synchronize PR status with task progress

#### Documentation Tools
- `generate-api-docs`: Auto-generate comprehensive API documentation
- `update-changelog`: Maintain project changelogs
- `search-documentation`: Smart documentation search and retrieval

#### Code Analysis Tools
- `analyze-code-quality`: Deep code quality assessment
- `calculate-metrics`: Compute code complexity metrics
- `analyze-code-dependencies`: Map code dependency relationships

#### Project Management Tools
- `analyze-team-velocity`: Calculate and track team performance
- `generate-reports`: Create comprehensive project reports

### MCP Tool Configuration

Each MCP tool supports extensive configuration options:

```typescript
interface MCPToolConfig {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  handler: (args: any) => Promise<MCPToolResult>;
  rateLimits?: {
    requests: number;
    window: number; // in milliseconds
  };
  permissions?: string[];
  caching?: {
    enabled: boolean;
    ttl: number;
  };
}
```

---

## Claude CLI Integration

### Setup Claude CLI with MCP

1. **Install Claude CLI:**
```bash
npm install -g @anthropic-ai/claude-cli
```

2. **Configure Claude CLI:**
```bash
claude config
```

3. **Add MCP Server Configuration:**

Create or update `~/.claude/mcp_servers.json`:
```json
{
  "kanban-mcp": {
    "command": "node",
    "args": ["./mcp-server/dist/index.js"],
    "env": {
      "MCP_PORT": "3002",
      "BACKEND_URL": "http://localhost:3001"
    }
  }
}
```

### Using Claude CLI with Kanban

#### Basic Commands

```bash
# Start a conversation with MCP context
claude chat --mcp-server kanban-mcp

# Analyze a GitHub PR
claude --mcp-server kanban-mcp \
  "Analyze PR #123 in vedantparmar12/Kanban repository"

# Generate project documentation
claude --mcp-server kanban-mcp \
  "Generate comprehensive API documentation for the Kanban project"

# Create Kanban tasks from GitHub issues
claude --mcp-server kanban-mcp \
  "Create Kanban tasks from the latest 5 GitHub issues"
```

#### Advanced Workflows

**PR Review Workflow:**
```bash
# Comprehensive PR analysis
claude --mcp-server kanban-mcp \
  "Analyze PR #45, check code quality, suggest improvements, and create review comments"

# Auto-generate PR from branch
claude --mcp-server kanban-mcp \
  "Create a PR from feature/user-authentication branch with auto-generated title and description"
```

**Project Management Workflow:**
```bash
# Team velocity analysis
claude --mcp-server kanban-mcp \
  "Analyze team velocity for the last sprint and generate performance report"

# Automated task creation
claude --mcp-server kanban-mcp \
  "Review recent GitHub issues and create corresponding Kanban tasks with appropriate priorities"
```

### MCP Client Example

```typescript
import { MCPClient } from './src/services/mcp/mcp-client';

const client = new MCPClient('http://localhost:3002');

// Initialize connection
await client.connect();

// Call MCP tool
const result = await client.callTool('analyze-pr', {
  owner: 'vedantparmar12',
  repo: 'Kanban',
  prNumber: 123
});

console.log('PR Analysis:', result);
```

---

## Configuration

### Database Configuration

**Prisma Schema (prisma/schema.prisma):**
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model User {
  id          Int      @id @default(autoincrement())
  email       String   @unique
  username    String   @unique
  password    String
  firstName   String?
  lastName    String?
  avatar      String?
  role        UserRole @default(USER)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  // Relations
  boards      BoardMember[]
  tasks       Task[]
  comments    Comment[]
  createdBoards Board[] @relation("BoardCreator")
}

model Board {
  id          Int      @id @default(autoincrement())
  title       String
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  creatorId   Int
  
  // Relations
  creator     User         @relation("BoardCreator", fields: [creatorId], references: [id])
  members     BoardMember[]
  swimlanes   Swimlane[]
  tasks       Task[]
}

model Swimlane {
  id        Int      @id @default(autoincrement())
  title     String
  position  Int
  boardId   Int
  createdAt DateTime @default(now())
  
  // Relations
  board     Board @relation(fields: [boardId], references: [id], onDelete: Cascade)
  tasks     Task[]
}

model Task {
  id          Int        @id @default(autoincrement())
  title       String
  description String?
  status      TaskStatus @default(TODO)
  priority    Priority   @default(MEDIUM)
  position    Float
  dueDate     DateTime?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  
  // Foreign Keys
  boardId     Int
  swimlaneId  Int?
  assigneeId  Int?
  
  // Relations
  board       Board      @relation(fields: [boardId], references: [id], onDelete: Cascade)
  swimlane    Swimlane?  @relation(fields: [swimlaneId], references: [id])
  assignee    User?      @relation(fields: [assigneeId], references: [id])
  comments    Comment[]
}

enum UserRole {
  ADMIN
  USER
}

enum TaskStatus {
  TODO
  IN_PROGRESS
  IN_REVIEW
  DONE
}

enum Priority {
  LOW
  MEDIUM
  HIGH
  URGENT
}
```

### WebSocket Configuration

```typescript
// WebSocket Service Configuration
export const websocketConfig = {
  port: process.env.WS_PORT || 3001,
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
};

// Events
export const WEBSOCKET_EVENTS = {
  // Task Events
  TASK_CREATED: 'task:created',
  TASK_UPDATED: 'task:updated',
  TASK_MOVED: 'task:moved',
  TASK_DELETED: 'task:deleted',
  
  // Board Events
  BOARD_UPDATED: 'board:updated',
  MEMBER_JOINED: 'member:joined',
  MEMBER_LEFT: 'member:left',
  
  // Real-time Collaboration
  USER_JOINED_BOARD: 'user:joined_board',
  USER_LEFT_BOARD: 'user:left_board',
  CURSOR_MOVED: 'cursor:moved'
};
```

---

## Usage Guide

### Getting Started

1. **Access the Application:**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3001
   - MCP Server: http://localhost:3002

2. **Create Your First Board:**
```bash
# Using Claude CLI
claude --mcp-server kanban-mcp \
  "Create a new Kanban board called 'Sprint Planning' with default swimlanes"
```

3. **Set Up GitHub Integration:**
```typescript
// Configure GitHub webhook
const webhook = {
  url: 'http://your-domain.com/api/webhooks/github',
  events: ['pull_request', 'issues', 'push'],
  secret: process.env.GITHUB_WEBHOOK_SECRET
};
```

### Workflow Examples

#### Development Workflow

```mermaid
flowchart LR
    A[Create Issue] --> B[Generate Task]
    B --> C[Start Development]
    C --> D[Create PR]
    D --> E[AI Review]
    E --> F[Update Task]
    F --> G[Merge & Close]
    
    subgraph "MCP Automation"
        H[Auto Task Creation]
        I[PR Analysis]
        J[Status Sync]
    end
    
    B -.-> H
    E -.-> I
    F -.-> J
```

#### Team Management Workflow

1. **Sprint Planning:**
```bash
claude --mcp-server kanban-mcp \
  "Analyze team velocity from last sprint and suggest task allocation for upcoming sprint"
```

2. **Daily Standup:**
```bash
claude --mcp-server kanban-mcp \
  "Generate daily standup report showing completed tasks, in-progress work, and blockers"
```

3. **Sprint Review:**
```bash
claude --mcp-server kanban-mcp \
  "Create sprint review report with metrics, completed features, and team performance analysis"
```

---

## API Reference

### Authentication API

#### POST /api/auth/register
Register a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "username": "johndoe",
  "password": "securepassword123",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "email": "user@example.com",
      "username": "johndoe",
      "firstName": "John",
      "lastName": "Doe",
      "role": "USER"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### POST /api/auth/login
Authenticate user and get access token.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

### Board Management API

#### GET /api/boards
Get all boards for authenticated user.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "Sprint Planning",
      "description": "Current sprint tasks",
      "createdAt": "2024-01-15T10:00:00Z",
      "members": [
        {
          "user": {
            "id": 1,
            "username": "johndoe",
            "firstName": "John",
            "lastName": "Doe"
          },
          "role": "ADMIN"
        }
      ],
      "swimlanes": [
        {
          "id": 1,
          "title": "To Do",
          "position": 0
        }
      ]
    }
  ]
}
```

#### POST /api/boards
Create a new board.

**Request:**
```json
{
  "title": "New Project Board",
  "description": "Board for new project development",
  "swimlanes": [
    { "title": "Backlog", "position": 0 },
    { "title": "To Do", "position": 1 },
    { "title": "In Progress", "position": 2 },
    { "title": "Review", "position": 3 },
    { "title": "Done", "position": 4 }
  ]
}
```

### Task Management API

#### POST /api/tasks
Create a new task.

**Request:**
```json
{
  "title": "Implement user authentication",
  "description": "Add JWT-based authentication system",
  "boardId": 1,
  "swimlaneId": 2,
  "priority": "HIGH",
  "assigneeId": 1,
  "dueDate": "2024-01-30T23:59:59Z"
}
```

#### PUT /api/tasks/:id/move
Move task to different position/swimlane.

**Request:**
```json
{
  "swimlaneId": 3,
  "position": 1.5,
  "status": "IN_PROGRESS"
}
```

### MCP Integration API

#### POST /api/mcp/tools/call
Call MCP tool directly through REST API.

**Request:**
```json
{
  "tool": "analyze-pr",
  "args": {
    "owner": "vedantparmar12",
    "repo": "Kanban",
    "prNumber": 123
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "analysis": {
      "summary": "This PR implements user authentication...",
      "suggestions": ["Add input validation", "Include unit tests"],
      "codeQuality": 8.5,
      "securityScore": 9.0
    }
  }
}
```

---

## Project Structure

```
Kanban/
├── backend/                    # Node.js Backend
│   ├── src/
│   │   ├── api/
│   │   │   ├── middlewares/   # Auth, validation, error handling
│   │   │   ├── routes/        # API route definitions
│   │   │   └── validators/    # Request validation schemas
│   │   ├── config/            # App configuration
│   │   ├── database/          # Database connection and setup
│   │   ├── services/          # Business logic services
│   │   │   ├── ai/           # AI/LLM integration
│   │   │   ├── analytics/    # Metrics and analytics
│   │   │   ├── automation/   # Workflow automation
│   │   │   ├── kanban/       # Core Kanban functionality
│   │   │   ├── mcp/          # MCP integration services
│   │   │   └── notifications/ # Real-time notifications
│   │   └── utils/            # Utility functions
│   ├── prisma/               # Database schema and migrations
│   └── package.json
├── frontend/                  # React Frontend
│   ├── src/
│   │   ├── components/       # React components
│   │   │   ├── Analytics/    # Analytics dashboard
│   │   │   ├── Board/        # Kanban board components
│   │   │   └── shared/       # Shared UI components
│   │   └── services/         # API client services
│   └── package.json
├── mcp-server/               # MCP Server
│   ├── src/
│   │   ├── clients/          # External service clients
│   │   ├── tools/            # MCP tool implementations
│   │   │   ├── code-analysis/
│   │   │   ├── documentation/
│   │   │   ├── github/
│   │   │   ├── kanban/
│   │   │   ├── neo4j/
│   │   │   └── project-management/
│   │   ├── types/            # TypeScript type definitions
│   │   └── utils/            # Utility functions
│   └── package.json
├── docker/                   # Docker configuration
├── docs/                     # Generated documentation
└── docker-compose.yml       # Multi-container setup
```

---

## Development Workflow

### Git Workflow

```bash
# Feature development
git checkout -b feature/new-feature
git commit -m "feat: add new feature"
git push origin feature/new-feature

# Create PR via MCP
claude --mcp-server kanban-mcp \
  "Create PR for feature/new-feature with auto-generated description"
```

### Code Quality Checks

```bash
# Backend
cd backend
npm run lint
npm run test
npm run type-check

# Frontend
cd frontend
npm run lint
npm run test
npm run build

# MCP Server
cd mcp-server
npm run lint
npm run test
python -m pytest src/tests/
```

### CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: password
          MYSQL_DATABASE: kanban_test
        ports:
          - 3306:3306
          
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.9'
          
      - name: Install dependencies
        run: |
          cd backend && npm install
          cd ../frontend && npm install
          cd ../mcp-server && npm install && pip install -r requirements.txt
          
      - name: Run tests
        run: |
          cd backend && npm test
          cd ../frontend && npm test
          cd ../mcp-server && npm test && python -m pytest
          
      - name: Build
        run: |
          cd backend && npm run build
          cd ../frontend && npm run build
          cd ../mcp-server && npm run build
```

---

## Deployment

### Docker Deployment

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    container_name: kanban-mysql
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: kanban_db
      MYSQL_USER: kanban_user
      MYSQL_PASSWORD: kanban_password
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql

  redis:
    image: redis:7-alpine
    container_name: kanban-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: kanban-backend
    environment:
      - DATABASE_URL=mysql://kanban_user:kanban_password@mysql:3306/kanban_db
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=your-production-jwt-secret
      - NODE_ENV=production
    ports:
      - "3001:3001"
    depends_on:
      - mysql
      - redis
    volumes:
      - ./backend:/app
      - /app/node_modules

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: kanban-frontend
    environment:
      - VITE_API_BASE_URL=http://localhost:3001
      - VITE_WS_URL=ws://localhost:3001
    ports:
      - "5173:5173"
    depends_on:
      - backend

  mcp-server:
    build:
      context: ./mcp-server
      dockerfile: Dockerfile
    container_name: kanban-mcp-server
    environment:
      - MCP_PORT=3002
      - BACKEND_URL=http://backend:3001
      - GITHUB_TOKEN=${GITHUB_TOKEN}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    ports:
      - "3002:3002"
    depends_on:
      - backend

  nginx:
    image: nginx:alpine
    container_name: kanban-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./docker/nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./docker/nginx/ssl:/etc/nginx/ssl
    depends_on:
      - frontend
      - backend
      - mcp-server

volumes:
  mysql_data:
  redis_data:
```

### Production Deployment Steps

1. **Prepare Environment:**
```bash
# Create production environment file
cp .env.example .env.production

# Update with production values
nano .env.production
```

2. **Deploy with Docker:**
```bash
# Build and start services
docker-compose -f docker-compose.prod.yml up -d

# Run database migrations
docker-compose exec backend npx prisma migrate deploy

# Verify deployment
docker-compose ps
docker-compose logs -f
```

3. **Configure Nginx (Production):**
```nginx
# /etc/nginx/sites-available/kanban
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/key.pem;
    
    # Frontend
    location / {
        proxy_pass http://localhost:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # Backend API
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # WebSocket
    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    
    # MCP Server
    location /mcp/ {
        proxy_pass http://localhost:3002/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Cloud Deployment Options

#### AWS Deployment
```bash
# Using AWS ECS with Docker
aws ecs create-cluster --cluster-name kanban-cluster

# Deploy using AWS CDK or CloudFormation
cdk deploy KanbanStack
```

#### Google Cloud Deployment
```bash
# Using Google Cloud Run
gcloud run deploy kanban-backend --source ./backend --region us-central1
gcloud run deploy kanban-frontend --source ./frontend --region us-central1
gcloud run deploy kanban-mcp --source ./mcp-server --region us-central1
```

#### Azure Deployment
```bash
# Using Azure Container Instances
az container create --resource-group kanban-rg --name kanban-app --file docker-compose.yml
```

---

## Troubleshooting

### Common Issues and Solutions

#### 1. MCP Server Connection Issues

**Problem:** Claude CLI cannot connect to MCP server
```
Error: Connection refused to MCP server at localhost:3002
```

**Solution:**
```bash
# Check if MCP server is running
curl http://localhost:3002/health

# Verify MCP configuration
cat ~/.claude/mcp_servers.json

# Restart MCP server with debug logging
DEBUG=mcp:* npm run dev
```

#### 2. Database Connection Issues

**Problem:** Backend cannot connect to MySQL database
```
Error: connect ECONNREFUSED 127.0.0.1:3306
```

**Solution:**
```bash
# Check MySQL status
mysql -u root -p -e "SHOW DATABASES;"

# Verify connection string in .env
echo $DATABASE_URL

# Reset database connection
npx prisma db push --force-reset
```

#### 3. WebSocket Connection Issues

**Problem:** Real-time updates not working
```
WebSocket connection failed: Error during WebSocket handshake
```

**Solution:**
```bash
# Check WebSocket server
curl -i -N -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: SGVsbG8sIHdvcmxkIQ==" \
  -H "Sec-WebSocket-Version: 13" \
  http://localhost:3001/socket.io/

# Update CORS configuration
# In backend/src/index.ts
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});
```

#### 4. GitHub Integration Issues

**Problem:** GitHub webhooks not triggering
```
Error: GitHub webhook signature validation failed
```

**Solution:**
```bash
# Verify webhook secret
echo $GITHUB_WEBHOOK_SECRET

# Check webhook URL accessibility
curl -X POST https://your-domain.com/api/webhooks/github \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# Update webhook configuration in GitHub repository settings
```

#### 5. Claude CLI MCP Integration Issues

**Problem:** MCP tools not available in Claude CLI
```
Error: Tool 'analyze-pr' not found in MCP server
```

**Solution:**
```bash
# Verify MCP server tools registration
curl http://localhost:3002/tools

# Check MCP server logs
docker-compose logs mcp-server

# Restart Claude CLI with fresh MCP connection
claude config --reset-mcp
```

### Performance Optimization

#### Backend Optimization

1. **Database Query Optimization:**
```typescript
// Use Prisma query optimization
const tasks = await prisma.task.findMany({
  where: { boardId },
  include: {
    assignee: {
      select: { id: true, username: true, avatar: true }
    },
    comments: {
      orderBy: { createdAt: 'desc' },
      take: 5
    }
  },
  orderBy: { position: 'asc' }
});
```

2. **Caching Implementation:**
```typescript
// Redis caching for frequently accessed data
const cacheKey = `board:${boardId}:tasks`;
let tasks = await redis.get(cacheKey);

if (!tasks) {
  tasks = await prisma.task.findMany({ where: { boardId } });
  await redis.setex(cacheKey, 300, JSON.stringify(tasks));
} else {
  tasks = JSON.parse(tasks);
}
```

3. **Rate Limiting:**
```typescript
// Advanced rate limiting configuration
const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req) => {
    if (req.user?.role === 'ADMIN') return 1000;
    return 100; // Regular users
  },
  standardHeaders: true,
  legacyHeaders: false,
});
```

#### Frontend Optimization

1. **Code Splitting:**
```typescript
// Lazy load components
const BoardView = lazy(() => import('./components/Board/BoardView'));
const Analytics = lazy(() => import('./components/Analytics/Dashboard'));

// Route-based code splitting
const router = createBrowserRouter([
  {
    path: "/boards/:id",
    element: <Suspense fallback={<Loading />}><BoardView /></Suspense>
  }
]);
```

2. **Memoization:**
```typescript
// Optimize expensive calculations
const TaskCard = memo(({ task, onUpdate }) => {
  const formattedDate = useMemo(() => 
    task.dueDate ? format(new Date(task.dueDate), 'MMM dd') : null,
    [task.dueDate]
  );
  
  return <div>{/* Task card content */}</div>;
});
```

### Monitoring and Logging

#### Application Monitoring

```typescript
// Comprehensive logging setup
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ],
});

// Add request logging middleware
app.use((req, res, next) => {
  logger.info({
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });
  next();
});
```

#### Health Checks

```typescript
// Comprehensive health check endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: 'unknown',
      redis: 'unknown',
      mcp: 'unknown'
    }
  };
  
  try {
    // Check database
    await prisma.$queryRaw`SELECT 1`;
    health.services.database = 'healthy';
    
    // Check Redis
    await redis.ping();
    health.services.redis = 'healthy';
    
    // Check MCP server
    const mcpResponse = await fetch('http://localhost:3002/health');
    health.services.mcp = mcpResponse.ok ? 'healthy' : 'unhealthy';
    
  } catch (error) {
    health.status = 'error';
    logger.error('Health check failed:', error);
  }
  
  res.json(health);
});
```

---

## Advanced Features

### AI-Powered Analytics Dashboard

The Kanban platform includes advanced analytics powered by AI through the MCP integration:

#### Team Velocity Analysis

```typescript
// MCP Tool: analyze-team-velocity
interface VelocityAnalysis {
  sprintData: {
    completed: number;
    planned: number;
    carryover: number;
    velocity: number;
  }[];
  trends: {
    velocityTrend: 'increasing' | 'decreasing' | 'stable';
    burndownRate: number;
    predictedCompletion: Date;
  };
  recommendations: string[];
  teamMetrics: {
    memberId: number;
    tasksCompleted: number;
    averageTaskTime: number;
    efficiency: number;
  }[];
}
```

Usage with Claude CLI:
```bash
claude --mcp-server kanban-mcp \
  "Analyze team velocity for the last 3 sprints and provide optimization recommendations"
```

#### Code Quality Integration

```typescript
// Automated code quality analysis on PR creation
export const analyzePRQuality = async (prData: PRData) => {
  const analysis = await mcpClient.callTool('analyze-code-quality', {
    owner: prData.owner,
    repo: prData.repo,
    prNumber: prData.number
  });
  
  // Auto-create tasks for identified issues
  if (analysis.issues.length > 0) {
    await mcpClient.callTool('create-task-from-pr', {
      prData,
      taskType: 'code_quality_improvements',
      issues: analysis.issues
    });
  }
  
  return analysis;
};
```

### Automated Workflow Orchestration

#### Smart Task Assignment

```mermaid
flowchart TD
    A[New Issue Created] --> B[AI Analysis]
    B --> C[Skill Matching]
    C --> D[Workload Assessment]
    D --> E[Priority Calculation]
    E --> F[Auto Assignment]
    F --> G[Task Creation]
    G --> H[Notification Sent]
    
    subgraph "AI Decision Engine"
        I[Team Skills DB]
        J[Historical Performance]
        K[Current Workload]
        L[Priority Algorithm]
    end
    
    C --> I
    D --> J
    D --> K
    E --> L
```

#### Automated Documentation Updates

```bash
# Claude CLI command for documentation automation
claude --mcp-server kanban-mcp \
  "Review recent code changes and update API documentation automatically"

# Example automated workflow
claude --mcp-server kanban-mcp \
  "When PR is merged to main branch:
   1. Update API documentation
   2. Generate changelog entry
   3. Update README if needed
   4. Create release notes draft"
```

---

## Security Best Practices

### Authentication & Authorization

```typescript
// JWT token configuration with refresh tokens
export const jwtConfig = {
  accessToken: {
    secret: process.env.JWT_SECRET,
    expiresIn: '15m'
  },
  refreshToken: {
    secret: process.env.JWT_REFRESH_SECRET,
    expiresIn: '7d'
  }
};

// Role-based access control middleware
export const requireRole = (roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};
```

### API Security

```typescript
// Comprehensive security middleware setup
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
  credentials: true,
  optionsSuccessStatus: 200
}));

// Input validation and sanitization
app.use('/api', (req, res, next) => {
  // Sanitize inputs
  Object.keys(req.body).forEach(key => {
    if (typeof req.body[key] === 'string') {
      req.body[key] = validator.escape(req.body[key]);
    }
  });
  next();
});
```

### MCP Security

```typescript
// MCP tool access control
export const mcpToolSecurity = {
  // Tool-specific permissions
  toolPermissions: {
    'analyze-pr': ['read:repo'],
    'create-pr': ['write:repo'],
    'generate-api-docs': ['read:repo'],
    'analyze-team-velocity': ['read:analytics']
  },
  
  // Rate limiting per tool
  rateLimits: {
    'analyze-pr': { requests: 50, window: 3600000 }, // 50/hour
    'create-pr': { requests: 20, window: 3600000 },   // 20/hour
  },
  
  // API key validation
  validateApiKey: async (key: string) => {
    return await redis.get(`api_key:${key}`);
  }
};
```

---

## Extension and Customization

### Custom MCP Tools

Create your own MCP tools for specific workflows:

```typescript
// Custom MCP tool example: Slack integration
export const slackNotificationTool: MCPTool = {
  name: 'send-slack-notification',
  description: 'Send notifications to Slack channels',
  inputSchema: {
    type: 'object',
    properties: {
      channel: { type: 'string' },
      message: { type: 'string' },
      priority: { type: 'string', enum: ['low', 'medium', 'high'] }
    },
    required: ['channel', 'message']
  },
  handler: async (args) => {
    const { channel, message, priority = 'medium' } = args;
    
    const slackMessage = {
      channel: `#${channel}`,
      text: message,
      color: priority === 'high' ? 'danger' : 
             priority === 'medium' ? 'warning' : 'good',
      username: 'Kanban Bot'
    };
    
    const response = await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackMessage)
    });
    
    return {
      success: response.ok,
      message: response.ok ? 'Notification sent' : 'Failed to send notification'
    };
  }
};

// Register the custom tool
mcpServer.registerTool(slackNotificationTool);
```

### Custom Automation Rules

```typescript
// Define custom automation rules
export interface AutomationRule {
  id: string;
  name: string;
  trigger: {
    event: string;
    conditions: Record<string, any>;
  };
  actions: {
    type: string;
    config: Record<string, any>;
  }[];
  enabled: boolean;
}

// Example: Auto-assign critical bugs
const criticalBugRule: AutomationRule = {
  id: 'critical-bug-assignment',
  name: 'Auto-assign critical bugs',
  trigger: {
    event: 'task.created',
    conditions: {
      priority: 'URGENT',
      labels: ['bug']
    }
  },
  actions: [
    {
      type: 'assign_to_team_lead',
      config: { teamId: 'backend-team' }
    },
    {
      type: 'send_notification',
      config: { 
        channel: 'urgent-bugs',
        template: 'critical_bug_alert'
      }
    }
  ],
  enabled: true
};
```

---

## Conclusion

The Kanban Project Management Platform represents a next-generation approach to project management, combining traditional Kanban methodology with cutting-edge AI integration through MCP (Model Context Protocol). This comprehensive documentation has covered:

### Key Achievements
- **Full-Stack Architecture**: Modern TypeScript/Node.js backend with React frontend
- **AI Integration**: Seamless Claude CLI integration via MCP protocol
- **Real-time Collaboration**: WebSocket-based live updates and collaboration
- **Extensible Design**: Plugin-based architecture with custom MCP tools
- **Production Ready**: Docker deployment, security best practices, monitoring

### Getting Started Quick Reference

1. **Basic Setup:**
```bash
git clone https://github.com/vedantparmar12/Kanban.git
cd Kanban
docker-compose up -d
```

2. **Claude CLI Integration:**
```bash
claude config --mcp-server kanban-mcp
claude "Analyze my project and suggest optimizations"
```

3. **Access Points:**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3001
   - MCP Server: http://localhost:3002

### Support and Community

For questions, issues, or contributions:
- **GitHub Issues**: https://github.com/vedantparmar12/Kanban/issues
- **Documentation**: Auto-generated and updated via MCP tools
- **Community**: Join discussions in GitHub Discussions

### Future Roadmap
- Enhanced AI capabilities with custom model integration
- Mobile application with React Native
- Advanced analytics and reporting
- Multi-tenant SaaS deployment options
- Integration with popular project management tools

This platform showcases the future of development workflows, where AI assistants work seamlessly alongside human developers to enhance productivity, code quality, and project management efficiency.

---

*Last updated: September 15, 2025*
*Generated with AI assistance via MCP integration*
