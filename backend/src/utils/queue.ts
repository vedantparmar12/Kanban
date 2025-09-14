export enum QueueName {
  PR_ANALYSIS = 'pr-analysis',
  DOCUMENTATION = 'documentation',
  DOC_GENERATION = 'doc-generation',
  NOTIFICATIONS = 'notifications'
}

interface QueueJob {
  id: string;
  type?: string;
  data?: any;
  priority?: number;
  delay?: number;
  [key: string]: any; // Allow additional properties
}

class QueueService {
  private queues: Map<QueueName, QueueJob[]> = new Map();

  async add(queueName: QueueName, job: Omit<QueueJob, 'id'>): Promise<QueueJob> {
    const fullJob: QueueJob = {
      id: Date.now().toString() + Math.random().toString(36),
      ...job
    };

    if (!this.queues.has(queueName)) {
      this.queues.set(queueName, []);
    }

    const queue = this.queues.get(queueName)!;
    queue.push(fullJob);
    queue.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    return fullJob;
  }

  async process(queueName: QueueName, processor: (job: QueueJob) => Promise<void>): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue || queue.length === 0) return;

    const job = queue.shift()!;
    try {
      await processor(job);
    } catch (error) {
      console.error(`Queue processing error for job ${job.id}:`, error);
    }
  }

  async getQueue(queueName: QueueName): Promise<QueueJob[]> {
    return this.queues.get(queueName) || [];
  }

  // Alias for add method
  async addJob(queueName: QueueName, job: Omit<QueueJob, 'id'>): Promise<QueueJob> {
    return this.add(queueName, job);
  }
}

export const queueService = new QueueService();