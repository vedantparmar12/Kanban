import { ToolHandler } from '../../types/mcp.js';
import { z } from 'zod';
import { createLogger } from '../../utils/logger.js';
import { Neo4jClient } from '../../clients/neo4j-client.js';
import { KanbanClient } from '../../clients/kanban-client.js';

const logger = createLogger('AnalyzeTeamVelocityTool');

const AnalyzeTeamVelocitySchema = z.object({
  teamId: z.string().optional(),
  projectId: z.string().optional(),
  boardId: z.string().optional(),
  timeframe: z.enum(['sprint', 'month', 'quarter', 'custom']).default('sprint'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  periods: z.number().min(1).max(12).default(6),
  metrics: z.array(z.enum(['velocity', 'burndown', 'throughput', 'cycle_time', 'lead_time', 'capacity'])).default(['velocity', 'throughput']),
  includeForecasting: z.boolean().default(false)
});

export const analyzeTeamVelocityTool: ToolHandler = {
  name: 'analyze-team-velocity',
  description: 'Calculate sprint/iteration metrics, team velocity, and performance analytics',
  inputSchema: {
    type: 'object',
    properties: {
      teamId: {
        type: 'string',
        description: 'Specific team to analyze'
      },
      projectId: {
        type: 'string',
        description: 'Project to analyze'
      },
      boardId: {
        type: 'string',
        description: 'Kanban board to analyze'
      },
      timeframe: {
        type: 'string',
        enum: ['sprint', 'month', 'quarter', 'custom'],
        description: 'Time period for analysis',
        default: 'sprint'
      },
      startDate: {
        type: 'string',
        description: 'Start date for custom timeframe (ISO format)'
      },
      endDate: {
        type: 'string',
        description: 'End date for custom timeframe (ISO format)'
      },
      periods: {
        type: 'number',
        description: 'Number of periods to analyze (1-12)',
        minimum: 1,
        maximum: 12,
        default: 6
      },
      metrics: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['velocity', 'burndown', 'throughput', 'cycle_time', 'lead_time', 'capacity']
        },
        description: 'Metrics to calculate',
        default: ['velocity', 'throughput']
      },
      includeForecasting: {
        type: 'boolean',
        description: 'Include velocity forecasting and predictions',
        default: false
      }
    }
  },

  async execute(params) {
    try {
      const { teamId, projectId, boardId, timeframe, startDate, endDate, periods, metrics, includeForecasting } =
        AnalyzeTeamVelocitySchema.parse(params);

      logger.info({ teamId, projectId, boardId, timeframe, metrics }, 'Analyzing team velocity');

      const kanbanClient = KanbanClient.getInstance();
      const neo4jClient = Neo4jClient.getInstance();

      // Determine analysis scope and time periods
      const timePeriods = await generateTimePeriods(timeframe, startDate, endDate, periods);

      const analysis: any = {
        scope: {
          teamId,
          projectId,
          boardId,
          timeframe,
          periodsAnalyzed: timePeriods.length
        },
        periods: [],
        summary: {},
        trends: {},
        insights: []
      };

      // Analyze each time period
      for (const period of timePeriods) {
        const periodAnalysis = await analyzePeriod(
          kanbanClient,
          neo4jClient,
          period,
          { teamId, projectId, boardId },
          metrics
        );

        analysis.periods.push(periodAnalysis);
      }

      // Calculate summary statistics
      analysis.summary = calculateSummaryMetrics(analysis.periods, metrics);

      // Identify trends
      analysis.trends = calculateTrends(analysis.periods, metrics);

      // Generate insights and recommendations
      analysis.insights = generateVelocityInsights(analysis);

      // Add forecasting if requested
      if (includeForecasting) {
        analysis.forecasting = generateVelocityForecasting(analysis.periods, metrics);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(analysis, null, 2)
        }]
      };

    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to analyze team velocity');

      return {
        content: [{
          type: 'text',
          text: `Error analyzing team velocity: ${error.message}`
        }]
      };
    }
  }
};

