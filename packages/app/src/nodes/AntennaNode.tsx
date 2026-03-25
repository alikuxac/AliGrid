import React, { memo } from 'react';
import { Handle, Position, useEdges } from 'reactflow';
import { RESOURCE_REGISTRY, Decimal, ResourceType } from '@aligrid/engine';
import { NodeHeaderMenu } from '../components/NodeHeaderMenu';
import { useStore } from '../store';

import type { NodeData } from '../store/types';

export interface AntennaNodeProps {
    id: string;
    data: NodeData;
}

export const AntennaNode: React.FC<AntennaNodeProps> = memo(({ id, data }) => {
    const cloudLevel = useStore((state) => state.cloudLevel || 1);
    const cloudStorage = useStore((state) => state.cloudStorage || {});
    const capacity = new Decimal(5000).times(Math.pow(2, (cloudLevel || 1) - 1));
    const allEdges = useEdges();
    const connectedInputs = allEdges.filter((e) => e.target === id).length;
    const visibleInputs = Math.min(Math.max(connectedInputs + 1, 1), 5);

    const status = data?.status || 'idle';
    const borderColor = status === 'active' ? '#22c55e' : '#14b8a6'; // active green, idle teal

    return (
        <div style={{
            background: '#161b2e', // Unified dark background
            border: `1px solid ${borderColor}aa`,
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
                background: 'rgba(20, 184, 166, 0.1)', // transparent teal tint
                padding: '8px 12px',
                borderBottom: `1px solid ${borderColor}aa`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px' }}>📡</span>
                    <span style={{ fontWeight: 'bold', color: '#5eead4' }}>Uploader</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ fontSize: '9px', padding: '2px 5px', background: status === 'active' ? '#059669' : '#0f766e', borderRadius: '4px', fontWeight: 'bold', color: '#f8fafc' }}>{status.toUpperCase()}</span>
                    <NodeHeaderMenu nodeId={id} />
                </div>
            </div>

            {/* Body */}
            <div style={{ padding: '10px 12px', fontSize: '11px', color: '#a7f3d0', display: 'flex', flexDirection: 'column', gap: '10px' }}>

                {/* Inputs List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ color: '#14b8a6', fontSize: '9px', marginBottom: '2px' }}>INPUTS:</div>
                    {Array.from({ length: visibleInputs }, (_, i) => {
                        const handleId = `input-${i}`;
                        const rateInfo = data?.incomingRates?.[handleId];

                        let fallbackRes: string | undefined = undefined;
                        if (!rateInfo) {
                            const edge = allEdges.find(e => e.target === id && e.targetHandle === handleId);
                            if (edge) {
                                const nodes = useStore.getState().nodes;
                                const srcNode = nodes.find((n) => n.id === edge.source);
                                if (srcNode) {
                                    if (srcNode.data?.resourceType) fallbackRes = srcNode.data.resourceType;
                                    else if (srcNode.data?.recipe?.outputType) fallbackRes = srcNode.data.recipe.outputType;
                                }
                            }
                        }

                        const icon = rateInfo ? RESOURCE_REGISTRY[rateInfo.res]?.icon || '❓' : (fallbackRes ? RESOURCE_REGISTRY[fallbackRes]?.icon || '❓' : '📤');
                        const label = rateInfo
                            ? `${rateInfo.res.charAt(0).toUpperCase() + rateInfo.res.slice(1)} - ${parseFloat(rateInfo.rate).toFixed(1)}/s`
                            : (fallbackRes ? `${fallbackRes.charAt(0).toUpperCase() + fallbackRes.slice(1)} - 0.0/s` : `Line ${i + 1}`);
                        const isFull = rateInfo && new Decimal(cloudStorage[rateInfo.res as ResourceType] || 0).gte(capacity);

                        return (
                            <div key={handleId} style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative', height: '16px', color: '#e2e8f0', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Handle
                                        type="target"
                                        position={Position.Left}
                                        id={handleId}
                                        style={{ left: '-16px', background: '#14b8a6', width: '8px', height: '8px', border: '1.5px solid #0a0f1d' }}
                                    />
                                    <span style={{ fontSize: '12px' }}>{icon}</span>
                                    <span style={{ color: isFull ? '#64748b' : '#e2e8f0' }}>{label}</span>
                                </div>
                                {isFull && (
                                    <span style={{ fontSize: '9px', background: '#dc2626', color: 'white', padding: '1px 4px', borderRadius: '3px', fontWeight: 'bold' }}>FULL</span>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '6px', textAlign: 'center', fontSize: '10px', color: '#94a3b8' }}>
                    Uploading Cloud Backup ({connectedInputs} Connectors)
                </div>
            </div>
        </div>
    );
});
