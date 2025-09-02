import { z } from 'zod';
import { TaskPriority, TaskStatus, Role, PRStatus } from '@prisma/client';

export const authSchemas = {
  register: z.object({
    email: z.string().email(),
    username: z.string().min(3).max(30),
    password: z.string().min(8).max(100),
    firstName: z.string().optional(),
    lastName: z.string().optional()
  }),

  login: z.object({
    email: z.string().email(),
    password: z.string()
  }),

  refreshToken: z.object({
    refreshToken: z.string()
  }),

  updateProfile: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    avatar: z.string().url().optional()
  }),

  changePassword: z.object({
    currentPassword: z.string(),
    newPassword: z.string().min(8).max(100)
  })
};

export const boardSchemas = {
  create: z.object({
    name: z.string().min(1).max(100),
    description: z.string().optional(),
    isPublic: z.boolean().optional(),
    organizationId: z.string().optional()
  }),

  update: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().optional(),
    isPublic: z.boolean().optional(),
    isArchived: z.boolean().optional()
  }),

  addMember: z.object({
    userId: z.string(),
    role: z.nativeEnum(Role)
  })
};

export const taskSchemas = {
  create: z.object({
    title: z.string().min(1).max(200),
    description: z.string().optional(),
    columnId: z.string(),
    swimlaneId: z.string().optional(),
    priority: z.nativeEnum(TaskPriority).optional(),
    assigneeId: z.string().optional(),
    dueDate: z.string().datetime().optional(),
    estimatedHours: z.number().positive().optional(),
    labelIds: z.array(z.string()).optional()
  }),

  update: z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().optional(),
    priority: z.nativeEnum(TaskPriority).optional(),
    status: z.nativeEnum(TaskStatus).optional(),
    assigneeId: z.string().nullable().optional(),
    swimlaneId: z.string().nullable().optional(),
    dueDate: z.string().datetime().nullable().optional(),
    estimatedHours: z.number().positive().nullable().optional(),
    actualHours: z.number().positive().nullable().optional()
  }),

  move: z.object({
    columnId: z.string(),
    swimlaneId: z.string().optional(),
    position: z.number().int().min(0)
  }),

  comment: z.object({
    content: z.string().min(1).max(1000)
  })
};

export const columnSchemas = {
  create: z.object({
    name: z.string().min(1).max(50),
    boardId: z.string(),
    color: z.string().optional(),
    wipLimit: z.number().int().positive().optional()
  }),

  update: z.object({
    name: z.string().min(1).max(50).optional(),
    color: z.string().optional(),
    wipLimit: z.number().int().positive().nullable().optional()
  }),

  reorder: z.object({
    columnIds: z.array(z.string())
  })
};

export const labelSchemas = {
  create: z.object({
    name: z.string().min(1).max(30),
    color: z.string().regex(/^#[0-9A-F]{6}$/i)
  }),

  update: z.object({
    name: z.string().min(1).max(30).optional(),
    color: z.string().regex(/^#[0-9A-F]{6}$/i).optional()
  })
};

export const swimlaneSchemas = {
  create: z.object({
    name: z.string().min(1).max(50),
    description: z.string().optional(),
    boardId: z.string(),
    color: z.string().optional()
  }),

  update: z.object({
    name: z.string().min(1).max(50).optional(),
    description: z.string().optional(),
    color: z.string().optional()
  }),

  reorder: z.object({
    swimlaneIds: z.array(z.string())
  })
};

export const prSchemas = {
  create: z.object({
    title: z.string().min(1).max(200),
    description: z.string().optional(),
    branch: z.string(),
    baseBranch: z.string().optional(),
    taskId: z.string().optional(),
    repositoryUrl: z.string().url()
  }),

  update: z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().optional(),
    status: z.nativeEnum(PRStatus).optional()
  }),

  review: z.object({
    status: z.enum(['approved', 'changes_requested', 'commented']),
    comment: z.string().optional()
  })
};

export const querySchemas = {
  pagination: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20)
  }),

  taskFilter: z.object({
    status: z.nativeEnum(TaskStatus).optional(),
    priority: z.nativeEnum(TaskPriority).optional(),
    assigneeId: z.string().optional(),
    search: z.string().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20)
  })
};

export const idSchema = z.object({
  id: z.string()
});