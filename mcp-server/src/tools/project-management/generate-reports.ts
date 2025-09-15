import { ToolHandler } from '../../types/mcp.js';
import { z } from 'zod';
import { createLogger } from '../../utils/logger.js';
import { Neo4jClient } from '../../clients/neo4j-client.js';
import { KanbanClient } from '../../clients/kanban-client.js';

const logger = createLogger('GenerateReportsTool');

const GenerateReportsSchema = z.object({
  reportType: z.enum(['sprint', 'project', 'team', 'executive', 'custom']).default('sprint'),
  scope: z.object({
    teamId: z.string().optional(),
    projectId: z.string().optional(),
    boardId: z.string().optional(),
    sprintId: z.string().optional()
  }).default({}),
  timeframe: z.object({
    startDate: z.string(),
    endDate: z.string()
  }),
  sections: z.array(z.enum(['summary', 'metrics', 'tasks', 'team', 'risks', 'recommendations'])).default(['summary', 'metrics']),
  format: z.enum(['json', 'markdown', 'html']).default('markdown'),
  includeCharts: z.boolean().default(false),
  audienceLevel: z.enum(['technical', 'management', 'executive']).default('management')
});

export const generateReportsTool: ToolHandler = {
  name: 'generate-reports',
  description: 'Generate comprehensive project status reports with metrics, insights, and recommendations',
  inputSchema: {
    type: 'object' as const,
    properties: {
      reportType: {
        type: 'string',
        enum: ['sprint', 'project', 'team', 'executive', 'custom'],
        description: 'Type of report to generate',
        default: 'sprint'
      },
      scope: {
        type: 'object' as const,
        properties: {
          teamId: { type: 'string' },
          projectId: { type: 'string' },
          boardId: { type: 'string' },
          sprintId: { type: 'string' }
        },
        description: 'Scope filters for the report'
      },
      timeframe: {
        type: 'object' as const,
        properties: {
          startDate: { type: 'string' },
          endDate: { type: 'string' }
        },
        required: ['startDate', 'endDate'],
        description: 'Time period for the report'
      },
      sections: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['summary', 'metrics', 'tasks', 'team', 'risks', 'recommendations']
        },
        description: 'Sections to include in the report',
        default: ['summary', 'metrics']
      },
      format: {
        type: 'string',
        enum: ['json', 'markdown', 'html'],
        description: 'Output format for the report',
        default: 'markdown'
      },
      includeCharts: {
        type: 'boolean',
        description: 'Include chart data in the report',
        default: false
      },
      audienceLevel: {
        type: 'string',
        enum: ['technical', 'management', 'executive'],
        description: 'Audience level for report content',
        default: 'management'
      }
    },
    required: ['timeframe']
  },

  async execute(params) {
    try {
      const { reportType, scope, timeframe, sections, format, includeCharts, audienceLevel } =
        GenerateReportsSchema.parse(params);

      logger.info({ reportType, scope, timeframe, format }, 'Generating project report');

      const kanbanClient = KanbanClient.getInstance();
      const neo4jClient = Neo4jClient.getInstance();

      // Gather data for the report
      const reportData = await gatherReportData(kanbanClient, neo4jClient, scope, timeframe);

      // Generate report structure
      const report: any = {
        title: getReportTitle(reportType, scope, timeframe),
        metadata: {
          reportType,
          scope,
          timeframe,
          generatedAt: new Date().toISOString(),
          audienceLevel
        },
        sections: {}
      };

      // Generate each requested section
      for (const section of sections) {
        report.sections[section] = await generateSection(section, reportData, audienceLevel, includeCharts);
      }

      // Format the report
      const formattedReport = await formatReport(report, format);

      return {
        content: [{
          type: 'text',
          text: typeof formattedReport === 'string' ? formattedReport : JSON.stringify(formattedReport, null, 2)
        }]
      };

    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to generate report');

      return {
        content: [{
          type: 'text',
          text: `Error generating report: ${error.message}`
        }]
      };
    }
  }
};