async function generateTimePeriods(timeframe: string, startDate?: string, endDate?: string, periods = 6) {
  const timePeriods = [];
  let currentDate = endDate ? new Date(endDate) : new Date();

  // Set end of day for current date
  currentDate.setHours(23, 59, 59, 999);

  for (let i = 0; i < periods; i++) {
    let periodStart: Date;
    let periodEnd: Date = new Date(currentDate);

    switch (timeframe) {
      case 'sprint':
        // Assume 2-week sprints
        periodStart = new Date(currentDate);
        periodStart.setDate(periodStart.getDate() - 13); // 14 days ago
        periodStart.setHours(0, 0, 0, 0);
        break;

      case 'month':
        periodStart = new Date(currentDate);
        periodStart.setMonth(periodStart.getMonth() - 1);
        periodStart.setDate(1);
        periodStart.setHours(0, 0, 0, 0);
        periodEnd = new Date(periodStart);
        periodEnd.setMonth(periodEnd.getMonth() + 1);
        periodEnd.setDate(0); // Last day of month
        periodEnd.setHours(23, 59, 59, 999);
        break;

      case 'quarter':
        periodStart = new Date(currentDate);
        periodStart.setMonth(periodStart.getMonth() - 3);
        periodStart.setDate(1);
        periodStart.setHours(0, 0, 0, 0);
        break;

      case 'custom':
        if (!startDate) throw new Error('startDate required for custom timeframe');
        const customDuration = new Date(endDate || new Date()).getTime() - new Date(startDate).getTime();
        periodStart = new Date(currentDate);
        periodStart.setTime(currentDate.getTime() - customDuration);
        break;

      default:
        throw new Error(`Unsupported timeframe: ${timeframe}`);
    }

    timePeriods.unshift({
      start: periodStart.toISOString(),
      end: periodEnd.toISOString(),
      label: formatPeriodLabel(periodStart, periodEnd, timeframe)
    });

    // Move to previous period
    currentDate = new Date(periodStart);
    currentDate.setTime(currentDate.getTime() - 1); // 1ms before start of this period
  }

  return timePeriods;
}

function formatPeriodLabel(start: Date, end: Date, timeframe: string): string {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };

  switch (timeframe) {
    case 'sprint':
      return `Sprint ${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`;
    case 'month':
      return start.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    case 'quarter':
      return `Q${Math.ceil((start.getMonth() + 1) / 3)} ${start.getFullYear()}`;
    default:
      return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`;
  }
}

async function analyzePeriod(kanbanClient: any, neo4jClient: any, period: any, scope: any, metrics: string[]) {
  const analysis: any = {
    period: period.label,
    startDate: period.start,
    endDate: period.end,
    metrics: {}
  };

  // Get tasks for this period
  const tasks = await getTasksForPeriod(kanbanClient, neo4jClient, period, scope);

  // Calculate requested metrics
  for (const metric of metrics) {
    switch (metric) {
      case 'velocity':
        analysis.metrics.velocity = calculateVelocity(tasks, period);
        break;
      case 'throughput':
        analysis.metrics.throughput = calculateThroughput(tasks, period);
        break;
      case 'cycle_time':
        analysis.metrics.cycleTime = calculateCycleTime(tasks);
        break;
      case 'lead_time':
        analysis.metrics.leadTime = calculateLeadTime(tasks);
        break;
      case 'burndown':
        analysis.metrics.burndown = calculateBurndown(tasks, period);
        break;
      case 'capacity':
        analysis.metrics.capacity = await calculateCapacity(neo4jClient, period, scope);
        break;
    }
  }

  return analysis;
}

async function getTasksForPeriod(kanbanClient: any, neo4jClient: any, period: any, scope: any) {
  // Build query based on scope
  let query = `
    MATCH (task:Task)
    WHERE task.updatedAt >= $startDate AND task.updatedAt <= $endDate
  `;

  const parameters: any = {
    startDate: period.start,
    endDate: period.end
  };

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
    RETURN task,
           task.storyPoints as points,
           task.status as status,
           task.createdAt as created,
           task.completedAt as completed,
           task.priority as priority
    ORDER BY task.updatedAt
  `;

  try {
    const result = await neo4jClient.executeQuery(query, parameters);

    return result.records.map((record: any) => ({
      id: record.get('task').elementId,
      title: record.get('task').properties.title,
      status: record.get('status'),
      points: record.get('points') || 1,
      created: record.get('created'),
      completed: record.get('completed'),
      priority: record.get('priority'),
      properties: record.get('task').properties
    }));

  } catch (error) {
    logger.warn({ error: error.message }, 'Failed to get tasks from Neo4j, falling back to Kanban API');

    // Fallback to Kanban API
    const filter: any = {
      startDate: period.start,
      endDate: period.end
    };

    if (scope.boardId) filter.boardId = scope.boardId;
    if (scope.teamId) filter.teamId = scope.teamId;

    return await kanbanClient.getTasks(filter);
  }
}

