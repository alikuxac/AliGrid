import React, { memo } from 'react';
import { Handle, Position, useEdges } from 'reactflow';
import { NodeTemplate } from '@aligrid/schema';
import { RESOURCE_REGISTRY, NODE_COSTS, Decimal, getUpgradeCost } from '@aligrid/engine';

import { useStore } from '../store';
import { formatNumber } from '../utils/formatter';
import { NodeHeaderMenu } from '../components/NodeHeaderMenu';
import { RESOURCE_STATES } from '../store/constants';

import type { NodeData, RecipeConfig, FlowEdgeData } from '../store/types';

interface ExtendedTemplate extends NodeTemplate {
    maxBuffer?: string | number;
    resource_type?: string | null;
    radius?: number | null;
    recipes?: RecipeConfig[];
}

export interface GenericNodeProps {
    id: string;
    type: string;
    data: NodeData;
    selected?: boolean;
}

export const GenericNode: React.FC<GenericNodeProps> = React.memo(({ id, type, data, selected }) => {
    // ═══ Selective Selectors (Optimization: Only re-render when needed) ═══
    const stats = useStore((state) => state.nodeStats[id]);
    const cloudStorage = useStore((state) => state.cloudStorage);
    const isViewOnly = useStore((state) => state.isViewOnly);
    const nodeTemplates = useStore((state) => state.nodeTemplates) || [];

    // ═══ Memoized Data ═══
    const template = React.useMemo(() => {
        const originalTemplate = nodeTemplates.find((t) => t.id === type) as ExtendedTemplate | undefined || data?.template as ExtendedTemplate | undefined;

        if (originalTemplate) {
            const t = { ...originalTemplate };
            if (t.category === 'generator' && !t.output_type && t.resource_type) {
                t.output_type = t.resource_type;
            }
            return t;
        }

        // Fallback for legacy static nodes
        const isProcessor = (data?.recipe || data?.recipes) ? true : false;
        const isGenerator = type.toLowerCase().includes('generator') || type.toLowerCase().includes('pump');

        return {
            id: type,
            name: type.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
            category: isProcessor ? 'processor' : isGenerator ? 'generator' : 'logistics',
            icon: type.toLowerCase().includes('water') ? '💧' : type.toLowerCase().includes('lava') ? '🌋' : '⚙️',
            input_type: data?.recipe?.inputType || '',
            output_type: data?.recipe?.outputType || data?.resourceType || '',
            initial_rate: (data?.outputRate ? Number(data.outputRate) : 1).toString(),
        } as ExtendedTemplate;
    }, [type, data?.template, data?.recipe, data?.recipes, data?.resourceType, data?.outputRate, nodeTemplates]);

    const level = data?.level || 0;
    const cost = React.useMemo(() => getUpgradeCost(type, level), [type, level]);

    const recipes = data?.recipes || template.recipes;
    const isProcessor = template.category === 'processor';

    const { inputs, outputs } = React.useMemo(() => {
        let ins = (template.input_type || '').split(',').filter(Boolean).map((i: string) => i.trim());
        let outs = (template.output_type || '').split(',').filter(Boolean).map((o: string) => o.trim());

        if (isProcessor && recipes && Array.isArray(recipes) && recipes.length > 0) {
            const allIns = new Set<string>();
            const allOuts = new Set<string>();
            recipes.forEach((r: any) => {
                const rtIn = typeof (r.inputType || r.input_type) === 'string' ? (r.inputType || r.input_type).split(',') : [];
                const rtOut = typeof (r.outputType || r.output_type) === 'string' ? (r.outputType || r.output_type).split(',') : [];
                rtIn.forEach((t: string) => { if (t) allIns.add(t.trim()) });
                rtOut.forEach((t: string) => { if (t) allOuts.add(t.trim()) });
            });
            if (allIns.size > 0) ins = Array.from(allIns);
            if (allOuts.size > 0) outs = Array.from(allOuts);
        }
        return { inputs: ins, outputs: outs };
    }, [template.input_type, template.output_type, isProcessor, recipes]);

    const activeIdx = data?.activeRecipeIndex || 0;
    const activeRecipe = React.useMemo(() => (recipes && Array.isArray(recipes)) ? recipes[activeIdx] : undefined, [recipes, activeIdx]);

    const outputsToRender = React.useMemo(() => {
        if (isProcessor && recipes && Array.isArray(recipes) && recipes.length > 1) {
            return activeRecipe?.outputType ? activeRecipe.outputType.split(',').map(o => o.trim()) : [];
        }
        return outputs;
    }, [isProcessor, recipes, activeRecipe?.outputType, outputs]);

    const hasMultipleRecipes = isProcessor && recipes && Array.isArray(recipes) && recipes.length > 1;
    const powerCons = React.useMemo(() => data?.powerConsumption ? (typeof data.powerConsumption === 'object' ? data.powerConsumption : new Decimal(data.powerConsumption)) : new Decimal(0), [data?.powerConsumption]);

    const formatInputRate = (input: string) => {
        if (input === 'electricity') {
            const eff = typeof (stats?.efficiency || data?.efficiency) === 'object' ? (stats?.efficiency || data?.efficiency) : new Decimal((stats?.efficiency || data?.efficiency) ?? 1);
            return formatNumber(powerCons.times(eff as Decimal));
        }
        return formatNumber(stats?.actualInputPerSec || data?.actualInputPerSec || 0);
    };

    const borderColor = (stats?.isOff || data?.isOff) ? '#f87171' : '#10b981';
    const headerColor = template.style_header || 'rgba(255, 255, 255, 0.04)';

    const needsInput = template.category === 'processor' || template.category === 'storage' || template.category === 'logistics' || template.category === 'power';
    const needsOutput = (template.category === 'processor' || template.category === 'generator' || template.category === 'storage' || template.category === 'logistics' || template.category === 'power') && template.id !== 'sink';

    return (
        <div style={{
            background: '#161b2e',
            border: `1px solid ${borderColor}cc`,
            borderRadius: '6px',
            minWidth: '220px',
            color: '#e2e8f0',
            fontFamily: 'monospace',
            overflow: 'visible',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4)',
            position: 'relative',
            // ═══ Hardware Acceleration ═══
            willChange: 'transform',
            transform: 'translate3d(0,0,0)'
        }}>
            {/* Header */}
            <div style={{
                background: headerColor,
                padding: '6px 10px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '6px',
                fontSize: '11px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '13px' }}>{template.icon || '⚙️'}</span>
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
                            useStore.getState().toggleNodePower(id);
                        }}
                        style={{
                            background: (stats?.isOff || data?.isOff) ? '#f87171' : '#059669',
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
                            boxShadow: (stats?.isOff || data?.isOff) ? 'none' : '0 0 5px rgba(16, 185, 129, 0.4)'
                        }}
                    >
                        <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#f8fafc' }} />
                        <span>{(stats?.isOff || data?.isOff) ? 'OFF' : 'ON'}</span>
                    </button>
                    <NodeHeaderMenu nodeId={id} />
                </div>
            </div>

            {/* Body */}
            <div style={{ padding: '10px', fontSize: '10px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {template.category === 'generator' && (
                    <div>
                        <span>Yield: </span>
                        <b style={{ color: '#34d399' }}>
                            {formatNumber(stats?.outputRate ?? data?.outputRate ?? String(template.initial_rate || 0))}
                            {Number(stats?.boost ?? data?.boost ?? 1) > 1 && (
                                <span style={{ color: '#fb923c' }}> + {formatNumber(new Decimal(stats?.outputRate || data?.outputRate || template.initial_rate || 0).times(Number(stats?.boost || data?.boost || 1) - 1))}</span>
                            )}
                            /s
                        </b>
                    </div>
                )}

                {template.id === 'accumulator' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                            <span>Stored Energy:</span>
                            <b style={{ color: '#10b981' }}>{formatNumber(stats?.buffer || data?.buffer || 0)} / {formatNumber(stats?.maxBuffer || data?.maxBuffer || template.maxBuffer || 5000)}</b>
                        </div>
                        <div style={{ height: '8px', background: '#334155', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{
                                height: '100%',
                                background: '#10b981',
                                width: `${(() => {
                                    try {
                                        const b = new Decimal((stats?.buffer ?? data?.buffer ?? 0) as any);
                                        const mb = new Decimal((stats?.maxBuffer ?? data?.maxBuffer ?? template?.maxBuffer ?? 5000) as any);
                                        if (mb.toNumber() === 0) return 0;
                                        return Math.min(100, b.div(mb).times(100).toNumber());
                                    } catch { return 0; }
                                })()}%`,
                                transition: 'width 0.2s'
                            }} />
                        </div>
                    </div>
                )}

                {/* ⚡ Power Info */}
                {powerCons.gt(0) && (
                    <div style={{ padding: '4px 8px', background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '4px', fontSize: '9px', color: '#f59e0b', display: 'flex', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>⚡</span>
                            <span>Power Demand</span>
                        </div>
                        <b style={{ color: '#fef08a' }}>{formatInputRate('electricity')} / {formatNumber(powerCons.times(stats?.boost || data?.boost || 1))} W/s</b>
                    </div>
                )}

                {/* Amplifier Boosting Info */}
                {type === 'amplifier' && (
                    <div style={{ padding: '4px 8px', background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '4px', fontSize: '9px', color: '#38bdf8', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Boosting Machines:</span>
                        <b style={{ color: '#7dd3fc' }}>{stats?.boostedCount || data?.boostedCount || 0}</b>
                    </div>
                )}

                {/* Inputs */}
                {inputs.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#94a3b8', fontSize: '9px', marginBottom: '4px' }}>
                            <span>INPUTS:</span>
                            {recipes && Array.isArray(recipes) && recipes.length > 0 && (
                                <span
                                    title={recipes.map(r => `${RESOURCE_REGISTRY[r.inputType as string]?.icon || r.inputType} ➔ ${RESOURCE_REGISTRY[r.outputType as string]?.icon || r.outputType} (x${(typeof r.conversionRate === 'object' ? r.conversionRate.toNumber() : Number(r.conversionRate)).toFixed(2)})`).join('\n')}
                                    style={{ cursor: 'help', background: 'rgba(255,255,255,0.1)', padding: '1px 3px', borderRadius: '3px', fontSize: '8px', color: '#38bdf8' }}
                                >
                                    📋 Info
                                </span>
                            )}
                        </div>
                        {(() => {
                            const allInputTypes = activeRecipe?.inputType
                                ? String(activeRecipe.inputType).split(',').map(s => s.trim())
                                : [];

                            const FUEL_RESOURCES = ['coal', 'wood_log', 'leaf', 'lava'];

                            return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {[
                                        { id: 'input', label: 'Material Intake', color: '#3b82f6', isFuel: false },
                                        { id: 'fuel', label: 'Fuel Chamber', color: '#f97316', isFuel: true }
                                    ].map(h => {
                                        const totalFlow = Number(stats?.handleFlows?.[h.id] || 0);
                                        const relevantResources = allInputTypes.filter(res => {
                                            const resourceIsFuel = FUEL_RESOURCES.includes(res);
                                            return h.isFuel ? resourceIsFuel : !resourceIsFuel;
                                        });

                                        if (h.isFuel && relevantResources.length === 0) return null;
                                        if (!h.isFuel && relevantResources.length === 0 && allInputTypes.length > 0) return null;

                                        return (
                                            <div key={h.id} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '4px', padding: '6px 8px', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '4px', borderLeft: `3px solid ${h.color}` }}>
                                                <Handle
                                                    type="target"
                                                    id={h.id}
                                                    position={Position.Left}
                                                    style={{ left: '-18px', background: h.color, width: '8px', height: '8px', border: '1.5px solid #0a0f1d' }}
                                                />
                                                <div style={{ fontSize: '10px', fontWeight: 'bold', color: h.color, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between' }}>
                                                    <span>{h.label}</span>
                                                    <span style={{ fontSize: '8px', opacity: 0.8 }}>{formatNumber(totalFlow)}/s</span>
                                                </div>

                                                {relevantResources.length > 0 ? relevantResources.map(res => {
                                                    const amt = Number(stats?.inputBuffer?.[res] || data?.inputBuffer?.[res] || 0);
                                                    const resMeta = RESOURCE_REGISTRY[res];
                                                    const convRate = new Decimal(activeRecipe?.conversionRate || 1);
                                                    const req = (convRate.lt(1) ? new Decimal(1).dividedBy(convRate).round() : new Decimal(1)).times(Math.pow(2, level));

                                                    return (
                                                        <div key={res} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#cbd5e1' }}>
                                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <span style={{ fontSize: '12px' }}>{resMeta?.icon || '📦'}</span>
                                                                <span style={{ textTransform: 'capitalize' }}>{res.replace('_', ' ')}:</span>
                                                            </span>
                                                            <b style={{ color: amt >= req.toNumber() ? '#34d399' : '#94a3b8' }}>
                                                                {formatNumber(amt)}/{formatNumber(req)}
                                                            </b>
                                                        </div>
                                                    );
                                                }) : (
                                                    <div style={{ fontSize: '9px', color: '#64748b', fontStyle: 'italic' }}>No requirement in recipe</div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })()}
                    </div>
                )}

                {/* Outputs */}
                {(template.category === 'processor' || template.category === 'generator') && (outputsToRender.length > 0 || template.category === 'generator') && (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '5px',
                        borderTop: '1px solid rgba(255,255,255,0.05)',
                        paddingTop: '5px',
                        opacity: (stats?.actualOutputPerSec || data?.actualOutputPerSec && new Decimal((stats?.actualOutputPerSec || data.actualOutputPerSec)).gt(0)) ? 1 : 0.4,
                        transition: 'opacity 0.2s'
                    }}>
                        <div style={{ color: '#94a3b8', fontSize: '9px', marginBottom: '2px' }}>OUTPUTS:</div>
                        {outputsToRender.map((output: string) => (
                            <div key={output} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', height: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '12px' }}>{RESOURCE_REGISTRY[output]?.icon || '❓'}</span>
                                    <span style={{ textTransform: 'capitalize' }}>{output}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ fontSize: '9px', color: '#34d399' }}>
                                        {formatNumber(stats?.actualOutputPerSec || data?.actualOutputPerSec || 0)}/s
                                        {stats?.outputBuffer?.[output] && new Decimal(stats.outputBuffer[output] as any).gt(0.01) && (
                                            <span style={{ color: '#fb923c', marginLeft: '4px' }} title="Internal Buffer">
                                                ({formatNumber(new Decimal(stats.outputBuffer[output] as any))})
                                            </span>
                                        )}
                                    </span>
                                    <Handle
                                        type="source"
                                        id={output}
                                        position={Position.Right}
                                        style={{ right: '-14px', background: '#10b981', width: '8px', height: '8px', border: '1.5px solid #0a0f1d' }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* 🔖 Active Recipe Info */}
                {hasMultipleRecipes && activeRecipe && (
                    <div style={{
                        marginTop: '5px',
                        padding: '4px 6px',
                        background: 'rgba(15, 23, 42, 0.4)',
                        borderRadius: '4px',
                        border: '1px solid rgba(148, 163, 184, 0.1)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px'
                    }}>
                        <div style={{ fontSize: '8px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active Recipe</div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ fontSize: '11px' }}>{RESOURCE_REGISTRY[activeRecipe.outputType]?.icon || '❓'}</span>
                                <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#f1f5f9', textTransform: 'capitalize' }}>{activeRecipe.outputType}</span>
                            </div>
                            <span style={{ fontSize: '9px', color: '#38bdf8' }}>
                                Ratio: 1:{activeRecipe.conversionRate?.toString()}
                            </span>
                        </div>
                        <div style={{ fontSize: '8px', color: '#94a3b8', fontStyle: 'italic' }}>
                            Needs: {activeRecipe.inputType.replace(/,/g, ' + ')}
                        </div>
                    </div>
                )}

                {(stats?.efficiency !== undefined || data?.efficiency !== undefined) && type !== 'waterGenerator' && type !== 'lavaPump' && (
                    <div style={{ marginTop: '4px', color: '#94a3b8' }}>
                        Eff: {(() => {
                            try {
                                return (new Decimal((stats?.efficiency ?? data?.efficiency ?? 1) as any).times(100)).toFixed(0);
                            } catch { return "100"; }
                        })()}%
                    </div>
                )}

                {/* Upgrade Button */}
                {Object.keys(cost).length > 0 && (
                    <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
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
                                width: '100%', background: '#2563eb', border: 'none', color: 'white',
                                borderRadius: '4px', padding: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer',
                                transition: 'background 0.2s'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.background = '#1d4ed8'}
                            onMouseOut={(e) => e.currentTarget.style.background = '#2563eb'}
                        >
                            Upgrade
                        </button>
                    </div>
                )}
            </div>

            {/* Default Catch-all Handles */}
            {template.category !== 'processor' && needsInput && (
                <Handle
                    type="target"
                    position={Position.Left}
                    id="target"
                    style={{ background: '#3b82f6', width: '8px', height: '8px', border: '1.5px solid #0a0f1d' }}
                />
            )}

            {template.category !== 'processor' && template.category !== 'generator' && needsOutput && (
                <Handle
                    type="source"
                    position={Position.Right}
                    id="source"
                    style={{ background: '#10b981', width: '8px', height: '8px', border: '1.5px solid #0a0f1d' }}
                />
            )}
            {/* Radius Overlay */}
            {selected && template && template.radius && (
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: `${(Number(template.radius || 0) * (1 + level * 0.2)) * 2}px`,
                    height: `${(Number(template.radius || 0) * (1 + level * 0.2)) * 2}px`,
                    borderRadius: '50%',
                    border: '2px dashed #facc15',
                    background: 'rgba(250, 204, 21, 0.03)',
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'none',
                    zIndex: -1,
                    boxShadow: '0 0 10px rgba(250, 204, 21, 0.1)'
                }} />
            )}
        </div>
    );
});
