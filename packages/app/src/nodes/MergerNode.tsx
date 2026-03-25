import React, { memo } from 'react';
import { Handle, Position, useEdges } from 'reactflow';
import type { ResourceType } from '@aligrid/engine';
import { NodeHeaderMenu } from '../components/NodeHeaderMenu';

import { RESOURCE_REGISTRY } from '@aligrid/engine';
import { useStore } from '../store';
import type { NodeData, FlowEdgeData } from '../store/types';

export interface MergerNodeProps {
    id: string;
    data: NodeData;
}

export const MergerNode: React.FC<MergerNodeProps> = memo(({ id, data }) => {
    const stats = useStore((state) => state.nodeStats[id]);
    const liveData = { ...data, ...stats };
    const allEdges = useEdges();
    const maxInputs = liveData?.maxInputs || 5;
    const connectedInputs = allEdges.filter((e) => e.target === id).length;
    const visibleInputs = Math.min(Math.max(connectedInputs + 1, 1), maxInputs);
    const locked = liveData?.lockedResourceType;
    const meta = locked ? RESOURCE_REGISTRY[locked] : null;

    const findSourceResourceType = (eSourceId: string, visited = new Set<string>()): string | undefined => {
        if (visited.has(eSourceId)) return undefined;
        visited.add(eSourceId);

        const nodes = useStore.getState().nodes || [];
        const node = nodes.find((n) => n.id === eSourceId);
        if (!node) return undefined;

        if (node.data?.resourceType) return node.data.resourceType;
        if (node.data?.recipe?.outputType) return node.data.recipe.outputType;

        if (node.type === 'splitter' || node.type === 'merger') {
            const inEdges = allEdges.filter(e => e.target === eSourceId);
            for (const e of inEdges) {
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
            const edge = allEdges.find(e => e.target === id && e.targetHandle === `input-${i}`);
            if (edge) {
                fallbackRes = findSourceResourceType(edge.source);
                if (fallbackRes) break;
            }
        }
        if (fallbackRes) {
            displayMeta = RESOURCE_REGISTRY[fallbackRes];
        }
    }

    const borderColor = displayMeta ? displayMeta.color : '#8b5cf6';

    return (
        <div style={{
            background: '#161b2e',
            border: `1px solid ${borderColor}40`,
            borderRadius: '6px',
            minWidth: '220px',
            color: '#e2e8f0',
            fontFamily: 'monospace',
            overflow: 'visible',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4)',
            position: 'relative',
        }}>
            <div style={{
                background: '#1e293b',
                padding: '8px 12px',
                borderBottom: `1px solid ${borderColor}40`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px' }}>🔀</span>
                    <span style={{ fontWeight: 'bold' }}>Merger</span>
                </div>
                <NodeHeaderMenu nodeId={id} />
            </div>

            {/* Body */}
            <div style={{ padding: '10px 12px', fontSize: '11px', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {displayMeta ? (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        background: '#1b233d', padding: '6px 10px', borderRadius: '4px',
                        borderLeft: `2px solid ${displayMeta.color}`
                    }}>
                        <span>{displayMeta.icon}</span>
                        <span style={{ color: displayMeta.color, fontWeight: 'bold' }}>{displayMeta.label}</span>
                    </div>
                ) : (
                    <div style={{ fontStyle: 'italic', color: '#475569', textAlign: 'center' }}>
                        No type (connect first)
                    </div>
                )}

                {/* Inputs List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ color: '#94a3b8', fontSize: '9px', marginBottom: '2px' }}>INPUTS:</div>
                    {Array.from({ length: visibleInputs }, (_, i) => {
                        const edgeForPort = allEdges.find(e => e.target === id && e.targetHandle === `input-${i}`);
                        const edgeData = edgeForPort?.data as FlowEdgeData | undefined;
                        const flowAmt = edgeData?.flow ? parseFloat(edgeData.flow.toString()) : 0;

                        let portRes: string | undefined = undefined;
                        if (edgeForPort) {
                            portRes = findSourceResourceType(edgeForPort.source);
                        }
                        const portMeta = portRes ? RESOURCE_REGISTRY[portRes] : null;
                        const icon = portMeta ? portMeta.icon : '📥';
                        const label = portMeta ? `${portMeta.label} Port` : `Port ${i + 1}`;

                        return (
                            <div key={`input-${i}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', height: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Handle
                                        type="target"
                                        position={Position.Left}
                                        id={`input-${i}`}
                                        style={{ left: '-16px', background: '#3b82f6', width: '8px', height: '8px', border: '1.5px solid #0a0f1d' }}
                                    />
                                    <span style={{ fontSize: '12px' }}>{icon}</span>
                                    <span>{label}</span>
                                </div>
                                {flowAmt > 0 && <span style={{ fontSize: '9px', color: '#60a5fa' }}>{flowAmt.toFixed(1)}/s</span>}
                            </div>
                        );
                    })}
                    {connectedInputs === maxInputs && <div style={{ fontSize: '9px', color: '#ef4444' }}>Max Inputs Reached</div>}
                </div>

                {/* Outputs List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '6px' }}>
                    <div style={{ color: '#94a3b8', fontSize: '9px', marginBottom: '2px' }}>OUTPUTS:</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', height: '16px' }}>
                        {(() => {
                            let totalInputFlow = 0;
                            const maxInputsCount = liveData?.maxInputs || 5;
                            for (let i = 0; i < maxInputsCount; i++) {
                                const edgeForPort = allEdges.find(e => e.target === id && e.targetHandle === `input-${i}`);
                                const edgeData = edgeForPort?.data as FlowEdgeData | undefined;
                                if (edgeData?.flow) {
                                    totalInputFlow += parseFloat(edgeData.flow.toString());
                                }
                            }
                            const outFlow = totalInputFlow;
                            return (
                                <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '12px' }}>📤</span>
                                        <span>Merged Output</span>
                                    </div>
                                    {outFlow > 0 && <span style={{ fontSize: '9px', color: '#10b981', marginRight: '6px' }}>{outFlow.toFixed(1)}/s</span>}
                                </>
                            );
                        })()}
                        <Handle
                            type="source"
                            position={Position.Right}
                            id="output"
                            style={{ right: '-16px', background: '#10b981', width: '8px', height: '8px', border: '1.5px solid #0a0f1d' }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
});
