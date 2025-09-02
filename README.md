# Kanban Board with Graph-Based RAG, PR Agent & Documentation System

A comprehensive Kanban board application powered by Neo4j graph database, featuring AI-powered PR management, automatic documentation generation, and advanced Graph RAG (Retrieval-Augmented Generation) capabilities for intelligent code and project insights.

## Features

### Core Kanban Functionality
- **Multi-board Management**: Create and manage multiple boards for different projects
- **Drag & Drop Interface**: Intuitive task management with smooth drag-and-drop
- **Real-time Collaboration**: WebSocket-based live updates across all connected clients
- **Task Management**: Comprehensive task features including priorities, due dates, labels, and assignees
- **Custom Workflows**: Configurable columns and status transitions
- **Analytics Dashboard**: Track project metrics and team performance

### AI-Powered PR Agent
- **Automated PR Creation**: Generate pull requests with AI-enhanced descriptions
- **Smart Code Analysis**: Understand changes and suggest reviewers
- **Conflict Detection**: Proactive merge conflict warnings
- **Documentation Sync**: Automatic documentation updates with code changes

### Documentation Generator
- **Auto-generated Docs**: Create documentation from code changes
- **README Synchronization**: Keep README files up-to-date automatically
- **API Documentation**: Generate API docs from endpoints
- **Change Logs**: Automated CHANGELOG generation

### Graph-Based Intelligence (Neo4j)
- **Knowledge Graph**: Interconnected representation of code, tasks, and documentation
- **Graph RAG**: Semantic search and context-aware question answering
- **Code Analysis**: Dependency tracking and impact analysis
- **Relationship Visualization**: Interactive graph visualizations of project structure
- **Pattern Detection**: Identify code patterns and similar implementations
- **Smart Suggestions**: Context-aware recommendations based on graph relationships

## Tech Stack

### Backend
- **Node.js** with **TypeScript**
- **Express.js** for REST API
- **Socket.io** for real-time communication
- **Neo4j** graph database for entity relationships
- **Redis** for caching and queues
- **Bull** for job processing
- **JWT** authentication
- **LangChain** for RAG implementation
- **OpenAI Embeddings** for semantic search

### Frontend
- **React 18** with **TypeScript**
- **Vite** for fast development
- **Zustand** for state management
- **TanStack Query** for server state
- **@dnd-kit** for drag-and-drop
- **Tailwind CSS** for styling
- **Recharts** for analytics

### MCP Server
- **Python 3.11** with **FastAPI**
- **GitHub API** integration
- **OpenAI GPT-4** for AI features
- **GitPython** for repository management

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.11+
- Docker & Docker Compose
- Neo4j 5+ (or use Docker)
- Redis 7+ (or use Docker)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/kanban-pr-agent.git
cd kanban-pr-agent
```

2. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Using Docker Compose (Recommended)**
```bash
docker-compose up -d
```

4. **Manual Setup**

Backend setup:
```bash
cd backend
npm install
npm run dev
```

Frontend setup:
```bash
cd frontend
npm install
npm run dev
```

MCP Server setup:
```bash
cd mcp-server
pip install -r requirements.txt
uvicorn src.server:app --reload
```

5. **Access the application**
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- MCP Server: http://localhost:8000
- Neo4j Browser: http://localhost:7474
- API Documentation: http://localhost:3000/api-docs

## Configuration

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NEO4J_URI` | Neo4j connection URI | `bolt://localhost:7687` |
| `NEO4J_USERNAME` | Neo4j username | `neo4j` |
| `NEO4J_PASSWORD` | Neo4j password | `password123` |
| `JWT_SECRET` | Secret for JWT tokens | `your-secret-key` |
| `GITHUB_TOKEN` | GitHub Personal Access Token | `ghp_xxxxx` |
| `OPENAI_API_KEY` | OpenAI API Key | `sk-xxxxx` |

See `.env.example` for all configuration options.

## API Documentation

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh token
- `GET /api/auth/me` - Get current user

### Boards
- `GET /api/boards` - List boards
- `POST /api/boards` - Create board
- `GET /api/boards/:id` - Get board details
- `PUT /api/boards/:id` - Update board
- `DELETE /api/boards/:id` - Delete board

### Tasks
- `GET /api/tasks` - List tasks
- `POST /api/tasks` - Create task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task
- `PUT /api/tasks/:id/move` - Move task

### Pull Requests
- `POST /api/pr/create` - Create PR from branch
- `GET /api/pr/:id` - Get PR details
- `POST /api/pr/:id/review` - Add review

### Graph & RAG
- `GET /api/graph/visualization/board/:id` - Get board graph visualization
- `GET /api/graph/visualization/codebase/:id` - Get codebase graph
- `POST /api/graph/search/semantic` - Semantic search
- `GET /api/graph/similar/:nodeId` - Find similar nodes
- `GET /api/graph/impact/:nodeId` - Impact analysis
- `POST /api/graph/rag/question` - Ask questions with RAG
- `GET /api/graph/dependencies/:nodeId` - Analyze dependencies

## WebSocket Events

### Client → Server
- `join-board` - Join board room
- `move-task` - Move task to column
- `update-task` - Update task details

### Server → Client
- `task-moved` - Task position changed
- `task-updated` - Task details changed
- `board-updated` - Board configuration changed

## Development

### Running Tests
```bash
# Backend tests
cd backend && npm test

# Frontend tests
cd frontend && npm test

# E2E tests
npm run test:e2e
```

### Code Style
```bash
# Lint backend
cd backend && npm run lint

# Lint frontend
cd frontend && npm run lint
```

### Neo4j Cypher Queries
```bash
# Access Neo4j Browser at http://localhost:7474
# Default credentials: neo4j/password123

# Example: View all nodes
MATCH (n) RETURN n LIMIT 25

# Example: Find task relationships
MATCH (t:Task)-[r]-(connected)
RETURN t, r, connected
```

## Docker Deployment

### Production Build
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Scaling
```bash
docker-compose up -d --scale backend=3
```

## Security Considerations

- All passwords are hashed using bcrypt
- JWT tokens expire after 7 days by default
- Rate limiting on API endpoints
- Input validation using Zod schemas
- Cypher injection prevention via parameterized queries
- XSS protection in React components
- CORS configuration for production
- Neo4j role-based access control

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues and questions:
- Create an issue on GitHub
- Check the [documentation](./docs)
- Contact the maintainers

## Acknowledgments

- Built with modern web technologies
- Powered by OpenAI GPT-4 for AI features
- Uses MCP (Model Context Protocol) for extensibility