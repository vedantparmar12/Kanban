import { neo4jConnection } from '../database/neo4j.connection';
import { NodeLabel, RelationshipType, GraphNode, GraphRelationship } from '../models/graph.models';
import { logger } from '../utils/logger';

export class GraphRepository {
  async createNode(node: GraphNode): Promise<GraphNode> {
    const query = `
      CREATE (n:${node.label} $properties)
      SET n.id = $id,
          n.createdAt = datetime($createdAt),
          n.updatedAt = datetime($updatedAt)
      RETURN n
    `;

    const params = {
      id: node.id,
      properties: node.properties,
      createdAt: node.createdAt.toISOString(),
      updatedAt: node.updatedAt.toISOString()
    };

    const result = await neo4jConnection.runQuery(query, params);
    return this.parseNode(result.records[0].get('n'));
  }

  async createRelationship(
    fromId: string,
    toId: string,
    type: RelationshipType,
    properties: Record<string, any> = {}
  ): Promise<GraphRelationship> {
    const query = `
      MATCH (from {id: $fromId})
      MATCH (to {id: $toId})
      CREATE (from)-[r:${type} $properties]->(to)
      SET r.createdAt = datetime()
      RETURN r, from, to
    `;

    const params = {
      fromId,
      toId,
      properties
    };

    const result = await neo4jConnection.runQuery(query, params);
    const record = result.records[0];
    
    return {
      id: record.get('r').identity.toString(),
      type,
      fromId,
      toId,
      properties: record.get('r').properties,
      createdAt: new Date()
    };
  }

  async findNodeById(id: string): Promise<GraphNode | null> {
    const query = `
      MATCH (n {id: $id})
      RETURN n
    `;

    const result = await neo4jConnection.runQuery(query, { id });
    
    if (result.records.length === 0) {
      return null;
    }

    return this.parseNode(result.records[0].get('n'));
  }

  async findNodesByLabel(label: NodeLabel, filters: Record<string, any> = {}): Promise<GraphNode[]> {
    const whereClause = Object.keys(filters).length > 0
      ? 'WHERE ' + Object.keys(filters).map(key => `n.${key} = $${key}`).join(' AND ')
      : '';

    const query = `
      MATCH (n:${label})
      ${whereClause}
      RETURN n
      ORDER BY n.createdAt DESC
    `;

    const result = await neo4jConnection.runQuery(query, filters);
    return result.records.map(record => this.parseNode(record.get('n')));
  }

  async findRelatedNodes(
    nodeId: string,
    relationshipType: RelationshipType,
    direction: 'incoming' | 'outgoing' | 'both' = 'both'
  ): Promise<GraphNode[]> {
    const relationshipPattern = 
      direction === 'incoming' ? `<-[:${relationshipType}]-` :
      direction === 'outgoing' ? `-[:${relationshipType}]->` :
      `-[:${relationshipType}]-`;

    const query = `
      MATCH (n {id: $nodeId})${relationshipPattern}(related)
      RETURN related
    `;

    const result = await neo4jConnection.runQuery(query, { nodeId });
    return result.records.map(record => this.parseNode(record.get('related')));
  }

  async updateNode(id: string, updates: Record<string, any>): Promise<GraphNode | null> {
    const setClause = Object.keys(updates)
      .map(key => `n.${key} = $${key}`)
      .join(', ');

    const query = `
      MATCH (n {id: $id})
      SET ${setClause}, n.updatedAt = datetime()
      RETURN n
    `;

    const params = { id, ...updates };
    const result = await neo4jConnection.runQuery(query, params);

    if (result.records.length === 0) {
      return null;
    }

    return this.parseNode(result.records[0].get('n'));
  }

  async deleteNode(id: string): Promise<boolean> {
    const query = `
      MATCH (n {id: $id})
      DETACH DELETE n
      RETURN count(n) as deleted
    `;

    const result = await neo4jConnection.runQuery(query, { id });
    return result.records[0].get('deleted').toNumber() > 0;
  }

  async getGraphVisualization(boardId: string): Promise<any> {
    const query = `
      MATCH (board:Board {id: $boardId})
      OPTIONAL MATCH (board)-[:HAS_COLUMN]->(column:Column)
      OPTIONAL MATCH (column)-[:CONTAINS]->(task:Task)
      OPTIONAL MATCH (task)-[:ASSIGNED_TO]->(user:User)
      OPTIONAL MATCH (task)-[:HAS_LABEL]->(label:Label)
      OPTIONAL MATCH (task)-[:LINKED_TO_PR]->(pr:PullRequest)
      OPTIONAL MATCH (task)-[:RELATED_TO]->(related:Task)
      RETURN board, 
             collect(DISTINCT column) as columns,
             collect(DISTINCT task) as tasks,
             collect(DISTINCT user) as users,
             collect(DISTINCT label) as labels,
             collect(DISTINCT pr) as pullRequests,
             collect(DISTINCT related) as relatedTasks
    `;

    const result = await neo4jConnection.runQuery(query, { boardId });
    
    if (result.records.length === 0) {
      return null;
    }

    const record = result.records[0];
    return {
      board: this.parseNode(record.get('board')),
      columns: record.get('columns').map((n: any) => this.parseNode(n)),
      tasks: record.get('tasks').map((n: any) => this.parseNode(n)),
      users: record.get('users').map((n: any) => this.parseNode(n)),
      labels: record.get('labels').map((n: any) => this.parseNode(n)),
      pullRequests: record.get('pullRequests').map((n: any) => this.parseNode(n)),
      relatedTasks: record.get('relatedTasks').map((n: any) => this.parseNode(n))
    };
  }

