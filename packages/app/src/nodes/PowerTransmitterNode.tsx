import React, { memo } from 'react';
import { Handle, Position, useEdges } from 'reactflow';
import { NodeHeaderMenu } from '../components/NodeHeaderMenu';

export interface PowerTransmitterNodeProps {
    id: string;
    data: any;
}

export const PowerTransmitterNode: React.FC<PowerTransmitterNodeProps> = memo(({ id, data }) => {
    const edges = useEdges();
    const connectedInputs = edges.filter(e => e.target === id).length;
    const visibleInputs = Math.min(5, Math.max(1, connectedInputs + 1));

    const status = data?.status || 'idle';
    const borderColor = status === 'active' ? '#22c55e' : '#eab308';

    return (
        <div style={{
            background: '#161b2e', // unified background
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
                background: 'rgba(234, 179, 8, 0.1)', // transparent yellow tint
                padding: '8px 12px',
                borderBottom: `1px solid ${borderColor}aa`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px' }}>⚡</span>
                    <span style={{ fontWeight: 'bold', color: '#fef08a' }}>Power Trans.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '9px', padding: '2px 5px', background: status === 'active' ? '#059669' : '#b45309', borderRadius: '4px', fontWeight: 'bold', color: '#fef08a' }}>{status.toUpperCase()}</span>
                    <NodeHeaderMenu nodeId={id} />
                </div>
            </div>

            {/* Body */}
            <div style={{ padding: '10px 12px', fontSize: '11px', color: '#fde047', display: 'flex', flexDirection: 'column', gap: '10px' }}>

                {/* Inputs List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ color: '#fde047', opacity: 0.8, fontSize: '9px', marginBottom: '2px' }}>INPUTS:</div>
                    {Array.from({ length: visibleInputs }, (_, i) => {
                        const rateData = data?.incomingRates?.[`input-${i}`];
                        const rateAmt = rateData ? parseFloat(rateData.rate) : 0;
                        return (
                            <div key={`input-${i}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', height: '16px', color: '#e2e8f0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Handle
                                        type="target"
                                        position={Position.Left}
                                        id={`input-${i}`}
                                        style={{ left: '-16px', background: '#eab308', width: '8px', height: '8px', border: '1.5px solid #0a0f1d' }}
                                    />
                                    <span style={{ fontSize: '12px' }}>🔌</span>
                                    <span>Line {i + 1}</span>
                                </div>
                                {rateAmt > 0 && <span style={{ fontSize: '10px', color: '#fef08a', fontWeight: 'bold' }}>{rateAmt.toFixed(1)}/s</span>}
                            </div>
                        );
                    })}
                </div>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '6px', textAlign: 'center', fontSize: '10px', color: '#94a3b8' }}>
                    Transmitting ({connectedInputs} Connectors)
                </div>
            </div>
        </div>
    );
});