function calculateVelocity(tasks: any[], period: any) {
  const completedTasks = tasks.filter(task =>
    task.status === 'Done' || task.status === 'Completed' || task.completed
  );

  const totalPoints = completedTasks.reduce((sum, task) => sum + (task.points || 1), 0);
  const totalTasks = completedTasks.length;

  return {
    storyPoints: totalPoints,
    tasksCompleted: totalTasks,
    averagePointsPerTask: totalTasks > 0 ? Math.round((totalPoints / totalTasks) * 100) / 100 : 0,
    completionRate: tasks.length > 0 ? Math.round((totalTasks / tasks.length) * 100) : 0
  };
}

function calculateThroughput(tasks: any[], period: any) {
  const completedTasks = tasks.filter(task =>
    task.status === 'Done' || task.status === 'Completed' || task.completed
  );

  const periodDays = Math.ceil(
    (new Date(period.end).getTime() - new Date(period.start).getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    tasksPerPeriod: completedTasks.length,
    tasksPerDay: Math.round((completedTasks.length / periodDays) * 100) / 100,
    pointsPerPeriod: completedTasks.reduce((sum, task) => sum + (task.points || 1), 0),
    periodDays
  };
}

function calculateCycleTime(tasks: any[]) {
  const completedTasks = tasks.filter(task =>
    task.completed && task.created
  );

  if (completedTasks.length === 0) {
    return { average: 0, median: 0, minimum: 0, maximum: 0, count: 0 };
  }

  const cycleTimes = completedTasks.map(task => {
    const created = new Date(task.created).getTime();
    const completed = new Date(task.completed).getTime();
    return Math.round((completed - created) / (1000 * 60 * 60 * 24)); // Days
  });

  cycleTimes.sort((a, b) => a - b);

  return {
    average: Math.round((cycleTimes.reduce((sum, time) => sum + time, 0) / cycleTimes.length) * 100) / 100,
    median: cycleTimes[Math.floor(cycleTimes.length / 2)],
    minimum: cycleTimes[0],
    maximum: cycleTimes[cycleTimes.length - 1],
    count: cycleTimes.length
  };
}

function calculateLeadTime(tasks: any[]) {
  // Lead time is similar to cycle time but may include time before work starts
  // For now, treating it the same as cycle time
  return calculateCycleTime(tasks);
}

function calculateBurndown(tasks: any[], period: any) {
  const totalPoints = tasks.reduce((sum, task) => sum + (task.points || 1), 0);
  const completedPoints = tasks
    .filter(task => task.status === 'Done' || task.status === 'Completed' || task.completed)
    .reduce((sum, task) => sum + (task.points || 1), 0);

  const remainingPoints = totalPoints - completedPoints;
  const burndownRate = totalPoints > 0 ? (completedPoints / totalPoints) * 100 : 0;

  return {
    totalPoints,
    completedPoints,
    remainingPoints,
    burndownPercentage: Math.round(burndownRate * 100) / 100,
    isOnTrack: remainingPoints <= totalPoints * 0.1 // Within 10% of completion
  };
}

async function calculateCapacity(neo4jClient: any, period: any, scope: any) {
  // This would calculate team capacity based on team members and availability
  // Simplified implementation
  let query = `
    MATCH (user:User)
  `;

  const parameters: any = {};

  if (scope.teamId) {
    query += `-[:MEMBER_OF]->(team:Team {id: $teamId})`;
    parameters.teamId = scope.teamId;
  }

  query += `
    RETURN count(user) as teamSize
  `;

  try {
    const result = await neo4jClient.executeQuery(query, parameters);
    const teamSize = result.records[0]?.get('teamSize')?.toNumber() || 1;

    // Assume 8 hours per day, 5 days per week
    const periodDays = Math.ceil(
      (new Date(period.end).getTime() - new Date(period.start).getTime()) / (1000 * 60 * 60 * 24)
    );
    const workingDays = Math.floor(periodDays * (5/7)); // Exclude weekends

    return {
      teamSize,
      totalHours: teamSize * workingDays * 8,
      averagePointsPerHour: 0.5, // Estimated
      theoreticalCapacity: teamSize * workingDays * 8 * 0.5,
      workingDays,
      periodDays
    };

  } catch (error) {
    return {
      teamSize: 1,
      totalHours: 40,
      theoreticalCapacity: 20,
      workingDays: 5,
      periodDays: 7
    };
  }
}

function calculateSummaryMetrics(periods: any[], metrics: string[]) {
  const summary: any = {};

  for (const metric of metrics) {
    const values = periods
      .map(p => p.metrics[metric])
      .filter(v => v !== undefined);

    if (values.length === 0) continue;

    switch (metric) {
      case 'velocity':
        const velocityPoints = values.map(v => v.storyPoints);
        summary.velocity = {
          averageStoryPoints: Math.round((velocityPoints.reduce((a, b) => a + b, 0) / velocityPoints.length) * 100) / 100,
          totalStoryPoints: velocityPoints.reduce((a, b) => a + b, 0),
          averageTasksCompleted: Math.round((values.map(v => v.tasksCompleted).reduce((a, b) => a + b, 0) / values.length) * 100) / 100
        };
        break;

      case 'throughput':
        const throughputValues = values.map(v => v.tasksPerPeriod);
        summary.throughput = {
          averageTasksPerPeriod: Math.round((throughputValues.reduce((a, b) => a + b, 0) / throughputValues.length) * 100) / 100,
          totalTasksCompleted: throughputValues.reduce((a, b) => a + b, 0)
        };
        break;

      case 'cycle_time':
        const cycleTimeAverages = values.map(v => v.average).filter(v => v > 0);
        if (cycleTimeAverages.length > 0) {
          summary.cycleTime = {
            averageAcrossPeriods: Math.round((cycleTimeAverages.reduce((a, b) => a + b, 0) / cycleTimeAverages.length) * 100) / 100,
            minimum: Math.min(...values.map(v => v.minimum).filter(v => v > 0)),
            maximum: Math.max(...values.map(v => v.maximum))
          };
        }
        break;
    }
  }

  return summary;
}

function calculateTrends(periods: any[], metrics: string[]) {
  const trends: any = {};

  for (const metric of metrics) {
    const values = periods.map(p => p.metrics[metric]).filter(v => v !== undefined);

    if (values.length < 2) continue;

    switch (metric) {
      case 'velocity':
        const velocityTrend = calculateTrend(values.map(v => v.storyPoints));
        trends.velocity = {
          direction: velocityTrend.direction,
          slope: velocityTrend.slope,
          confidence: velocityTrend.confidence,
          interpretation: interpretVelocityTrend(velocityTrend)
        };
        break;

      case 'throughput':
        const throughputTrend = calculateTrend(values.map(v => v.tasksPerPeriod));
        trends.throughput = {
          direction: throughputTrend.direction,
          slope: throughputTrend.slope,
          confidence: throughputTrend.confidence,
          interpretation: interpretThroughputTrend(throughputTrend)
        };
        break;

      case 'cycle_time':
        const cycleTimeTrend = calculateTrend(values.map(v => v.average).filter(v => v > 0));
        if (cycleTimeTrend) {
          trends.cycleTime = {
            direction: cycleTimeTrend.direction,
            slope: cycleTimeTrend.slope,
            confidence: cycleTimeTrend.confidence,
            interpretation: interpretCycleTimeTrend(cycleTimeTrend)
          };
        }
        break;
    }
  }

  return trends;
}

function calculateTrend(values: number[]) {
  if (values.length < 2) return null;

  // Simple linear regression
  const n = values.length;
  const xMean = (n - 1) / 2; // 0, 1, 2, ... n-1
  const yMean = values.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    const x = i;
    const y = values[i];
    numerator += (x - xMean) * (y - yMean);
    denominator += (x - xMean) * (x - xMean);
  }

  const slope = denominator !== 0 ? numerator / denominator : 0;

  // Calculate R-squared for confidence
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = yMean + slope * (i - xMean);
    ssRes += (values[i] - predicted) * (values[i] - predicted);
    ssTot += (values[i] - yMean) * (values[i] - yMean);
  }

  const rSquared = ssTot !== 0 ? 1 - (ssRes / ssTot) : 0;

  return {
    slope: Math.round(slope * 1000) / 1000,
    direction: slope > 0.1 ? 'increasing' : slope < -0.1 ? 'decreasing' : 'stable',
    confidence: Math.round(rSquared * 100)
  };
}

