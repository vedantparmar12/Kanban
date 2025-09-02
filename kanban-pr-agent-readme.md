# Kanban Board with Automated PR Agent & Documentation System

## Features

### Core Kanban Features
- **Multi-level Board Management**: Organization and personal boards
- **Drag & Drop Interface**: Intuitive task management across columns
- **Real-time Updates**: WebSocket-based live synchronization
- **Task Prioritization**: Priority levels, due dates, and assignees
- **Custom Workflows**: Configurable columns and status transitions
- **Filtering & Search**: Advanced task filtering by status, assignee, labels
- **Task Templates**: Reusable templates for common task types
- **Analytics Dashboard**: Project metrics and burndown charts
- **Role-based Access Control**: Admin, Manager, Member permissions
- **Activity Timeline**: Complete audit trail of all changes

### PR Agent Features (MCP Integration)
- **Automated PR Creation**: Generates PRs from branch changes
- **Smart PR Descriptions**: AI-generated descriptions based on code changes
- **Commit Analysis**: Understands context from commit history
- **Review Assignment**: Automatic reviewer selection based on code ownership
- **Conflict Detection**: Proactive merge conflict warnings
- **PR Templates**: Customizable templates for different PR types

### Documentation Agent Features
- **Code-to-Docs**: Automatic documentation from code changes
- **README Updates**: Real-time README synchronization with codebase
- **API Documentation**: Auto-generated API docs from endpoints
- **Change Logs**: Automated CHANGELOG.md generation
- **Dependency Tracking**: Updates dependency documentation
- **Architecture Diagrams**: Auto-generated system diagrams

## Project Structure

```
kanban-pr-agent/
├── backend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   │   ├── auth.routes.ts
│   │   │   │   ├── board.routes.ts
│   │   │   │   ├── task.routes.ts
│   │   │   │   ├── pr.routes.ts
│   │   │   │   └── docs.routes.ts
│   │   │   ├── middlewares/
│   │   │   │   ├── auth.middleware.ts
│   │   │   │   ├── validation.middleware.ts
│   │   │   │   └── rateLimit.middleware.ts
│   │   │   └── validators/
│   │   │       └── schemas.ts
│   │   ├── services/
│   │   │   ├── kanban/
│   │   │   │   ├── board.service.ts
│   │   │   │   ├── task.service.ts
│   │   │   │   └── analytics.service.ts
│   │   │   ├── mcp/
│   │   │   │   ├── pr-agent.service.ts
│   │   │   │   ├── doc-generator.service.ts
│   │   │   │   └── mcp-client.ts
│   │   │   ├── git/
│   │   │   │   ├── github.service.ts
│   │   │   │   ├── gitlab.service.ts
│   │   │   │   └── bitbucket.service.ts
│   │   │   └── ai/
│   │   │       ├── llm.service.ts
│   │   │       └── embedding.service.ts
│   │   ├── models/
│   │   │   ├── board.model.ts
│   │   │   ├── task.model.ts
│   │   │   ├── user.model.ts
│   │   │   └── pr.model.ts
│   │   ├── database/
│   │   │   ├── connection.ts
│   │   │   ├── migrations/
│   │   │   └── seeds/
│   │   ├── config/
│   │   │   ├── database.config.ts
│   │   │   ├── mcp.config.ts
│   │   │   └── app.config.ts
│   │   └── utils/
│   │       ├── logger.ts
│   │       ├── cache.ts
│   │       └── queue.ts
│   ├── tests/
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Board/
│   │   │   │   ├── Board.tsx
│   │   │   │   ├── Column.tsx
│   │   │   │   ├── TaskCard.tsx
│   │   │   │   └── TaskModal.tsx
│   │   │   ├── PRAgent/
│   │   │   │   ├── PRDashboard.tsx
│   │   │   │   ├── PRCreator.tsx
│   │   │   │   └── PRStatus.tsx
│   │   │   ├── Documentation/
│   │   │   │   ├── DocViewer.tsx
│   │   │   │   └── DocGenerator.tsx
│   │   │   └── shared/
│   │   │       └── Layout.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── BoardView.tsx
│   │   │   └── Settings.tsx
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts
│   │   │   └── useKanban.ts
│   │   ├── store/
│   │   │   └── kanbanStore.ts
│   │   └── services/
│   │       └── api.service.ts
│   ├── package.json
│   └── vite.config.ts
├── mcp-server/
│   ├── src/
│   │   ├── server.py
│   │   ├── pr_agent.py
│   │   ├── doc_generator.py
│   │   └── readme_updater.py
│   ├── requirements.txt
│   └── mcp.json
├── docker/
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   └── Dockerfile.mcp
├── kubernetes/
│   ├── deployments/
│   ├── services/
│   └── configmaps/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── cd.yml
├── docker-compose.yml
├── README.md
└── .env.example
```

