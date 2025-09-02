import axios, { AxiosInstance } from 'axios';
import { createLogger } from '../utils/logger.js';
import type {
  Board,
  Task,
  Column,
  Swimlane,
  BoardMetrics,
  AutomationRule,
  User
} from '../types/kanban.js';

const logger = createLogger('KanbanClient');

export class KanbanClient {
  private api: AxiosInstance;
  private baseURL: string;
  private token?: string;

  constructor(baseURL: string, token?: string) {
    this.baseURL = baseURL;
    this.token = token;

    this.api = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'kanban-mcp-server/1.0.0'
      }
    });

    // Add auth token if provided
    if (token) {
      this.api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }

    // Request interceptor for logging
    this.api.interceptors.request.use(
      (config) => {
        logger.debug({
          method: config.method?.toUpperCase(),
          url: config.url,
          data: config.data
        }, 'API request');
        return config;
      },
      (error) => {
        logger.error({ error }, 'API request error');
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging
    this.api.interceptors.response.use(
      (response) => {
        logger.debug({
          status: response.status,
          url: response.config.url
        }, 'API response');
        return response;
      },
      (error) => {
        logger.error({
          status: error.response?.status,
          url: error.config?.url,
          message: error.response?.data?.message || error.message
        }, 'API response error');
        return Promise.reject(error);
      }
    );

    logger.info({ baseURL }, 'Kanban client initialized');
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.api.get('/health');
      logger.info({ status: response.status }, 'Kanban API connection successful');
      return true;
    } catch (error) {
      // Try alternative endpoint if health endpoint doesn't exist
      try {
        await this.api.get('/boards');
        logger.info('Kanban API connection successful (via /boards)');
        return true;
      } catch (secondError) {
        logger.error({ error: secondError }, 'Kanban API connection failed');
        return false;
      }
    }
  }

  // Board operations
  async getBoard(boardId: string): Promise<Board> {
    const response = await this.api.get(`/boards/${boardId}`);
    return response.data;
  }

  async listBoards(): Promise<Board[]> {
    const response = await this.api.get('/boards');
    return response.data;
  }

  async getBoardWithDetails(boardId: string): Promise<Board & {
    columns: Column[];
    swimlanes: Swimlane[];
    tasks: Task[];
  }> {
    const [board, columns, swimlanes, tasks] = await Promise.all([
      this.getBoard(boardId),
      this.getColumns(boardId),
      this.getSwimlanes(boardId),
      this.getTasks(boardId)
    ]);

    return {
      ...board,
      columns,
      swimlanes,
      tasks
    };
  }

  // Task operations
  async createTask(data: {
    title: string;
    description?: string;
    columnId: string;
    swimlaneId?: string;
    priority?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    assigneeId?: string;
    dueDate?: string;
    estimatedHours?: number;
    labelIds?: string[];
  }): Promise<Task> {
    const response = await this.api.post('/tasks', data);
    return response.data;
  }

  async updateTask(taskId: string, data: {
    title?: string;
    description?: string;
    priority?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    status?: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'BLOCKED';
    assigneeId?: string;
    swimlaneId?: string;
    dueDate?: string;
    estimatedHours?: number;
    actualHours?: number;
  }): Promise<Task> {
    const response = await this.api.put(`/tasks/${taskId}`, data);
    return response.data;
  }

  async moveTask(taskId: string, data: {
    columnId: string;
    swimlaneId?: string;
    position: number;
  }): Promise<Task> {
    const response = await this.api.put(`/tasks/${taskId}/move`, data);
    return response.data;
  }

  async deleteTask(taskId: string): Promise<void> {
    await this.api.delete(`/tasks/${taskId}`);
  }

  async getTask(taskId: string): Promise<Task> {
    const response = await this.api.get(`/tasks/${taskId}`);
    return response.data;
  }

  async getTasks(boardId?: string, filters?: {
    status?: string;
    priority?: string;
    assigneeId?: string;
    search?: string;
  }): Promise<Task[]> {
    const params = new URLSearchParams();
    if (boardId) params.append('boardId', boardId);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.priority) params.append('priority', filters.priority);
    if (filters?.assigneeId) params.append('assigneeId', filters.assigneeId);
    if (filters?.search) params.append('search', filters.search);

    const response = await this.api.get(`/tasks?${params.toString()}`);
    return response.data.tasks || response.data;
  }

  // Comment operations
  async addComment(taskId: string, content: string): Promise<{
    id: string;
    content: string;
    author: User;
    createdAt: string;
  }> {
    const response = await this.api.post(`/tasks/${taskId}/comments`, { content });
    return response.data;
  }

  // Column operations
  async getColumns(boardId: string): Promise<Column[]> {
    const response = await this.api.get(`/boards/${boardId}/columns`);
    return response.data;
  }

  // Swimlane operations
  async getSwimlanes(boardId: string): Promise<Swimlane[]> {
    const response = await this.api.get('/swimlanes', {
      params: { boardId }
    });
    return response.data;
  }

  async createSwimlane(data: {
    name: string;
    description?: string;
    boardId: string;
    color?: string;
  }): Promise<Swimlane> {
    const response = await this.api.post('/swimlanes', data);
    return response.data;
  }

  // Metrics operations
  async getBoardMetrics(boardId: string, dateFrom?: string, dateTo?: string): Promise<BoardMetrics> {
    const params = new URLSearchParams();
    if (dateFrom) params.append('dateFrom', dateFrom);
    if (dateTo) params.append('dateTo', dateTo);

    const response = await this.api.get(`/metrics/board/${boardId}?${params.toString()}`);
    return response.data;
  }

  async getTaskMetrics(taskId: string): Promise<{
    taskId: string;
    title: string;
    cycleTime?: number;
    leadTime?: number;
    timeInStatuses: Record<string, number>;
  }> {
    const response = await this.api.get(`/metrics/task/${taskId}`);
    return response.data;
  }

  // Automation operations
  async createAutomationRule(data: {
    name: string;
    description?: string;
    boardId: string;
    triggerType: string;
    triggerConfig: Record<string, any>;
    actionType: string;
    actionConfig: Record<string, any>;
  }): Promise<AutomationRule> {
    const response = await this.api.post('/automation', data);
    return response.data;
  }

  async getAutomationRules(boardId: string): Promise<AutomationRule[]> {
    const response = await this.api.get('/automation', {
      params: { boardId }
    });
    return response.data;
  }

  async updateAutomationRule(ruleId: string, data: {
    name?: string;
    description?: string;
    isActive?: boolean;
    triggerConfig?: Record<string, any>;
    actionConfig?: Record<string, any>;
  }): Promise<AutomationRule> {
    const response = await this.api.put(`/automation/${ruleId}`, data);
    return response.data;
  }

  // Integration operations
  async linkTaskToPR(taskId: string, prData: {
    owner: string;
    repo: string;
    pullNumber: number;
    url: string;
  }): Promise<void> {
    const response = await this.api.post(`/tasks/${taskId}/link-pr`, prData);
    return response.data;
  }

  async syncPRStatus(taskId: string, prStatus: 'open' | 'closed' | 'merged'): Promise<Task> {
    const response = await this.api.post(`/tasks/${taskId}/sync-pr-status`, { prStatus });
    return response.data;
  }

  // User operations
  async getCurrentUser(): Promise<User> {
    const response = await this.api.get('/auth/me');
    return response.data;
  }

  async getUsers(): Promise<User[]> {
    const response = await this.api.get('/users');
    return response.data;
  }

  // Notification operations
  async createNotification(data: {
    type: string;
    title: string;
    message: string;
    recipients?: string[];
    boardId?: string;
    taskId?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    await this.api.post('/notifications/create', data);
  }

  // Activity operations
  async getBoardActivities(boardId: string, limit: number = 50): Promise<Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    user: User;
    metadata?: Record<string, any>;
    createdAt: string;
  }>> {
    const response = await this.api.get(`/activities/board/${boardId}`, {
      params: { limit }
    });
    return response.data;
  }

  // Search operations
  async searchTasks(query: string, boardId?: string): Promise<Task[]> {
    const params = new URLSearchParams({ search: query });
    if (boardId) params.append('boardId', boardId);

    const response = await this.api.get(`/tasks/search?${params.toString()}`);
    return response.data.tasks || response.data;
  }

  // Bulk operations
  async bulkUpdateTasks(updates: Array<{
    taskId: string;
    updates: Record<string, any>;
  }>): Promise<Task[]> {
    const response = await this.api.post('/tasks/bulk-update', { updates });
    return response.data;
  }
}