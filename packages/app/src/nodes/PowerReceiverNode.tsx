import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { useStore } from '../store';
import { RESOURCE_REGISTRY, Decimal } from '@aligrid/engine';
import { formatNumber } from '../utils/formatter';
import { NodeHeaderMenu } from '../components/NodeHeaderMenu';

export interface PowerReceiverNodeProps {
    id: string;
    data: {
        outputRate?: Decimal;
    };
}

export const PowerReceiverNode: React.FC<PowerReceiverNodeProps> = memo(({ id, data }) => {
    const rate = data?.outputRate
        ? (typeof data.outputRate === 'string' ? new Decimal(data.outputRate) : data.outputRate)
        : new Decimal(2); // Higher default rate for power

    const meta = RESOURCE_REGISTRY['electricity'] || { icon: '⚡', label: 'Electricity', color: '#eab308' };

    return (
        <div style={{
            background: '#161b2e', // stone-900
            border: `1px solid #eab308aa`,
            borderRadius: '6px',
            minWidth: '220px',
            color: '#e2e8f0',
            fontFamily: 'monospace',
            overflow: 'visible',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4)',
            position: 'relative'
        }}>
            {/* Header */}
            <div style={{
                background: 'rgba(234, 179, 8, 0.1)',
                padding: '8px 12px',
                borderBottom: `1px solid #eab308aa`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px' }}>🔌</span>
                    <span style={{ fontWeight: 'bold', color: '#fef08a' }}>Power Receiver</span>
                </div>
                <NodeHeaderMenu nodeId={id} />
            </div>

            {/* Body */}
            <div style={{ padding: '12px', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                <div style={{ fontSize: '18px', marginBottom: '2px' }}>⚡</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', color: '#fde047' }}>
                    <span>Supply Rate:</span>
                    <span style={{ fontWeight: 'bold' }}>{formatNumber(rate)}/s</span>
                </div>
            </div>

            {/* Output Handle - Right Side */}
            <Handle
                type="source"
                position={Position.Right}
                id="output"
                style={{
                    background: '#1c1917',
                    border: `2px solid #eab308`,
                    width: '12px',
                    height: '12px',
                    right: '-6px',
                }}
            />
        </div>
    );
});
