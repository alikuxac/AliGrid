import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { RESOURCE_REGISTRY, Decimal, getUpgradeCost } from '@aligrid/engine';
import { useStore } from '../store';
import { formatNumber } from '../utils/formatter';
import { NodeHeaderMenu } from '../components/NodeHeaderMenu';
import { NodeData } from '../store/types';

export const PowerReceiverNode = memo(({ id, data }: NodeProps<NodeData>) => {
    const stats = useStore((state) => state.nodeStats[id]) || {};
    const liveData = { ...data, ...stats };
    const cloudStorage = useStore((state) => state.cloudStorage);
    const isViewOnly = useStore((state) => state.isViewOnly);

    const level = liveData?.level || 0;
    const cost = getUpgradeCost('powerReceiver', level);

    const isOff = liveData?.isOff;
    const borderColor = isOff ? '#f87171' : '#eab308';

    return (
        <div style={{
            background: 'rgba(15, 23, 42, 0.9)',
            backdropFilter: 'blur(10px)',
            border: `1.2px solid ${borderColor}`,
            borderRadius: '8px',
            minWidth: '240px',
            color: '#e2e8f0',
            fontFamily: 'monospace',
            overflow: 'visible',
            boxShadow: '0 10px 25px -3px rgba(0, 0, 0, 0.5)',
            position: 'relative',
        }}>
            {/* Header */}
            <div style={{
                background: `linear-gradient(90deg, ${borderColor}22, rgba(15, 23, 42, 0))`,
                padding: '10px 12px',
                borderBottom: `1px solid ${borderColor}44`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px' }}>🔌</span>
                    <span style={{ fontWeight: 'bold', color: '#fef08a' }}>Power Recv. <span style={{ fontSize: '9px', color: '#94a3b8' }}>Lv.{level}</span></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                        onClick={(e) => {
                            if (isViewOnly) return;
                            e.stopPropagation();
                            useStore.getState().toggleNodePower(id);
                        }}
                        style={{
                            background: isOff ? '#f87171' : '#059669',
                            border: 'none',
                            color: '#f8fafc',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '9px',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                        }}
                    >
                        {isOff ? 'OFF' : 'ON'}
                    </button>
                    <NodeHeaderMenu nodeId={id} />
                </div>
            </div>

            {/* Body */}
            <div style={{ padding: '12px', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

                {/* Channel Control */}
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

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '6px', fontSize: '10px', color: '#94a3b8' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span>Channel Cap:</span>
                        <span style={{ color: '#fbbf24' }}>{Number(2000 * Math.pow(4, level)).toLocaleString()}W</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span>Grid Supply:</span>
                        <span style={{ color: '#22c55e' }}>{Number(liveData?.gridSupply || 0).toLocaleString()}W</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Grid Demand:</span>
                        <span style={{ color: '#f87171' }}>{Number(liveData?.gridDemand || 0).toLocaleString()}W</span>
                    </div>
                </div>

                {/* Upgrade Button */}
                {Object.keys(cost).length > 0 && (
                    <div style={{ marginTop: '4px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
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
                                width: '100%', background: '#2563eb', border: 'none', color: 'white', borderRadius: '4px', padding: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer'
                            }}
                        >
                            Upgrade
                        </button>
                    </div>
                )}
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
