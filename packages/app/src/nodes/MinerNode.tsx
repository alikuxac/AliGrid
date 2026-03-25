import React, { memo } from 'react';
import { Handle, Position, useEdges } from 'reactflow';
import { NodeTemplate } from '@aligrid/schema';
import { RESOURCE_REGISTRY, NODE_COSTS, Decimal, getUpgradeCost } from '@aligrid/engine';

import { useStore } from '../store';
import { formatNumber } from '../utils/formatter';
import { Counter } from '../components/Counter';
import { NodeHeaderMenu } from '../components/NodeHeaderMenu';

import type { NodeData } from '../store/types';

interface ExtendedTemplate extends NodeTemplate {
    maxBuffer?: string | number;
    resource_type?: string | null;
    radius?: number | null;
}

export interface MinerNodeProps {
    id: string;
    type: string;
    data: NodeData;
    selected?: boolean;
}

export const MinerNode: React.FC<MinerNodeProps> = memo(({ id, type, data, selected }) => {
    const stats = useStore((state) => state.nodeStats[id]);
    const cloudStorage = useStore((state) => state.cloudStorage);
    const isViewOnly = useStore((state) => state.isViewOnly);
    const allEdges = useEdges();
    const nodeTemplates = useStore((state) => state.nodeTemplates) || [];
    const originalTemplate = data?.template as ExtendedTemplate || nodeTemplates.find((t) => t.id === type) as ExtendedTemplate;

    // Merge prop data with live stats
    const liveData = { ...data, ...stats };
    const level = liveData?.level || 0;

    // Calculate cost based on levels
    const cost = getUpgradeCost(type, level);

    let finalTemplate = originalTemplate;
    if (!finalTemplate) {
        finalTemplate = {
            id: type,
            name: type.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
            category: 'generator',
            icon: type.toLowerCase().includes('coal') ? '🔥' : type.toLowerCase().includes('iron') ? '⛓️' : '⛏️',
            output_type: data?.resourceType || '',
            initial_rate: (data?.outputRate ? Number(data.outputRate) : 1).toString(),
        } as ExtendedTemplate;
    }

    const template = { ...finalTemplate! };
    const outType = template.output_type || liveData?.resourceType || 'iron';
    const resMeta = RESOURCE_REGISTRY[outType] || { icon: '⚙️', name: outType };

    const hasEdges = allEdges.some(e => e.target === id);
    const efficiency = typeof liveData?.efficiency === 'object' ? liveData.efficiency : new Decimal(liveData?.efficiency ?? 0);
    const effPercent = efficiency.times(100).toFixed(0);
    const isRunning = !liveData?.isOff && efficiency.gt(0);

    let borderColor = liveData?.isOff ? '#f87171' : isRunning ? '#10b981' : '#f59e0b'; // red off, green run, amber warning/idle

    const bgColor = template.style_bg || '#111827';

    // CSS for rotating the icon if running
    const animationStyles = isRunning ? {
        animation: 'spin 4s linear infinite',
    } : {};

    return (
        <div style={{
            background: '#161b2e',
            border: `1px solid ${borderColor}cc`,
            borderRadius: '8px',
            minWidth: '200px',
            color: '#e2e8f0',
            fontFamily: 'monospace',
            overflow: 'visible',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4)',
            position: 'relative'
        }}>
            <style>
                {`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                `}
            </style>

            {/* Header */}
            <div style={{
                background: 'rgba(255, 255, 255, 0.04)',
                padding: '6px 10px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '6px',
                fontSize: '11px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '13px' }}>{template.icon || '⛏️'}</span>
                    <span style={{ fontWeight: 'bold' }}>{template.name}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {level > 0 && <span style={{ fontSize: '9px', color: '#94a3b8' }}>Lv.{level}</span>}
                    <button
                        onClick={(e) => {
                            if (isViewOnly) return;
                            e.stopPropagation();
                            if (window.confirm('Flush all buffers for this machine?')) {
                                useStore.getState().updateNodeData(id, { inputBuffer: {}, outputBuffer: {} });
                            }
                        }}
                        style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid #ef4444',
                            color: '#ef4444',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '9px',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                        }}
                    >
                        Flush
                    </button>
                    <button
                        onClick={(e) => {
                            if (isViewOnly) return;
                            e.stopPropagation();
                            const state = useStore.getState();
                            state.toggleNodePower(id);
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
                            gap: '2px'
                        }}
                    >
                        <span>{liveData?.isOff ? 'OFF' : 'ON'}</span>
                    </button>
                    <NodeHeaderMenu nodeId={id} />
                </div>
            </div>

            {/* Body */}
            <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>

                {/* Central Drill/Animation Visual */}
                <div style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.3)',
                    border: `2px dashed ${borderColor}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    ...animationStyles
                }}>
                    <span style={{ fontSize: '28px' }}>{resMeta.icon}</span>
                </div>

                <div style={{ textAlign: 'center', fontSize: '11px' }}>
                    <div>Yield: <b style={{ color: '#34d399' }}>
                        <Counter value={liveData?.outputRate ?? String(template.initial_rate || 0)} />
                        {Number(liveData?.boost || 1) > 1 && (
                            <span style={{ color: '#fb923c' }}> + {formatNumber(new Decimal(liveData?.outputRate || template.initial_rate || 0).times(Number(liveData!.boost) - 1))}</span>
                        )}
                        {resMeta.unit || ''}/s</b></div>
                    <div style={{ color: '#94a3b8', fontSize: '9px', marginTop: '2px' }}>
                        Eff: <span style={{ color: isRunning ? '#34d399' : '#f59e0b' }}>{effPercent}%</span>
                    </div>
                    {liveData?.powerConsumption && (
                        <div style={{ color: '#94a3b8', fontSize: '9px', marginTop: '2px' }}>
                            Power: <span style={{ color: '#eab308' }}>{formatNumber(new Decimal(liveData.powerConsumption).times(efficiency).times(liveData.boost || 1))} {RESOURCE_REGISTRY['electricity']?.unit || ''}/s</span>
                        </div>
                    )}
                </div>

                {/* Outputs List (for handle alignment) */}
                <div style={{ width: '100%', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '6px', marginTop: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '9px' }}>
                        <span style={{ color: '#94a3b8' }}>Producing:</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <span><Counter value={liveData?.actualOutputPerSec || 0} /> {resMeta.unit || ''}/s</span>
                            <Handle
                                type="source"
                                id={outType}
                                position={Position.Right}
                                style={{ right: '-14px', background: '#10b981', width: '8px', height: '8px', border: '1.5px solid #0a0f1d' }}
                            />
                        </div>
                    </div>
                </div>

                {/* Upgrade Button */}
                {Object.keys(cost).length > 0 && (
                    <div style={{ width: '100%', marginTop: '4px' }}>
                        <div style={{ fontSize: '9px', color: '#94a3b8', marginBottom: '2px' }}>Cost to Upgrade:</div>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '6px' }}>
                            {Object.entries(cost).map(([res, amt]) => {
                                const meta = RESOURCE_REGISTRY[res] || { icon: '❓' };
                                const cur = cloudStorage[res] || new Decimal(0);
                                const isAffordable = cur.gte(amt as Decimal);
                                return (
                                    <div key={res} style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '8px', color: isAffordable ? '#4ade80' : '#f87171' }}>
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
                                const state = useStore.getState();
                                state.upgradeNode(id);
                            }}
                            style={{
                                width: '100%', background: '#2563eb', border: 'none', color: 'white',
                                borderRadius: '4px', padding: '3px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer'
                            }}
                        >
                            Upgrade
                        </button>
                    </div>
                )}
            </div>

            {/* Electricity Target Handle */}
            <Handle
                type="target"
                position={Position.Left}
                id="electricity"
                style={{ left: '-14px', background: '#eab308', width: '8px', height: '8px', border: '1.5px solid #0a0f1d' }}
                title="Electricity"
            />
        </div>
    );
});