## Sample Code

### Backend - PR Agent Service
```typescript
// backend/src/services/mcp/pr-agent.service.ts
import { MCPClient } from './mcp-client';
import { GitHubService } from '../git/github.service';
import { LLMService } from '../ai/llm.service';

export class PRAgentService {
  private mcpClient: MCPClient;
  private githubService: GitHubService;
  private llmService: LLMService;

  constructor() {
    this.mcpClient = new MCPClient();
    this.githubService = new GitHubService();
    this.llmService = new LLMService();
  }

  async createPRFromBranch(branchName: string, repoId: string) {
    const changes = await this.githubService.getBranchChanges(branchName);
    const context = await this.analyzeChanges(changes);
    
    const prData = {
      title: await this.generateTitle(context),
      description: await this.generateDescription(context),
      reviewers: await this.selectReviewers(changes),
      labels: this.extractLabels(context)
    };

    return await this.githubService.createPullRequest(prData);
  }

  private async analyzeChanges(changes: any) {
    return await this.mcpClient.call('analyze_code_changes', { changes });
  }

  private async generateTitle(context: any): Promise<string> {
    const prompt = `Generate PR title for: ${JSON.stringify(context)}`;
    return await this.llmService.generate(prompt);
  }

  private async generateDescription(context: any): Promise<string> {
    const template = `
      ## Summary
      {summary}
      
      ## Changes
      {changes}
      
      ## Testing
      {testing}
      
      ## Impact
      {impact}
    `;
    
    return await this.llmService.generateWithTemplate(template, context);
  }
}
```

### Frontend - Kanban Board Component
```typescript
// frontend/src/components/Board/Board.tsx
import React, { useState, useEffect } from 'react';
import { DndContext, DragEndEvent } from '@dnd-kit/core';
import { Column } from './Column';
import { useKanbanStore } from '../../store/kanbanStore';
import { useWebSocket } from '../../hooks/useWebSocket';

export const Board: React.FC<{ boardId: string }> = ({ boardId }) => {
  const { board, columns, tasks, moveTask } = useKanbanStore();
  const ws = useWebSocket(boardId);

  useEffect(() => {
    ws.on('taskMoved', (data) => {
      moveTask(data.taskId, data.newColumnId);
    });
  }, [ws]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over) return;

    const taskId = active.id as string;
    const newColumnId = over.id as string;
    
    await moveTask(taskId, newColumnId);
    ws.emit('moveTask', { taskId, newColumnId });
  };

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="board-container">
        {columns.map(column => (
          <Column 
            key={column.id} 
            column={column} 
            tasks={tasks.filter(t => t.columnId === column.id)}
          />
        ))}
      </div>
    </DndContext>
  );
};
```

