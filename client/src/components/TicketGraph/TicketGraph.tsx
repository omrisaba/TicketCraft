import { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  type Node,
  type Edge,
  Position,
  MarkerType,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Ticket } from 'ticketcraft-shared';

interface Props {
  ticket: Ticket;
  onTicketClick?: (key: string) => void;
}

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  Done: { bg: '#dcfce7', border: '#22c55e', text: '#166534' },
  Closed: { bg: '#dcfce7', border: '#22c55e', text: '#166534' },
  'In Progress': { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
  'In Review': { bg: '#e0e7ff', border: '#6366f1', text: '#3730a3' },
  'To Do': { bg: '#f3f4f6', border: '#9ca3af', text: '#374151' },
  Open: { bg: '#f3f4f6', border: '#9ca3af', text: '#374151' },
  Backlog: { bg: '#f3f4f6', border: '#9ca3af', text: '#374151' },
};

function getStatusStyle(status: string) {
  return STATUS_COLORS[status] || { bg: '#f3f4f6', border: '#9ca3af', text: '#374151' };
}

function truncate(text: string, max: number) {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function buildGraph(ticket: Ticket): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const seen = new Set<string>();

  const addNode = (
    key: string,
    summary: string,
    status: string,
    issueType: string,
    x: number,
    y: number,
    isCurrent: boolean,
  ) => {
    if (seen.has(key)) return;
    seen.add(key);
    const style = getStatusStyle(status);
    nodes.push({
      id: key,
      position: { x, y },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      data: {
        label: (
          <div style={{ textAlign: 'center', lineHeight: 1.3 }}>
            <div style={{
              fontSize: isCurrent ? 12 : 10,
              fontWeight: 700,
              color: style.text,
            }}>
              {key}
            </div>
            <div style={{
              fontSize: isCurrent ? 11 : 9,
              color: '#6b7280',
              maxWidth: isCurrent ? 180 : 140,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {truncate(summary, 40)}
            </div>
            <div style={{
              fontSize: 9,
              marginTop: 2,
              color: style.text,
              background: style.bg,
              borderRadius: 4,
              padding: '1px 6px',
              display: 'inline-block',
            }}>
              {issueType} · {status}
            </div>
          </div>
        ),
      },
      style: {
        background: isCurrent ? '#eff6ff' : '#ffffff',
        border: `2px solid ${isCurrent ? '#3b82f6' : style.border}`,
        borderRadius: 10,
        padding: '8px 12px',
        minWidth: isCurrent ? 200 : 160,
        boxShadow: isCurrent
          ? '0 0 0 3px rgba(59,130,246,0.2)'
          : '0 1px 3px rgba(0,0,0,0.08)',
      },
    });
  };

  const CENTER_X = 300;
  const CENTER_Y = 250;
  const V_GAP = 120;
  const H_GAP = 200;

  // Parent (above)
  if (ticket.parent) {
    const p = ticket.parent;
    addNode(p.key, p.summary, p.status, p.issueType, CENTER_X, CENTER_Y - V_GAP, false);
    edges.push({
      id: `${p.key}->${ticket.key}`,
      source: p.key,
      target: ticket.key,
      label: 'parent of',
      style: { stroke: '#9ca3af' },
      labelStyle: { fontSize: 9, fill: '#9ca3af' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#9ca3af' },
    });
  }

  // Current ticket (center)
  addNode(ticket.key, ticket.summary, ticket.status, ticket.issueType, CENTER_X, CENTER_Y, true);

  // Subtasks (below)
  const subtaskStartX = CENTER_X - ((ticket.subtasks.length - 1) * H_GAP) / 2;
  ticket.subtasks.forEach((st, i) => {
    const x = subtaskStartX + i * H_GAP;
    addNode(st.key, st.summary, st.status, st.issueType, x, CENTER_Y + V_GAP, false);
    edges.push({
      id: `${ticket.key}->${st.key}`,
      source: ticket.key,
      target: st.key,
      label: 'subtask',
      style: { stroke: '#9ca3af' },
      labelStyle: { fontSize: 9, fill: '#9ca3af' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#9ca3af' },
    });
  });

  // Linked tickets (left and right sides)
  const linked = ticket.linkedTickets;
  const leftLinks = linked.filter((_, i) => i % 2 === 0);
  const rightLinks = linked.filter((_, i) => i % 2 === 1);

  leftLinks.forEach((lt, i) => {
    const y = CENTER_Y - ((leftLinks.length - 1) * 90) / 2 + i * 90;
    addNode(lt.key, lt.summary, lt.status, 'Linked', CENTER_X - H_GAP - 60, y, false);
    edges.push({
      id: `link-${lt.key}`,
      source: lt.direction === 'outward' ? ticket.key : lt.key,
      target: lt.direction === 'outward' ? lt.key : ticket.key,
      label: lt.linkType,
      style: { stroke: '#f59e0b', strokeDasharray: '5,5' },
      labelStyle: { fontSize: 9, fill: '#d97706' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' },
    });
  });

  rightLinks.forEach((lt, i) => {
    const y = CENTER_Y - ((rightLinks.length - 1) * 90) / 2 + i * 90;
    addNode(lt.key, lt.summary, lt.status, 'Linked', CENTER_X + H_GAP + 60, y, false);
    edges.push({
      id: `link-${lt.key}`,
      source: lt.direction === 'outward' ? ticket.key : lt.key,
      target: lt.direction === 'outward' ? lt.key : ticket.key,
      label: lt.linkType,
      style: { stroke: '#f59e0b', strokeDasharray: '5,5' },
      labelStyle: { fontSize: 9, fill: '#d97706' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' },
    });
  });

  return { nodes, edges };
}

export function TicketGraph({ ticket, onTicketClick }: Props) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildGraph(ticket),
    [ticket],
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.id !== ticket.key && onTicketClick) {
        onTicketClick(node.id);
      }
    },
    [ticket.key, onTicketClick],
  );

  const hasRelationships = ticket.parent
    || ticket.subtasks.length > 0
    || ticket.linkedTickets.length > 0;

  if (!hasRelationships) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        No linked tickets, parent, or subtasks found.
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        nodesDraggable
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={2}
      >
        <Background gap={20} size={1} color="#f1f5f9" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