function interpretVelocityTrend(trend: any): string {
  if (trend.direction === 'increasing') {
    return trend.confidence > 70 ? 'Team velocity is improving consistently' : 'Team velocity shows some improvement';
  } else if (trend.direction === 'decreasing') {
    return trend.confidence > 70 ? 'Team velocity is declining' : 'Team velocity may be declining';
  } else {
    return 'Team velocity is stable';
  }
}

function interpretThroughputTrend(trend: any): string {
  if (trend.direction === 'increasing') {
    return 'Team is completing more tasks over time';
  } else if (trend.direction === 'decreasing') {
    return 'Team throughput is declining';
  } else {
    return 'Team throughput is consistent';
  }
}

function interpretCycleTimeTrend(trend: any): string {
  if (trend.direction === 'increasing') {
    return 'Tasks are taking longer to complete';
  } else if (trend.direction === 'decreasing') {
    return 'Task completion time is improving';
  } else {
    return 'Task completion time is consistent';
  }
}

function generateVelocityInsights(analysis: any) {
  const insights = [];

  // Velocity insights
  if (analysis.summary.velocity) {
    const avgVelocity = analysis.summary.velocity.averageStoryPoints;

    if (avgVelocity > 30) {
      insights.push({
        type: 'velocity',
        level: 'positive',
        message: `High team velocity of ${avgVelocity} story points per period`,
        recommendation: 'Consider increasing sprint capacity or taking on more complex features'
      });
    } else if (avgVelocity < 10) {
      insights.push({
        type: 'velocity',
        level: 'warning',
        message: `Low team velocity of ${avgVelocity} story points per period`,
        recommendation: 'Review task sizing, remove blockers, or consider team capacity issues'
      });
    }
  }

  // Trend insights
  if (analysis.trends.velocity) {
    if (analysis.trends.velocity.direction === 'decreasing' && analysis.trends.velocity.confidence > 70) {
      insights.push({
        type: 'trend',
        level: 'warning',
        message: 'Team velocity is declining with high confidence',
        recommendation: 'Investigate potential issues: team capacity, technical debt, or process problems'
      });
    }
  }

  // Cycle time insights
  if (analysis.summary.cycleTime) {
    const avgCycleTime = analysis.summary.cycleTime.averageAcrossPeriods;

    if (avgCycleTime > 14) {
      insights.push({
        type: 'cycle_time',
        level: 'warning',
        message: `Long average cycle time of ${avgCycleTime} days`,
        recommendation: 'Break down tasks into smaller pieces or identify bottlenecks in the workflow'
      });
    } else if (avgCycleTime < 3) {
      insights.push({
        type: 'cycle_time',
        level: 'positive',
        message: `Excellent cycle time of ${avgCycleTime} days`,
        recommendation: 'Maintain current practices and consider sharing best practices with other teams'
      });
    }
  }

  // Consistency insights
  const velocityVariance = calculateVariance(analysis.periods.map(p => p.metrics.velocity?.storyPoints).filter(v => v !== undefined));
  if (velocityVariance > 100) {
    insights.push({
      type: 'consistency',
      level: 'info',
      message: 'High velocity variance indicates inconsistent delivery',
      recommendation: 'Work on more consistent task sizing and sprint planning'
    });
  }

  return insights;
}

function calculateVariance(values: number[]): number {
  if (values.length < 2) return 0;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(value => (value - mean) * (value - mean));
  return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
}

function generateVelocityForecasting(periods: any[], metrics: string[]) {
  const forecasting: any = {};

  // Forecast velocity for next 3 periods
  if (metrics.includes('velocity')) {
    const velocities = periods.map(p => p.metrics.velocity?.storyPoints).filter(v => v !== undefined);

    if (velocities.length >= 3) {
      const trend = calculateTrend(velocities);
      const lastVelocity = velocities[velocities.length - 1];

      forecasting.velocity = {
        nextPeriod: Math.max(0, Math.round((lastVelocity + trend.slope) * 100) / 100),
        next2Periods: Math.max(0, Math.round((lastVelocity + trend.slope * 2) * 100) / 100),
        next3Periods: Math.max(0, Math.round((lastVelocity + trend.slope * 3) * 100) / 100),
        confidence: trend.confidence,
        baselineAverage: Math.round((velocities.reduce((a, b) => a + b, 0) / velocities.length) * 100) / 100
      };
    }
  }

  return forecasting;
}