export interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  columnId: string;
  swimlaneId?: string;
  assigneeId?: string;
  assignee?: {
    id: string;
    username: string;
    name?: string;
    avatar?: string;
  };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
  completedAt?: string;
  storyPoints?: number;
  estimatedHours?: number;
}

export interface Board {
  id: string;
  name: string;
  description?: string;
  teamId: string;
  createdBy: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Column {
  id: string;
  name: string;
  position: number;
  color?: string;
  wipLimit?: number;
  boardId: string;
  tasks: Task[];
}

export interface Swimlane {
  id: string;
  name: string;
  description?: string;
  color?: string;
  position: number;
  boardId: string;
  isVisible: boolean;
}

export interface User {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  role: 'ADMIN' | 'USER';
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  columnId: string;
  swimlaneId?: string;
  assigneeId?: string;
  priority?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  dueDate?: string;
  storyPoints?: number;
}

export interface BoardMetrics {
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  averageCycleTime: number;
  averageLeadTime: number;
  throughput: number;
  cumulativeFlow: Array<{
    date: string;
    todo: number;
    inProgress: number;
    done: number;
  }>;
  burndown: Array<{
    date: string;
    planned: number;
    actual: number;
  }>;
}

export interface AutomationRule {
  id: string;
  name: string;
  description?: string;
  boardId: string;
  isActive: boolean;
  triggerType: 'TASK_CREATED' | 'TASK_MOVED' | 'TASK_UPDATED' | 'TASK_COMPLETED';
  triggerConfig: Record<string, any>;
  actionType: 'MOVE_TASK' | 'ASSIGN_USER' | 'ADD_LABEL' | 'SET_PRIORITY' | 'SEND_NOTIFICATION';
  actionConfig: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface TaskStatus {
  TODO: 'TODO';
  IN_PROGRESS: 'IN_PROGRESS';
  IN_REVIEW: 'IN_REVIEW';
  DONE: 'DONE';
  BLOCKED: 'BLOCKED';
}