function getReportTitle(reportType: string, scope: any, timeframe: any): string {
  const startDate = new Date(timeframe.startDate).toLocaleDateString();
  const endDate = new Date(timeframe.endDate).toLocaleDateString();

  switch (reportType) {
    case 'sprint':
      return `Sprint Report (${startDate} - ${endDate})`;
    case 'project':
      return scope.projectId ? `Project Report - ${scope.projectId}` : 'Project Report';
    case 'team':
      return scope.teamId ? `Team Report - ${scope.teamId}` : 'Team Report';
    case 'executive':
      return `Executive Summary (${startDate} - ${endDate})`;
    default:
      return `Report (${startDate} - ${endDate})`;
  }
}

async function gatherReportData(kanbanClient: any, neo4jClient: any, scope: any, timeframe: any) {
  const data: any = {
    tasks: [],
    team: {},
    metrics: {},
    issues: [],
    achievements: []
  };

  // Get tasks for the timeframe and scope
  data.tasks = await getTasksForReport(kanbanClient, neo4jClient, scope, timeframe);

  // Get team information
  if (scope.teamId) {
    data.team = await getTeamInfo(neo4jClient, scope.teamId);
  }

  // Calculate metrics
  data.metrics = calculateReportMetrics(data.tasks, timeframe);

  // Identify issues and achievements
  data.issues = identifyIssues(data.tasks, data.metrics);
  data.achievements = identifyAchievements(data.tasks, data.metrics);

  return data;
}

async function getTasksForReport(kanbanClient: any, neo4jClient: any, scope: any, timeframe: any) {
  let query = `
    MATCH (task:Task)
    WHERE (task.createdAt >= $startDate AND task.createdAt <= $endDate)
       OR (task.updatedAt >= $startDate AND task.updatedAt <= $endDate)
       OR (task.completedAt >= $startDate AND task.completedAt <= $endDate)
  `;

  const parameters: any = {
    startDate: timeframe.startDate,
    endDate: timeframe.endDate
  };

  // Add scope filters
  if (scope.teamId) {
    query += ` AND task.teamId = $teamId`;
    parameters.teamId = scope.teamId;
  }

  if (scope.projectId) {
    query += ` AND task.projectId = $projectId`;
    parameters.projectId = scope.projectId;
  }

  if (scope.boardId) {
    query += ` AND task.boardId = $boardId`;
    parameters.boardId = scope.boardId;
  }

  query += `
    OPTIONAL MATCH (task)-[:ASSIGNED_TO]->(assignee:User)
    RETURN task, collect(assignee.name) as assignees
    ORDER BY task.updatedAt DESC
  `;

  try {
    const result = await neo4jClient.executeQuery(query, parameters);

    return result.records.map((record: any) => {
      const task = record.get('task');
      return {
        id: task.elementId,
        ...task.properties,
        assignees: record.get('assignees') || []
      };
    });

  } catch (error) {
    logger.warn('Failed to get tasks from Neo4j, using Kanban API fallback');

    const filter: any = {
      startDate: timeframe.startDate,
      endDate: timeframe.endDate,
      ...scope
    };

    return await kanbanClient.getTasks(filter);
  }
}

async function getTeamInfo(neo4jClient: any, teamId: string) {
  const query = `
    MATCH (team:Team {id: $teamId})
    OPTIONAL MATCH (team)<-[:MEMBER_OF]-(member:User)
    RETURN team, collect({
      id: member.id,
      name: member.name,
      role: member.role,
      avatar: member.avatar
    }) as members
  `;

  try {
    const result = await neo4jClient.executeQuery(query, { teamId });

    if (result.records.length > 0) {
      const record = result.records[0];
      const team = record.get('team');
      return {
        ...team.properties,
        members: record.get('members')
      };
    }
  } catch (error) {
    logger.warn('Failed to get team info from Neo4j');
  }

  return { id: teamId, name: 'Unknown Team', members: [] };
}

