import React, { memo, useEffect, useRef, useMemo } from 'react';
import { Handle, Position, NodeProps, useViewport } from 'reactflow';
import { RESOURCE_REGISTRY, ResourceType } from '@aligrid/engine';
import { useStore, RFState } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { NodeHeaderMenu } from '../components/NodeHeaderMenu';
import type { NodeData } from '../store/types';

const DEFAULT_RATIOS = [1, 1];

const SplitterNodeComponent = ({ id, data, selected }: NodeProps<NodeData>) => {
    const { zoom } = useViewport();
    const updateNodeData = useStore((s) => s.updateNodeData);

    const inFlowRef = useRef<HTMLSpanElement>(null);
    const outFlowRefs = useRef<Record<string, HTMLSpanElement>>({});
    const targetRateRefs = useRef<Record<string, HTMLSpanElement>>({});

    const ratios = useStore((state: RFState) => state.nodes.find(node => node.id === id)?.data?.ratios) || DEFAULT_RATIOS;
    const compactMode = useStore(state => state.settings.compactMode);
    const showDetail = zoom > 0.6 && !compactMode;

    useEffect(() => {
        const unsubscribe = useStore.subscribe(
            state => state.nodeStats?.[id],
            (stats) => {
                if (!stats) return;
                try {
                    const inputFlow = parseFloat(stats.handleFlows?.['input'] || '0');
                    if (inFlowRef.current) {
                        inFlowRef.current.innerText = inputFlow > 0 ? `${inputFlow.toFixed(1)}/s` : '0/s';
                    }

                    const totalRatio = ratios.reduce((a, b) => a + b, 0);
                    ratios.forEach((r, i) => {
                        const handleId = `output-${i}`;
                        const el = outFlowRefs.current[handleId];
                        if (el) {
                            const handleFlow = parseFloat(stats.handleFlows?.[handleId] || '0');
                            el.innerText = handleFlow > 0 ? `${handleFlow.toFixed(1)}/s` : '0.0/s';
                        }

                        const targetEl = targetRateRefs.current[handleId];
                        if (targetEl) {
                            const targetRate = totalRatio > 0 ? (inputFlow * r) / totalRatio : 0;
                            const pct = totalRatio > 0 ? ((r / totalRatio) * 100).toFixed(0) : '0';
                            targetEl.innerText = `Target: ${targetRate.toFixed(1)} (${pct}%)`;
                        }
                    });
                } catch (e) { }
            }
        );
        return unsubscribe;
    }, [id, ratios]);

    const handleRatioChange = (index: number, value: string) => {
        const num = Math.max(parseInt(value, 10) || 0, 0);
        const newRatios = [...ratios];
        newRatios[index] = num;
        updateNodeData(id, { ratios: newRatios });
    };

    const inputRes = useStore(useShallow(state => {
        const edges = state.edges.filter(e => e.target === id && e.targetHandle === 'input');
        if (edges.length === 0) return undefined;
        const e = edges[0];
        return (state as any).edgeStats?.[e.id]?.resourceType || (e.data as any)?.resourceType;
    }));
    const meta = inputRes ? RESOURCE_REGISTRY[inputRes as ResourceType] : null;

    const nodeStyles = useMemo(() => ({
        '--node-accent': '#06b6d4',
    } as React.CSSProperties), []);

    if (!showDetail) {
        return (
            <div className="glass-node" style={{ ...nodeStyles, width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Handle type="target" position={Position.Left} id="input" style={{ left: '-4px', top: '32px', background: '#3b82f6', width: '8px', height: '8px', border: '1.5px solid #0d1122' }} />
                <div style={{ fontSize: '32px' }}>↗️</div>
                {ratios.map((_, i) => (
                    <Handle
                        key={i}
                        type="source"
                        position={Position.Right}
                        id={`output-${i}`}
                        style={{
                            right: '-4px',
                            top: ratios.length === 1 ? '32px' : `${(i + 1) * (64 / (ratios.length + 1))}px`,
                            background: '#10b981',
                            width: '8px',
                            height: '8px',
                            border: '1.5px solid #0d1122'
                        }}
                    />
                ))}
            </div>
        );
    }

    return (
        <div className="glass-node" style={{ ...nodeStyles, minWidth: '240px', padding: '16px' }}>
            {/* Header */}
            <div className="node-header">
                <div className="node-icon-ring" style={{ background: `linear-gradient(135deg, rgba(6, 182, 212, 0.2), transparent)` }}>
                    ↗️
                </div>
                <div className="node-title-group">
                    <div className="node-title">{data?.label || 'Splitter'}</div>
                    <div className="node-level">Distribution Hub</div>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                    <NodeHeaderMenu nodeId={id} />
                </div>
            </div>

            {/* Input Section */}
            <div className="resource-section-title">Inbound Stream</div>
            <div className="resource-card" style={{ borderLeft: `2px solid ${meta?.color || '#3b82f6'}`, marginBottom: '12px' }}>
                <Handle type="target" position={Position.Left} id="input" style={{ left: '-20px', background: meta?.color || '#3b82f6', width: '10px', height: '10px', border: '2px solid #0d1122' }} />
                <div className="resource-info">
                    <span style={{ color: meta ? meta.color : '#e2e8f0' }}>{meta?.label || 'Full Load'}</span>
                </div>
                <span ref={inFlowRef} style={{ fontSize: '12px', color: '#60a5fa', fontWeight: '800' }}>0/s</span>
            </div>

            {/* Outputs Section */}
            <div className="resource-section-title">Ratio Distribution</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {ratios.map((r, i) => {
                    const handleId = `output-${i}`;
                    return (
                        <div key={i} className="resource-card" style={{ borderRight: '2px solid #10b981' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{
                                    background: 'rgba(0,0,0,0.3)',
                                    width: '20px',
                                    height: '20px',
                                    borderRadius: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '9px',
                                    fontWeight: 'bold',
                                    color: '#64748b'
                                }}>
                                    #{i + 1}
                                </div>
                                <input
                                    type="number"
                                    min="0"
                                    value={r}
                                    onChange={(e) => handleRatioChange(i, e.target.value)}
                                    style={{
                                        width: '40px',
                                        background: 'rgba(255,255,255,0.05)',
                                        color: '#f8fafc',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '4px',
                                        padding: '2px 4px',
                                        fontSize: '11px',
                                        textAlign: 'center',
                                        fontFamily: 'inherit'
                                    }}
                                    className="nodrag"
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexGrow: 1 }}>
                                <div ref={el => { if (el) outFlowRefs.current[handleId] = el; }} style={{ color: '#22d3ee', fontWeight: '800', fontSize: '11px' }}>
                                    0.0/s
                                </div>
                                <div ref={el => { if (el) targetRateRefs.current[handleId] = el; }} style={{ color: '#64748b', fontSize: '8px' }}>
                                    Target: 0.0 (0%)
                                </div>
                            </div>
                            <Handle
                                key={handleId}
                                type="source"
                                position={Position.Right}
                                id={handleId}
                                style={{ right: '-20px', background: '#10b981', width: '10px', height: '10px', border: '2px solid #0d1122' }}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export const SplitterNode = memo(SplitterNodeComponent, (prev, next) => {
    return prev.id === next.id && prev.selected === next.selected;
});

