import React, { memo, useEffect, useRef } from 'react';
import { Handle, Position, useViewport } from 'reactflow';
import { Decimal, ResourceType, NODE_COSTS, RESOURCE_REGISTRY, getUpgradeCost } from '@aligrid/engine';
import { useStore } from '../store';
import { safeDecimal } from '../store/slices/tick/helpers';
import type { NodeData } from '../store/types';

export interface ResourceGeneratorNodeProps {
    id: string;
    type: string;
    data: NodeData;
}

import { formatNumber } from '../utils/formatter';
import { Counter } from '../components/Counter';

const RESOURCE_METADATA: Record<ResourceType, { icon: string; label: string; color: string }> = {
    water: { icon: '💧', label: 'Water Pump', color: '#3b82f6' },
    iron: { icon: '⛏️', label: 'Iron Miner', color: '#94a3b8' },
    copper: { icon: '⚒️', label: 'Copper Miner', color: '#d97706' },
    coal: { icon: '🔥', label: 'Coal Miner', color: '#334155' }
};

export const ResourceGeneratorNode: React.FC<ResourceGeneratorNodeProps> = memo(({ id, type, data }) => {
    const { zoom } = useViewport();
    const showDetail = zoom > 0.6;
    const rateRef = useRef<HTMLElement>(null);
    const effRef = useRef<HTMLElement>(null);
    const effContainerRef = useRef<HTMLDivElement>(null);

    const level = useStore(state => state.nodes.find(n => n.id === id)?.data?.level ?? 0);
    const tier = useStore(state => state.nodes.find(n => n.id === id)?.data?.tier ?? 0);
    const isOff = useStore(state => state.nodes.find(n => n.id === id)?.data?.isOff ?? false);
    const cloudStorage = useStore((state) => state.cloudStorage);
    const isViewOnly = useStore((state) => state.isViewOnly);

    useEffect(() => {
        const unsubscribe = useStore.subscribe(
            state => state.nodeStats[id],
            (stats) => {
                if (!stats) return;
                const outputRate = safeDecimal(stats.actualOutputPerSec || 0);
                const efficiency = safeDecimal(stats.efficiency ?? 1);

                if (rateRef.current) {
                    rateRef.current.innerText = formatNumber(outputRate);
                }
                if (effRef.current) {
                    effRef.current.innerText = `${(efficiency.toNumber() * 100).toFixed(0)}%`;
                }
                if (effContainerRef.current) {
                    const lowPower = efficiency.lt(1);
                    effContainerRef.current.style.background = lowPower ? '#7f1d1d40' : '#1e293b';
                    effContainerRef.current.style.borderColor = lowPower ? '#ef444440' : '#334155';
                    effContainerRef.current.style.color = lowPower ? '#f87171' : '#34d399';
                    effContainerRef.current.innerText = lowPower ? '⚠️ Low Power: ' : '⚡ Efficiency: ';
                    // we need to re-append the span since we overwrite innerText
                    const span = document.createElement('span');
                    span.innerText = `${(efficiency.toNumber() * 100).toFixed(0)}%`;
                    effContainerRef.current.appendChild(span);
                }
            }
        );
        return unsubscribe;
    }, [id]);
    const resType = (data.resourceType as ResourceType) || 'water';
    const meta = RESOURCE_METADATA[resType];

    const cost = getUpgradeCost(type, level);

    const borderColor = meta.color;

    return (
        <div style={{
            background: '#161b2e',
            border: `1px solid ${borderColor}cc`,
            borderRadius: '6px',
            minWidth: showDetail ? '220px' : '60px',
            minHeight: showDetail ? 'none' : '60px',
            color: '#e2e8f0',
            fontFamily: 'monospace',
            overflow: 'visible',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4)',
            position: 'relative',
            opacity: isOff ? 0.4 : 1,
            filter: isOff ? 'grayscale(0.4)' : 'none',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
            {/* Debug Info Overlay */}
            {data?.debugInfo && showDetail && (
                <div style={{
                    position: 'absolute',
                    top: '-18px',
                    left: '0',
                    fontSize: '8px',
                    color: '#60a5fa',
                    whiteSpace: 'nowrap',
                    background: 'rgba(15, 23, 42, 0.8)',
                    padding: '1px 4px',
                    borderRadius: '3px',
                    pointerEvents: 'none',
                    border: '1px solid rgba(96, 165, 250, 0.3)',
                    zIndex: 10
                }}>
                    SIM: {data.debugInfo}
                </div>
            )}

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
            {showDetail && (
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
            )}

            {/* Body Properties */}
            {showDetail && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '11px' }}>

                    {/* Efficiency Metric */}
                    {type !== 'waterGenerator' && (
                        <div
                            ref={effContainerRef}
                            style={{
                                padding: '4px 8px',
                                background: '#1e293b',
                                border: '1px solid #334155',
                                borderRadius: '4px',
                                color: '#34d399',
                                fontSize: '10px',
                                textAlign: 'center',
                                fontWeight: 'bold'
                            }}
                        >
                            ⚡ Efficiency: <span>100%</span>
                        </div>
                    )}

                    {/* Row 1 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ color: meta.color, fontSize: '14px' }}>⬆</div>
                        <div style={{ flexGrow: 1 }}>
                            <div style={{ color: '#94a3b8', marginBottom: '2px' }}>Output Rate</div>
                            <div style={{ color: '#f8fafc' }}><span ref={rateRef}>0</span> {RESOURCE_REGISTRY[resType]?.unit || ''}/s</div>
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
                                    const currentAmt = new Decimal(cloudStorage[res as ResourceType] as any || 0);
                                    const costAmt = amt as Decimal;
                                    const labelMeta = RESOURCE_REGISTRY[res as ResourceType] || { icon: '❓', label: res };
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
            )}

            {!showDetail && (
                <div style={{ height: '60px', width: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '32px' }}>{meta.icon}</span>
                </div>
            )}



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
});
