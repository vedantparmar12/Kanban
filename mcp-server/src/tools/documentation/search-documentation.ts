import { ToolHandler } from '../../types/mcp.js';
import { z } from 'zod';
import { createLogger } from '../../utils/logger.js';
import { Neo4jClient } from '../../clients/neo4j-client.js';
import fs from 'fs/promises';
import path from 'path';

const logger = createLogger('SearchDocumentationTool');

const SearchDocumentationSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  searchType: z.enum(['semantic', 'keyword', 'hybrid']).default('hybrid'),
  sources: z.array(z.string()).optional(),
  fileTypes: z.array(z.string()).default(['md', 'txt', 'rst', 'adoc']),
  maxResults: z.number().min(1).max(100).default(20),
  includeContext: z.boolean().default(true),
  threshold: z.number().min(0).max(1).default(0.5)
});

export const searchDocumentationTool: ToolHandler = {
  name: 'search-documentation',
  description: 'Semantic search across all documentation using graph relationships and embeddings',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Search query or question to find relevant documentation'
      },
      searchType: {
        type: 'string',
        enum: ['semantic', 'keyword', 'hybrid'],
        description: 'Type of search to perform',
        default: 'hybrid'
      },
      sources: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific documentation sources to search (paths, repos, etc.)'
      },
      fileTypes: {
        type: 'array',
        items: { type: 'string' },
        description: 'File extensions to include in search',
        default: ['md', 'txt', 'rst', 'adoc']
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (1-100)',
        minimum: 1,
        maximum: 100,
        default: 20
      },
      includeContext: {
        type: 'boolean',
        description: 'Include surrounding context and related documents',
        default: true
      },
      threshold: {
        type: 'number',
        description: 'Minimum relevance threshold (0-1)',
        minimum: 0,
        maximum: 1,
        default: 0.5
      }
    },
    required: ['query']
  },

  async execute(params) {
    try {
      const { query, searchType, sources, fileTypes, maxResults, includeContext, threshold } =
        SearchDocumentationSchema.parse(params);

      logger.info({ query, searchType, maxResults }, 'Searching documentation');

      const neo4jClient = Neo4jClient.getInstance();
      const results: any[] = [];

      // Perform search based on type
      switch (searchType) {
        case 'semantic':
          results.push(...await performSemanticSearch(neo4jClient, query, sources, fileTypes, maxResults, threshold));
          break;
        case 'keyword':
          results.push(...await performKeywordSearch(neo4jClient, query, sources, fileTypes, maxResults));
          break;
        case 'hybrid':
          const semanticResults = await performSemanticSearch(neo4jClient, query, sources, fileTypes, Math.ceil(maxResults * 0.7), threshold);
          const keywordResults = await performKeywordSearch(neo4jClient, query, sources, fileTypes, Math.ceil(maxResults * 0.3));
          results.push(...semanticResults, ...keywordResults);
          break;
      }

      // Remove duplicates and sort by relevance
      const uniqueResults = removeDuplicateResults(results);
      const sortedResults = uniqueResults
        .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
        .slice(0, maxResults);

      // Add context if requested
      if (includeContext) {
        await addContextToResults(neo4jClient, sortedResults);
      }

      const searchSummary = {
        query,
        searchType,
        totalFound: sortedResults.length,
        searchTime: Date.now(), // Would be actual search time
        results: sortedResults
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(searchSummary, null, 2)
        }]
      };

    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to search documentation');

      return {
        content: [{
          type: 'text',
          text: `Error searching documentation: ${error.message}`
        }]
      };
    }
  }
};

async function performSemanticSearch(neo4jClient: any, query: string, sources?: string[], fileTypes: string[] = [], maxResults = 20, threshold = 0.5) {
  // This would use vector embeddings stored in Neo4j
  // For now, we'll simulate semantic search using text similarity

  const sourceFilter = sources ? `AND doc.source IN $sources` : '';
  const fileTypeFilter = fileTypes.length > 0 ? `AND any(ext IN $fileTypes WHERE doc.path ENDS WITH '.' + ext)` : '';

  const cypher = `
    MATCH (doc:Documentation)
    WHERE doc.content IS NOT NULL
    ${sourceFilter}
    ${fileTypeFilter}

    // Calculate semantic similarity (simplified)
    WITH doc,
         apoc.text.sorensenDiceSimilarity(toLower(doc.content), toLower($query)) as contentSimilarity,
         apoc.text.sorensenDiceSimilarity(toLower(doc.title), toLower($query)) as titleSimilarity,
         apoc.text.jaroWinkler(toLower(doc.title), toLower($query)) as titleJW

    WITH doc,
         (contentSimilarity * 0.4 + titleSimilarity * 0.4 + titleJW * 0.2) as relevance

    WHERE relevance >= $threshold

    // Get related documents
    OPTIONAL MATCH (doc)-[:REFERENCES|LINKS_TO]-(related:Documentation)
    WITH doc, relevance, collect(DISTINCT related.title) as relatedDocs

    RETURN doc, relevance, relatedDocs
    ORDER BY relevance DESC
    LIMIT $maxResults
  `;

  const parameters = {
    query,
    threshold,
    maxResults,
    ...(sources && { sources }),
    ...(fileTypes.length > 0 && { fileTypes })
  };

  const result = await neo4jClient.executeQuery(cypher, parameters);

  return result.records.map((record: any) => {
    const doc = record.get('doc');
    const relevance = record.get('relevance');
    const relatedDocs = record.get('relatedDocs');

    return {
      id: doc.elementId,
      title: doc.properties.title,
      path: doc.properties.path,
      source: doc.properties.source,
      content: doc.properties.content?.substring(0, 500) + '...',
      relevance: Math.round(relevance * 1000) / 1000,
      type: 'semantic',
      relatedDocuments: relatedDocs.slice(0, 5)
    };
  });
}

