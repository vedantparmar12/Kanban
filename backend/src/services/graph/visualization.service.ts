import { GraphNode, NodeLabel, RelationshipType } from '../../models/graph.models';
import { neo4jConnection } from '../../database/neo4j.connection';
import { logger } from '../../utils/logger';

interface D3Node {
  id: string;
  label: string;
  group: string;
  properties: Record<string, any>;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
}

interface D3Link {
  source: string;
  target: string;
  type: string;
  properties?: Record<string, any>;
  value?: number;
}

interface D3Graph {
  nodes: D3Node[];
  links: D3Link[];
  metadata?: {
    nodeCount: number;
    linkCount: number;
    nodeTypes: Record<string, number>;
    linkTypes: Record<string, number>;
  };
}

export class GraphVisualizationService {
  async formatForD3(graphData: any): Promise<D3Graph> {
    if (!graphData) {
      return { nodes: [], links: [] };
    }

    const nodes: D3Node[] = [];
    const links: D3Link[] = [];
    const nodeMap = new Map<string, boolean>();

    const addNode = (node: any, group: string) => {
      if (!nodeMap.has(node.id)) {
        nodes.push({
          id: node.id,
          label: node.name || node.title || node.username || node.id,
          group,
          properties: node
        });
        nodeMap.set(node.id, true);
      }
    };

    if (graphData.board) {
      addNode(graphData.board.properties, 'board');
    }

    graphData.columns?.forEach((col: any) => addNode(col.properties, 'column'));
    graphData.tasks?.forEach((task: any) => addNode(task.properties, 'task'));
    graphData.users?.forEach((user: any) => addNode(user.properties, 'user'));
    graphData.labels?.forEach((label: any) => addNode(label.properties, 'label'));
    graphData.pullRequests?.forEach((pr: any) => addNode(pr.properties, 'pullRequest'));

    const relationshipsQuery = `
      MATCH (board:Board {id: $boardId})
      OPTIONAL MATCH (board)-[r1:HAS_COLUMN]->(column:Column)
      OPTIONAL MATCH (column)-[r2:CONTAINS]->(task:Task)
      OPTIONAL MATCH (task)-[r3:ASSIGNED_TO]->(user:User)
      OPTIONAL MATCH (task)-[r4:HAS_LABEL]->(label:Label)
      OPTIONAL MATCH (task)-[r5:LINKED_TO_PR]->(pr:PullRequest)
      OPTIONAL MATCH (task)-[r6:RELATED_TO]->(related:Task)
      RETURN 
        collect(DISTINCT {from: board.id, to: column.id, type: 'HAS_COLUMN'}) +
        collect(DISTINCT {from: column.id, to: task.id, type: 'CONTAINS'}) +
        collect(DISTINCT {from: task.id, to: user.id, type: 'ASSIGNED_TO'}) +
        collect(DISTINCT {from: task.id, to: label.id, type: 'HAS_LABEL'}) +
        collect(DISTINCT {from: task.id, to: pr.id, type: 'LINKED_TO_PR'}) +
        collect(DISTINCT {from: task.id, to: related.id, type: 'RELATED_TO'}) as relationships
    `;

    if (graphData.board) {
      const result = await neo4jConnection.runQuery(relationshipsQuery, { 
        boardId: graphData.board.properties.id 
      });
      
      if (result.records.length > 0) {
        const relationships = result.records[0].get('relationships');
        relationships.forEach((rel: any) => {
          if (rel.from && rel.to && nodeMap.has(rel.from) && nodeMap.has(rel.to)) {
            links.push({
              source: rel.from,
              target: rel.to,
              type: rel.type,
              value: 1
            });
          }
        });
      }
    }

    const metadata = this.calculateMetadata(nodes, links);

    return { nodes, links, metadata };
  }

