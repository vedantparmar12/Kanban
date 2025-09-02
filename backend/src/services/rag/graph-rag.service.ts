import { OpenAIEmbeddings } from '@langchain/openai';
import { Document } from 'langchain/document';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { neo4jConnection } from '../../database/neo4j.connection';
import { graphRepository } from '../../repositories/graph.repository';
import { NodeLabel, RelationshipType } from '../../models/graph.models';
import { logger } from '../../utils/logger';
import { cache } from '../../utils/cache';

export class GraphRAGService {
  private embeddings: OpenAIEmbeddings;
  private textSplitter: RecursiveCharacterTextSplitter;

  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'text-embedding-ada-002'
    });

    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200
    });
  }

  async indexContent(
    content: string,
    metadata: {
      sourceId: string;
      sourceType: string;
      title?: string;
      type?: 'code' | 'documentation' | 'task' | 'comment';
    }
  ): Promise<void> {
    try {
      const chunks = await this.textSplitter.splitText(content);
      
      for (const chunk of chunks) {
        const embedding = await this.embeddings.embedQuery(chunk);
        
        const embeddingNode = {
          id: `emb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          label: NodeLabel.Embedding,
          properties: {
            vector: embedding,
            model: 'text-embedding-ada-002',
            dimensions: embedding.length,
            contentType: metadata.type || 'text',
            sourceId: metadata.sourceId,
            sourceType: metadata.sourceType,
            content: chunk,
            title: metadata.title
          },
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await graphRepository.createNode(embeddingNode);
        
        await graphRepository.createRelationship(
          metadata.sourceId,
          embeddingNode.id,
          RelationshipType.HAS_EMBEDDING
        );
      }

      logger.info(`Indexed content for ${metadata.sourceId}`);
    } catch (error) {
      logger.error('Failed to index content:', error);
      throw error;
    }
  }

  async semanticSearch(
    query: string,
    options: {
      limit?: number;
      threshold?: number;
      filter?: {
        sourceType?: string;
        contentType?: string;
      };
    } = {}
  ): Promise<any[]> {
    const { limit = 10, threshold = 0.7, filter = {} } = options;
    
    const cacheKey = `semantic:${query}:${JSON.stringify(options)}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached as any[];

    try {
      const queryEmbedding = await this.embeddings.embedQuery(query);
      
      let whereClause = '';
      const conditions = [];
      
      if (filter.sourceType) {
        conditions.push(`e.sourceType = '${filter.sourceType}'`);
      }
      if (filter.contentType) {
        conditions.push(`e.contentType = '${filter.contentType}'`);
      }
      
      if (conditions.length > 0) {
        whereClause = `WHERE ${conditions.join(' AND ')} AND`;
      } else {
        whereClause = 'WHERE';
      }

      const cypher = `
        MATCH (e:Embedding)
        ${whereClause} gds.similarity.cosine($queryVector, e.vector) > $threshold
        WITH e, gds.similarity.cosine($queryVector, e.vector) AS similarity
        ORDER BY similarity DESC
        LIMIT $limit
        MATCH (source {id: e.sourceId})
        RETURN e, source, similarity
      `;

      const result = await neo4jConnection.runQuery(cypher, {
        queryVector: queryEmbedding,
        threshold,
        limit
      });

      const searchResults = result.records.map(record => ({
        embedding: record.get('e').properties,
        source: record.get('source').properties,
        similarity: record.get('similarity')
      }));

      await cache.set(cacheKey, searchResults, 300);
      
      return searchResults;
    } catch (error) {
      logger.error('Semantic search failed:', error);
      throw error;
    }
  }

  async graphTraversal(
    startNodeId: string,
    pattern: string,
    depth: number = 2
  ): Promise<any> {
    const query = `
      MATCH path = (start {id: $startNodeId})${pattern}
      WHERE length(path) <= $depth
      RETURN path
    `;

    const result = await neo4jConnection.runQuery(query, {
      startNodeId,
      depth
    });

    return result.records.map(record => {
      const path = record.get('path');
      return {
        nodes: path.nodes.map((n: any) => n.properties),
        relationships: path.relationships.map((r: any) => ({
          type: r.type,
          properties: r.properties
        }))
      };
    });
  }

  async getContextualInformation(nodeId: string): Promise<any> {
    const query = `
      MATCH (n {id: $nodeId})
      OPTIONAL MATCH (n)-[r1]-(connected1)
      OPTIONAL MATCH (connected1)-[r2]-(connected2)
      WITH n, 
           collect(DISTINCT {node: connected1, relationship: type(r1)}) as firstDegree,
           collect(DISTINCT {node: connected2, relationship: type(r2)}) as secondDegree
      RETURN n, firstDegree, secondDegree
    `;

    const result = await neo4jConnection.runQuery(query, { nodeId });
    
    if (result.records.length === 0) {
      return null;
    }

    const record = result.records[0];
    return {
      node: record.get('n').properties,
      firstDegreeConnections: record.get('firstDegree'),
      secondDegreeConnections: record.get('secondDegree')
    };
  }

  async generateAnswer(
    question: string,
    context: any[]
  ): Promise<string> {
    const contextText = context.map(item => 
      `Source: ${item.source.title || item.source.name || 'Unknown'}\n` +
      `Content: ${item.embedding.content}\n` +
      `Relevance: ${(item.similarity * 100).toFixed(1)}%`
    ).join('\n\n');

    const prompt = `Based on the following context, answer the question:
    
Context:
${contextText}

Question: ${question}

Please provide a comprehensive answer based on the context provided. If the context doesn't contain enough information, indicate what's missing.`;

    const { llmService } = await import('../ai/llm.service');
    return await llmService.generate(prompt);
  }

  async findCodePatterns(pattern: {
    type?: 'function' | 'class' | 'component';
    language?: string;
    framework?: string;
  }): Promise<any[]> {
    const conditions = [];
    
    if (pattern.type) {
      conditions.push(`ce.type = '${pattern.type}'`);
    }
    if (pattern.language) {
      conditions.push(`f.language = '${pattern.language}'`);
    }

    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const query = `
      MATCH (f:File)-[:CONTAINS]->(ce:CodeElement)
      ${whereClause}
      OPTIONAL MATCH (ce)-[:CALLS]->(called:CodeElement)
      OPTIONAL MATCH (ce)-[:IMPORTS]->(imported:File)
      RETURN ce, f, collect(DISTINCT called) as calls, collect(DISTINCT imported) as imports
      LIMIT 50
    `;

    const result = await neo4jConnection.runQuery(query, {});
    
    return result.records.map(record => ({
      codeElement: record.get('ce').properties,
      file: record.get('f').properties,
      calls: record.get('calls').map((n: any) => n.properties),
      imports: record.get('imports').map((n: any) => n.properties)
    }));
  }

  async analyzeDependencies(nodeId: string): Promise<any> {
    const query = `
      MATCH (start {id: $nodeId})
      CALL apoc.path.subgraphAll(start, {
        relationshipFilter: "DEPENDS_ON>|IMPORTS>|CALLS>",
        maxLevel: 5
      })
      YIELD nodes, relationships
      
      WITH nodes, relationships
      UNWIND nodes as node
      WITH node, relationships,
           size([r in relationships WHERE startNode(r) = node]) as outDegree,
           size([r in relationships WHERE endNode(r) = node]) as inDegree
      
      RETURN collect({
        node: node.properties,
        outDegree: outDegree,
        inDegree: inDegree,
        centrality: outDegree + inDegree
      }) as dependencies,
      size(relationships) as totalRelationships
    `;

    const result = await neo4jConnection.runQuery(query, { nodeId });
    
    if (result.records.length === 0) {
      return { dependencies: [], totalRelationships: 0 };
    }

    const record = result.records[0];
    return {
      dependencies: record.get('dependencies'),
      totalRelationships: record.get('totalRelationships')
    };
  }

  async suggestRelatedContent(nodeId: string): Promise<any[]> {
    const query = `
      MATCH (n {id: $nodeId})
      OPTIONAL MATCH (n)-[:HAS_EMBEDDING]->(e1:Embedding)
      OPTIONAL MATCH (n)-[:SIMILAR_TO]-(similar)
      OPTIONAL MATCH (n)-[:RELATED_TO]-(related)
      OPTIONAL MATCH (similar)-[:HAS_EMBEDDING]->(e2:Embedding)
      WHERE e1.vector IS NOT NULL AND e2.vector IS NOT NULL
      WITH n, similar, related, 
           gds.similarity.cosine(e1.vector, e2.vector) as similarity
      RETURN 
        collect(DISTINCT similar) as similarNodes,
        collect(DISTINCT related) as relatedNodes,
        avg(similarity) as avgSimilarity
    `;

    const result = await neo4jConnection.runQuery(query, { nodeId });
    
    if (result.records.length === 0) {
      return [];
    }

    const record = result.records[0];
    const similarNodes = record.get('similarNodes').map((n: any) => n.properties);
    const relatedNodes = record.get('relatedNodes').map((n: any) => n.properties);
    
    const semanticResults = await this.semanticSearch(
      nodeId,
      { limit: 5 }
    );

    return [
      ...similarNodes.map((node: any) => ({ ...node, type: 'similar' })),
      ...relatedNodes.map((node: any) => ({ ...node, type: 'related' })),
      ...semanticResults.map((result: any) => ({ 
        ...result.source, 
        type: 'semantic',
        similarity: result.similarity 
      }))
    ];
  }

  async createKnowledgeGraph(
    documents: Array<{
      content: string;
      metadata: Record<string, any>;
    }>
  ): Promise<void> {
    for (const doc of documents) {
      const chunks = await this.textSplitter.splitDocuments([
        new Document({
          pageContent: doc.content,
          metadata: doc.metadata
        })
      ]);

      for (const chunk of chunks) {
        await this.indexContent(
          chunk.pageContent,
          {
            sourceId: doc.metadata.id || `doc_${Date.now()}`,
            sourceType: doc.metadata.type || 'document',
            title: doc.metadata.title
          }
        );
      }

      logger.info(`Added document to knowledge graph: ${doc.metadata.title}`);
    }
  }
}

export const graphRAGService = new GraphRAGService();