### MCP Server - Documentation Generator
```python
# mcp-server/src/doc_generator.py
import ast
import os
from typing import Dict, List
from pathlib import Path
import markdown
from git import Repo

class DocumentationGenerator:
    def __init__(self, repo_path: str):
        self.repo_path = Path(repo_path)
        self.repo = Repo(repo_path)
        
    async def generate_from_changes(self) -> Dict:
        changed_files = self.get_changed_files()
        docs = {}
        
        for file_path in changed_files:
            if file_path.endswith(('.py', '.ts', '.js')):
                docs[file_path] = await self.generate_file_docs(file_path)
        
        return docs
    
    async def generate_file_docs(self, file_path: str) -> str:
        content = self.read_file(file_path)
        
        if file_path.endswith('.py'):
            return self.generate_python_docs(content)
        elif file_path.endswith(('.ts', '.js')):
            return self.generate_typescript_docs(content)
            
    def update_readme(self, docs: Dict):
        readme_path = self.repo_path / 'README.md'
        current_readme = readme_path.read_text()
        
        # Parse existing README structure
        sections = self.parse_readme_sections(current_readme)
        
        # Update relevant sections
        sections['API Documentation'] = self.format_api_docs(docs)
        sections['Recent Changes'] = self.format_changes()
        
        # Write updated README
        new_readme = self.rebuild_readme(sections)
        readme_path.write_text(new_readme)
        
    def get_changed_files(self) -> List[str]:
        diff = self.repo.index.diff(None)
        return [item.a_path for item in diff]
```

### Docker Compose Configuration
```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: kanban_db
      POSTGRES_USER: kanban_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - kanban_network

  redis:
    image: redis:7-alpine
    networks:
      - kanban_network

  backend:
    build:
      context: ./backend
      dockerfile: ../docker/Dockerfile.backend
    environment:
      DATABASE_URL: postgresql://kanban_user:${DB_PASSWORD}@postgres:5432/kanban_db
      REDIS_URL: redis://redis:6379
      MCP_SERVER_URL: http://mcp-server:8000
    depends_on:
      - postgres
      - redis
      - mcp-server
    networks:
      - kanban_network

  frontend:
    build:
      context: ./frontend
      dockerfile: ../docker/Dockerfile.frontend
    environment:
      VITE_API_URL: http://backend:3000
    depends_on:
      - backend
    networks:
      - kanban_network

  mcp-server:
    build:
      context: ./mcp-server
      dockerfile: ../docker/Dockerfile.mcp
    environment:
      GITHUB_TOKEN: ${GITHUB_TOKEN}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
    volumes:
      - ./repos:/app/repos
    networks:
      - kanban_network

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - frontend
      - backend
    networks:
      - kanban_network

volumes:
  postgres_data:

networks:
  kanban_network:
    driver: bridge
```

## Dependencies

### Backend Dependencies
```json
{
  "dependencies": {
    "@dnd-kit/core": "^6.0.0",
    "express": "^4.18.0",
    "socket.io": "^4.6.0",
    "prisma": "@prisma/client^5.0.0",
    "jsonwebtoken": "^9.0.0",
    "bcrypt": "^5.1.0",
    "zod": "^3.22.0",
    "bull": "^4.11.0",
    "redis": "^4.6.0",
    "@octokit/rest": "^20.0.0",
    "openai": "^4.28.0",
    "winston": "^3.11.0"
  }
}
```

### Frontend Dependencies
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@tanstack/react-query": "^5.0.0",
    "zustand": "^4.4.0",
    "socket.io-client": "^4.6.0",
    "@dnd-kit/sortable": "^8.0.0",
    "react-router-dom": "^6.20.0",
    "tailwindcss": "^3.4.0",
    "recharts": "^2.10.0",
    "react-hook-form": "^7.48.0"
  }
}
```

### MCP Server Dependencies
```txt
fastapi==0.109.0
uvicorn==0.27.0
pydantic==2.5.0
pygithub==2.1.0
gitpython==3.1.40
openai==1.10.0
redis==5.0.0
celery==5.3.0
markdown==3.5.0
black==24.1.0
```

## Environment Variables

```env
# .env.example

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/kanban_db
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-secret-key-here
JWT_EXPIRY=7d

# GitHub Integration
GITHUB_TOKEN=ghp_your_github_token
GITHUB_WEBHOOK_SECRET=your-webhook-secret

# OpenAI
OPENAI_API_KEY=sk-your-openai-key
OPENAI_MODEL=gpt-4

# MCP Configuration
MCP_SERVER_URL=http://localhost:8000
MCP_API_KEY=your-mcp-api-key

