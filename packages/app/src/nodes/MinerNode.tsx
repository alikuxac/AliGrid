import { Handle, Position, NodeProps, useEdges, useViewport } from 'reactflow';
import { NodeTemplate } from '@aligrid/schema';
import { ResourceType, RESOURCE_REGISTRY, Decimal, getUpgradeCost } from '@aligrid/engine';
import { safeDecimal } from '../store/slices/tick/helpers';

import { useStore } from '../store';
import { formatNumber } from '../utils/formatter';
import { Counter } from '../components/Counter';
import { NodeHeaderMenu } from '../components/NodeHeaderMenu';

import type { NodeData } from '../store/types';
import { memo, useEffect, useRef, useMemo } from 'react';

interface ExtendedTemplate extends NodeTemplate {
    maxBuffer?: string | number;
    resource_type?: string | null;
    radius?: number | null;
}

const MinerNodeComponent = ({ id, type, data, selected }: NodeProps<NodeData>) => {
    const { zoom } = useViewport();
    const compactMode = useStore(state => state.settings.compactMode);
    const showDetail = zoom > 0.6 && !compactMode;

    const yieldRef = useRef<HTMLSpanElement>(null);
    const effRef = useRef<HTMLSpanElement>(null);
    const effFillRef = useRef<HTMLDivElement>(null);
    const powerRef = useRef<HTMLSpanElement>(null);
    const bufferRef = useRef<HTMLSpanElement>(null);
    const bufferBarRef = useRef<HTMLDivElement>(null);
    const producingRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        const unsubscribe = useStore.subscribe(
            state => state.nodeStats?.[id],
            (nodeState) => {
                if (!nodeState) return;

                try {
                    const efficiency = safeDecimal(nodeState.efficiency);
                    const effPercent = efficiency.times(100).toFixed(0);
                    const outputRate = safeDecimal(nodeState.actualOutputPerSec || 0);
                    const powerEfficiency = safeDecimal(nodeState.wirelessEfficiency ?? 1);
                    const powerCons = safeDecimal(nodeState.powerConsumption || 0);
                    const currentPower = safeDecimal(nodeState.inputBuffer?.['electricity'] || 0);
                    const maxBuf = Number(nodeState.maxBuffer) || 5000;

                    if (effRef.current) {
                        effRef.current.innerText = `${effPercent}%`;
                        effRef.current.style.color = efficiency.gt(0) ? '#34d399' : '#f59e0b';
                    }
                    if (effFillRef.current) {
                        effFillRef.current.style.width = `${Math.min(100, efficiency.toNumber() * 100)}%`;
                    }
                    if (powerRef.current) {
                        powerRef.current.innerText = `${formatNumber(powerCons.times(powerEfficiency))} / ${formatNumber(powerCons)}`;
                    }
                    if (bufferRef.current) {
                        bufferRef.current.innerText = `${formatNumber(currentPower)}`;
                    }
                    if (bufferBarRef.current) {
                        bufferBarRef.current.style.width = `${Math.min(100, (currentPower.toNumber() / maxBuf) * 100)}%`;
                    }
                    if (producingRef.current) {
                        producingRef.current.innerText = formatNumber(outputRate);
                    }
                } catch (e) { }
            }
        );
        return unsubscribe;
    }, [id]);

    const level = useStore(state => state.nodes.find(n => n.id === id)?.data?.level ?? 0);
    const isOff = useStore(state => state.nodes.find(n => n.id === id)?.data?.isOff ?? false);
    const boost = useStore(state => state.nodes.find(n => n.id === id)?.data?.boost ?? 1);

    const cloudStorage = useStore((state) => state.cloudStorage);
    const isViewOnly = useStore((state) => state.isViewOnly);

    const nodeTemplates = useStore((state) => state.nodeTemplates) || [];
    const template = data?.template as ExtendedTemplate || nodeTemplates.find((t) => t.id === type) as ExtendedTemplate;
    const cost = getUpgradeCost(type, level);

    const rawOutType = template.output_type || data?.resourceType || 'iron';
    const outType = typeof rawOutType === 'string' ? rawOutType : String(rawOutType || 'iron');
    const resMeta = RESOURCE_REGISTRY[outType as ResourceType] || { icon: '⚙️', name: outType, color: '#3b82f6' };

    const efficiency = safeDecimal(data?.efficiency);
    const powerEfficiency = safeDecimal(data?.wirelessEfficiency ?? 1);
    const isRunning = !isOff && efficiency.gt(0);

    const nodeStyles = useMemo(() => ({
        '--node-accent': '#3b82f6',
    } as React.CSSProperties), []);

    const animationStyles = isRunning ? {
        animation: 'spin 4s linear infinite',
    } : {};

    if (!showDetail) {
        return (
            <div className="glass-node" style={{ ...nodeStyles, width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: '32px', ...animationStyles }}>{resMeta.icon}</div>
                <Handle type="source" id={outType} position={Position.Right} style={{ right: '-4px', top: '32px', background: resMeta.color || '#10b981', width: '8px', height: '8px', border: '1.5px solid #0d1122' }} />
                <Handle type="target" position={Position.Left} id="electricity" style={{ left: '-4px', top: '32px', background: '#fbbf24', width: '8px', height: '8px', border: '1.5px solid #0d1122' }} />
            </div>
        );
    }

    return (
        <div className="glass-node" style={{ ...nodeStyles, minWidth: '240px', padding: '16px', opacity: isOff ? 0.8 : 1 }}>
            <style>
                {`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}
            </style>

            {/* Header */}
            <div className="node-header">
                <div className="node-icon-ring" style={{ background: `linear-gradient(135deg, ${resMeta.color}33, transparent)`, ...animationStyles }}>
                    {template.icon || '⛏️'}
                </div>
                <div className="node-title-group">
                    <div className="node-title">{template.name}</div>
                    <div className="node-level">Level {level}</div>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                    <div className="status-indicator">
                        <div className={`status-dot ${isOff ? 'off' : 'on'}`}></div>
                        <div className="status-text" style={{ color: isOff ? '#f87171' : '#34d399' }}>{isOff ? 'Disabled' : 'Active'}</div>
                    </div>
                </div>
            </div>

            {/* Efficiency */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '4px' }}>
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>EFFICIENCY</span>
                <span ref={effRef} style={{ fontSize: '12px', fontWeight: '800', fontFamily: 'JetBrains Mono' }}>0%</span>
            </div>
            <div className="efficiency-bar">
                <div ref={effFillRef} className="efficiency-fill" style={{ width: '0%' }}></div>
            </div>

            {/* Producing Resource Card */}
            <div className="resource-section-title">Minerals</div>
            <div className="resource-card" style={{ borderRight: `2px solid ${resMeta.color}` }}>
                <Handle
                    type="source"
                    id={outType}
                    position={Position.Right}
                    style={{ right: '-20px', background: resMeta.color, width: '10px', height: '10px', border: '2px solid #0d1122' }}
                />
                <div className="resource-info">
                    <div className="resource-name">{resMeta.icon} {resMeta.label}</div>
                    <div style={{ fontSize: '10px', fontWeight: '700', color: '#34d399' }}>
                        <span ref={producingRef}>0</span> <small style={{ fontSize: '8px' }}>{resMeta.unit}/s</small>
                    </div>
                </div>
                <div style={{ fontSize: '10px', color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Yield:</span>
                    <span style={{ color: '#fff', fontWeight: '600' }}>
                        <Counter value={String(data?.outputRate ?? template.initial_rate ?? 0)} />
                        {Number(boost) > 1 && (
                            <span style={{ color: '#fb923c', fontSize: '9px' }}> +{formatNumber(new Decimal(data?.outputRate || template.initial_rate || 0).times(Number(boost) - 1))}</span>
                        )}
                    </span>
                </div>
            </div>

            {/* Power Status */}
            <div style={{ marginBottom: '16px' }}>
                <div className="resource-section-title">Energy</div>
                <div className="resource-card" style={{ borderLeft: `2px solid #fbbf24` }}>
                    <Handle
                        type="target"
                        id="electricity"
                        position={Position.Left}
                        style={{ left: '-20px', background: '#fbbf24', width: '10px', height: '10px', border: '2px solid #0d1122' }}
                    />
                    <div className="resource-info">
                        <div className="resource-name">⚡ Electricity</div>
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                            <span ref={powerRef}>0 / 0</span> <small>unit/s</small>
                        </div>
                    </div>
                    <div className="buffer-container">
                        <div ref={bufferBarRef} className="buffer-fill" style={{ width: '0%', backgroundColor: '#fbbf24', boxShadow: '0 0 10px #fbbf2466' }} />
                    </div>
                    <div className="buffer-label">
                        <span>GRID BUFFER</span>
                        <span ref={bufferRef}>0</span>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                <button
                    onClick={(e) => {
                        if (isViewOnly) return;
                        e.stopPropagation();
                        if (window.confirm('Flush all buffers?')) {
                            useStore.getState().flushNode(id);
                        }
                    }}
                    style={{ flex: 1, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#f87171', padding: '8px', borderRadius: '6px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer', textTransform: 'uppercase' }}
                >
                    Flush
                </button>
                <button
                    onClick={(e) => {
                        if (isViewOnly) return;
                        e.stopPropagation();
                        useStore.getState().toggleNodePower(id);
                    }}
                    style={{ flex: 1, background: isOff ? 'rgba(52, 211, 153, 0.1)' : 'rgba(239, 68, 68, 0.1)', border: isOff ? '1px solid rgba(52, 211, 153, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)', color: isOff ? '#34d399' : '#f87171', padding: '8px', borderRadius: '6px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer', textTransform: 'uppercase' }}
                >
                    {isOff ? 'Enable' : 'Disable'}
                </button>
                <NodeHeaderMenu nodeId={id} />
            </div>

            {/* Upgrade Section */}
            <NodeUpgradeSection id={id} templateId={type} level={level} isViewOnly={!!isViewOnly} />
        </div>
    );
};

const NodeUpgradeSection = memo(({ id, templateId, level, isViewOnly }: { id: string; templateId: string; level: number; isViewOnly: boolean }) => {
    const cost = useMemo(() => getUpgradeCost(templateId, level), [templateId, level]);
    const cloudStorage = useStore(state => state.cloudStorage);
    if (Object.keys(cost).length === 0) return null;

    return (
        <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
            <div style={{ fontSize: '9px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold', textTransform: 'uppercase' }}>Upgrade Cost</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                {Object.entries(cost).map(([res, amt]) => {
                    const meta = RESOURCE_REGISTRY[res as ResourceType] || { icon: '❓', label: res };
                    const curVal = safeDecimal(cloudStorage[res as ResourceType] || 0);
                    const isAffordable = curVal.gte(amt as Decimal);
                    return (
                        <div key={res} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(0,0,0,0.2)', padding: '4px 6px', borderRadius: '4px', border: `1px solid ${isAffordable ? 'rgba(52, 211, 153, 0.1)' : 'rgba(239, 68, 68, 0.1)'}` }}>
                            <span style={{ fontSize: '10px' }}>{meta.icon}</span>
                            <span style={{ fontSize: '9px', fontWeight: '700', color: isAffordable ? '#34d399' : '#f87171' }}>{formatNumber(amt as Decimal)}</span>
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
                className="upgrade-button"
            >
                Upgrade to Mk.{level + 1}
            </button>
        </div>
    );
});
NodeUpgradeSection.displayName = 'NodeUpgradeSection';

export const MinerNode = memo(MinerNodeComponent);
