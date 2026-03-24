import React from 'react';
import { Handle, Position } from 'reactflow';
import { Decimal, ResourceType, NODE_COSTS, RESOURCE_REGISTRY, getUpgradeCost } from '@aligrid/engine';
import { useStore } from '../store';

export interface ResourceGeneratorNodeProps {
    id: string;
    type: string;
    data: {
        level: number;
        tier?: number;
        outputRate: Decimal;
        resourceType: ResourceType;
        status?: string;
        isOff?: boolean;
        efficiency?: number | Decimal | string;
    };
}

import { formatNumber } from '../utils/formatter';

const RESOURCE_METADATA: Record<ResourceType, { icon: string; label: string; color: string }> = {
    water: { icon: '💧', label: 'Water Pump', color: '#3b82f6' },
    iron: { icon: '⛏️', label: 'Iron Miner', color: '#94a3b8' },
    copper: { icon: '⚒️', label: 'Copper Miner', color: '#d97706' },
    coal: { icon: '🔥', label: 'Coal Miner', color: '#334155' }
};

export const ResourceGeneratorNode: React.FC<ResourceGeneratorNodeProps> = ({ id, type, data }) => {
    const cloudStorage = useStore((state) => state.cloudStorage);
    const isViewOnly = useStore((state) => state.isViewOnly);
    const rateStr = data?.outputRate ? formatNumber(data.outputRate) : "0.0";
    const level = data?.level || 0;
    const tier = data?.tier || 0;
    const meta = RESOURCE_METADATA[data.resourceType] || RESOURCE_METADATA.water;

    const cost = getUpgradeCost(type, level);

    const efficiency = data?.efficiency
        ? (typeof data.efficiency === 'string' ? new Decimal(data.efficiency) : data.efficiency as Decimal)
        : new Decimal(1);

    const status = data.status || 'active';
    const borderColor = status === 'warning' ? '#ef4444' : status === 'idle' ? '#eab308' : meta.color;
    const isOff = data.isOff || false;

    return (
        <div style={{
            background: '#161b2e',
            border: `1px solid ${borderColor}cc`, // increased opacity for pop
            borderRadius: '6px',
            minWidth: '220px',
            color: '#e2e8f0',
            fontFamily: 'monospace',
            overflow: 'visible', // allow left handle offset overflow
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4)',
            position: 'relative',
            opacity: isOff ? 0.4 : 1,
            filter: isOff ? 'grayscale(0.4)' : 'none',
            transition: 'all 0.3s ease'
        }}>
            {/* Input Handle for Electricity - Non Water Pumps */}
            {type !== 'waterGenerator' && (
                <Handle
                    type="target"
                    position={Position.Left}
                    id="electricity"
                    style={{
                        background: '#161b2e',
                        border: '2px solid #eab308',
                        width: '10px',
                        height: '10px',
                        left: '-5px',
                        top: '50%'
                    }}
                />
            )}

            {/* Header */}
            <div style={{
                background: '#1e293b',
                padding: '8px 12px',
                borderBottom: `1px solid ${meta.color}40`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px' }}>{meta.icon}</span>
                    <span style={{ textDecoration: isOff ? 'line-through' : 'none', color: isOff ? '#64748b' : '#e2e8f0' }}>{meta.label}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                        onClick={() => { if (!isViewOnly) useStore.getState().updateNodeData(id, { isOff: !isOff }); }}
                        style={{
                            background: isOff ? '#ef444420' : '#10b98120',
                            border: `1px solid ${isOff ? '#ef4444' : '#10b981'}`,
                            color: isOff ? '#ef4444' : '#10b981',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '9px',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                        }}
                    >
                        {isOff ? 'OFF' : 'ON'}
                    </button>
                    {type !== 'waterGenerator' && (
                        <div style={{ background: '#334155', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>
                            {tier > 0 ? `Mk.${tier + 1} ` : ''}Lv.{level}
                        </div>
                    )}
                </div>
            </div>

            {/* Body Properties */}
            <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '11px' }}>

                {/* Efficiency Warning for Miners */}
                {/* Efficiency Metric */}
                {type !== 'waterGenerator' && (
                    <div style={{
                        padding: '4px 8px',
                        background: efficiency.lt(1) ? '#7f1d1d40' : '#1e293b',
                        border: `1px solid ${efficiency.lt(1) ? '#ef444440' : '#334155'}`,
                        borderRadius: '4px',
                        color: efficiency.lt(1) ? '#f87171' : '#34d399',
                        fontSize: '10px',
                        textAlign: 'center',
                        fontWeight: 'bold'
                    }}>
                        {efficiency.lt(1) ? '⚠️ Low Power: ' : '⚡ Efficiency: '}
                        {efficiency.times(100).toFixed(0)}%
                    </div>
                )}

                {/* Row 1 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ color: meta.color, fontSize: '14px' }}>⬆</div>
                    <div style={{ flexGrow: 1 }}>
                        <div style={{ color: '#94a3b8', marginBottom: '2px' }}>Output Rate</div>
                        {(() => {
                            const registryMeta = RESOURCE_REGISTRY[data.resourceType];
                            return <div style={{ color: '#f8fafc' }}>{rateStr} {registryMeta?.unit || ''}/s</div>;
                        })()}
                    </div>
                    {/* Status Dot */}
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: meta.color }}></div>
                </div>

                {/* Cost & Upgrade - Disabled for basic Water Pumps */}
                {type !== 'waterGenerator' && (
                    <>
                        {/* Cost Requirements */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '6px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', fontSize: '10px' }}>
                            <div style={{ color: '#94a3b8', fontSize: '9px', marginBottom: '2px' }}>Cost to Upgrade:</div>
                            {Object.entries(cost).map(([res, amt]) => {
                                const currentAmt = cloudStorage[res] || new Decimal(0);
                                const costAmt = amt as Decimal;
                                const labelMeta = RESOURCE_REGISTRY[res] || { icon: '❓', label: res };
                                const isAffordable = currentAmt.gte(costAmt);

                                return (
                                    <div key={res} style={{ display: 'flex', justifyContent: 'space-between', color: isAffordable ? '#10b981' : '#f87171' }}>
                                        <span>{labelMeta.icon} {labelMeta.label}</span>
                                        <span style={{ fontFamily: 'monospace' }}>{formatNumber(currentAmt)}/{formatNumber(costAmt)}</span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Upgrade Button */}
                        <button
                            onClick={() => { if (!isViewOnly) useStore.getState().upgradeNode(id); }}
                            style={{
                                background: '#374151',
                                border: '1px solid #4b5563',
                                color: '#f8fafc',
                                padding: '6px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: 'bold',
                                textAlign: 'center',
                                transition: 'background 0.2s',
                            }}
                            onMouseOver={(e) => e.currentTarget.style.background = '#4b5563'}
                            onMouseOut={(e) => e.currentTarget.style.background = '#374151'}
                        >
                            Upgrade {level === 99 ? 'Tier' : ''}
                        </button>
                    </>
                )}

            </div>

            {/* Output handle for connecting to other nodes - Right Side Only */}
            <Handle
                type="source"
                position={Position.Right}
                id="output"
                style={{
                    background: '#2d3748',
                    border: `2px solid ${meta.color}`,
                    width: '12px',
                    height: '12px',
                    right: '-6px'
                }}
            />
        </div>
    );
};