# Application
NODE_ENV=production
PORT=3000
FRONTEND_URL=http://localhost:5173
```

## Important Guidelines

### ⚠️ Avoid Hard Coding
- **Configuration**: Use environment variables for all configurations
- **API Endpoints**: Define endpoints in a central configuration file
- **Magic Numbers**: Use named constants for all numeric values
- **Strings**: Use translation keys for user-facing strings
- **Business Logic**: Keep logic in services, not in controllers or components

### 🚫 Prevent Over-Engineering
- **YAGNI Principle**: Don't add functionality until it's needed
- **Simple Solutions First**: Start with the simplest solution that works
- **Avoid Premature Optimization**: Profile before optimizing
- **Minimal Dependencies**: Only add dependencies you actually use
- **Clear Abstractions**: Don't create abstractions for single use cases

### ✅ Best Practices
- **Single Responsibility**: Each module/component should do one thing well
- **DRY (Don't Repeat Yourself)**: Extract common logic into utilities
- **Type Safety**: Use TypeScript/Python type hints everywhere
- **Error Handling**: Implement proper error boundaries and logging
- **Testing**: Write tests for critical business logic
- **Documentation**: Keep docs in sync with code changes

### 🔒 Security Considerations
- **Input Validation**: Validate all user inputs using Zod/Pydantic
- **Authentication**: Use JWT with refresh tokens
- **Authorization**: Implement role-based access control
- **Rate Limiting**: Protect APIs with rate limiting
- **SQL Injection**: Use parameterized queries/ORMs
- **XSS Prevention**: Sanitize user-generated content
- **CORS**: Configure CORS properly for production

### 📊 Performance Optimization
- **Database Indexing**: Index frequently queried columns
- **Caching Strategy**: Use Redis for frequently accessed data
- **Lazy Loading**: Load components/data only when needed
- **Pagination**: Implement pagination for large datasets
- **WebSocket Management**: Use rooms for efficient broadcasting
- **Background Jobs**: Use queues for heavy operations

## Installation & Setup

### Prerequisites
- Node.js 18+
- Python 3.11+
- PostgreSQL 15+
- Redis 7+
- Docker & Docker Compose

### Quick Start
```bash
# Clone repository
git clone https://github.com/yourusername/kanban-pr-agent.git
cd kanban-pr-agent

# Copy environment variables
cp .env.example .env

# Install dependencies
cd backend && npm install
cd ../frontend && npm install
cd ../mcp-server && pip install -r requirements.txt

# Run with Docker Compose
docker-compose up -d

# Run migrations
cd backend && npm run migrate

# Access application
# Frontend: http://localhost:5173
# Backend API: http://localhost:3000
# MCP Server: http://localhost:8000
```

## API Documentation

### Authentication Endpoints
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh JWT token
- `POST /api/auth/logout` - User logout

### Kanban Endpoints
- `GET /api/boards` - List all boards
- `POST /api/boards` - Create new board
- `GET /api/boards/:id` - Get board details
- `PUT /api/boards/:id` - Update board
- `DELETE /api/boards/:id` - Delete board

### Task Endpoints
- `GET /api/tasks` - List tasks with filters
- `POST /api/tasks` - Create new task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task
- `PUT /api/tasks/:id/move` - Move task to another column

### PR Agent Endpoints
- `POST /api/pr/create` - Create PR from branch
- `GET /api/pr/:id` - Get PR details
- `POST /api/pr/:id/update-docs` - Update documentation for PR

### Documentation Endpoints
- `GET /api/docs/readme` - Get current README
- `POST /api/docs/generate` - Generate documentation from code
- `PUT /api/docs/readme` - Update README

## WebSocket Events

### Client to Server
- `join-board` - Join a board room
- `leave-board` - Leave a board room
- `move-task` - Move task to another column
- `update-task` - Update task details
- `create-task` - Create new task

### Server to Client
- `task-moved` - Task was moved
- `task-updated` - Task was updated
- `task-created` - New task created
- `board-updated` - Board details changed
- `pr-created` - New PR was created
- `docs-updated` - Documentation was updated

## Contributing
Please read CONTRIBUTING.md for details on our code of conduct and the process for submitting pull requests.

## License
This project is licensed under the MIT License - see the LICENSE file for details.
