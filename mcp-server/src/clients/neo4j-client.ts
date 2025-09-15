import neo4j, { Driver, Session, Result } from 'neo4j-driver';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('Neo4jClient');

export class Neo4jClient {
  private static instance: Neo4jClient;
  private driver: Driver | null = null;
  private connected = false;

  private constructor() {}

  static getInstance(): Neo4jClient {
    if (!Neo4jClient.instance) {
      Neo4jClient.instance = new Neo4jClient();
    }
    return Neo4jClient.instance;
  }

  async connect(): Promise<void> {
    try {
      const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
      const user = process.env.NEO4J_USER || 'neo4j';
      const password = process.env.NEO4J_PASSWORD || 'password';

      logger.info({ uri, user }, 'Connecting to Neo4j database');

      this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 60000,
        maxTransactionRetryTime: 30000
      });

      // Verify connectivity
      const serverInfo = await this.driver.getServerInfo();
      logger.info(
        {
          version: serverInfo.protocolVersion,
          agent: serverInfo.agent,
          address: serverInfo.address
        },
        'Successfully connected to Neo4j'
      );

      this.connected = true;

    } catch (error) {
      logger.error({ error: (error as any).message }, 'Failed to connect to Neo4j');
      throw new Error(`Neo4j connection failed: ${(error as any).message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
      this.connected = false;
      logger.info('Disconnected from Neo4j');
    }
  }

  async executeQuery(cypher: string, parameters: Record<string, any> = {}): Promise<Result> {
    if (!this.connected || !this.driver) {
      throw new Error('Neo4j client not connected');
    }

    const session: Session = this.driver.session();

    try {
      logger.debug({ cypher, parameters }, 'Executing Cypher query');

      const result = await session.run(cypher, parameters);

      logger.debug(
        {
          recordCount: result.records.length,
          summary: {
            queryType: result.summary.queryType,
            counters: result.summary.counters,
            executionTime: result.summary.resultAvailableAfter
          }
        },
        'Query executed successfully'
      );

      return result;

    } catch (error) {
      logger.error({ error: (error as any).message, cypher }, 'Query execution failed');
      throw error;

    } finally {
      await session.close();
    }
  }

  async executeReadQuery(cypher: string, parameters: Record<string, any> = {}): Promise<Result> {
    if (!this.connected || !this.driver) {
      throw new Error('Neo4j client not connected');
    }

    const session: Session = this.driver.session({ defaultAccessMode: neo4j.session.READ });

    try {
      return await session.run(cypher, parameters);
    } finally {
      await session.close();
    }
  }

  async executeWriteQuery(cypher: string, parameters: Record<string, any> = {}): Promise<Result> {
    if (!this.connected || !this.driver) {
      throw new Error('Neo4j client not connected');
    }

    const session: Session = this.driver.session({ defaultAccessMode: neo4j.session.WRITE });

    try {
      return await session.run(cypher, parameters);
    } finally {
      await session.close();
    }
  }

  async executeTransaction(queries: Array<{ cypher: string; parameters?: Record<string, any> }>): Promise<Result[]> {
    if (!this.connected || !this.driver) {
      throw new Error('Neo4j client not connected');
    }

    const session: Session = this.driver.session();

    try {
      return await session.executeWrite(async tx => {
        const results: Result[] = [];

        for (const query of queries) {
          const result = await tx.run(query.cypher, query.parameters || {});
          results.push(result as any);
        }

        return results;
      });

    } finally {
      await session.close();
    }
  }

  async verifyConnection(): Promise<boolean> {
    try {
      if (!this.driver) {
        return false;
      }

      const result = await this.executeQuery('RETURN 1 as test');
      return result.records.length === 1;

    } catch (error) {
      logger.error({ error: (error as any).message }, 'Connection verification failed');
      return false;
    }
  }

  async getConstraints(): Promise<any[]> {
    const result = await this.executeQuery('SHOW CONSTRAINTS');
    return result.records.map(record => record.toObject());
  }

  async getIndexes(): Promise<any[]> {
    const result = await this.executeQuery('SHOW INDEXES');
    return result.records.map(record => record.toObject());
  }

  async createConstraint(label: string, property: string): Promise<void> {
    const cypher = `CREATE CONSTRAINT IF NOT EXISTS FOR (n:${label}) REQUIRE n.${property} IS UNIQUE`;
    await this.executeQuery(cypher);
    logger.info({ label, property }, 'Created unique constraint');
  }

  async createIndex(label: string, property: string): Promise<void> {
    const cypher = `CREATE INDEX IF NOT EXISTS FOR (n:${label}) ON (n.${property})`;
    await this.executeQuery(cypher);
    logger.info({ label, property }, 'Created index');
  }

  async clearDatabase(): Promise<void> {
    logger.warn('Clearing entire database');
    await this.executeQuery('MATCH (n) DETACH DELETE n');
  }

  async getDatabaseStats(): Promise<any> {
    const queries = [
      'MATCH (n) RETURN count(n) as nodeCount',
      'MATCH ()-[r]->() RETURN count(r) as relationshipCount',
      'CALL db.labels() YIELD label RETURN collect(label) as labels',
      'CALL db.relationshipTypes() YIELD relationshipType RETURN collect(relationshipType) as relationshipTypes'
    ];

    const results = await Promise.all(
      queries.map(query => this.executeQuery(query))
    );

    return {
      nodeCount: results[0].records[0]?.get('nodeCount')?.toNumber() || 0,
      relationshipCount: results[1].records[0]?.get('relationshipCount')?.toNumber() || 0,
      labels: results[2].records[0]?.get('labels') || [],
      relationshipTypes: results[3].records[0]?.get('relationshipTypes') || []
    };
  }

  isConnected(): boolean {
    return this.connected;
  }

  getDriver(): Driver | null {
    return this.driver;
  }
}