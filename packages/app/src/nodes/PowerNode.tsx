import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { RESOURCE_REGISTRY, Decimal, getUpgradeCost } from '@aligrid/engine';
import { useStore, NodeData } from '../store';
import { formatNumber } from '../utils/formatter';
import { NodeHeaderMenu } from '../components/NodeHeaderMenu';
import { FALLBACK_NODES } from '../config/fallbackNodes';

export const PowerNode = memo(({ id, type, data, selected }: NodeProps<NodeData>) => {
    const stats = useStore((state) => state.nodeStats[id]);
    const liveData = { ...data, ...stats };

    const cloudStorage = useStore((state) => state.cloudStorage);
    const isViewOnly = useStore((state) => state.isViewOnly);
    const nodeTemplates = useStore((state) => state.nodeTemplates) || [];

    // Find template
    const template = nodeTemplates.find((t) => t.id === type) || FALLBACK_NODES.find(f => f.id === type) || { name: 'Power Node', category: 'power', icon: '⚡' };

    const level = liveData?.level || 0;
    const cost = getUpgradeCost(type, level);

    let borderColor = liveData?.isOff ? '#f87171' : '#f59e0b';
    const baseRadius = (template as { radius?: number }).radius || 0;
    const radius = baseRadius > 0 ? baseRadius + (level * 20) : 0;

    return (
        <div style={{
            background: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(8px)',
            border: `1.2px solid ${borderColor}`,
            borderRadius: '8px',
            minWidth: '240px',
            color: '#f8fafc',
            fontFamily: 'monospace',
            overflow: 'visible',
            boxShadow: `0 12px 24px -6px rgba(0, 0, 0, 0.6), 0 0 16px ${borderColor}1a`,
            position: 'relative',
            transition: 'all 0.2s ease'
        }}>
            {/* Wireless Radius Circle */}
            {radius > 0 && selected && (
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: `${radius * 2}px`,
                    height: `${radius * 2}px`,
                    border: '1px dashed #38bdf8',
                    borderRadius: '50%',
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'none',
                    background: 'rgba(56, 189, 248, 0.03)',
                    zIndex: -1
                }} />
            )}

            {/* Header */}
            <div style={{
                background: `linear-gradient(90deg, ${borderColor}1a, rgba(15, 23, 42, 0))`,
                padding: '8px 12px',
                borderBottom: `1px solid ${borderColor}33`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '6px',
                fontSize: '11px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '13px' }}>{template.icon || '⚡'}</span>
                    <span style={{ fontWeight: 'bold' }}>{template.name}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {level > 0 && <span style={{ fontSize: '9px', color: '#94a3b8' }}>Lv.{level}</span>}
                    <button
                        onClick={(e) => {
                            if (isViewOnly) return;
                            e.stopPropagation();
                            useStore.getState().toggleNodePower(id);
                        }}
                        style={{
                            background: liveData?.isOff ? '#f87171' : '#059669',
                            border: 'none',
                            color: '#f8fafc',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '9px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px',
                            boxShadow: liveData?.isOff ? 'none' : '0 0 5px rgba(16, 185, 129, 0.4)'
                        }}
                    >
                        <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#f8fafc' }} />
                        <span>{liveData?.isOff ? 'OFF' : 'ON'}</span>
                    </button>
                    <NodeHeaderMenu nodeId={id} />
                </div>
            </div>

            {/* Body */}
            <div style={{ padding: '10px', fontSize: '10px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '8px' }}>

                {/* Buffer Bar for Accumulator */}
                {type === 'accumulator' && (
                    <div style={{ background: '#1e293b', borderRadius: '4px', padding: '6px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#94a3b8' }}>
                            <span>🔋 BUFFER</span>
                            <span style={{ color: '#6ee7b7', fontWeight: 'bold' }}>
                                {formatNumber(new Decimal(liveData?.buffer || 0))} / {formatNumber(new Decimal(liveData?.maxBuffer || (template as { maxBuffer?: string | number }).maxBuffer || 5000))}
                            </span>
                        </div>
                        <div style={{ height: '5px', background: '#334155', borderRadius: '3px', overflow: 'hidden' }}>
                            <div className="progress-bar-inner" style={{
                                width: `${Math.min(100, (parseFloat(String(liveData?.buffer || 0)) / parseFloat(String(liveData?.maxBuffer || (template as { maxBuffer?: string | number }).maxBuffer || 5000))) * 100)}%`,
                                height: '100%',
                                background: '#10b981',
                                boxShadow: '0 0 4px rgba(16, 185, 129, 0.5)'
                            }} />
                        </div>
                    </div>
                )}

                {['powerTransmitter', 'powerReceiver'].includes(type) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', padding: '6px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.03)' }}>
                        <span style={{ color: '#94a3b8', fontSize: '9px' }}>📡 CHANNEL</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <button
                                onClick={(e) => {
                                    if (isViewOnly) return;
                                    e.stopPropagation();
                                    useStore.getState().updateNodeData(id, { channel: Math.max(0, (liveData?.channel ?? 0) - 1) });
                                }}
                                style={{ background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', padding: '1px 5px', borderRadius: '3px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}
                            >
                                -
                            </button>
                            <span style={{ minWidth: '16px', textAlign: 'center', fontSize: '10px', color: '#fff', fontWeight: 'bold' }}>{liveData?.channel ?? 0}</span>
                            <button
                                onClick={(e) => {
                                    if (isViewOnly) return;
                                    e.stopPropagation();
                                    useStore.getState().updateNodeData(id, { channel: (liveData?.channel ?? 0) + 1 });
                                }}
                                style={{ background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', padding: '1px 5px', borderRadius: '3px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}
                            >
                                +
                            </button>
                        </div>
                    </div>
                )}

                {/* Grid Load for Power Nodes */}
                <div style={{
                    padding: '8px',
                    background: 'rgba(0,0,0,0.25)',
                    borderRadius: '6px',
                    border: '1px solid rgba(255,255,255,0.04)',
                    fontSize: '11px',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)'
                }}>
                    <div style={{ color: '#94a3b8', fontSize: '9px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>⚡ Power Grid</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: liveData?.gridSupply && liveData?.gridDemand && new Decimal(liveData.gridSupply).gte(new Decimal(liveData.gridDemand)) ? '#34d399' : '#f87171' }}>
                            {formatNumber(new Decimal(liveData?.gridDemand || 0))} {RESOURCE_REGISTRY['electricity']?.unit || ''}/s
                        </span>
                        <span style={{ color: '#64748b', fontSize: '9px' }}>req of</span>
                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#fbbf24' }}>
                            {formatNumber(new Decimal(liveData?.gridSupply || 0))} {RESOURCE_REGISTRY['electricity']?.unit || ''}/s
                        </span>
                    </div>
                </div>

                {/* Upgrade Button */}
                {Object.keys(cost).length > 0 && (
                    <div style={{ marginTop: '4px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <div style={{ fontSize: '9px', color: '#94a3b8', marginBottom: '4px' }}>Cost to Upgrade:</div>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                            {Object.entries(cost).map(([res, amt]) => {
                                const meta = RESOURCE_REGISTRY[res] || { icon: '❓' };
                                const cur = cloudStorage[res] || new Decimal(0);
                                const isAffordable = cur.gte(amt as Decimal);
                                return (
                                    <div key={res} style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '9px', color: isAffordable ? '#4ade80' : '#f87171' }}>
                                        <span>{meta.icon}</span>
                                        <span>{formatNumber(amt as Decimal)}</span>
                                    </div>
                                );
                            })}
                        </div>
                        <button
                            onClick={(e) => {
                                if (isViewOnly) return;
                                e.stopPropagation();
                                useStore.getState().upgradeNode(id);
                            }}
                            style={{
                                width: '100%',
                                background: '#2563eb',
                                border: 'none',
                                color: 'white',
                                borderRadius: '4px',
                                padding: '4px',
                                fontSize: '10px',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                        >
                            Upgrade
                        </button>
                    </div>
                )}
            </div>

            {/* Input Handle - Left Side */}
            <Handle
                type="target"
                position={Position.Left}
                id="target"
                style={{
                    background: '#1c1917',
                    border: '2px solid #ed610b',
                    width: '10px',
                    height: '10px',
                    left: '-6px',
                }}
            />

            {/* Output Handle - Right Side */}
            <Handle
                type="source"
                position={Position.Right}
                id="source"
                style={{
                    background: '#1c1917',
                    border: '2px solid #eab308',
                    width: '10px',
                    height: '10px',
                    right: '-6px',
                }}
            />
        </div>
    );
});