function calculateReportMetrics(tasks: any[], timeframe: any) {
  const metrics: any = {};

  // Basic counts
  metrics.totalTasks = tasks.length;
  metrics.completedTasks = tasks.filter(t => ['Done', 'Completed'].includes(t.status)).length;
  metrics.inProgressTasks = tasks.filter(t => ['In Progress', 'Doing'].includes(t.status)).length;
  metrics.blockedTasks = tasks.filter(t => t.status === 'Blocked' || t.blocked).length;

  // Completion rate
  metrics.completionRate = metrics.totalTasks > 0
    ? Math.round((metrics.completedTasks / metrics.totalTasks) * 100)
    : 0;

  // Story points
  metrics.totalStoryPoints = tasks.reduce((sum, task) => sum + (task.storyPoints || 1), 0);
  metrics.completedStoryPoints = tasks
    .filter(t => ['Done', 'Completed'].includes(t.status))
    .reduce((sum, task) => sum + (task.storyPoints || 1), 0);

  // Priority distribution
  metrics.priorityDistribution = {
    high: tasks.filter(t => t.priority === 'High').length,
    medium: tasks.filter(t => t.priority === 'Medium').length,
    low: tasks.filter(t => t.priority === 'Low').length
  };

  // Cycle time for completed tasks
  const completedWithDates = tasks.filter(t =>
    ['Done', 'Completed'].includes(t.status) && t.createdAt && t.completedAt
  );

  if (completedWithDates.length > 0) {
    const cycleTimes = completedWithDates.map(task => {
      const created = new Date(task.createdAt).getTime();
      const completed = new Date(task.completedAt).getTime();
      return Math.round((completed - created) / (1000 * 60 * 60 * 24)); // Days
    });

    metrics.averageCycleTime = Math.round(
      (cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length) * 100
    ) / 100;
  }

  // Velocity (story points completed per day)
  const periodDays = Math.ceil(
    (new Date(timeframe.endDate).getTime() - new Date(timeframe.startDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  metrics.velocity = periodDays > 0 ? Math.round((metrics.completedStoryPoints / periodDays) * 100) / 100 : 0;

  return metrics;
}

function identifyIssues(tasks: any[], metrics: any) {
  const issues = [];

  // Low completion rate
  if (metrics.completionRate < 70) {
    issues.push({
      type: 'completion',
      severity: metrics.completionRate < 50 ? 'high' : 'medium',
      title: 'Low Completion Rate',
      description: `Only ${metrics.completionRate}% of tasks were completed`,
      impact: 'Sprint goals may not be met',
      recommendation: 'Review task sizing and identify blockers'
    });
  }

  // Too many blocked tasks
  if (metrics.blockedTasks > 0) {
    const blockedPercentage = Math.round((metrics.blockedTasks / metrics.totalTasks) * 100);
    if (blockedPercentage > 20) {
      issues.push({
        type: 'blocked',
        severity: 'high',
        title: 'High Number of Blocked Tasks',
        description: `${metrics.blockedTasks} tasks (${blockedPercentage}%) are blocked`,
        impact: 'Team productivity is being impacted',
        recommendation: 'Prioritize unblocking tasks and addressing dependencies'
      });
    }
  }

  // Long cycle time
  if (metrics.averageCycleTime > 14) {
    issues.push({
      type: 'cycle_time',
      severity: 'medium',
      title: 'Long Cycle Time',
      description: `Average cycle time is ${metrics.averageCycleTime} days`,
      impact: 'Slow delivery of value to users',
      recommendation: 'Break down tasks into smaller pieces'
    });
  }

  // Too many high priority tasks
  const highPriorityPercentage = metrics.totalTasks > 0
    ? Math.round((metrics.priorityDistribution.high / metrics.totalTasks) * 100)
    : 0;

  if (highPriorityPercentage > 40) {
    issues.push({
      type: 'priority',
      severity: 'low',
      title: 'Too Many High Priority Tasks',
      description: `${highPriorityPercentage}% of tasks are marked as high priority`,
      impact: 'Priority inflation may reduce focus',
      recommendation: 'Review and adjust task priorities'
    });
  }

  return issues;
}

function identifyAchievements(tasks: any[], metrics: any) {
  const achievements = [];

  // High completion rate
  if (metrics.completionRate >= 90) {
    achievements.push({
      type: 'completion',
      title: 'Excellent Completion Rate',
      description: `Achieved ${metrics.completionRate}% task completion`,
      impact: 'Strong sprint execution'
    });
  }

  // Fast cycle time
  if (metrics.averageCycleTime && metrics.averageCycleTime <= 5) {
    achievements.push({
      type: 'cycle_time',
      title: 'Fast Delivery',
      description: `Average cycle time of only ${metrics.averageCycleTime} days`,
      impact: 'Rapid value delivery to users'
    });
  }

  // High velocity
  if (metrics.velocity > 3) {
    achievements.push({
      type: 'velocity',
      title: 'High Team Velocity',
      description: `Completed ${metrics.velocity} story points per day`,
      impact: 'Strong team productivity'
    });
  }

  // No blocked tasks
  if (metrics.blockedTasks === 0) {
    achievements.push({
      type: 'blocked',
      title: 'No Blockers',
      description: 'No tasks were blocked during this period',
      impact: 'Smooth workflow execution'
    });
  }

  return achievements;
}

async function generateSection(section: string, data: any, audienceLevel: string, includeCharts: boolean) {
  switch (section) {
    case 'summary':
      return generateSummarySection(data, audienceLevel);

    case 'metrics':
      return generateMetricsSection(data, audienceLevel, includeCharts);

    case 'tasks':
      return generateTasksSection(data, audienceLevel);

    case 'team':
      return generateTeamSection(data, audienceLevel);

    case 'risks':
      return generateRisksSection(data, audienceLevel);

    case 'recommendations':
      return generateRecommendationsSection(data, audienceLevel);

    default:
      return { content: 'Section not implemented' };
  }
}

function generateSummarySection(data: any, audienceLevel: string) {
  const { metrics, issues, achievements } = data;

  let summary: {
    overview: {
      totalTasks: any;
      completedTasks: any;
      completionRate: string;
      totalStoryPoints: any;
      completedStoryPoints: any;
    };
    keyHighlights: any;
    mainConcerns: any;
    businessImpact?: any;
    nextSteps?: any;
  } = {
    overview: {
      totalTasks: metrics.totalTasks,
      completedTasks: metrics.completedTasks,
      completionRate: `${metrics.completionRate}%`,
      totalStoryPoints: metrics.totalStoryPoints,
      completedStoryPoints: metrics.completedStoryPoints
    },
    keyHighlights: achievements.slice(0, 3).map(a => a.title),
    mainConcerns: issues.filter(i => i.severity === 'high').map(i => i.title)
  };

  if (audienceLevel === 'executive') {
    // Executive summary with business impact
    summary = {
      ...summary,
      businessImpact: generateBusinessImpact(metrics, issues, achievements),
      nextSteps: generateExecutiveNextSteps(issues)
    };
  }

  return summary;
}

function generateMetricsSection(data: any, audienceLevel: string, includeCharts: boolean) {
  const section: any = {
    performance: {
      completionRate: `${data.metrics.completionRate}%`,
      velocity: `${data.metrics.velocity} points/day`,
      totalStoryPoints: data.metrics.totalStoryPoints,
      completedStoryPoints: data.metrics.completedStoryPoints
    },
    efficiency: {
      averageCycleTime: data.metrics.averageCycleTime ? `${data.metrics.averageCycleTime} days` : 'N/A',
      blockedTasks: data.metrics.blockedTasks,
      inProgressTasks: data.metrics.inProgressTasks
    },
    distribution: {
      priority: data.metrics.priorityDistribution,
      status: {
        completed: data.metrics.completedTasks,
        inProgress: data.metrics.inProgressTasks,
        blocked: data.metrics.blockedTasks,
        remaining: data.metrics.totalTasks - data.metrics.completedTasks - data.metrics.inProgressTasks - data.metrics.blockedTasks
      }
    }
  };

  if (includeCharts) {
    section.charts = {
      completionTrend: generateChartData('completion', data),
      priorityDistribution: generateChartData('priority', data),
      statusDistribution: generateChartData('status', data)
    };
  }

  return section;
}

function generateTasksSection(data: any, audienceLevel: string) {
  const tasks = data.tasks;

  if (audienceLevel === 'executive') {
    // High-level task summary for executives
    return {
      summary: {
        total: tasks.length,
        completed: tasks.filter(t => ['Done', 'Completed'].includes(t.status)).length,
        critical: tasks.filter(t => t.priority === 'High').length
      },
      criticalTasks: tasks
        .filter(t => t.priority === 'High')
        .slice(0, 5)
        .map(t => ({
          title: t.title,
          status: t.status,
          assignee: t.assignees?.[0] || 'Unassigned'
        }))
    };
  }

  // Detailed task breakdown for technical/management
  return {
    summary: {
      total: tasks.length,
      byStatus: {
        completed: tasks.filter(t => ['Done', 'Completed'].includes(t.status)).length,
        inProgress: tasks.filter(t => ['In Progress', 'Doing'].includes(t.status)).length,
        blocked: tasks.filter(t => t.status === 'Blocked' || t.blocked).length,
        todo: tasks.filter(t => ['To Do', 'Backlog'].includes(t.status)).length
      },
      byPriority: data.metrics.priorityDistribution
    },
    recentlyCompleted: tasks
      .filter(t => ['Done', 'Completed'].includes(t.status))
      .slice(0, 10)
      .map(t => ({
        title: t.title,
        completedAt: t.completedAt,
        storyPoints: t.storyPoints,
        assignee: t.assignees?.[0] || 'Unassigned'
      })),
    blockedTasks: tasks
      .filter(t => t.status === 'Blocked' || t.blocked)
      .map(t => ({
        title: t.title,
        reason: t.blockedReason || 'Not specified',
        assignee: t.assignees?.[0] || 'Unassigned'
      }))
  };
}

function generateTeamSection(data: any, audienceLevel: string) {
  if (!data.team.members || data.team.members.length === 0) {
    return { message: 'Team information not available' };
  }

  const teamTasks = data.tasks.filter(t => t.assignees && t.assignees.length > 0);

  return {
    teamInfo: {
      name: data.team.name,
      size: data.team.members.length,
      members: data.team.members.map(m => m.name)
    },
    workload: data.team.members.map(member => {
      const memberTasks = teamTasks.filter(t => t.assignees.includes(member.name));
      const completed = memberTasks.filter(t => ['Done', 'Completed'].includes(t.status)).length;

      return {
        name: member.name,
        role: member.role,
        totalTasks: memberTasks.length,
        completedTasks: completed,
        completionRate: memberTasks.length > 0 ? Math.round((completed / memberTasks.length) * 100) : 0
      };
    }),
    collaboration: {
      averageTasksPerMember: Math.round(teamTasks.length / data.team.members.length),
      unassignedTasks: data.tasks.filter(t => !t.assignees || t.assignees.length === 0).length
    }
  };
}

function generateRisksSection(data: any, audienceLevel: string) {
  return {
    identifiedRisks: data.issues.map(issue => ({
      title: issue.title,
      severity: issue.severity,
      description: issue.description,
      impact: issue.impact,
      mitigation: issue.recommendation
    })),
    riskLevel: calculateOverallRiskLevel(data.issues),
    recommendation: generateRiskRecommendation(data.issues)
  };
}

function generateRecommendationsSection(data: any, audienceLevel: string) {
  const recommendations = [];

  // Generate recommendations based on issues
  data.issues.forEach((issue: any) => {
    recommendations.push({
      area: issue.type,
      priority: issue.severity,
      recommendation: issue.recommendation,
      expectedImpact: issue.impact
    });
  });

  // Add general recommendations
  if (data.metrics.completionRate > 90) {
    recommendations.push({
      area: 'capacity',
      priority: 'medium',
      recommendation: 'Consider increasing sprint capacity or taking on more complex features',
      expectedImpact: 'Better utilization of high-performing team'
    });
  }

  return {
    immediate: recommendations.filter(r => r.priority === 'high'),
    shortTerm: recommendations.filter(r => r.priority === 'medium'),
    longTerm: recommendations.filter(r => r.priority === 'low'),
    summary: generateRecommendationSummary(recommendations, audienceLevel)
  };
}

function generateBusinessImpact(metrics: any, issues: any[], achievements: any[]) {
  const impact = [];

  if (metrics.completionRate >= 90) {
    impact.push('Strong sprint execution supports reliable delivery commitments');
  } else if (metrics.completionRate < 70) {
    impact.push('Low completion rate may impact customer delivery timelines');
  }

  if (metrics.blockedTasks > 0) {
    impact.push(`${metrics.blockedTasks} blocked tasks are impacting team productivity`);
  }

  if (achievements.length > issues.length) {
    impact.push('Team is performing well and delivering value consistently');
  } else if (issues.length > achievements.length) {
    impact.push('Multiple issues may be impacting business objectives');
  }

  return impact;
}

function generateExecutiveNextSteps(issues: any[]) {
  const highPriorityIssues = issues.filter(i => i.severity === 'high');

  if (highPriorityIssues.length === 0) {
    return ['Continue current practices and monitor team performance'];
  }

  return highPriorityIssues.map(issue => `Address ${issue.title}: ${issue.recommendation}`);
}

function calculateOverallRiskLevel(issues: any[]) {
  const highRisks = issues.filter(i => i.severity === 'high').length;
  const mediumRisks = issues.filter(i => i.severity === 'medium').length;

  if (highRisks > 2) return 'High';
  if (highRisks > 0 || mediumRisks > 3) return 'Medium';
  return 'Low';
}

function generateRiskRecommendation(issues: any[]) {
  const highRisks = issues.filter(i => i.severity === 'high').length;

  if (highRisks > 0) {
    return 'Immediate attention required to address high-severity risks';
  } else if (issues.length > 0) {
    return 'Monitor and address medium-severity risks to prevent escalation';
  } else {
    return 'No significant risks identified in this report period';
  }
}

function generateRecommendationSummary(recommendations: any[], audienceLevel: string) {
  if (recommendations.length === 0) {
    return 'Team is performing well. Continue current practices.';
  }

  const immediate = recommendations.filter(r => r.priority === 'high').length;

  if (immediate > 0) {
    return `${immediate} immediate action(s) required. Focus on addressing high-priority recommendations first.`;
  } else {
    return 'Several opportunities for improvement identified. Prioritize based on expected impact.';
  }
}

function generateChartData(chartType: string, data: any) {
  // Placeholder chart data generation
  switch (chartType) {
    case 'completion':
      return {
        type: 'line',
        data: [70, 75, 80, 85, data.metrics.completionRate],
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Current']
      };

    case 'priority':
      return {
        type: 'pie',
        data: [
          data.metrics.priorityDistribution.high,
          data.metrics.priorityDistribution.medium,
          data.metrics.priorityDistribution.low
        ],
        labels: ['High', 'Medium', 'Low']
      };

    case 'status':
      return {
        type: 'bar',
        data: [
          data.metrics.completedTasks,
          data.metrics.inProgressTasks,
          data.metrics.blockedTasks
        ],
        labels: ['Completed', 'In Progress', 'Blocked']
      };

    default:
      return { type: 'unknown', data: [], labels: [] };
  }
}

async function formatReport(report: any, format: string) {
  switch (format) {
    case 'json':
      return report;

    case 'markdown':
      return formatAsMarkdown(report);

    case 'html':
      return formatAsHtml(report);

    default:
      return report;
  }
}

function formatAsMarkdown(report: any): string {
  let md = `# ${report.title}\n\n`;

  md += `**Generated:** ${new Date(report.metadata.generatedAt).toLocaleString()}\n`;
  md += `**Report Type:** ${report.metadata.reportType}\n`;
  md += `**Period:** ${new Date(report.metadata.timeframe.startDate).toLocaleDateString()} - ${new Date(report.metadata.timeframe.endDate).toLocaleDateString()}\n\n`;

  for (const [sectionName, sectionData] of Object.entries(report.sections)) {
    md += `## ${sectionName.charAt(0).toUpperCase() + sectionName.slice(1)}\n\n`;
    md += formatSectionAsMarkdown(sectionData) + '\n\n';
  }

  return md;
}

function formatSectionAsMarkdown(section: any): string {
  if (typeof section === 'string') return section;

  return '```json\n' + JSON.stringify(section, null, 2) + '\n```';
}

function formatAsHtml(report: any): string {
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${report.title}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        h1 { color: #333; border-bottom: 2px solid #333; }
        h2 { color: #666; border-bottom: 1px solid #eee; }
        .metadata { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
        .section { margin-bottom: 30px; }
        pre { background: #f8f8f8; padding: 15px; border-radius: 5px; overflow-x: auto; }
      </style>
    </head>
    <body>
      <h1>${report.title}</h1>
      <div class="metadata">
        <strong>Generated:</strong> ${new Date(report.metadata.generatedAt).toLocaleString()}<br>
        <strong>Report Type:</strong> ${report.metadata.reportType}<br>
        <strong>Period:</strong> ${new Date(report.metadata.timeframe.startDate).toLocaleDateString()} - ${new Date(report.metadata.timeframe.endDate).toLocaleDateString()}
      </div>
  `;

  for (const [sectionName, sectionData] of Object.entries(report.sections)) {
    html += `
      <div class="section">
        <h2>${sectionName.charAt(0).toUpperCase() + sectionName.slice(1)}</h2>
        <pre>${JSON.stringify(sectionData, null, 2)}</pre>
      </div>
    `;
  }

  html += '</body></html>';
  return html;
}