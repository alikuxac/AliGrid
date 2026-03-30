import React, { memo, useEffect, useRef, useMemo } from 'react';
import { Handle, Position, NodeProps, useViewport } from 'reactflow';
import { Decimal, RESOURCE_REGISTRY, ResourceType } from '@aligrid/engine';
import { useStore } from '../store';
import { NodeHeaderMenu } from '../components/NodeHeaderMenu';
import { safeDecimal } from '../store/slices/tick/helpers';
import { formatNumber } from '../utils/formatter';
import type { NodeData } from '../store/types';

export const ProcessorNode = memo(({ id, data, selected }: NodeProps<NodeData>) => {
    const { zoom } = useViewport();
    const compactMode = useStore(state => state.settings.compactMode);
    const showDetail = zoom > 0.6 && !compactMode;

    const inRateRef = useRef<HTMLSpanElement>(null);
    const outRateRef = useRef<HTMLSpanElement>(null);
    const effFillRef = useRef<HTMLDivElement>(null);
    const effRef = useRef<HTMLSpanElement>(null);

    const isOff = useStore(state => state.nodes.find(n => n.id === id)?.data?.isOff ?? false);
    const status = useStore(state => state.nodeStats[id]?.status || 'active');

    useEffect(() => {
        const unsubscribe = useStore.subscribe(
            state => state.nodeStats[id],
            (stats) => {
                if (!stats) return;
                const efficiency = safeDecimal(stats.efficiency || 0);

                if (inRateRef.current) inRateRef.current.innerText = `${new Decimal(stats.actualInputPerSec || 0).toNumber().toFixed(1)}`;
                if (outRateRef.current) outRateRef.current.innerText = `${new Decimal(stats.actualOutputPerSec || 0).toNumber().toFixed(1)}`;

                if (effRef.current) {
                    effRef.current.innerText = `${efficiency.times(100).toFixed(0)}%`;
                    effRef.current.style.color = efficiency.gt(0) ? '#34d399' : '#f59e0b';
                }
                if (effFillRef.current) {
                    effFillRef.current.style.width = `${efficiency.times(100).toNumber()}%`;
                }
            }
        );
        return unsubscribe;
    }, [id]);

    const recipe = data?.recipe;
    const inType = recipe?.inputType || 'water';
    const outType = recipe?.outputType || 'electricity';
    const regIn = RESOURCE_REGISTRY[inType as ResourceType] || { icon: '❓', label: inType, color: '#94a3b8' };
    const regOut = RESOURCE_REGISTRY[outType as ResourceType] || { icon: '❓', label: outType, color: '#facc15' };
    const convRate = recipe?.conversionRate ? new Decimal(recipe.conversionRate as any).toNumber().toFixed(3) : '0';

    const nodeGlowStyle = useMemo(() => ({
        boxShadow: selected
            ? `0 0 0 2px #3b82f6, 0 12px 40px -10px rgba(0, 0, 0, 0.8), 0 0 20px rgba(59, 130, 246, 0.4)`
            : `0 12px 30px -10px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.1)`,
        borderColor: selected ? '#3b82f6' :
            status === 'warning' ? '#ef4444' :
                status === 'idle' ? '#eab308' : 'rgba(255, 255, 255, 0.08)'
    }), [selected, status]);

    if (!showDetail) {
        return (
            <div className="glass-node" style={{ width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: selected ? '2px solid #3b82f6' : undefined }}>
                <div style={{ fontSize: '32px' }}>{isOff ? '💤' : (data?.template?.icon || '⚙️')}</div>
                <Handle type="target" position={Position.Left} id="input" style={{ left: '-4px', top: '32px', background: regIn.color, width: '8px', height: '8px', border: '1.5px solid #0d1122' }} />
                <Handle type="source" position={Position.Right} id="output" style={{ right: '-4px', top: '32px', background: regOut.color, width: '8px', height: '8px', border: '1.5px solid #0d1122' }} />
            </div>
        );
    }

    return (
        <div className="glass-node" style={{ ...nodeGlowStyle, minWidth: '240px', padding: '16px', opacity: isOff ? 0.8 : 1 }}>
            {/* Header */}
            <div className="node-header">
                <div className="node-icon-ring" style={{ background: `linear-gradient(135deg, ${regOut.color}33, transparent)` }}>
                    {data?.template?.icon || '⚙️'}
                </div>
                <div className="node-title-group">
                    <div className="node-title">{data?.label || data?.template?.name || 'Processor'}</div>
                    <div className="node-level">Process Node</div>
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
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>OPERATIONAL LOAD</span>
                <span ref={effRef} style={{ fontSize: '12px', fontWeight: '800' }}>0%</span>
            </div>
            <div className="efficiency-bar">
                <div ref={effFillRef} className="efficiency-fill" style={{ width: '0%', background: regOut.color }}></div>
            </div>

            {/* Conversion Path */}
            <div className="resource-section-title">Conversion</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {/* Input Resource */}
                <div className="resource-card" style={{ borderLeft: `2px solid ${regIn.color}`, marginBottom: '4px' }}>
                    <div className="resource-info">
                        <div className="resource-name">{regIn.icon} {regIn.label}</div>
                        <div style={{ fontSize: '10px', color: '#f87171', fontWeight: '700' }}>
                            - <span ref={inRateRef}>0.0</span> <small>{regIn.unit}/s</small>
                        </div>
                    </div>
                </div>

                <div style={{ textAlign: 'center', color: '#64748b', fontSize: '10px', margin: '4px 0' }}>
                    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '2px 8px', display: 'inline-block' }}>
                        Yield Factor: {convRate}x
                    </div>
                </div>

                {/* Output Resource */}
                <div className="resource-card" style={{ borderLeft: `2px solid ${regOut.color}` }}>
                    <div className="resource-info">
                        <div className="resource-name">{regOut.icon} {regOut.label}</div>
                        <div style={{ fontSize: '10px', color: '#34d399', fontWeight: '700' }}>
                            + <span ref={outRateRef}>0.0</span> <small>{regOut.unit}/s</small>
                        </div>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <button
                    onClick={() => { if (window.confirm('Flush all buffers?')) useStore.getState().flushNode(id); }}
                    style={{ flex: 1, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#f87171', padding: '8px', borderRadius: '6px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                    FLUSH
                </button>
                <button
                    onClick={() => useStore.getState().updateNodeData(id, { isOff: !isOff })}
                    style={{ flex: 1, background: isOff ? 'rgba(52, 211, 153, 0.1)' : 'rgba(239, 68, 68, 0.1)', border: isOff ? '1px solid rgba(52, 211, 153, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)', color: isOff ? '#34d399' : '#f87171', padding: '8px', borderRadius: '6px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                    {isOff ? 'ENABLE' : 'DISABLE'}
                </button>
                <NodeHeaderMenu nodeId={id} />
            </div>

            <Handle type="target" position={Position.Left} id="input" style={{ left: '-20px', background: regIn.color, width: '10px', height: '10px', border: '2px solid #0d1122' }} />
            <Handle type="source" position={Position.Right} id="output" style={{ right: '-20px', background: regOut.color, width: '10px', height: '10px', border: '2px solid #0d1122' }} />
        </div>
    );
});
