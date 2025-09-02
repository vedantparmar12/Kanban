import neo4j, { Driver, Session, Result } from 'neo4j-driver';
import { logger } from '../utils/logger';

class Neo4jConnection {
  private driver: Driver | null = null;
  private readonly uri: string;
  private readonly username: string;
  private readonly password: string;

  constructor() {
    this.uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    this.username = process.env.NEO4J_USERNAME || 'neo4j';
    this.password = process.env.NEO4J_PASSWORD || 'password';
  }

  async connect(): Promise<void> {
    try {
      this.driver = neo4j.driver(
        this.uri,
        neo4j.auth.basic(this.username, this.password),
        {
          maxConnectionPoolSize: 50,
          connectionAcquisitionTimeout: 60000,
          maxTransactionRetryTime: 30000
        }
      );

      await this.driver.verifyConnectivity();
      logger.info('Connected to Neo4j database');
      
      await this.createConstraints();
      await this.createIndexes();
    } catch (error) {
      logger.error('Failed to connect to Neo4j:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      logger.info('Disconnected from Neo4j database');
    }
  }

  getSession(): Session {
    if (!this.driver) {
      throw new Error('Neo4j driver not initialized');
    }
    return this.driver.session();
  }

  async runQuery(query: string, params: any = {}): Promise<Result> {
    const session = this.getSession();
    try {
      const result = await session.run(query, params);
      return result;
    } finally {
      await session.close();
    }
  }

  async runTransaction<T>(
    work: (tx: any) => Promise<T>
  ): Promise<T> {
    const session = this.getSession();
    try {
      return await session.writeTransaction(work);
    } finally {
      await session.close();
    }
  }

  private async createConstraints(): Promise<void> {
    const constraints = [
      'CREATE CONSTRAINT user_email IF NOT EXISTS FOR (u:User) REQUIRE u.email IS UNIQUE',
      'CREATE CONSTRAINT user_id IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE',
      'CREATE CONSTRAINT board_id IF NOT EXISTS FOR (b:Board) REQUIRE b.id IS UNIQUE',
      'CREATE CONSTRAINT task_id IF NOT EXISTS FOR (t:Task) REQUIRE t.id IS UNIQUE',
      'CREATE CONSTRAINT column_id IF NOT EXISTS FOR (c:Column) REQUIRE c.id IS UNIQUE',
      'CREATE CONSTRAINT pr_id IF NOT EXISTS FOR (p:PullRequest) REQUIRE p.id IS UNIQUE',
      'CREATE CONSTRAINT label_id IF NOT EXISTS FOR (l:Label) REQUIRE l.id IS UNIQUE',
      'CREATE CONSTRAINT comment_id IF NOT EXISTS FOR (c:Comment) REQUIRE c.id IS UNIQUE',
      'CREATE CONSTRAINT codebase_id IF NOT EXISTS FOR (cb:Codebase) REQUIRE cb.id IS UNIQUE',
      'CREATE CONSTRAINT file_path IF NOT EXISTS FOR (f:File) REQUIRE f.path IS UNIQUE'
    ];

    for (const constraint of constraints) {
      try {
        await this.runQuery(constraint);
      } catch (error: any) {
        if (!error.message.includes('already exists')) {
          logger.error(`Failed to create constraint: ${constraint}`, error);
        }
      }
    }
  }

  private async createIndexes(): Promise<void> {
    const indexes = [
      'CREATE INDEX user_username IF NOT EXISTS FOR (u:User) ON (u.username)',
      'CREATE INDEX board_slug IF NOT EXISTS FOR (b:Board) ON (b.slug)',
      'CREATE INDEX task_status IF NOT EXISTS FOR (t:Task) ON (t.status)',
      'CREATE INDEX task_priority IF NOT EXISTS FOR (t:Task) ON (t.priority)',
      'CREATE INDEX pr_status IF NOT EXISTS FOR (p:PullRequest) ON (p.status)',
      'CREATE INDEX activity_timestamp IF NOT EXISTS FOR (a:Activity) ON (a.timestamp)',
      'CREATE INDEX file_type IF NOT EXISTS FOR (f:File) ON (f.type)',
      'CREATE INDEX code_element_type IF NOT EXISTS FOR (ce:CodeElement) ON (ce.type)'
    ];

    for (const index of indexes) {
      try {
        await this.runQuery(index);
      } catch (error: any) {
        if (!error.message.includes('already exists')) {
          logger.error(`Failed to create index: ${index}`, error);
        }
      }
    }
  }
}

export const neo4jConnection = new Neo4jConnection();

export async function connectDatabase(): Promise<void> {
  await neo4jConnection.connect();
}

export async function disconnectDatabase(): Promise<void> {
  await neo4jConnection.disconnect();
}

process.on('beforeExit', async () => {
  await disconnectDatabase();
});