  async getCodebaseGraph(codebaseId: string): Promise<any> {
    const query = `
      MATCH (codebase:Codebase {id: $codebaseId})
      OPTIONAL MATCH (codebase)-[:CONTAINS_FILE]->(file:File)
      OPTIONAL MATCH (file)-[:CONTAINS]->(element:CodeElement)
      OPTIONAL MATCH (element)-[:CALLS]->(called:CodeElement)
      OPTIONAL MATCH (element)-[:IMPORTS]->(imported:File)
      OPTIONAL MATCH (file)-[:DOCUMENTED_BY]->(doc:Documentation)
      RETURN codebase,
             collect(DISTINCT file) as files,
             collect(DISTINCT element) as codeElements,
             collect(DISTINCT called) as calledElements,
             collect(DISTINCT imported) as importedFiles,
             collect(DISTINCT doc) as documentation
    `;

    const result = await neo4jConnection.runQuery(query, { codebaseId });
    
    if (result.records.length === 0) {
      return null;
    }

    const record = result.records[0];
    return {
      codebase: this.parseNode(record.get('codebase')),
      files: record.get('files').map((n: any) => this.parseNode(n)),
      codeElements: record.get('codeElements').map((n: any) => this.parseNode(n)),
      calledElements: record.get('calledElements').map((n: any) => this.parseNode(n)),
      importedFiles: record.get('importedFiles').map((n: any) => this.parseNode(n)),
      documentation: record.get('documentation').map((n: any) => this.parseNode(n))
    };
  }

  async findShortestPath(fromId: string, toId: string): Promise<any> {
    const query = `
      MATCH path = shortestPath((from {id: $fromId})-[*]-(to {id: $toId}))
      RETURN path
    `;

    const result = await neo4jConnection.runQuery(query, { fromId, toId });
    
    if (result.records.length === 0) {
      return null;
    }

    const path = result.records[0].get('path');
    return {
      nodes: path.nodes.map((n: any) => this.parseNode(n)),
      relationships: path.relationships.map((r: any) => ({
        type: r.type,
        properties: r.properties
      }))
    };
  }

  async findSimilarNodes(nodeId: string, limit: number = 10): Promise<GraphNode[]> {
    const query = `
      MATCH (n {id: $nodeId})-[:HAS_EMBEDDING]->(e1:Embedding)
      MATCH (similar)-[:HAS_EMBEDDING]->(e2:Embedding)
      WHERE n <> similar
      WITH similar, gds.similarity.cosine(e1.vector, e2.vector) AS similarity
      WHERE similarity > 0.8
      RETURN similar
      ORDER BY similarity DESC
      LIMIT $limit
    `;

    const result = await neo4jConnection.runQuery(query, { nodeId, limit });
    return result.records.map(record => this.parseNode(record.get('similar')));
  }

  async getActivityTimeline(entityId: string, limit: number = 50): Promise<any[]> {
    const query = `
      MATCH (entity {id: $entityId})<-[:ACTIVITY_ON]-(activity:Activity)
      MATCH (activity)<-[:PERFORMED]-(user:User)
      RETURN activity, user
      ORDER BY activity.timestamp DESC
      LIMIT $limit
    `;

    const result = await neo4jConnection.runQuery(query, { entityId, limit });
    return result.records.map(record => ({
      activity: this.parseNode(record.get('activity')),
      user: this.parseNode(record.get('user'))
    }));
  }

  async getImpactAnalysis(nodeId: string, depth: number = 3): Promise<any> {
    const query = `
      MATCH (start {id: $nodeId})
      CALL apoc.path.subgraphAll(start, {
        maxLevel: $depth,
        relationshipFilter: "DEPENDS_ON>|IMPORTS>|CALLS>|EXTENDS>|IMPLEMENTS>"
      })
      YIELD nodes, relationships
      RETURN nodes, relationships
    `;

    const result = await neo4jConnection.runQuery(query, { nodeId, depth });
    
    if (result.records.length === 0) {
      return { nodes: [], relationships: [] };
    }

    const record = result.records[0];
    return {
      nodes: record.get('nodes').map((n: any) => this.parseNode(n)),
      relationships: record.get('relationships').map((r: any) => ({
        type: r.type,
        fromId: r.start.properties.id,
        toId: r.end.properties.id,
        properties: r.properties
      }))
    };
  }

  private parseNode(neo4jNode: any): GraphNode {
    const labels = neo4jNode.labels;
    const properties = neo4jNode.properties;
    
    return {
      id: properties.id,
      label: labels[0] as NodeLabel,
      properties: Object.keys(properties).reduce((acc, key) => {
        if (key !== 'id' && key !== 'createdAt' && key !== 'updatedAt') {
          acc[key] = properties[key];
        }
        return acc;
      }, {} as Record<string, any>),
      createdAt: new Date(properties.createdAt),
      updatedAt: new Date(properties.updatedAt)
    };
  }
}

export const graphRepository = new GraphRepository();