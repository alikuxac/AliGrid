import React, { memo, useEffect, useRef, useMemo } from 'react';
import { Handle, Position, NodeProps, useViewport } from 'reactflow';
import { RESOURCE_REGISTRY, Decimal, getUpgradeCost, ResourceType } from '@aligrid/engine';
import { useStore, safeDecimal } from '../store';
import { formatNumber } from '../utils/formatter';
import { NodeHeaderMenu } from '../components/NodeHeaderMenu';
import { NodeData } from '../store/types';

const PowerReceiverNodeComponent = ({ id, data, selected }: NodeProps<NodeData>) => {
    const { zoom } = useViewport();
    const compactMode = useStore(state => state.settings.compactMode);
    const showDetail = zoom > 0.6 && !compactMode;
    const supplyRef = useRef<HTMLSpanElement>(null);
    const demandRef = useRef<HTMLSpanElement>(null);
    const reserveAmtRef = useRef<HTMLSpanElement>(null);

    const level = useStore(state => state.nodes.find(n => n.id === id)?.data?.level ?? 0);
    const isOff = useStore(state => state.nodes.find(n => n.id === id)?.data?.isOff ?? false);
    const channel = useStore(state => state.nodes.find(n => n.id === id)?.data?.channel ?? 0);
    const cloudReservePercent = useStore(state => state.nodes.find(n => n.id === id)?.data?.cloudReservePercent ?? 0);

    const cloudStorage = useStore((state) => state.cloudStorage);
    const isViewOnly = useStore((state) => state.isViewOnly);
    const cloudLevel = useStore((state) => state.cloudLevel);
    const getCloudCapacity = useStore((state) => state.getCloudCapacity);
    const cloudCapacity = getCloudCapacity(cloudLevel);

    useEffect(() => {
        const unsubscribe = useStore.subscribe(
            state => state.nodeStats?.[id],
            (stats) => {
                if (!stats) return;
                try {
                    if (supplyRef.current) supplyRef.current.innerText = `${formatNumber(safeDecimal(stats.gridSupply || 0))}W`;
                    if (demandRef.current) demandRef.current.innerText = `${formatNumber(safeDecimal(stats.gridDemand || 0))}W`;

                    if (reserveAmtRef.current) {
                        const reservedAmount = cloudCapacity.times((cloudReservePercent || 0) / 100);
                        reserveAmtRef.current.innerText = `(${formatNumber(reservedAmount)}W)`;
                    }
                } catch (e) { }
            }
        );
        return unsubscribe;
    }, [id, cloudCapacity, cloudReservePercent]);

    const cost = getUpgradeCost('powerReceiver', level);
    const status = isOff ? 'off' : 'active';
    const accentColor = isOff ? '#ef4444' : '#eab308';

    const nodeStyles = useMemo(() => ({
        '--node-accent': accentColor,
    } as React.CSSProperties), [accentColor]);

    if (!showDetail) {
        return (
            <div className="glass-node" style={{ ...nodeStyles, width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: '32px' }}>🔌</div>
                <Handle type="source" position={Position.Right} id="output" style={{ right: '-4px', background: '#eab308', width: '8px', height: '8px', border: '1.5px solid #0d1122' }} />
            </div>
        );
    }

    return (
        <div className="glass-node" style={{ ...nodeStyles, minWidth: '240px', padding: '16px' }}>
            {/* Header */}
            <div className="node-header">
                <div className="node-icon-ring" style={{ background: `linear-gradient(135deg, ${accentColor}33, transparent)` }}>
                    🔌
                </div>
                <div className="node-title-group">
                    <div className="node-title">Power Receiver</div>
                    <div className="node-level">Level {level} Quantum Relay</div>
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
                    {isOff ? 'ACTIVATE' : 'DEACTIVATE'}
                </button>
            </div>

            {/* Channel Selection */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '12px' }}>
                <span style={{ color: '#94a3b8', fontSize: '9px', fontWeight: 'bold' }}>📡 SYNC CHANNEL</span>
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

            {/* Cloud Reserve Control */}
            <div className="resource-section-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Cloud Pull Capacity</span>
                <span style={{ color: '#fbbf24' }}>{cloudReservePercent}%</span>
            </div>
            <div style={{ padding: '4px 0 12px 0' }}>
                <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={cloudReservePercent}
                    onChange={(e) => {
                        if (isViewOnly) return;
                        const val = parseInt(e.target.value, 10);
                        useStore.getState().updateNodeData(id, { cloudReservePercent: val });
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    style={{
                        width: '100%',
                        accentColor: '#fbbf24',
                        height: '6px',
                        cursor: 'pointer',
                        borderRadius: '3px'
                    }}
                    className="nodrag"
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '9px', color: '#64748b' }}>
                    <span>Passive</span>
                    <span ref={reserveAmtRef} style={{ color: '#94a3b8' }}>(0W)</span>
                    <span>Full Force</span>
                </div>
            </div>

            {/* Grid Metrics */}
            <div style={{ padding: '10px', background: 'rgba(0,0,0,0.4)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '10px', color: '#64748b' }}>CHANNEL CAP</span>
                    <span style={{ fontSize: '10px', color: '#fbbf24', fontWeight: 'bold' }}>{formatNumber(safeDecimal(2000 * Math.pow(4, level)))}W</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '10px', color: '#64748b' }}>SUPPLY (OUT)</span>
                    <span ref={supplyRef} style={{ fontSize: '11px', color: '#22c55e', fontWeight: '800' }}>0W</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '10px', color: '#64748b' }}>TOTAL DEMAND</span>
                    <span ref={demandRef} style={{ fontSize: '11px', color: '#f87171', fontWeight: '800' }}>0W</span>
                </div>
            </div>

            {/* Upgrade Section */}
            {Object.keys(cost).length > 0 && (
                <div style={{ paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
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
                            cursor: 'pointer'
                        }}
                    >
                        UPGRADE RELAY
                    </button>
                </div>
            )}

            <Handle type="source" position={Position.Right} id="output" style={{ right: '-20px', background: '#eab308', width: '10px', height: '10px', border: '2px solid #0d1122' }} />
        </div>
    );
};

export const PowerReceiverNode = memo(PowerReceiverNodeComponent);

