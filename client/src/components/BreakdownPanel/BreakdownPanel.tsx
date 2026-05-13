import { useState } from 'react';
import type { SubtaskProposal } from 'ticketcraft-shared';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import {
  ChevronDown, ChevronUp, Trash2, Plus,
  ArrowUp, ArrowDown, GripVertical,
} from 'lucide-react';

interface BreakdownPanelProps {
  tasks: SubtaskProposal[];
  rationale: string;
  parentStoryPoints: number | null;
  onTasksChange: (tasks: SubtaskProposal[]) => void;
}

export function BreakdownPanel({
  tasks,
  rationale,
  parentStoryPoints,
  onTasksChange,
}: BreakdownPanelProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const totalPoints = tasks.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateTask = (id: string, patch: Partial<SubtaskProposal>) => {
    onTasksChange(tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const removeTask = (id: string) => {
    onTasksChange(tasks.filter((t) => t.id !== id));
  };

  const moveTask = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= tasks.length) return;
    const next = [...tasks];
    [next[index], next[target]] = [next[target], next[index]];
    onTasksChange(next.map((t, i) => ({ ...t, order: i + 1 })));
  };

  const addTask = () => {
    const id = `task-${Date.now()}`;
    onTasksChange([
      ...tasks,
      {
        id,
        summary: '',
        description: '',
        acceptanceCriteria: '',
        labels: [],
        storyPoints: null,
        order: tasks.length + 1,
      },
    ]);
    setExpandedIds((prev) => new Set(prev).add(id));
  };

  return (
    <div className="space-y-4">
      {rationale && (
        <Card padding="sm">
          <p className="text-sm text-gray-600">
            <span className="font-medium text-gray-800">Decomposition strategy: </span>
            {rationale}
          </p>
        </Card>
      )}

      <div className="space-y-3">
        {tasks.map((task, index) => {
          const expanded = expandedIds.has(task.id);
          return (
            <Card key={task.id} padding="sm" className="relative">
              <div className="flex items-start gap-2">
                <div className="flex flex-col items-center gap-0.5 pt-1 text-gray-400">
                  <GripVertical className="w-4 h-4" />
                  <span className="text-xs font-mono">{index + 1}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <input
                      value={task.summary}
                      onChange={(e) => updateTask(task.id, { summary: e.target.value })}
                      placeholder="Task summary"
                      className="flex-1 text-sm font-medium border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none bg-transparent px-0 py-0.5"
                    />
                    <input
                      type="number"
                      min={0}
                      max={21}
                      value={task.storyPoints ?? ''}
                      onChange={(e) =>
                        updateTask(task.id, {
                          storyPoints: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      placeholder="SP"
                      className="w-14 text-center text-xs border border-gray-200 rounded px-1 py-0.5 focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  {task.labels.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {task.labels.map((l) => (
                        <Badge key={l} size="sm">{l}</Badge>
                      ))}
                    </div>
                  )}

                  {expanded && (
                    <div className="mt-3 space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                        <textarea
                          value={task.description}
                          onChange={(e) => updateTask(task.id, { description: e.target.value })}
                          rows={4}
                          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Acceptance Criteria</label>
                        <textarea
                          value={task.acceptanceCriteria}
                          onChange={(e) => updateTask(task.id, { acceptanceCriteria: e.target.value })}
                          rows={3}
                          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Labels (comma-separated)
                        </label>
                        <input
                          value={task.labels.join(', ')}
                          onChange={(e) =>
                            updateTask(task.id, {
                              labels: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                            })
                          }
                          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button onClick={() => moveTask(index, -1)} disabled={index === 0} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer">
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => moveTask(index, 1)} disabled={index === tasks.length - 1} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer">
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => toggleExpand(task.id)} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer">
                    {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => removeTask(task.id)} className="p-1 text-gray-400 hover:text-red-500 cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" icon={<Plus className="w-4 h-4" />} onClick={addTask}>
          Add Task
        </Button>
        <div className="text-sm text-gray-600">
          <span className="font-medium">{tasks.length}</span> task{tasks.length !== 1 && 's'}
          {' · '}
          <span className="font-medium">{totalPoints}</span> SP total
          {parentStoryPoints != null && (
            <span className={totalPoints === parentStoryPoints ? ' text-green-600' : ' text-amber-600'}>
              {' '}(parent: {parentStoryPoints})
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