  async formatCodeGraph(codeGraph: any): Promise<D3Graph> {
    if (!codeGraph) {
      return { nodes: [], links: [] };
    }

    const nodes: D3Node[] = [];
    const links: D3Link[] = [];
    const nodeMap = new Map<string, boolean>();

    const addNode = (node: any, group: string) => {
      if (!nodeMap.has(node.id)) {
        nodes.push({
          id: node.id,
          label: node.name || node.path || node.id,
          group,
          properties: node
        });
        nodeMap.set(node.id, true);
      }
    };

    if (codeGraph.codebase) {
      addNode(codeGraph.codebase.properties, 'codebase');
    }

    codeGraph.files?.forEach((file: any) => addNode(file.properties, 'file'));
    codeGraph.codeElements?.forEach((el: any) => addNode(el.properties, 'codeElement'));
    codeGraph.documentation?.forEach((doc: any) => addNode(doc.properties, 'documentation'));

    const codeRelationshipsQuery = `
      MATCH (codebase:Codebase {id: $codebaseId})
      OPTIONAL MATCH (codebase)-[r1:CONTAINS_FILE]->(file:File)
      OPTIONAL MATCH (file)-[r2:CONTAINS]->(element:CodeElement)
      OPTIONAL MATCH (element)-[r3:CALLS]->(called:CodeElement)
      OPTIONAL MATCH (element)-[r4:IMPORTS]->(imported:File)
      OPTIONAL MATCH (element)-[r5:EXTENDS|IMPLEMENTS]->(parent:CodeElement)
      RETURN 
        collect(DISTINCT {from: codebase.id, to: file.id, type: 'CONTAINS_FILE'}) +
        collect(DISTINCT {from: file.id, to: element.id, type: 'CONTAINS'}) +
        collect(DISTINCT {from: element.id, to: called.id, type: 'CALLS'}) +
        collect(DISTINCT {from: element.id, to: imported.id, type: 'IMPORTS'}) +
        collect(DISTINCT {from: element.id, to: parent.id, type: type(r5)}) as relationships
    `;

    if (codeGraph.codebase) {
      const result = await neo4jConnection.runQuery(codeRelationshipsQuery, {
        codebaseId: codeGraph.codebase.properties.id
      });

      if (result.records.length > 0) {
        const relationships = result.records[0].get('relationships');
        relationships.forEach((rel: any) => {
          if (rel.from && rel.to && nodeMap.has(rel.from) && nodeMap.has(rel.to)) {
            links.push({
              source: rel.from,
              target: rel.to,
              type: rel.type,
              value: rel.type === 'CALLS' ? 2 : 1
            });
          }
        });
      }
    }

    const metadata = this.calculateMetadata(nodes, links);

    return { nodes, links, metadata };
  }

  async getHierarchicalGraph(rootId: string, depth: number = 3): Promise<any> {
    const query = `
      MATCH path = (root {id: $rootId})-[*..${depth}]->(child)
      WITH root, child, length(path) as level
      RETURN root, collect({node: child, level: level}) as children
    `;

    const result = await neo4jConnection.runQuery(query, { rootId });
    
    if (result.records.length === 0) {
      return null;
    }

    const record = result.records[0];
    const root = record.get('root').properties;
    const children = record.get('children');

    return this.buildHierarchy(root, children);
  }

  async getForceDirectedGraph(
    centerNodeId: string,
    radius: number = 2
  ): Promise<D3Graph> {
    const query = `
      MATCH (center {id: $centerNodeId})
      CALL apoc.path.subgraphNodes(center, {
        maxLevel: $radius
      })
      YIELD node
      WITH collect(node) as nodes
      UNWIND nodes as n1
      UNWIND nodes as n2
      MATCH (n1)-[r]->(n2)
      RETURN nodes, collect(DISTINCT r) as relationships
    `;

    const result = await neo4jConnection.runQuery(query, { centerNodeId, radius });
    
    if (result.records.length === 0) {
      return { nodes: [], links: [] };
    }

    const record = result.records[0];
    const nodes = record.get('nodes').map((n: any) => ({
      id: n.properties.id,
      label: n.properties.name || n.properties.title || n.properties.id,
      group: n.labels[0].toLowerCase(),
      properties: n.properties
    }));

    const links = record.get('relationships').map((r: any) => ({
      source: r.start.properties.id,
      target: r.end.properties.id,
      type: r.type,
      properties: r.properties,
      value: 1
    }));

    return { nodes, links };
  }

  async getClusteredGraph(boardId: string): Promise<any> {
    const query = `
      MATCH (b:Board {id: $boardId})-[:HAS_COLUMN]->(c:Column)
      OPTIONAL MATCH (c)-[:CONTAINS]->(t:Task)
      OPTIONAL MATCH (t)-[:ASSIGNED_TO]->(u:User)
      WITH c, collect(DISTINCT t) as tasks, collect(DISTINCT u) as users
      RETURN collect({
        cluster: c.properties,
        nodes: tasks + users
      }) as clusters
    `;

    const result = await neo4jConnection.runQuery(query, { boardId });
    
    if (result.records.length === 0) {
      return { clusters: [] };
    }

    return {
      clusters: result.records[0].get('clusters').map((cluster: any) => ({
        id: cluster.cluster.id,
        name: cluster.cluster.name,
        nodes: cluster.nodes.map((n: any) => n.properties)
      }))
    };
  }

  private calculateMetadata(nodes: D3Node[], links: D3Link[]) {
    const nodeTypes: Record<string, number> = {};
    const linkTypes: Record<string, number> = {};

    nodes.forEach(node => {
      nodeTypes[node.group] = (nodeTypes[node.group] || 0) + 1;
    });

    links.forEach(link => {
      linkTypes[link.type] = (linkTypes[link.type] || 0) + 1;
    });

    return {
      nodeCount: nodes.length,
      linkCount: links.length,
      nodeTypes,
      linkTypes
    };
  }

  private buildHierarchy(root: any, children: any[]): any {
    const levels = new Map<number, any[]>();
    
    children.forEach((child: any) => {
      const level = child.level;
      if (!levels.has(level)) {
        levels.set(level, []);
      }
      levels.get(level)!.push(child.node.properties);
    });

    return {
      root,
      levels: Array.from(levels.entries()).map(([level, nodes]) => ({
        level,
        nodes
      }))
    };
  }
}

export const graphVisualizationService = new GraphVisualizationService();