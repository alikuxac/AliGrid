import React, { memo, useEffect, useMemo, useRef } from 'react';
import { Position, NodeProps, Handle, useViewport } from 'reactflow';
import { RESOURCE_REGISTRY, Decimal, getUpgradeCost, ResourceType } from '@aligrid/engine';
import { useStore } from '../store';
import { safeDecimal } from '../store/slices/tick/helpers';
import { formatNumber } from '../utils/formatter';
import { NodeHeaderMenu } from '../components/NodeHeaderMenu';
import { NodeTemplate } from '@aligrid/schema';
import type { NodeData } from '../store/types';

interface ExtendedTemplate extends Partial<Omit<NodeTemplate, 'output_type'>> {
    resource_type?: string | null;
    output_type?: any;
    icon?: string;
    name?: string;
}

const GeneratorNodeComponent = ({ id, type, data, selected }: NodeProps<NodeData>) => {
    const { zoom } = useViewport();
    const compactMode = useStore(state => state.settings.compactMode);
    const showDetail = zoom > 0.6 && !compactMode;

    const yieldRef = useRef<HTMLSpanElement>(null);
    const outputRateRefs = useRef<Record<string, HTMLSpanElement>>({});
    const outputFillRefs = useRef<Record<string, HTMLDivElement>>({});
    const outputBufferRefs = useRef<Record<string, HTMLSpanElement>>({});

    const level = useStore(state => state.nodes.find(n => n.id === id)?.data?.level ?? 0);
    const isOff = useStore(state => state.nodes.find(n => n.id === id)?.data?.isOff ?? false);
    const cloudStorage = useStore((state) => state.cloudStorage);
    const isViewOnly = useStore((state) => state.isViewOnly);
    const nodeTemplates = useStore((state) => state.nodeTemplates) || [];

    useEffect(() => {
        const unsubscribe = useStore.subscribe(
            state => state.nodeStats?.[id],
            (stats) => {
                if (!stats) return;
                try {
                    const outputRate = safeDecimal(stats.actualOutputPerSec || 0);

                    if (yieldRef.current) {
                        yieldRef.current.innerText = formatNumber(outputRate);
                    }

                    Object.keys(stats.outputBuffer || {}).forEach(res => {
                        const rateEl = outputRateRefs.current[res];
                        if (rateEl) {
                            const handleRate = safeDecimal(stats.handleFlows?.[res] || stats.actualOutputPerSec || 0);
                            rateEl.innerText = `${formatNumber(handleRate)}/s`;
                        }
                        const fillEl = outputFillRefs.current[res];
                        if (fillEl) {
                            const amt = safeDecimal(stats.outputBuffer?.[res] || 0);
                            const max = safeDecimal(stats.maxBuffer || 1000);
                            fillEl.style.width = `${Math.min(100, amt.dividedBy(max).toNumber() * 100)}%`;
                        }
                        const bufEl = outputBufferRefs.current[res];
                        if (bufEl) {
                            const amt = safeDecimal(stats.outputBuffer?.[res] || 0);
                            bufEl.innerText = amt.gt(0.01) ? formatNumber(amt) : '0';
                        }
                    });
                } catch (e) { }
            }
        );
        return unsubscribe;
    }, [id]);

    const originalTemplate = data?.template as ExtendedTemplate || nodeTemplates.find((t) => t.id === type) as ExtendedTemplate;
    const cost = getUpgradeCost(type, level);

    let finalTemplate = originalTemplate;
    if (!finalTemplate) {
        finalTemplate = {
            id: type,
            name: type.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
            category: 'generator',
            icon: type.toLowerCase().includes('water') ? '💧' : type.toLowerCase().includes('lava') ? '🌋' : '⚙️',
            output_type: data?.resourceType || '',
            initial_rate: (data?.outputRate ? Number(data.outputRate) : 1).toString(),
        } as ExtendedTemplate;
    }

    const template = { ...finalTemplate! };
    if (!template.output_type && template.resource_type) {
        template.output_type = template.resource_type as string;
    }

    const outputString = typeof template.output_type === 'string'
        ? template.output_type
        : Array.isArray(template.output_type)
            ? (template.output_type as any[]).join(',')
            : String(template.output_type || '');

    const outputs = outputString.split(',').filter(Boolean).map((o: string) => o.trim());

    const nodeStyles = useMemo(() => ({
        '--node-accent': '#3b82f6',
    } as React.CSSProperties), []);

    if (!showDetail) {
        return (
            <div className="glass-node" style={{ ...nodeStyles, width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: '32px' }}>{(template as any).icon || '⚙️'}</div>
                {outputs.map((output: string, i: number) => (
                    <Handle
                        key={output}
                        type="source"
                        position={Position.Right}
                        id={output}
                        style={{
                            right: '-4px',
                            top: outputs.length === 1 ? '32px' : `${(i + 1) * (64 / (outputs.length + 1))}px`,
                            background: RESOURCE_REGISTRY[output as ResourceType]?.color || '#10b981',
                            width: '8px',
                            height: '8px',
                            border: '1.5px solid #0d1122'
                        }}
                    />
                ))}
            </div>
        );
    }

    return (
        <div className="glass-node" style={{ ...nodeStyles, minWidth: '240px', padding: '16px', opacity: isOff ? 0.8 : 1 }}>
            {/* Debug Info */}
            {data?.debugInfo && (
                <div style={{ position: 'absolute', top: '-20px', left: '0', fontSize: '8px', color: '#60a5fa', background: 'rgba(15,23,42,0.8)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(96,165,250,0.2)' }}>
                    SIM: {data.debugInfo}
                </div>
            )}

            {/* Header */}
            <div className="node-header">
                <div className="node-icon-ring" style={{ background: `linear-gradient(135deg, rgba(234, 179, 8, 0.2), transparent)` }}>
                    {(template as any).icon || '⚙️'}
                </div>
                <div className="node-title-group">
                    <div className="node-title">{(template as any).name || 'Generator'}</div>
                    <div className="node-level">Level {level || 0} Extraction</div>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                    <div className="status-indicator">
                        <div className={`status-dot ${isOff ? 'off' : 'on'}`}></div>
                        <div className="status-text" style={{ color: isOff ? '#f87171' : '#34d399' }}>{isOff ? 'Disabled' : 'Active'}</div>
                    </div>
                </div>
            </div>

            {/* Total Yield */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '8px' }}>
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>TOTAL OUTPUT</span>
                <span style={{ fontSize: '14px', fontWeight: '800', color: '#34d399' }}>
                    <span ref={yieldRef}>0</span> <small style={{ fontSize: '10px' }}>unit/s</small>
                </span>
            </div>

            {/* Output Resources */}
            <div className="resource-section-title">Generation</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {outputs.map((output) => {
                    const meta = RESOURCE_REGISTRY[output as ResourceType] || { icon: '❓', label: output, color: '#3b82f6' };
                    return (
                        <div key={output} className="resource-card" style={{ borderRight: `2px solid ${meta.color}` }}>
                            <Handle
                                type="source"
                                id={output}
                                position={Position.Right}
                                style={{ right: '-20px', background: meta.color, width: '10px', height: '10px', border: '2px solid #0d1122' }}
                            />
                            <div className="resource-info">
                                <div className="resource-name">{meta.icon} {meta.label}</div>
                                <div ref={el => { if (el) outputRateRefs.current[output] = el; }} style={{ fontSize: '10px', color: '#34d399', fontWeight: '700' }}>0/s</div>
                            </div>
                            <div className="buffer-container">
                                <div ref={el => { if (el) outputFillRefs.current[output] = el; }} className="buffer-fill" style={{ width: '0%', backgroundColor: meta.color, boxShadow: `0 0 10px ${meta.color}66` }} />
                            </div>
                            <div className="buffer-label">
                                <span>INTERNAL BUFFER</span>
                                <span ref={el => { if (el) outputBufferRefs.current[output] = el; }}>0</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <button
                    onClick={(e) => {
                        if (isViewOnly) return;
                        e.stopPropagation();
                        if (window.confirm('Flush generator buffers?')) {
                            useStore.getState().flushNode(id);
                        }
                    }}
                    style={{ flex: 1, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#f87171', padding: '8px', borderRadius: '6px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                    FLUSH
                </button>
                <button
                    onClick={(e) => {
                        if (isViewOnly) return;
                        e.stopPropagation();
                        useStore.getState().toggleNodePower(id);
                    }}
                    style={{ flex: 1, background: isOff ? 'rgba(52, 211, 153, 0.1)' : 'rgba(239, 68, 68, 0.1)', border: isOff ? '1px solid rgba(52, 211, 153, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)', color: isOff ? '#34d399' : '#f87171', padding: '8px', borderRadius: '6px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                    {isOff ? 'ENABLE' : 'DISABLE'}
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
                Upgrade to Level {level + 1}
            </button>
        </div>
    );
});
NodeUpgradeSection.displayName = 'NodeUpgradeSection';
export const GeneratorNode = memo(GeneratorNodeComponent);

