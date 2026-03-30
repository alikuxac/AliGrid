import React, { memo, useEffect, useMemo, useRef } from 'react';
import { Handle, Position, NodeProps, useViewport } from 'reactflow';
import { RESOURCE_REGISTRY, Decimal, getUpgradeCost, ResourceType } from '@aligrid/engine';
import { useStore, NodeData, safeDecimal } from '../store';
import { formatNumber } from '../utils/formatter';
import { NodeHeaderMenu } from '../components/NodeHeaderMenu';
import { FALLBACK_NODES } from '../config/fallbackNodes';

const PowerNodeComponent = ({ id, type, data, selected }: NodeProps<NodeData>) => {
    const { zoom } = useViewport();
    const compactMode = useStore(state => state.settings.compactMode);
    const showDetail = zoom > 0.6 && !compactMode;
    const supplyRef = useRef<HTMLSpanElement>(null);
    const demandRef = useRef<HTMLSpanElement>(null);
    const bufferTextRef = useRef<HTMLSpanElement>(null);
    const bufferBarRef = useRef<HTMLDivElement>(null);

    const level = useStore(state => state.nodes.find(n => n.id === id)?.data?.level ?? 0);
    const isOff = useStore(state => state.nodes.find(n => n.id === id)?.data?.isOff ?? false);
    const channel = useStore(state => state.nodes.find(n => n.id === id)?.data?.channel ?? 0);
    const cloudStorage = useStore((state) => state.cloudStorage);
    const isViewOnly = useStore((state) => state.isViewOnly);
    const nodeTemplates = useStore((state) => state.nodeTemplates) || [];

    useEffect(() => {
        const unsubscribe = useStore.subscribe(
            state => state.nodeStats?.[id],
            (stats) => {
                if (!stats) return;
                try {
                    const supply = safeDecimal(stats.gridSupply || 0);
                    const demand = safeDecimal(stats.gridDemand || 0);

                    if (supplyRef.current) supplyRef.current.innerText = `${formatNumber(supply)} W/s`;
                    if (demandRef.current) {
                        demandRef.current.innerText = `${formatNumber(demand)} W/s`;
                        demandRef.current.style.color = supply.gte(demand) ? '#34d399' : '#f87171';
                    }

                    if (type === 'accumulator') {
                        const buffer = safeDecimal(stats.buffer || 0);
                        const maxBuf = safeDecimal(stats.maxBuffer || 5000);
                        if (bufferTextRef.current) bufferTextRef.current.innerText = `${formatNumber(buffer)} / ${formatNumber(maxBuf)}`;
                        if (bufferBarRef.current) {
                            const pct = Math.min(100, (buffer.dividedBy(maxBuf).toNumber() * 100));
                            bufferBarRef.current.style.width = `${pct}%`;
                        }
                    }
                } catch (e) { }
            }
        );
        return unsubscribe;
    }, [id, type]);

    // Find template
    const template = nodeTemplates.find((t) => t.id === type) || FALLBACK_NODES.find(f => f.id === type) || { name: 'Power Node', category: 'power', icon: '⚡' };

    const cost = getUpgradeCost(type, level);

    const status = isOff ? 'off' : 'active';
    const accentColor = isOff ? '#ef4444' : '#f59e0b';

    const baseRadius = (template as { radius?: number }).radius || 0;
    const radius = baseRadius > 0 ? baseRadius + (level * 20) : 0;

    const nodeStyles = useMemo(() => ({
        '--node-accent': accentColor,
    } as React.CSSProperties), [accentColor]);

    if (!showDetail) {
        return (
            <div className="glass-node" style={{ ...nodeStyles, width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: '32px' }}>{template.icon || '⚡'}</div>
                <Handle type="target" position={Position.Left} id="electricity" style={{ left: '-4px', background: '#ed610b', width: '8px', height: '8px', border: '1.5px solid #0d1122' }} />
                <Handle type="source" position={Position.Right} id="electricity" style={{ right: '-4px', background: '#eab308', width: '8px', height: '8px', border: '1.5px solid #0d1122' }} />
            </div>
        );
    }

    return (
        <div className="glass-node" style={{ ...nodeStyles, minWidth: '240px', padding: '16px' }}>
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
            <div className="node-header">
                <div className="node-icon-ring" style={{ background: `linear-gradient(135deg, ${accentColor}33, transparent)` }}>
                    {template.icon || '⚡'}
                </div>
                <div className="node-title-group">
                    <div className="node-title">{template.name}</div>
                    <div className="node-level">Level {level} Power Infrastructure</div>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                    <NodeHeaderMenu nodeId={id} />
                </div>
            </div>

            {/* Status & Power Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.3)', padding: '6px 10px', borderRadius: '8px', marginBottom: '12px' }}>
                <div className={`status-dot ${!isOff ? 'status-active' : ''}`} style={{ background: isOff ? '#ef4444' : undefined }} />
                <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#f8fafc', letterSpacing: '0.05em' }}>
                    {status.toUpperCase()}
                </span>

                <button
                    onClick={(e) => {
                        if (isViewOnly) return;
                        e.stopPropagation();
                        useStore.getState().toggleNodePower(id);
                    }}
                    className="nodrag"
                    style={{
                        marginLeft: 'auto',
                        background: isOff ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                        border: `1px solid ${isOff ? '#ef4444' : '#10b981'}`,
                        color: isOff ? '#fca5a5' : '#6ee7b7',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '9px',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                    }}
                >
                    {isOff ? 'POWER ON' : 'POWER OFF'}
                </button>
            </div>

            {/* Buffer for Accumulator */}
            {type === 'accumulator' && (
                <div className="resource-card" style={{ borderLeft: '2px solid #10b981', marginBottom: '12px' }}>
                    <div className="resource-info">
                        <div className="resource-name">🔋 Storage Buffer</div>
                        <span ref={bufferTextRef} style={{ fontSize: '11px', color: '#6ee7b7', fontWeight: 'bold' }}>0 / 0</span>
                    </div>
                    <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', marginTop: '6px', overflow: 'hidden' }}>
                        <div ref={bufferBarRef} style={{ width: '0%', height: '100%', background: '#10b981', boxShadow: '0 0 8px rgba(16, 185, 129, 0.5)' }} />
                    </div>
                </div>
            )}

            {/* Channel Selection for wireless power */}
            {['powerTransmitter', 'powerReceiver'].includes(type) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '12px' }}>
                    <span style={{ color: '#94a3b8', fontSize: '9px', fontWeight: 'bold' }}>📡 FREQUENCY CHANNEL</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                            onClick={(e) => {
                                if (isViewOnly) return;
                                e.stopPropagation();
                                useStore.getState().updateNodeData(id, { channel: Math.max(0, channel - 1) });
                            }}
                            className="nodrag"
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', width: '20px', height: '20px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            -
                        </button>
                        <span style={{ minWidth: '16px', textAlign: 'center', fontSize: '12px', color: '#fff', fontWeight: '800' }}>{channel}</span>
                        <button
                            onClick={(e) => {
                                if (isViewOnly) return;
                                e.stopPropagation();
                                useStore.getState().updateNodeData(id, { channel: channel + 1 });
                            }}
                            className="nodrag"
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', width: '20px', height: '20px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            +
                        </button>
                    </div>
                </div>
            )}

            {/* Grid Metrics */}
            <div style={{ padding: '10px', background: 'rgba(0,0,0,0.4)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ color: '#94a3b8', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>⚡ GRID TELEMETRY</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                    <span style={{ fontSize: '10px', color: '#64748b' }}>DEMAND</span>
                    <span ref={demandRef} style={{ fontSize: '12px', fontWeight: '800' }}>0 W/s</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: '10px', color: '#64748b' }}>SUPPLY</span>
                    <span ref={supplyRef} style={{ fontSize: '12px', color: '#fbbf24', fontWeight: '800' }}>0 W/s</span>
                </div>
            </div>

            {/* Upgrade Section */}
            {Object.keys(cost).length > 0 && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <div style={{ fontSize: '9px', color: '#94a3b8', marginBottom: '8px' }}>Upgrade Requirements:</div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                        {Object.entries(cost).map(([res, amt]) => {
                            const meta = RESOURCE_REGISTRY[res as ResourceType] || { icon: '❓' };
                            const cur = new Decimal(cloudStorage[res] as any || 0);
                            const isAffordable = cur.gte(amt as Decimal);
                            return (
                                <div key={res} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: isAffordable ? '#4ade80' : '#f87171', background: 'rgba(0,0,0,0.2)', padding: '2px 6px', borderRadius: '4px' }}>
                                    <span>{meta.icon}</span>
                                    <span style={{ fontWeight: 'bold' }}>{formatNumber(amt as Decimal)}</span>
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
                        className="nodrag"
                        style={{
                            width: '100%',
                            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                            border: 'none',
                            color: 'white',
                            borderRadius: '8px',
                            padding: '8px',
                            fontSize: '11px',
                            fontWeight: '800',
                            cursor: 'pointer',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)'
                        }}
                    >
                        UPGRADE INFRASTRUCTURE
                    </button>
                </div>
            )}

            {/* Handles */}
            <Handle type="target" position={Position.Left} id="electricity" style={{ left: '-20px', background: '#ed610b', width: '10px', height: '10px', border: '2px solid #0d1122' }} />
            <Handle type="source" position={Position.Right} id="electricity" style={{ right: '-20px', background: '#eab308', width: '10px', height: '10px', border: '2px solid #0d1122' }} />
        </div>
    );
};

export const PowerNode = memo(PowerNodeComponent, (prev, next) => {
    return prev.id === next.id && prev.selected === next.selected;
});

