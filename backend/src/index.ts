import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import 'express-async-errors';

import { appConfig } from './config/app.config';
import { logger } from './utils/logger';
import { errorHandler } from './api/middlewares/error.middleware';
import { authRouter } from './api/routes/auth.routes';
import { boardRouter } from './api/routes/board.routes';
import { taskRouter } from './api/routes/task.routes';
import { prRouter } from './api/routes/pr.routes';
import { docsRouter } from './api/routes/docs.routes';
import { graphRouter } from './api/routes/graph.routes';
import { initializeWebSocket } from './services/websocket.service';
import { connectDatabase } from './database/neo4j.connection';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
  }
});

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRouter);
app.use('/api/boards', boardRouter);
app.use('/api/tasks', taskRouter);
app.use('/api/pr', prRouter);
app.use('/api/docs', docsRouter);
app.use('/api/graph', graphRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.use(errorHandler);

initializeWebSocket(io);

async function startServer() {
  try {
    await connectDatabase();
    
    const port = appConfig.port;
    httpServer.listen(port, () => {
      logger.info(`Server running on port ${port}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export { app, io };