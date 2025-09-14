import { ToolHandler } from '../../types/mcp.js';
import { z } from 'zod';
import { createLogger } from '../../utils/logger.js';
import { Neo4jClient } from '../../clients/neo4j-client.js';

const logger = createLogger('VisualizeRelationshipsTool');

const VisualizeRelationshipsSchema = z.object({
  nodeId: z.string().optional(),
  nodeLabel: z.string().optional(),
  relationshipType: z.string().optional(),
  depth: z.number().min(1).max(5).default(2),
  maxNodes: z.number().min(1).max(500).default(100),
  format: z.enum(['cytoscape', 'vis', 'graphviz', 'mermaid']).default('cytoscape'),
  includeProperties: z.boolean().default(false)
});

export const visualizeRelationshipsTool: ToolHandler = {
  name: 'visualize-relationships',
  description: 'Generate graph visualizations of node relationships',
  inputSchema: {
    type: 'object',
    properties: {
      nodeId: {
        type: 'string',
        description: 'Specific node ID to visualize relationships from'
      },
      nodeLabel: {
        type: 'string',
        description: 'Node label type to visualize (e.g., "Task", "User", "Code")'
      },
      relationshipType: {
        type: 'string',
        description: 'Specific relationship type to include (e.g., "ASSIGNED_TO", "DEPENDS_ON")'
      },
      depth: {
        type: 'number',
        description: 'Relationship traversal depth (1-5)',
        minimum: 1,
        maximum: 5,
        default: 2
      },
      maxNodes: {
        type: 'number',
        description: 'Maximum number of nodes to include (1-500)',
        minimum: 1,
        maximum: 500,
        default: 100
      },
      format: {
        type: 'string',
        enum: ['cytoscape', 'vis', 'graphviz', 'mermaid'],
        description: 'Output format for visualization',
        default: 'cytoscape'
      },
      includeProperties: {
        type: 'boolean',
        description: 'Include node and relationship properties in output',
        default: false
      }
    }
  },

  async execute(params) {
    try {
      const { nodeId, nodeLabel, relationshipType, depth, maxNodes, format, includeProperties } =
        VisualizeRelationshipsSchema.parse(params);

      logger.info({ nodeId, nodeLabel, relationshipType, depth, format }, 'Generating graph visualization');

      const neo4jClient = Neo4jClient.getInstance();

      // Build Cypher query based on parameters
      let query = '';
      let parameters: Record<string, any> = {};

      if (nodeId) {
        // Visualize relationships from specific node
        query = `
          MATCH path = (start)-[*1..${depth}]-(connected)
          WHERE elementId(start) = $nodeId
          WITH nodes(path) as nodes, relationships(path) as rels
          UNWIND nodes as n
          WITH collect(DISTINCT n) as allNodes, rels
          UNWIND rels as r
          WITH allNodes, collect(DISTINCT r) as allRels
          RETURN allNodes[..${maxNodes}] as nodes, allRels as relationships
        `;
        parameters.nodeId = nodeId;
      } else if (nodeLabel) {
        // Visualize relationships between nodes of specific label
        const relFilter = relationshipType ? `[r:${relationshipType}]` : '[r]';
        query = `
          MATCH (n:${nodeLabel})-${relFilter}-(m)
          WITH n, r, m
          LIMIT ${maxNodes}
          RETURN collect(DISTINCT n) + collect(DISTINCT m) as nodes,
                 collect(DISTINCT r) as relationships
        `;
      } else {
        // General graph overview
        query = `
          MATCH (n)-[r]-(m)
          WITH n, r, m
          LIMIT ${maxNodes}
          RETURN collect(DISTINCT n) + collect(DISTINCT m) as nodes,
                 collect(DISTINCT r) as relationships
        `;
      }

      const result = await neo4jClient.executeQuery(query, parameters);

      if (result.records.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No relationships found matching the specified criteria.'
          }]
        };
      }

      const record = result.records[0];
      const nodes = record.get('nodes') || [];
      const relationships = record.get('relationships') || [];

      // Format based on requested format
      const visualization = formatVisualization(nodes, relationships, format, includeProperties);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(visualization, null, 2)
        }]
      };

    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to generate graph visualization');

      return {
        content: [{
          type: 'text',
          text: `Error generating visualization: ${error.message}`
        }]
      };
    }
  }
};

function formatVisualization(nodes: any[], relationships: any[], format: string, includeProperties: boolean) {
  switch (format) {
    case 'cytoscape':
      return {
        elements: [
          ...nodes.map((node: any) => ({
            data: {
              id: node.elementId || node.identity?.toString(),
              label: node.labels?.[0] || 'Node',
              ...(includeProperties ? node.properties : {})
            }
          })),
          ...relationships.map((rel: any) => ({
            data: {
              id: rel.elementId || rel.identity?.toString(),
              source: rel.startNodeElementId || rel.start?.toString(),
              target: rel.endNodeElementId || rel.end?.toString(),
              label: rel.type,
              ...(includeProperties ? rel.properties : {})
            }
          }))
        ]
      };

    case 'vis':
      return {
        nodes: nodes.map((node: any) => ({
          id: node.elementId || node.identity?.toString(),
          label: node.labels?.[0] || 'Node',
          group: node.labels?.[0] || 'default',
          ...(includeProperties ? { title: JSON.stringify(node.properties) } : {})
        })),
        edges: relationships.map((rel: any) => ({
          id: rel.elementId || rel.identity?.toString(),
          from: rel.startNodeElementId || rel.start?.toString(),
          to: rel.endNodeElementId || rel.end?.toString(),
          label: rel.type,
          ...(includeProperties ? { title: JSON.stringify(rel.properties) } : {})
        }))
      };

    case 'mermaid':
      let mermaid = 'graph TD\n';
      nodes.forEach((node: any) => {
        const id = node.elementId || node.identity?.toString();
        const label = node.labels?.[0] || 'Node';
        mermaid += `    ${id}["${label}"]\n`;
      });
      relationships.forEach((rel: any) => {
        const source = rel.startNodeElementId || rel.start?.toString();
        const target = rel.endNodeElementId || rel.end?.toString();
        mermaid += `    ${source} -->|${rel.type}| ${target}\n`;
      });
      return { mermaid };

    case 'graphviz':
      let dot = 'digraph G {\n';
      nodes.forEach((node: any) => {
        const id = node.elementId || node.identity?.toString();
        const label = node.labels?.[0] || 'Node';
        dot += `  "${id}" [label="${label}"];\n`;
      });
      relationships.forEach((rel: any) => {
        const source = rel.startNodeElementId || rel.start?.toString();
        const target = rel.endNodeElementId || rel.end?.toString();
        dot += `  "${source}" -> "${target}" [label="${rel.type}"];\n`;
      });
      dot += '}';
      return { dot };

    default:
      return { nodes, relationships };
  }
}