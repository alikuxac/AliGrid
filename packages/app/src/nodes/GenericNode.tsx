import React, { useRef, useMemo, useEffect, memo } from 'react';
import { Handle, Position, NodeProps, useViewport } from 'reactflow';
import { NodeData } from '../store/types';
import { useStore } from '../store';
import { RESOURCE_REGISTRY, Decimal, getUpgradeCost, ResourceType } from '@aligrid/engine';
import { safeDecimal } from '../store/slices/tick/helpers';
import { formatNumber } from '../utils/formatter';

const GenericNodeComponent = ({ id, data, selected }: NodeProps<NodeData>) => {
    const template = data?.template;
    if (!template) return null;

    // Refs for real-time updates without re-renders
    const inputBufferRefs = useRef<Record<string, HTMLSpanElement>>({});
    const inputFillRefs = useRef<Record<string, HTMLDivElement>>({});
    const outputBufferRefs = useRef<Record<string, HTMLSpanElement>>({});
    const outputFillRefs = useRef<Record<string, HTMLDivElement>>({});
    const efficiencyRef = useRef<HTMLSpanElement>(null);
    const efficiencyFillRef = useRef<HTMLDivElement>(null);

    // Subscribe to state updates for real-time metrics WITHOUT re-rendering the component
    useEffect(() => {
        const unsubscribe = useStore.subscribe(
            state => state.nodeStats?.[id], // Defensive check for nodeStats
            (nodeState) => {
                if (!nodeState) return;

                try {
                    // Update efficiency
                    const eff = safeDecimal(nodeState.efficiency || 0);
                    if (efficiencyRef.current) {
                        efficiencyRef.current.innerText = `${(eff.toNumber() * 100).toFixed(1)}%`;
                        efficiencyRef.current.style.color = eff.gt(0.9) ? '#34d399' : eff.gt(0.5) ? '#fbbf24' : '#f87171';
                    }
                    if (efficiencyFillRef.current) {
                        efficiencyFillRef.current.style.width = `${Math.min(100, eff.toNumber() * 100)}%`;
                    }

                    // Update Input Buffers & Rates
                    if (nodeState.inputBuffer) {
                        Object.entries(nodeState.inputBuffer).forEach(([res, amt]) => {
                            const el = inputBufferRefs.current[res];
                            const fillEl = inputFillRefs.current[res];
                            if (el) {
                                const currentText = el.innerText || '';
                                const maxPart = currentText.includes('/') ? currentText.split('/')[1] : null;
                                const rateEl = el.parentElement?.querySelector('.receiving-rate');
                                const rateVal = safeDecimal(nodeState.inputRates?.[res] || 0);

                                const amtDec = safeDecimal(amt);
                                el.innerText = maxPart ? `${formatNumber(amtDec)}/${maxPart}` : formatNumber(amtDec);

                                if (fillEl && maxPart) {
                                    const maxVal = parseFloat(maxPart.replace(/[^0-9.]/g, ''));
                                    if (!isNaN(maxVal) && maxVal > 0) {
                                        fillEl.style.width = `${Math.min(100, (amtDec.toNumber() / maxVal) * 100)}%`;
                                    }
                                }

                                if (rateEl) {
                                    (rateEl as HTMLElement).innerText = rateVal.gt(0) ? `+${formatNumber(rateVal)}/s` : '';
                                }
                            }
                        });
                    }

                    // Update Output Buffers & Rates
                    if (nodeState.outputBuffer) {
                        Object.entries(nodeState.outputBuffer).forEach(([res, amt]) => {
                            const el = outputBufferRefs.current[res];
                            const fillEl = outputFillRefs.current[res];
                            if (el) {
                                const amtDec = safeDecimal(amt);
                                el.innerText = formatNumber(amtDec);

                                const rateEl = el.parentElement?.querySelector('.sending-rate');
                                const rateVal = safeDecimal(nodeState.handleFlows?.[res] || 0);

                                if (rateEl) {
                                    (rateEl as HTMLElement).innerText = rateVal.gt(0) ? `${formatNumber(rateVal)}/s` : '';
                                }
                            }
                        });
                    }
                } catch (err) {
                    // Silently fail if refs are missing during unmount or weird state
                }
            }
        );
        return unsubscribe;
    }, [id]);

    // Use primitives for stable selectors
    const level = useStore(state => state.nodes.find(n => n.id === id)?.data?.level ?? 0);
    const isOff = useStore(state => state.nodes.find(n => n.id === id)?.data?.isOff ?? false);
    const activeRecipeIndex = useStore(state => state.nodes.find(n => n.id === id)?.data?.activeRecipeIndex ?? 0);
    const itemRegistry = useStore((state) => state.itemRegistry);

    const isViewOnly = useStore(state => state.isViewOnly);
    const compactMode = useStore(state => state.settings.compactMode);
    const { zoom } = useViewport();
    const showDetail = zoom > 0.6 && !compactMode;

    const nodeState = useStore.getState().nodes.find(n => n.id === id)?.data;
    const powerCons = useMemo(() => {
        const val = nodeState?.powerConsumption ?? template?.power_demand ?? template?.base_power_demand ?? 0;
        return safeDecimal(val);
    }, [nodeState?.powerConsumption, template]);

    const activeRecipe = useMemo(() => {
        if (!data?.recipes) return data?.recipe;
        return data.recipes[activeRecipeIndex || 0];
    }, [data?.recipes, activeRecipeIndex, data?.recipe]);

    const visualInputs = useMemo(() => {
        const inputs: any[] = [];
        if (activeRecipe) {
            const recipe = activeRecipe as any;
            const inTypes = typeof (recipe.inputType || recipe.input_type || '') === 'string'
                ? (recipe.inputType || recipe.input_type || '').split(',').map((t: string) => t.trim())
                : [];

            const inAmts = typeof (recipe.inputAmount || '') === 'string'
                ? (recipe.inputAmount || '').split(',').map((t: string) => t.trim())
                : inTypes.map(() => '1');

            inTypes.forEach((type: string, idx: number) => {
                if (!type) return;
                const item = itemRegistry[type];
                const res = RESOURCE_REGISTRY[type as ResourceType];
                inputs.push({
                    id: type,
                    name: item?.name || res?.label || type,
                    color: res?.color || '#94a3b8',
                    icon: item?.icon || res?.icon || '📦',
                    amount: inAmts[idx] || '1',
                    usageType: type === 'electricity' ? 'POWER' : (idx === 0 ? 'MATERIAL' : 'FUEL')
                });
            });
        } else if (template.input_type) {
            const types = template.input_type.split(',').map((t: string) => t.trim());
            types.forEach((type, idx) => {
                const item = itemRegistry[type];
                const res = RESOURCE_REGISTRY[type as ResourceType];
                inputs.push({
                    id: type,
                    name: item?.name || res?.label || type,
                    color: res?.color || '#94a3b8',
                    icon: item?.icon || res?.icon || '📦',
                    amount: '1',
                    usageType: type === 'electricity' ? 'POWER' : (idx === 0 ? 'MATERIAL' : 'FUEL')
                });
            });
        }
        return inputs;
    }, [activeRecipe, template, itemRegistry]);

    const outputsToRender = useMemo(() => {
        const outs: any[] = [];
        if (activeRecipe) {
            const recipe = activeRecipe as any;
            const outTypes = typeof (recipe.outputType || recipe.output_type || '') === 'string'
                ? (recipe.outputType || recipe.output_type || '').split(',').map((t: string) => t.trim())
                : [recipe.outputType || recipe.output_type];

            outTypes.forEach((type: string) => {
                if (!type) return;
                const res = RESOURCE_REGISTRY[type as ResourceType];
                outs.push({
                    id: type,
                    name: res?.label || type,
                    color: res?.color || '#34d399',
                    icon: res?.icon || '📦'
                });
            });
        } else if (template.resource_type || template.output_type) {
            const types = (template.resource_type || template.output_type || '').split(',').map((t: string) => t.trim());
            types.forEach((type) => {
                if (!type) return;
                const item = itemRegistry[type];
                const res = RESOURCE_REGISTRY[type as ResourceType];
                outs.push({
                    id: type,
                    name: item?.name || res?.label || type,
                    color: res?.color || '#34d399',
                    icon: item?.icon || res?.icon || '📦'
                });
            });
        }
        return outs;
    }, [activeRecipe, template, itemRegistry]);

    const nodeAccent = template.style_bg || '#3b82f6';
    const nodeStyles = useMemo(() => ({
        '--node-accent': nodeAccent,
        // Added standard border and shadow defaults to avoid React style reconciliation warnings
    } as React.CSSProperties), [nodeAccent]);

    if (!showDetail) {
        return (
            <div className="glass-node" style={{ ...nodeStyles, width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {visualInputs.map((input, i) => (
                    <Handle
                        key={input.id}
                        type="target"
                        position={Position.Left}
                        id={input.id}
                        style={{
                            left: '-4px',
                            top: visualInputs.length === 1 ? '32px' : `${(i + 1) * (64 / (visualInputs.length + 1))}px`,
                            background: input.color,
                            width: '8px',
                            height: '8px',
                            border: '1.5px solid #0d1122'
                        }}
                    />
                ))}
                <div style={{ fontSize: '32px' }}>{template.icon || '⚙️'}</div>
                {outputsToRender.map((out, i) => (
                    <Handle
                        key={out.id}
                        type="source"
                        position={Position.Right}
                        id={out.id}
                        style={{
                            right: '-4px',
                            top: outputsToRender.length === 1 ? '32px' : `${(i + 1) * (64 / (outputsToRender.length + 1))}px`,
                            background: out.color,
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
            {/* Header */}
            <div className="node-header">
                <div className="node-icon-ring" style={{ background: `linear-gradient(135deg, ${template.style_bg || '#3b82f6'}33, transparent)` }}>
                    {template.icon || '⚙️'}
                </div>
                <div className="node-title-group">
                    <div className="node-title">{template.name}</div>
                    <div className="node-level">Level {level}</div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                    <div className="status-indicator">
                        <div className={`status-dot ${isOff ? 'off' : 'on'}`}></div>
                        <div className="status-text" style={{ color: isOff ? '#f87171' : '#34d399' }}>{isOff ? 'Disabled' : 'Active'}</div>
                    </div>
                </div>
            </div>

            {/* Efficiency */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '4px' }}>
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>EFFICIENCY</span>
                <span ref={efficiencyRef} style={{ fontSize: '12px', fontWeight: '800', fontFamily: 'JetBrains Mono' }}>0.0%</span>
            </div>
            <div className="efficiency-bar">
                <div ref={efficiencyFillRef} className="efficiency-fill" style={{ width: '0%' }}></div>
            </div>

            {/* Inputs Section */}
            {visualInputs.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                    <div className="resource-section-title">Inputs</div>
                    {(() => {
                        const multiplierVal = Math.pow(2, level);
                        const baseMaxBuf = safeDecimal(data?.maxBuffer || template?.maxBuffer || 5000).times(multiplierVal);

                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {visualInputs.map((input) => {
                                    const res = input.id;
                                    const resColor = input.color;
                                    const amt = Number(useStore.getState().nodeStats[id]?.inputBuffer?.[res] || 0);

                                    const reqBase = input.usageType === 'POWER' ? powerCons.times(Number(data?.boost || 1)) : safeDecimal(input.amount || 1);
                                    const reqCycle = reqBase.times(multiplierVal);
                                    const displayMaxBuf = baseMaxBuf.gt(reqCycle.times(10)) ? baseMaxBuf : reqCycle.times(10);

                                    return (
                                        <div key={res} className="resource-card" style={{ borderLeft: `2px solid ${resColor}` }}>
                                            <Handle
                                                type="target"
                                                id={res}
                                                position={Position.Left}
                                                style={{ left: '-20px', background: resColor, width: '10px', height: '10px', border: '2px solid #0d1122' }}
                                            />
                                            <div className="resource-info">
                                                <div className="resource-name">{input.icon} {input.name}</div>
                                                <div className="receiving-rate resource-rate"></div>
                                            </div>
                                            <div className="buffer-container">
                                                <div
                                                    ref={el => { if (el) inputFillRefs.current[res] = el; }}
                                                    className="buffer-fill"
                                                    style={{ width: '0%', backgroundColor: resColor, boxShadow: `0 0 10px ${resColor}66` }}
                                                ></div>
                                            </div>
                                            <div className="buffer-label">
                                                <span>{input.usageType}</span>
                                                <span ref={el => { if (el) inputBufferRefs.current[res] = el; }}>
                                                    {formatNumber(amt)}/{formatNumber(displayMaxBuf)}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* Outputs Section */}
            {outputsToRender.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                    <div className="resource-section-title">Outputs</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {outputsToRender.map((out) => {
                            const res = out.id;
                            const resColor = out.color;
                            const bufferAmt = Number(useStore.getState().nodeStats[id]?.outputBuffer?.[res] || 0);

                            return (
                                <div key={res} className="resource-card" style={{ borderRight: `2px solid ${resColor}` }}>
                                    <Handle
                                        type="source"
                                        id={res}
                                        position={Position.Right}
                                        style={{ right: '-20px', background: resColor, width: '10px', height: '10px', border: '2px solid #0d1122' }}
                                    />
                                    <div className="resource-info">
                                        <div className="resource-name">{out.icon} {out.name}</div>
                                        <div className="sending-rate resource-rate" style={{ color: '#34d399' }}></div>
                                    </div>
                                    <div className="buffer-container">
                                        <div
                                            ref={el => { if (el) outputFillRefs.current[res] = el; }}
                                            className="buffer-fill"
                                            style={{ width: '0%', backgroundColor: resColor, boxShadow: `0 0 10px ${resColor}66` }}
                                        ></div>
                                    </div>
                                    <div className="buffer-label">
                                        <span>BUFFER</span>
                                        <span ref={el => { if (el) outputBufferRefs.current[res] = el; }}>
                                            {formatNumber(bufferAmt)}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

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
                    style={{
                        flex: 1,
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        color: '#f87171',
                        padding: '8px',
                        borderRadius: '6px',
                        fontSize: '9px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        textTransform: 'uppercase'
                    }}
                >
                    Flush
                </button>
                <button
                    onClick={(e) => {
                        if (isViewOnly) return;
                        e.stopPropagation();
                        useStore.getState().toggleNodePower(id);
                    }}
                    style={{
                        flex: 1,
                        background: isOff ? 'rgba(52, 211, 153, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        border: isOff ? '1px solid rgba(52, 211, 153, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
                        color: isOff ? '#34d399' : '#f87171',
                        padding: '8px',
                        borderRadius: '6px',
                        fontSize: '9px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        textTransform: 'uppercase'
                    }}
                >
                    {isOff ? 'Enable' : 'Disable'}
                </button>
            </div>

            {/* Upgrade Section */}
            <NodeUpgradeSection
                id={id}
                templateId={template.id}
                level={level}
                isViewOnly={!!isViewOnly}
            />
        </div>
    );
};

// --- Sub-components for isolated renders ---

const NodeUpgradeSection = memo(({ id, templateId, level, isViewOnly }: { id: string; templateId: string; level: number; isViewOnly: boolean }) => {
    const cost = useMemo(() => getUpgradeCost(templateId, level), [templateId, level]);
    const cloudStorage = useStore(state => state.cloudStorage);

    if (Object.keys(cost).length === 0) return null;

    return (
        <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: '9px', color: '#64748b', marginBottom: '4px' }}>Cost to Upgrade:</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                {Object.entries(cost).map(([res, amt]) => {
                    const meta = RESOURCE_REGISTRY[res as ResourceType] || { icon: '❓', label: res };
                    const curVal = safeDecimal(cloudStorage[res as ResourceType] || 0);
                    const isAffordable = curVal.gte(amt as Decimal);
                    return (
                        <div key={res} style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '9px', color: isAffordable ? '#34d399' : '#f87171' }}>
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
                    width: '100%', background: '#3b82f6', border: 'none', color: 'white',
                    borderRadius: '6px', padding: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
            >
                UPGRADE
            </button>
        </div>
    );
});
NodeUpgradeSection.displayName = 'NodeUpgradeSection';

export const GenericNode = memo(GenericNodeComponent, (prev, next) => {
    return prev.id === next.id && prev.selected === next.selected;
});

