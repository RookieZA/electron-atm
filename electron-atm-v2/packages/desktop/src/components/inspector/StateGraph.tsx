import React, { useMemo, useCallback } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    type Node,
    type Edge,
    type NodeTypes,
    Handle,
    Position,
    useNodesState,
    useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// ── State type colour mapping (matches old build) ─────────────────────────
const STATE_COLOR: Record<string, { bg: string; border: string; text: string }> = {
    'I': { bg: '#14532d', border: '#22c55e', text: '#bbf7d0' }, // green  — Idle
    'J': { bg: '#7f1d1d', border: '#ef4444', text: '#fecaca' }, // red    — Close
    'D': { bg: '#1e3a5f', border: '#60a5fa', text: '#bfdbfe' }, // blue   — Decision
    'K': { bg: '#78350f', border: '#f59e0b', text: '#fde68a' }, // amber  — PIN
    'W': { bg: '#3b0764', border: '#a855f7', text: '#e9d5ff' }, // purple — Write
    '*': { bg: '#1e293b', border: '#94a3b8', text: '#cbd5e1' }, // grey   — other
};

function nodeColor(type: string) {
    return STATE_COLOR[type] ?? STATE_COLOR['*'];
}

// ── Custom node renderer ───────────────────────────────────────────────────
interface StateNodeData {
    label: string;
    type: string;
    screen?: string;
    isCurrent: boolean;
    [key: string]: unknown;
}

const StateNode = ({ data }: { data: StateNodeData }) => {
    const c = nodeColor(data.type);
    return (
        <div
            style={{
                background: c.bg,
                border: `2px solid ${data.isCurrent ? '#facc15' : c.border}`,
                color: c.text,
                boxShadow: data.isCurrent ? '0 0 16px 4px rgba(250,204,21,0.5)' : undefined,
            }}
            className="rounded-md px-3 py-2 font-mono text-xs min-w-[64px] text-center cursor-pointer select-none"
        >
            <Handle type="target" position={Position.Left} style={{ opacity: 0.4 }} />
            <div className="font-black">{data.label}</div>
            <div style={{ color: c.border === '#94a3b8' ? '#94a3b8' : c.text }} className="opacity-70 text-[10px]">{data.type}</div>
            {data.screen && <div className="text-[9px] opacity-50">S:{data.screen}</div>}
            <Handle type="source" position={Position.Right} style={{ opacity: 0.4 }} />
        </div>
    );
};

const nodeTypes: NodeTypes = { stateNode: StateNode };

// ── Dagre-like layout: arrange nodes in columns by depth ──────────────────
function layoutNodes(states: Record<string, any>) {
    const entries = Object.entries(states);
    if (entries.length === 0) return { nodes: [], edges: [] };

    // Build adjacency and compute depth via BFS from state '000'
    const adj: Record<string, string[]> = {};
    for (const [num, raw] of entries) {
        const exits: string[] = (raw as any)?.exit_states ?? (raw as any)?.states_to ?? [];
        adj[num] = exits.filter(Boolean);
    }

    const depth: Record<string, number> = {};
    const queue: string[] = ['000'];
    depth['000'] = 0;
    while (queue.length) {
        const cur = queue.shift()!;
        for (const nxt of (adj[cur] || [])) {
            if (!(nxt in depth)) {
                depth[nxt] = depth[cur] + 1;
                queue.push(nxt);
            }
        }
    }
    // Assign remaining unreachable states to depth 0
    for (const [num] of entries) {
        if (!(num in depth)) depth[num] = 0;
    }

    // Arrange columns
    const cols: Record<number, string[]> = {};
    for (const [num] of entries) {
        const d = depth[num];
        if (!cols[d]) cols[d] = [];
        cols[d].push(num);
    }

    const X_GAP = 200;
    const Y_GAP = 110;
    const nodes: Node[] = [];
    for (const [col, nums] of Object.entries(cols)) {
        const x = parseInt(col) * X_GAP;
        nums.forEach((num, row) => {
            const raw = states[num] as any;
            const type = raw?.type ?? raw?.raw?.[4] ?? '?';
            nodes.push({
                id: num,
                type: 'stateNode',
                position: { x, y: row * Y_GAP },
                data: {
                    label: num,
                    type,
                    screen: raw?.screen_number,
                    isCurrent: false,
                },
            });
        });
    }

    const edgeSet = new Set<string>();
    const edges: Edge[] = [];
    for (const [src, targets] of Object.entries(adj)) {
        for (const tgt of targets) {
            const key = `${src}->${tgt}`;
            if (!edgeSet.has(key) && states[tgt]) {
                edgeSet.add(key);
                edges.push({
                    id: key,
                    source: src,
                    target: tgt,
                    type: 'smoothstep',
                    style: { stroke: '#475569', strokeWidth: 1.5 },
                    markerEnd: { type: 'arrowclosed' as any, color: '#475569' },
                    animated: false,
                });
            }
        }
    }

    return { nodes, edges };
}

// ── Export ────────────────────────────────────────────────────────────────
interface StateGraphProps {
    stateTables: Record<string, any>;
    currentStateNumber?: string;
    onSelectState: (num: string) => void;
}

export const StateGraph = ({ stateTables, currentStateNumber, onSelectState }: StateGraphProps) => {
    const { nodes: initNodes, edges: initEdges } = useMemo(
        () => layoutNodes(stateTables),
        [stateTables]
    );

    // Mark current state node
    const nodesWithCurrent = useMemo(() =>
        initNodes.map(n => ({
            ...n,
            data: { ...n.data, isCurrent: n.id === currentStateNumber },
        })), [initNodes, currentStateNumber]);

    const [nodes, , onNodesChange] = useNodesState(nodesWithCurrent);
    const [edges, , onEdgesChange] = useEdgesState(initEdges);

    const onNodeClick = useCallback((_: any, node: Node) => {
        onSelectState(node.id);
    }, [onSelectState]);

    if (initNodes.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
                No state tables loaded. Connect to a host to download states.
            </div>
        );
    }

    return (
        <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.1 }}
            minZoom={0.05}
            maxZoom={2}
            style={{ background: '#0f172a' }}
            proOptions={{ hideAttribution: true }}
        >
            <Background color="#1e293b" gap={20} />
            <Controls
                style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8' }}
            />
            <MiniMap
                nodeColor={(n) => {
                    const type = (n.data as any)?.type ?? '?';
                    return nodeColor(type).border;
                }}
                style={{ background: '#0f172a', border: '1px solid #334155' }}
            />
        </ReactFlow>
    );
};
