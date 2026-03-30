import React, { memo, useEffect, useRef, useMemo } from 'react';
import { Handle, Position, NodeProps, useViewport } from 'reactflow';
import { RESOURCE_REGISTRY, ResourceType } from '@aligrid/engine';
import { useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { NodeHeaderMenu } from '../components/NodeHeaderMenu';
import type { NodeData } from '../store/types';

const MergerNodeComponent = ({ id, data, selected }: NodeProps<NodeData>) => {
    const { zoom } = useViewport();
    const compactMode = useStore(state => state.settings.compactMode);
    const showDetail = zoom > 0.6 && !compactMode;

    const incomingEdges = useStore(useShallow(state => state.edges.filter(e => e.target === id)));

    const maxInputs = data?.maxInputs || 5;
    const connectedInputs = incomingEdges.length;
    const visibleInputs = Math.min(Math.max(connectedInputs + 1, 1), maxInputs);
    const locked = data?.lockedResourceType as ResourceType | undefined;
    const meta = locked ? RESOURCE_REGISTRY[locked] : null;

    const findSourceResourceType = (eSourceId: string, visited = new Set<string>()): string | undefined => {
        if (visited.has(eSourceId)) return undefined;
        visited.add(eSourceId);

        const state = useStore.getState();
        const node = state.nodes.find((n) => n.id === eSourceId);
        if (!node) return undefined;

        if (node.data?.resourceType) return node.data.resourceType;
        if (node.data?.recipe?.outputType) return node.data.recipe.outputType;

        if (node.type === 'splitter' || node.type === 'merger') {
            const nodeInEdges = state.edges.filter(e => e.target === eSourceId);
            for (const e of nodeInEdges) {
                const res = findSourceResourceType(e.source, visited);
                if (res) return res;
            }
        }
        return undefined;
    };

    let displayMeta = meta;
    if (!displayMeta) {
        let fallbackRes: string | undefined = undefined;
        for (let i = 0; i < maxInputs; i++) {
            const edge = incomingEdges.find(e => e.targetHandle === `input-${i}`);
            if (edge) {
                fallbackRes = findSourceResourceType(edge.source);
                if (fallbackRes) break;
            }
        }
        if (fallbackRes) {
            displayMeta = RESOURCE_REGISTRY[fallbackRes as ResourceType];
        }
    }

    const inFlowRefs = useRef<Record<string, HTMLSpanElement>>({});
    const outFlowRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        const unsubscribe = useStore.subscribe(
            state => state.nodeStats?.[id],
            (stats) => {
                if (!stats) return;
                try {
                    for (let i = 0; i < maxInputs; i++) {
                        const el = inFlowRefs.current[`input-${i}`];
                        if (el) {
                            const flow = parseFloat(stats.handleFlows?.[`input-${i}`] || '0');
                            el.innerText = flow > 0 ? `${flow.toFixed(1)}/s` : '0/s';
                        }
                    }
                    if (outFlowRef.current) {
                        const rawOutValue = stats.handleFlows?.['output'] || stats.actualOutputPerSec || '0';
                        const outFlow = parseFloat(rawOutValue.toString());
                        outFlowRef.current.innerText = outFlow > 0 ? `${outFlow.toFixed(1)}/s` : '0.0/s';
                    }
                } catch (e) { }
            }
        );
        return unsubscribe;
    }, [id, maxInputs, locked]);

    const nodeStyles = useMemo(() => ({
        '--node-accent': '#8b5cf6',
    } as React.CSSProperties), []);

    if (!showDetail) {
        return (
            <div className="glass-node" style={{ ...nodeStyles, width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {Array.from({ length: 3 }, (_, i) => (
                    <Handle
                        key={`input-${i}`}
                        type="target"
                        position={Position.Left}
                        id={`input-${i}`}
                        style={{
                            left: '-4px',
                            top: `${(i + 1) * (64 / 4)}px`,
                            background: '#3b82f6',
                            width: '8px',
                            height: '8px',
                            border: '1.5px solid #0d1122'
                        }}
                    />
                ))}
                <div style={{ fontSize: '32px' }}>🔀</div>
                <Handle type="source" position={Position.Right} id="output" style={{ right: '-4px', top: '32px', background: '#10b981', width: '8px', height: '8px', border: '1.5px solid #0d1122' }} />
            </div>
        );
    }

    return (
        <div className="glass-node" style={{ ...nodeStyles, minWidth: '240px', padding: '16px' }}>
            {/* Header */}
            <div className="node-header">
                <div className="node-icon-ring" style={{ background: `linear-gradient(135deg, rgba(139, 92, 246, 0.2), transparent)` }}>
                    🔀
                </div>
                <div className="node-title-group">
                    <div className="node-title">{data?.label || 'Merger'}</div>
                    <div className="node-level">Consolidation Hub</div>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                    <NodeHeaderMenu nodeId={id} />
                </div>
            </div>

            {/* Content Buffer for resource type */}
            <div style={{ marginBottom: '12px' }}>
                {displayMeta ? (
                    <div className="resource-card" style={{ borderLeft: `2px solid ${displayMeta.color}` }}>
                        <div className="resource-info">
                            <div className="resource-name">{displayMeta.icon} {displayMeta.label}</div>
                            <div style={{ fontSize: '10px', color: '#64748b' }}>Primary Flow</div>
                        </div>
                    </div>
                ) : (
                    <div style={{ padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', textAlign: 'center', fontSize: '10px', color: '#475569', border: '1px dashed rgba(255,255,255,0.1)' }}>
                        Waiting for input connection...
                    </div>
                )}
            </div>

            {/* Inputs Section */}
            <div className="resource-section-title">Inbound Ports</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                {Array.from({ length: visibleInputs }, (_, i) => {
                    const edgeForPort = incomingEdges.find(e => e.targetHandle === `input-${i}`);
                    let portRes: string | undefined = undefined;
                    if (edgeForPort) portRes = findSourceResourceType(edgeForPort.source);
                    const portMeta = portRes ? RESOURCE_REGISTRY[portRes as ResourceType] : null;

                    return (
                        <div key={`input-${i}`} className="resource-card" style={{ borderLeft: `2px solid ${portMeta?.color || '#3b82f6'}` }}>
                            <Handle
                                type="target"
                                position={Position.Left}
                                id={`input-${i}`}
                                style={{ left: '-20px', background: portMeta?.color || '#3b82f6', width: '10px', height: '10px', border: '2px solid #0d1122' }}
                            />
                            <div className="resource-info">
                                <div className="resource-name">{portMeta?.icon || '📥'} {portMeta ? portMeta.label : `Port ${i + 1}`}</div>
                                <span ref={el => { if (el) inFlowRefs.current[`input-${i}`] = el; }} style={{ fontSize: '12px', color: '#60a5fa', fontWeight: '800' }}>0/s</span>
                            </div>
                        </div>
                    );
                })}
                {connectedInputs === maxInputs && <div style={{ fontSize: '9px', color: '#ef4444', textAlign: 'center' }}>Max Inbound Ports Reached</div>}
            </div>

            {/* Output Section */}
            <div className="resource-section-title">Consolidated Output</div>
            <div className="resource-card" style={{ borderRight: '2px solid #10b981' }}>
                <div className="resource-info">
                    <div className="resource-name">📤 Merged Stream</div>
                    <span ref={outFlowRef} style={{ fontSize: '12px', color: '#34d399', fontWeight: '800' }}>0.0/s</span>
                </div>
                <Handle
                    type="source"
                    position={Position.Right}
                    id="output"
                    style={{ right: '-20px', background: '#10b981', width: '10px', height: '10px', border: '2px solid #0d1122' }}
                />
            </div>
        </div>
    );
};

export const MergerNode = memo(MergerNodeComponent);
