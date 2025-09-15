import React, { useState, useEffect } from 'react';
import { authService } from '../../services/authService';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

interface MetricsDashboardProps {
  boardId: string;
}

interface BoardMetrics {
  boardId: string;
  boardName: string;
  totalTasks: number;
  completedTasks: number;
  averageCycleTime: number;
  averageLeadTime: number;
  throughput: number;
  cumulativeFlowData: CumulativeFlowDataPoint[];
  burndownData: BurndownDataPoint[];
  columnMetrics: ColumnMetrics[];
}

interface CumulativeFlowDataPoint {
  date: string;
  [columnName: string]: number | string;
}

interface BurndownDataPoint {
  date: string;
  totalTasks: number;
  completedTasks: number;
  remainingTasks: number;
  idealBurndown: number;
}

interface ColumnMetrics {
  columnId: string;
  columnName: string;
  averageCycleTime: number;
  averageLeadTime: number;
  throughput: number;
  wipViolations: number;
  tasksInProgress: number;
  tasksCompleted: number;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export const MetricsDashboard: React.FC<MetricsDashboardProps> = ({ boardId }) => {
  const [metrics, setMetrics] = useState<BoardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    dateTo: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchMetrics();
  }, [boardId, dateRange]);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        dateFrom: new Date(dateRange.dateFrom).toISOString(),
        dateTo: new Date(dateRange.dateTo).toISOString()
      });

      const response = await authService.makeAuthenticatedRequest(
        `/api/metrics/board/${boardId}?${params}`
      );

      if (!response.ok) throw new Error('Failed to fetch metrics');
      
      const data = await response.json();
      setMetrics(data);
    } catch (error) {
      console.error('Error fetching metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="text-center py-8 text-gray-500">
        Failed to load metrics data
      </div>
    );
  }

  const formatCumulativeFlowData = (data: CumulativeFlowDataPoint[]) => {
    return data.map(point => ({
      ...point,
      date: new Date(point.date).toLocaleDateString()
    }));
  };

  const formatBurndownData = (data: BurndownDataPoint[]) => {
    return data.map(point => ({
      ...point,
      date: new Date(point.date).toLocaleDateString()
    }));
  };

  const cycleTimeData = metrics.columnMetrics.map(col => ({
    column: col.columnName,
    cycleTime: Math.round(col.averageCycleTime * 10) / 10,
    leadTime: Math.round(col.averageLeadTime * 10) / 10,
    throughput: col.throughput
  }));

  const _wipViolationData = metrics.columnMetrics.map(col => ({
    column: col.columnName,
    violations: col.wipViolations,
    tasksInProgress: col.tasksInProgress
  }));

  const completionRateData = [
    { name: 'Completed', value: metrics.completedTasks, color: '#00C49F' },
    { name: 'In Progress', value: metrics.totalTasks - metrics.completedTasks, color: '#FFBB28' }
  ];

  return (
    <div className="space-y-6 p-6 bg-gray-50 min-h-screen">
      {/* Header with Date Range Selector */}
      <div className="bg-white p-6 rounded-lg shadow-sm">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">{metrics.boardName} - Analytics Dashboard</h1>
          <div className="flex gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">From</label>
              <input
                type="date"
                value={dateRange.dateFrom}
                onChange={(e) => setDateRange(prev => ({ ...prev, dateFrom: e.target.value }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">To</label>
              <input
                type="date"
                value={dateRange.dateTo}
                onChange={(e) => setDateRange(prev => ({ ...prev, dateTo: e.target.value }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Tasks</p>
              <p className="text-2xl font-semibold text-gray-900">{metrics.totalTasks}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Completed</p>
              <p className="text-2xl font-semibold text-gray-900">{metrics.completedTasks}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Avg Cycle Time</p>
              <p className="text-2xl font-semibold text-gray-900">
                {Math.round(metrics.averageCycleTime * 10) / 10}h
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Throughput</p>
              <p className="text-2xl font-semibold text-gray-900">{metrics.throughput}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cumulative Flow Diagram */}
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Cumulative Flow Diagram</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={formatCumulativeFlowData(metrics.cumulativeFlowData)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              {metrics.columnMetrics.map((col, index) => (
                <Area
                  key={col.columnId}
                  type="monotone"
                  dataKey={col.columnName}
                  stackId="1"
                  stroke={COLORS[index % COLORS.length]}
                  fill={COLORS[index % COLORS.length]}
                  fillOpacity={0.6}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Burndown Chart */}
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Burndown Chart</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={formatBurndownData(metrics.burndownData)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="remainingTasks"
                stroke="#8884d8"
                strokeWidth={2}
                name="Remaining Tasks"
              />
              <Line
                type="monotone"
                dataKey="idealBurndown"
                stroke="#82ca9d"
                strokeWidth={2}
                strokeDasharray="5 5"
                name="Ideal Burndown"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Cycle Time by Column */}
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Cycle Time by Column</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={cycleTimeData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="column" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="cycleTime" fill="#8884d8" name="Cycle Time (hours)" />
              <Bar dataKey="leadTime" fill="#82ca9d" name="Lead Time (hours)" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Task Completion Rate */}
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Task Completion Rate</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={completionRateData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {completionRateData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* WIP Violations Table */}
      <div className="bg-white rounded-lg shadow-sm">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">WIP Limit Status</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Column
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tasks in Progress
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Avg Cycle Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Throughput
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  WIP Violations
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {metrics.columnMetrics.map((column) => (
                <tr key={column.columnId}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {column.columnName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {column.tasksInProgress}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {Math.round(column.averageCycleTime * 10) / 10}h
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {column.throughput} tasks
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        column.wipViolations > 0
                          ? 'bg-red-100 text-red-800'
                          : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {column.wipViolations > 0 ? `${column.wipViolations} violations` : 'Within limit'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};