async function performKeywordSearch(neo4jClient: any, query: string, sources?: string[], fileTypes: string[] = [], maxResults = 20) {
  const keywords = extractKeywords(query);
  const sourceFilter = sources ? `AND doc.source IN $sources` : '';
  const fileTypeFilter = fileTypes.length > 0 ? `AND any(ext IN $fileTypes WHERE doc.path ENDS WITH '.' + ext)` : '';

  const cypher = `
    MATCH (doc:Documentation)
    WHERE doc.content IS NOT NULL
    ${sourceFilter}
    ${fileTypeFilter}

    // Keyword matching
    WITH doc,
         reduce(score = 0, keyword IN $keywords |
           score +
           (CASE WHEN toLower(doc.title) CONTAINS toLower(keyword) THEN 3 ELSE 0 END) +
           (CASE WHEN toLower(doc.content) CONTAINS toLower(keyword) THEN 1 ELSE 0 END)
         ) as keywordScore

    WHERE keywordScore > 0

    WITH doc, keywordScore,
         (keywordScore * 1.0 / size($keywords)) as relevance

    RETURN doc, relevance
    ORDER BY relevance DESC, keywordScore DESC
    LIMIT $maxResults
  `;

  const parameters = {
    keywords,
    maxResults,
    ...(sources && { sources }),
    ...(fileTypes.length > 0 && { fileTypes })
  };

  const result = await neo4jClient.executeQuery(cypher, parameters);

  return result.records.map((record: any) => {
    const doc = record.get('doc');
    const relevance = record.get('relevance');

    return {
      id: doc.elementId,
      title: doc.properties.title,
      path: doc.properties.path,
      source: doc.properties.source,
      content: extractRelevantSnippets(doc.properties.content, keywords),
      relevance: Math.round(relevance * 1000) / 1000,
      type: 'keyword',
      matchedKeywords: keywords.filter(k =>
        doc.properties.content?.toLowerCase().includes(k.toLowerCase()) ||
        doc.properties.title?.toLowerCase().includes(k.toLowerCase())
      )
    };
  });
}

function extractKeywords(query: string): string[] {
  // Remove common stop words and extract meaningful terms
  const stopWords = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'will', 'with']);

  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .slice(0, 10); // Limit to top 10 keywords
}

function extractRelevantSnippets(content: string, keywords: string[], snippetLength = 200): string {
  if (!content) return '';

  const lowerContent = content.toLowerCase();
  const lowerKeywords = keywords.map(k => k.toLowerCase());

  // Find the best snippet that contains the most keywords
  let bestSnippet = '';
  let bestScore = 0;
  let bestPosition = 0;

  // Sliding window approach
  for (let i = 0; i < content.length - snippetLength; i += 50) {
    const snippet = content.substring(i, i + snippetLength);
    const lowerSnippet = snippet.toLowerCase();

    const score = lowerKeywords.reduce((acc, keyword) => {
      return acc + (lowerSnippet.includes(keyword) ? 1 : 0);
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      bestSnippet = snippet;
      bestPosition = i;
    }
  }

  if (bestSnippet) {
    // Try to start and end at word boundaries
    const words = content.substring(Math.max(0, bestPosition - 50), bestPosition + snippetLength + 50).split(/\s+/);
    const cleanSnippet = words.slice(1, -1).join(' ');
    return '...' + cleanSnippet + '...';
  }

  // Fallback to beginning of content
  return content.substring(0, snippetLength) + '...';
}

function removeDuplicateResults(results: any[]): any[] {
  const seen = new Set();
  return results.filter(result => {
    const key = `${result.path}:${result.title}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function addContextToResults(neo4jClient: any, results: any[]) {
  for (const result of results) {
    try {
      // Get related documents and cross-references
      const contextQuery = `
        MATCH (doc:Documentation)
        WHERE elementId(doc) = $docId

        // Find related documents
        OPTIONAL MATCH (doc)-[:REFERENCES|LINKS_TO|PART_OF]-(related:Documentation)
        WITH doc, collect(DISTINCT {
          title: related.title,
          path: related.path,
          relationship: 'related'
        }) as related

        // Find documents that reference this one
        OPTIONAL MATCH (referencing:Documentation)-[:REFERENCES|LINKS_TO]->(doc)
        WITH doc, related, collect(DISTINCT {
          title: referencing.title,
          path: referencing.path,
          relationship: 'references'
        }) as referencing

        // Find documents in the same section/directory
        OPTIONAL MATCH (sibling:Documentation)
        WHERE sibling.path STARTS WITH substring(doc.path, 0, size(split(doc.path, '/')) - 1)
          AND elementId(sibling) <> elementId(doc)
        WITH doc, related, referencing, collect(DISTINCT {
          title: sibling.title,
          path: sibling.path,
          relationship: 'sibling'
        })[0..3] as siblings

        RETURN related + referencing + siblings as context
      `;

      const contextResult = await neo4jClient.executeQuery(contextQuery, { docId: result.id });

      if (contextResult.records.length > 0) {
        result.context = contextResult.records[0].get('context') || [];
      }

    } catch (error) {
      logger.warn({ resultId: result.id }, 'Failed to add context to result');
      result.context = [];
    }
  }
}