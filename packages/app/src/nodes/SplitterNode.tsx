import React, { memo } from 'react';
import { Handle, Position, useEdges } from 'reactflow';
import { useStore } from '../store';
import { NodeHeaderMenu } from '../components/NodeHeaderMenu';
import { RESOURCE_REGISTRY, Decimal } from '@aligrid/engine';

import type { NodeData, FlowEdgeData } from '../store/types';

export interface SplitterNodeProps {
    id: string;
    data: NodeData;
}

export const SplitterNode: React.FC<SplitterNodeProps> = memo(({ id, data }) => {
    const stats = useStore((state) => state.nodeStats[id]);
    const liveData = { ...data, ...stats };
    const allEdges = useEdges();
    const ratios = liveData?.ratios || [1, 1];
    const maxOutputs = 2;
    const totalRatio = ratios.reduce((s, r) => s + r, 0);
    const updateNodeData = useStore((s) => s.updateNodeData);

    const handleRatioChange = (index: number, value: string) => {
        const num = Math.max(parseInt(value, 10) || 0, 0);
        const newRatios = [...ratios];
        newRatios[index] = num;
        updateNodeData(id, { ratios: newRatios });
    };

    const inEdge = allEdges.find(e => e.target === id && e.targetHandle === 'input');
    let inputRes: string | undefined = undefined;
    if (inEdge) {
        const nodes = useStore.getState().nodes || [];
        const srcNode = nodes.find((n) => n.id === inEdge.source);
        if (srcNode) {
            if (srcNode.data?.resourceType) inputRes = srcNode.data.resourceType;
            else if (srcNode.data?.recipe?.outputType) inputRes = srcNode.data.recipe.outputType;
        }
    }
    const meta = inputRes ? RESOURCE_REGISTRY[inputRes] : null;

    return (
        <div style={{
            background: '#161b2e',
            border: '1px solid #06b6d440',
            borderRadius: '6px',
            minWidth: '220px',
            color: '#e2e8f0',
            fontFamily: 'monospace',
            overflow: 'visible',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4)',
            position: 'relative',
        }}>
            {/* Header */}
            <div style={{
                background: '#1e293b',
                padding: '8px 12px',
                borderBottom: '1px solid #06b6d440',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px' }}>↗️</span>
                    <span style={{ fontWeight: 'bold' }}>Splitter</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <NodeHeaderMenu nodeId={id} />
                </div>
            </div>

            {/* Body */}
            <div style={{ padding: '10px 12px', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '8px' }}>

                {/* Input Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ color: '#94a3b8', fontSize: '9px', marginBottom: '2px' }}>INPUT:</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', height: '16px' }}>
                        {(() => {
                            const inEdge = allEdges.find(e => e.target === id && e.targetHandle === 'input');
                            let inputRes: string | undefined = undefined;

                            if (inEdge) {
                                const nodes = useStore.getState().nodes || [];
                                const srcNode = nodes.find((n) => n.id === inEdge.source);
                                if (srcNode) {
                                    if (srcNode.data?.resourceType) inputRes = srcNode.data.resourceType;
                                    else if (srcNode.data?.recipe?.outputType) inputRes = srcNode.data.recipe.outputType;
                                }
                            }

                            const meta = inputRes ? RESOURCE_REGISTRY[inputRes] : null;
                            const icon = meta ? meta.icon : '📥';
                            const label = meta ? meta.label : 'Full Load';
                            const flow = inEdge?.data ? parseFloat((inEdge.data as { flow: string }).flow || '0') : 0;

                            return (
                                <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Handle
                                            type="target"
                                            position={Position.Left}
                                            id="input"
                                            style={{ left: '-16px', background: '#3b82f6', width: '8px', height: '8px', border: '1.5px solid #0a0f1d' }}
                                        />
                                        <span style={{ fontSize: '12px' }}>{icon}</span>
                                        <span style={{ color: meta ? meta.color : '#e2e8f0' }}>{label}</span>
                                    </div>
                                    {flow > 0 && <span style={{ fontSize: '9px', color: '#60a5fa' }}>{flow.toFixed(1)}{meta?.unit || ''}/s</span>}
                                </>
                            );
                        })()}
                    </div>
                </div>

                {/* Outputs Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '6px' }}>
                    <div style={{ color: '#94a3b8', fontSize: '9px', marginBottom: '2px' }}>OUTPUTS (Ratio Distribution):</div>
                    {ratios.map((r, i) => {
                        const pct = totalRatio > 0 ? ((r / totalRatio) * 100).toFixed(0) : '0';
                        return (
                            <div key={i} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: '#1e293b60',
                                padding: '4px 6px',
                                borderRadius: '4px',
                                borderLeft: '2px solid #06b6d4',
                                position: 'relative',
                                height: 'auto',
                                minHeight: '22px'
                            }}>
                                <span style={{ color: '#64748b', fontSize: '10px' }}>#{i + 1}</span>
                                <input
                                    type="number"
                                    min="0"
                                    value={r}
                                    onChange={(e) => handleRatioChange(i, e.target.value)}
                                    style={{
                                        width: '32px', background: '#0f172a', color: '#f8fafc',
                                        border: '1px solid #334155', borderRadius: '3px',
                                        padding: '1px 3px', fontSize: '10px', textAlign: 'center',
                                        fontFamily: 'monospace'
                                    }}
                                    className="nodrag"
                                />
                                {(() => {
                                    const inEdge = allEdges.find(e => e.target === id && e.targetHandle === 'input');
                                    const inputFlow = inEdge?.data ? new Decimal((inEdge.data as { flow: string }).flow || '0') : new Decimal(0);
                                    const targetRate = totalRatio > 0 ? inputFlow.times(r).dividedBy(totalRatio) : new Decimal(0);
                                    const handleEdges = allEdges.filter(e => e.source === id && e.sourceHandle === `output-${i}`);
                                    let actualFlow = 0;
                                    for (const e of handleEdges) {
                                        const edgeData = e.data as FlowEdgeData | undefined;
                                        if (edgeData?.flow) actualFlow += parseFloat(edgeData.flow.toString());
                                    }

                                    const isCongested = new Decimal(actualFlow).gt(0) && new Decimal(actualFlow).lt(targetRate);

                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexGrow: 1 }}>
                                            <span style={{ color: '#22d3ee', fontWeight: 'bold', fontSize: '10px' }}>
                                                {actualFlow.toFixed(1)}{meta?.unit || ''}/s
                                            </span>
                                            <span style={{ color: '#94a3b8', fontSize: '8px', marginTop: '1px' }}>
                                                Target: {targetRate.toFixed(1)} ({pct}%)
                                            </span>
                                        </div>
                                    );
                                })()}
                                <Handle
                                    key={`output-${i}`}
                                    type="source"
                                    position={Position.Right}
                                    id={`output-${i}`}
                                    style={{ right: '-16px', background: '#10b981', width: '8px', height: '8px', border: '1.5px solid #0a0f1d' }}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
});
