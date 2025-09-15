import React, { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  closestCenter
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';

interface Swimlane {
  id: string;
  name: string;
  description?: string;
  color?: string;
  position: number;
  tasks: Task[];
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  columnId: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  assignee?: {
    id: string;
    username: string;
    avatar?: string;
  };
  swimlane?: {
    id: string;
    name: string;
    color?: string;
  };
  dueDate?: string;
  labels: Array<{
    label: {
      id: string;
      name: string;
      color: string;
    };
  }>;
}

interface Column {
  id: string;
  name: string;
  position: number;
  color?: string;
  wipLimit?: number;
  tasks: Task[];
}

interface SwimlaneViewProps {
  boardId: string;
  columns: Column[];
  swimlanes: Swimlane[];
  onTaskMove: (taskId: string, columnId: string, position: number, swimlaneId?: string) => void;
  onSwimlaneReorder: (swimlaneIds: string[]) => void;
  onCreateSwimlane: () => void;
  onEditSwimlane: (swimlane: Swimlane) => void;
  onDeleteSwimlane: (swimlaneId: string) => void;
}

export const SwimlaneView: React.FC<SwimlaneViewProps> = ({
  boardId,
  columns,
  swimlanes,
  onTaskMove,
  onSwimlaneReorder: _onSwimlaneReorder,
  onCreateSwimlane,
  onEditSwimlane,
  onDeleteSwimlane
}) => {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [_showCreateSwimlane, setShowCreateSwimlane] = useState(false);
  const [newSwimlane, setNewSwimlane] = useState({ name: '', description: '', color: '#3B82F6' });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: any) => {
    const { active } = event;
    const task = findTaskById(active.id);
    setActiveTask(task);
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const activeTask = findTaskById(active.id);
    if (!activeTask) return;

    // Parse the drop target (format: "column-swimlane" or "column-null")
    const [targetColumnId, targetSwimlaneId] = over.id.split('-');
    const finalSwimlaneId = targetSwimlaneId === 'null' ? null : targetSwimlaneId;

    // Calculate new position based on drop zone
    const targetTasks = getTasksForCell(targetColumnId, finalSwimlaneId);
    const newPosition = targetTasks.length;

    if (
      activeTask.columnId !== targetColumnId ||
      activeTask.swimlane?.id !== finalSwimlaneId
    ) {
      onTaskMove(active.id, targetColumnId, newPosition, finalSwimlaneId);
    }
  };

  const findTaskById = (taskId: string): Task | null => {
    for (const column of columns) {
      const task = column.tasks.find(t => t.id === taskId);
      if (task) return { ...task, columnId: column.id };
    }
    return null;
  };

  const getTasksForCell = (columnId: string, swimlaneId: string | null): Task[] => {
    const column = columns.find(c => c.id === columnId);
    if (!column) return [];

    return column.tasks.filter(task => {
      if (swimlaneId === null) {
        return !task.swimlane?.id;
      }
      return task.swimlane?.id === swimlaneId;
    });
  };

  const getTaskCountForSwimlane = (swimlaneId: string): number => {
    return columns.reduce((total, column) => {
      return total + column.tasks.filter(task => task.swimlane?.id === swimlaneId).length;
    }, 0);
  };

  const _handleCreateSwimlane = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/swimlanes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          ...newSwimlane,
          boardId
        })
      });

      if (!response.ok) throw new Error('Failed to create swimlane');
      
      setShowCreateSwimlane(false);
      setNewSwimlane({ name: '', description: '', color: '#3B82F6' });
      // Refresh board data (would be handled by parent component)
    } catch (error) {
      console.error('Error creating swimlane:', error);
    }
  };

  const renderTaskCard = (task: Task) => (
    <div
      key={task.id}
      className="bg-white p-3 rounded-lg shadow-sm border border-gray-200 cursor-grab hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between mb-2">
        <h4 className="text-sm font-medium text-gray-900 truncate flex-1">{task.title}</h4>
        <span
          className={`ml-2 px-2 py-1 text-xs rounded-full ${
            task.priority === 'CRITICAL' ? 'bg-red-100 text-red-800' :
            task.priority === 'HIGH' ? 'bg-orange-100 text-orange-800' :
            task.priority === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
            'bg-green-100 text-green-800'
          }`}
        >
          {task.priority}
        </span>
      </div>
      
      {task.description && (
        <p className="text-xs text-gray-600 mb-2 line-clamp-2">{task.description}</p>
      )}
      
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1">
          {task.labels.map(({ label }) => (
            <span
              key={label.id}
              className="inline-block w-3 h-3 rounded-full"
              style={{ backgroundColor: label.color }}
              title={label.name}
            />
          ))}
        </div>
        
        {task.assignee && (
          <div className="flex items-center">
            {task.assignee.avatar ? (
              <img
                src={task.assignee.avatar}
                alt={task.assignee.username}
                className="w-6 h-6 rounded-full"
              />
            ) : (
              <div className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center">
                <span className="text-xs text-gray-600">
                  {task.assignee.username.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const renderDropZone = (columnId: string, swimlaneId: string | null, tasks: Task[]) => {
    const dropId = `${columnId}-${swimlaneId || 'null'}`;
    
    return (
      <div
        id={dropId}
        className="min-h-[100px] p-2 space-y-2"
      >
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map(task => renderTaskCard(task))}
        </SortableContext>
      </div>
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToWindowEdges]}
    >
      <div className="flex flex-col h-full bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Swimlane View</h2>
            <button
              onClick={onCreateSwimlane}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Add Swimlane
            </button>
          </div>
        </div>

        {/* Board Grid */}
        <div className="flex-1 overflow-auto">
          <div className="min-w-max">
            {/* Column Headers */}
            <div className="sticky top-0 bg-white border-b border-gray-200 z-10">
              <div className="flex">
                <div className="w-48 p-4 border-r border-gray-200">
                  <span className="text-sm font-medium text-gray-900">Swimlanes</span>
                </div>
                {columns.map(column => (
                  <div
                    key={column.id}
                    className="w-80 p-4 border-r border-gray-200"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">{column.name}</span>
                      {column.wipLimit && (
                        <span className="text-xs text-gray-500">
                          WIP: {column.tasks.length}/{column.wipLimit}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* No Swimlane Row */}
            <div className="flex border-b border-gray-200 bg-gray-50">
              <div className="w-48 p-4 border-r border-gray-200 flex items-center">
                <span className="text-sm text-gray-600 italic">No Swimlane</span>
              </div>
              {columns.map(column => (
                <div
                  key={`${column.id}-no-swimlane`}
                  className="w-80 border-r border-gray-200 bg-white"
                >
                  {renderDropZone(column.id, null, getTasksForCell(column.id, null))}
                </div>
              ))}
            </div>

            {/* Swimlane Rows */}
            <SortableContext items={swimlanes.map(s => s.id)} strategy={verticalListSortingStrategy}>
              {swimlanes.map(swimlane => (
                <div key={swimlane.id} className="flex border-b border-gray-200">
                  <div 
                    className="w-48 p-4 border-r border-gray-200 flex items-center justify-between"
                    style={{ borderLeft: `4px solid ${swimlane.color || '#3B82F6'}` }}
                  >
                    <div>
                      <h3 className="text-sm font-medium text-gray-900">{swimlane.name}</h3>
                      {swimlane.description && (
                        <p className="text-xs text-gray-600 mt-1">{swimlane.description}</p>
                      )}
                      <span className="text-xs text-gray-500 mt-1">
                        {getTaskCountForSwimlane(swimlane.id)} tasks
                      </span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => onEditSwimlane(swimlane)}
                        className="p-1 text-gray-400 hover:text-gray-600"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => onDeleteSwimlane(swimlane.id)}
                        className="p-1 text-gray-400 hover:text-red-600"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  {columns.map(column => (
                    <div
                      key={`${column.id}-${swimlane.id}`}
                      className="w-80 border-r border-gray-200 bg-white"
                    >
                      {renderDropZone(column.id, swimlane.id, getTasksForCell(column.id, swimlane.id))}
                    </div>
                  ))}
                </div>
              ))}
            </SortableContext>
          </div>
        </div>

        <DragOverlay>
          {activeTask ? renderTaskCard(activeTask) : null}
        </DragOverlay>
      </div>
    </DndContext>
  );
};