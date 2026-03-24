import React from 'react';
import { Handle, Position } from 'reactflow';
import { Decimal, ResourceType, getStorageCapacity } from '@aligrid/engine';

import { formatNumber } from '../utils/formatter';
import { NodeHeaderMenu } from '../components/NodeHeaderMenu';

export interface StorageNodeProps {
    id: string;
    data: {
        level: number;
        currentAmount: Decimal;
        lockedResourceType?: ResourceType;
        actualInputPerSec: Decimal;
    };
}

const RESOURCE_METADATA: Record<string, { icon: string; label: string; color: string }> = {
    water: { icon: '💧', label: 'Water', color: '#3b82f6' },
    iron: { icon: '⛏️', label: 'Iron', color: '#94a3b8' },
    copper: { icon: '⚒️', label: 'Copper', color: '#d97706' },
    coal: { icon: '🔥', label: 'Coal', color: '#334155' },
    electricity: { icon: '⚡', label: 'Electricity', color: '#facc15' },
};

export const StorageNode: React.FC<StorageNodeProps> = ({ id, data }) => {
    const level = data?.level || 1;
    const locked = data?.lockedResourceType;
    const meta = locked ? RESOURCE_METADATA[locked] : null;
    const amount = data?.currentAmount || new Decimal(0);
    const capacity = getStorageCapacity(level);
    const rate = data?.actualInputPerSec || new Decimal(0);

    const amountStr = formatNumber(amount);
    const capacityStr = formatNumber(capacity);
    const rateStr = rate.greaterThan(0) ? `+${formatNumber(rate)}/s` : '';

    let percent = 0;
    if (capacity.greaterThan(0)) {
        percent = Math.min(Math.max(amount.dividedBy(capacity).toNumber() * 100, 0), 100);
    }

    const borderColor = meta ? meta.color : '#475569';

    return (
        <div style={{
            background: '#161b2e',
            border: `1px solid ${borderColor}40`,
            borderRadius: '6px',
            minWidth: '200px',
            color: '#e2e8f0',
            fontFamily: 'monospace',
            overflow: 'hidden',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4)',
            position: 'relative'
        }}>
            {/* Header */}
            <div style={{
                background: '#1e293b', padding: '8px 12px', borderBottom: `1px solid ${borderColor}40`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>📦</span>
                    <span>Storage</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <div style={{ background: '#334155', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>
                        Mk.{level}
                    </div>
                    <NodeHeaderMenu nodeId={id} />
                </div>
            </div>

            {/* Body */}
            <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
                {meta ? (
                    <div style={{
                        background: '#1e293b', padding: '8px 10px', borderRadius: '4px',
                        borderLeft: `3px solid ${meta.color}`
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>{meta.icon}</span>
                                <span style={{ color: meta.color, fontWeight: 'bold' }}>{meta.label}</span>
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <div style={{ color: '#4ade80', fontSize: '10px' }}>{rateStr}</div>
                            <div style={{ color: '#f8fafc', fontWeight: 'bold', fontSize: '12px' }}>
                                {amountStr} <span style={{ color: '#64748b', fontWeight: 'normal' }}>/ {capacityStr}</span>
                            </div>
                        </div>
                        {/* Progress bar */}
                        <div style={{ width: '100%', height: '4px', background: '#0f172a', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ width: `${percent}%`, height: '100%', background: meta.color, transition: 'width 0.2s linear' }} />
                        </div>
                    </div>
                ) : (
                    <div style={{ color: '#64748b', fontStyle: 'italic', textAlign: 'center', padding: '12px 0' }}>
                        Empty (Connect to lock)
                    </div>
                )}
            </div>

            <Handle type="target" position={Position.Left} id="input"
                style={{ background: '#2d3748', border: `2px solid ${meta ? meta.color : '#64748b'}`, width: '12px', height: '12px', left: '-6px' }}
            />
            <Handle type="source" position={Position.Right} id="output"
                style={{ background: '#2d3748', border: `2px solid ${meta ? meta.color : '#64748b'}`, width: '12px', height: '12px', right: '-6px' }}
            />
        </div>
    );
};
