import React from 'react';
import { Handle, Position, useEdges } from 'reactflow';
import { NodeTemplate } from '@aligrid/schema';
import { RESOURCE_REGISTRY, NODE_COSTS, Decimal, getUpgradeCost } from '@aligrid/engine';

import { useStore } from '../store';
import { formatNumber } from '../utils/formatter';
import { NodeHeaderMenu } from '../components/NodeHeaderMenu';

import type { NodeData, RecipeConfig, FlowEdgeData } from '../store/types';

interface ExtendedTemplate extends NodeTemplate {
    maxBuffer?: string | number;
    resource_type?: string | null;
    radius?: number | string;
    recipes?: RecipeConfig[];
}

export interface GenericNodeProps {
    id: string;
    type: string;
    data: NodeData;
    selected?: boolean;
}

export const GenericNode: React.FC<GenericNodeProps> = ({ id, type, data, selected }) => {
    const cloudStorage = useStore((state) => state.cloudStorage);
    const isViewOnly = useStore((state) => state.isViewOnly);
    const allEdges = useEdges();
    const nodeTemplates = useStore((state) => state.nodeTemplates) || [];
    const nodes = useStore((state) => state.nodes) || [];
    const originalTemplate = data?.template as ExtendedTemplate | undefined || nodeTemplates.find((t) => t.id === type) as ExtendedTemplate | undefined;

    const level = data?.level || 0;
    const tier = data?.tier || 0;

    // Calculate cost based on levels
    const cost = getUpgradeCost(type, level);

    let finalTemplate = originalTemplate;
    if (!finalTemplate) {
        // Fallback for legacy static nodes to avoid rendering crashes
        const isProcessor = (data?.recipe || data?.recipes) ? true : false;
        const isGenerator = type.toLowerCase().includes('generator') || type.toLowerCase().includes('pump');

        finalTemplate = {
            id: type,
            name: type.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
            category: isProcessor ? 'processor' : isGenerator ? 'generator' : 'logistics',
            icon: type.toLowerCase().includes('water') ? '💧' : type.toLowerCase().includes('lava') ? '🌋' : '⚙️',
            input_type: data?.recipe?.inputType || '',
            output_type: data?.recipe?.outputType || data?.resourceType || '',
            initial_rate: (data?.outputRate ? Number(data.outputRate) : 1).toString(),
        } as ExtendedTemplate;
    }

    const template = { ...finalTemplate! };
    if (template.category === 'generator' && !template.output_type && template.resource_type) {
        template.output_type = template.resource_type;
    }
    let inputs = (template.input_type || '').split(',').filter(Boolean).map((i: string) => i.trim());
    const recipes = data?.recipes || template.recipes;
    const isProcessor = template.category === 'processor';

    let outputs = (template.output_type || '').split(',').filter(Boolean).map((o: string) => o.trim());

    if (isProcessor && recipes && Array.isArray(recipes) && recipes.length > 0) {
        const allIns = new Set<string>();
        const allOuts = new Set<string>();
        recipes.forEach((r: any) => {
            const rtIn = typeof (r.inputType || r.input_type) === 'string' ? (r.inputType || r.input_type).split(',') : [];
            const rtOut = typeof (r.outputType || r.output_type) === 'string' ? (r.outputType || r.output_type).split(',') : [];
            rtIn.forEach((t: string) => { if (t) allIns.add(t.trim()) });
            rtOut.forEach((t: string) => { if (t) allOuts.add(t.trim()) });
        });
        if (allIns.size > 0) inputs = Array.from(allIns);
        if (allOuts.size > 0) outputs = Array.from(allOuts);
    }

    const activeIdx = data?.activeRecipeIndex || 0;
    const activeRecipe = (recipes && Array.isArray(recipes)) ? recipes[activeIdx] : undefined;

    let outputsToRender = outputs;
    if (isProcessor && recipes && Array.isArray(recipes) && recipes.length > 1) {
        outputsToRender = activeRecipe?.outputType ? activeRecipe.outputType.split(',').map(o => o.trim()) : [];
    }

    let renderedInputs = inputs;
    const isMultiInput = isProcessor && activeRecipe && activeRecipe.inputType.split(',').filter(Boolean).length > 1;

    const hasEdges = allEdges.some(e => e.target === id);

    const powerCons = data?.powerConsumption ? (typeof data.powerConsumption === 'object' ? data.powerConsumption : new Decimal(data.powerConsumption)) : new Decimal(0);



    const formatInputRate = (input: string) => {
        if (input === 'electricity') {
            const eff = typeof data?.efficiency === 'object' ? data.efficiency : new Decimal(data?.efficiency ?? 1);
            return formatNumber(powerCons.times(eff));
        }
        return formatNumber(data?.actualInputPerSec || 0);
    };

    const status = data?.status || 'idle';
    let borderColor = data?.isOff ? '#f87171' : '#10b981'; // red if off, green if on flawless setup.

    const bgColor = template.style_bg || '#111827';
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
            position: 'relative'
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
                            const state = useStore.getState();
                            state.toggleNodePower(id);
                        }}
                        style={{
                            background: data?.isOff ? '#f87171' : '#059669',
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
                            boxShadow: data?.isOff ? 'none' : '0 0 5px rgba(16, 185, 129, 0.4)'
                        }}
                    >
                        <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#f8fafc' }} />
                        <span>{data?.isOff ? 'OFF' : 'ON'}</span>
                    </button>
                    <NodeHeaderMenu nodeId={id} />
                </div>
            </div>

            {/* Body */}
            <div style={{ padding: '10px', fontSize: '10px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {template.category === 'generator' && (
                    <div>
                        <span>Yield: </span>
                        <b style={{ color: '#34d399' }}>{formatNumber(data?.outputRate ?? String(template.initial_rate || 0))}/s</b>
                    </div>
                )}

                {template.id === 'accumulator' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                            <span>Stored Energy:</span>
                            <b style={{ color: '#10b981' }}>{formatNumber(data?.buffer || 0)} / {formatNumber(data?.maxBuffer || template.maxBuffer || 5000)}</b>
                        </div>
                        <div style={{ height: '8px', background: '#334155', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{
                                height: '100%',
                                background: '#10b981',
                                width: `${Math.min(100, (Number(typeof data?.buffer === 'object' ? data.buffer.toNumber() : (data?.buffer || 0)) / Number(data?.maxBuffer || template.maxBuffer || 5000)) * 100)}%`,
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
                        <b style={{ color: '#fef08a' }}>{formatInputRate('electricity')} / {formatNumber(powerCons)} W/s</b>
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
                        {isMultiInput ? (
                            <>
                                {/* Material Intake */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', height: '16px' }}>
                                    <Handle
                                        type="target"
                                        id="input"
                                        position={Position.Left}
                                        style={{ left: '-14px', background: '#3b82f6', width: '8px', height: '8px', border: '1.5px solid #0a0f1d' }}
                                    />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        {(() => {
                                            const currentInEdges = allEdges.filter(e => e.target === id && e.targetHandle === 'input');
                                            const resSet = new Set<string>();
                                            currentInEdges.forEach(e => {
                                                const srcNode = nodes.find((n: any) => n.id === e.source);
                                                const outType = srcNode?.data?.recipe?.outputType || srcNode?.data?.template?.output_type || srcNode?.data?.resourceType;
                                                if (outType) resSet.add(outType);
                                            });

                                            if (resSet.size === 0 && recipes) {
                                                const activeRecipe = recipes[data?.activeRecipeIndex || 0] || recipes[0];
                                                const inTypes = typeof activeRecipe?.inputType === 'string' ? activeRecipe.inputType.split(',').map((t: any) => t.trim()) : [];
                                                inTypes.forEach((t: any) => resSet.add(t));
                                            }
                                            return Array.from(resSet).map((res) => (
                                                <span key={res} title={res} style={{ fontSize: '12px' }}>{RESOURCE_REGISTRY[res]?.icon || '❓'}</span>
                                            ));
                                        })()}
                                        <span style={{ fontSize: '11px', color: '#f1f5f9' }}>Material Intake</span>
                                    </div>
                                    <span style={{ fontSize: '9px', color: '#94a3b8' }}>
                                        {(() => {
                                            const currentInEdges = allEdges.filter(e => e.target === id && e.targetHandle === 'input');
                                            const resSet = new Set<string>();
                                            currentInEdges.forEach(e => {
                                                const srcNode = nodes.find((n: any) => n.id === e.source);
                                                const outType = srcNode?.data?.recipe?.outputType || srcNode?.data?.template?.output_type || srcNode?.data?.resourceType;
                                                if (outType) resSet.add(outType);
                                            });

                                            if (resSet.size === 0 && recipes) {
                                                const activeRecipe = recipes[data?.activeRecipeIndex || 0] || recipes[0];
                                                const inTypes = typeof activeRecipe?.inputType === 'string' ? activeRecipe.inputType.split(',').map((t: any) => t.trim()) : [];
                                                inTypes.forEach((t: any) => resSet.add(t));
                                            }

                                            const resources = Array.from(resSet).filter(k => new Decimal(data?.inputBuffer?.[k] || 0).gt(0));
                                            const activeIdx = data?.activeRecipeIndex || 0;
                                            const activeRecipe = (recipes && Array.isArray(recipes)) ? recipes[activeIdx] : undefined;

                                            const totalFlow = currentInEdges.reduce((s, e) => s + ((e.data as any)?.flow || 0), 0);

                                            // Fallback rate display
                                            if (resources.length === 0) return `${formatNumber(totalFlow)}/s`;

                                            const convRate = new Decimal(activeRecipe?.conversionRate || 1);
                                            const req = (convRate.lt(1) ? new Decimal(1).dividedBy(convRate).round() : new Decimal(1)).times(Math.pow(2, level));

                                            return resources.map(res => {
                                                const amt = data?.inputBuffer?.[res] || 0;
                                                return `${formatNumber(new Decimal(amt).floor())}/${req.toString()}`;
                                            }).join(', ') + ` (${formatNumber(totalFlow)}/s)`;
                                        })()}
                                    </span>
                                </div>

                                {/* Fuel Divider */}
                                {template.category !== 'generator' && (
                                    <div style={{ borderTop: '1px dashed rgba(249, 115, 22, 0.4)', margin: '4px 0', paddingTop: '4px', textAlign: 'center', fontSize: '8px', color: '#f97316', fontWeight: 'bold' }}>
                                        🔥 Fuel Chamber
                                    </div>
                                )}

                                {/* Fuel Intake */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', height: '16px' }}>
                                    <Handle
                                        type="target"
                                        id="fuel"
                                        position={Position.Left}
                                        style={{ left: '-14px', background: '#f97316', width: '8px', height: '8px', border: '1.5px solid #0a0f1d' }}
                                    />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        {(() => {
                                            const edges = allEdges.filter(e => e.target === id && e.targetHandle === 'fuel');
                                            const resSet = new Set<string>();
                                            edges.forEach(e => {
                                                const srcNode = nodes.find((n: any) => n.id === e.source);
                                                const outType = srcNode?.data?.recipe?.outputType || srcNode?.data?.template?.output_type || srcNode?.data?.resourceType;
                                                if (outType) resSet.add(outType);
                                            });
                                            if (resSet.size === 0) {
                                                Object.keys(data?.inputBuffer || {})
                                                    .filter(k => data?.inputBuffer?.[k] && new Decimal(data.inputBuffer[k]).gt(0))
                                                    .forEach(k => resSet.add(k));
                                            }
                                            return Array.from(resSet).map((res) => (
                                                <span key={res} title={res} style={{ fontSize: '12px' }}>{RESOURCE_REGISTRY[res]?.icon || '🔥'}</span>
                                            ));
                                        })()}
                                        <span style={{ fontSize: '11px', color: '#f97316' }}>Fuel Feed</span>
                                    </div>
                                    <span style={{ fontSize: '9px', color: '#f97316' }}>
                                        {(() => {
                                            const resources = Array.from(new Set(Object.keys(data?.inputBuffer || {}))).filter(k => new Decimal(data?.inputBuffer?.[k] || 0).gt(0));
                                            const activeIdx = data?.activeRecipeIndex || 0;
                                            const activeRecipe = (recipes && Array.isArray(recipes)) ? recipes[activeIdx] : undefined;

                                            const currentFuelEdges = allEdges.filter(e => e.target === id && e.targetHandle === 'fuel');
                                            const totalFuelFlow = currentFuelEdges.reduce((s, e) => s + ((e.data as any)?.flow || 0), 0);

                                            if (resources.length === 0) return `${formatNumber(totalFuelFlow)}/s`;

                                            const convRate = new Decimal(activeRecipe?.conversionRate || 1);
                                            const req = (convRate.lt(1) ? new Decimal(1).dividedBy(convRate).round() : new Decimal(1)).times(Math.pow(2, level));

                                            return resources.map(res => {
                                                const amt = data?.inputBuffer?.[res] || 0;
                                                return `${formatNumber(new Decimal(amt).floor())}/${req.toString()}`;
                                            }).join(', ') + ` (${formatNumber(totalFuelFlow)}/s)`;
                                        })()}
                                    </span>
                                </div>
                            </>
                        ) : (
                            <>
                                {/* Render All Inputs for Single-Input Nodes */}
                                {inputs.map((input: string) => {
                                    const inputEdges = allEdges.filter(e => e.target === id && e.targetHandle === input);
                                    let incomingFlow = new Decimal(0);
                                    inputEdges.forEach(e => {
                                        const edgeData = e.data as any;
                                        if (edgeData?.flow) incomingFlow = incomingFlow.plus(new Decimal(edgeData.flow));
                                    });

                                    const formattedFlow = formatNumber(incomingFlow);
                                    const amount = data?.inputBuffer?.[input] || 0;

                                    return (
                                        <div key={input} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', height: '16px' }}>
                                            <Handle
                                                type="target"
                                                id={input}
                                                position={Position.Left}
                                                style={{ left: '-14px', background: '#3b82f6', width: '8px', height: '8px', border: '1.5px solid #0a0f1d' }}
                                            />
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ fontSize: '12px' }}>{RESOURCE_REGISTRY[input]?.icon || '❓'}</span>
                                                <span style={{ textTransform: 'capitalize' }}>{input.replace('_', ' ')}</span>
                                            </div>
                                            <span style={{ fontSize: '9px', color: '#94a3b8' }}>
                                                {(() => {
                                                    const convRate = new Decimal(activeRecipe?.conversionRate || 1);
                                                    const req = (convRate.lt(1) ? new Decimal(1).dividedBy(convRate).round() : new Decimal(1)).times(Math.pow(2, level));
                                                    return `${formatNumber(new Decimal(amount).floor())}/${req.toString()} (${formattedFlow}/s)`;
                                                })()}
                                            </span>
                                        </div>
                                    );
                                })}
                            </>
                        )}
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
                        opacity: (data?.actualOutputPerSec && new Decimal(data.actualOutputPerSec).gt(0)) ? 1 : 0.4,
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
                                        {formatNumber(data?.actualOutputPerSec || 0)}/s
                                        {data?.outputBuffer?.[output] && new Decimal(data.outputBuffer[output]!).gt(0.01) && (
                                            <span style={{ color: '#fb923c', marginLeft: '4px' }} title="Internal Buffer">
                                                ({formatNumber(new Decimal(data.outputBuffer[output]!))})
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
                {isMultiInput && activeRecipe && (
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

                {data?.efficiency && type !== 'waterGenerator' && type !== 'lavaPump' && (
                    <div style={{ marginTop: '4px', color: '#94a3b8' }}>
                        Eff: {((typeof data.efficiency === 'object' ? data.efficiency.toNumber() : Number(data.efficiency)) * 100).toFixed(0)}%
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
                                e.stopPropagation(); // avoid dragging nodes when clicking button
                                const state = useStore.getState();
                                state.upgradeNode(id);
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

            {/* Default Catch-all Handles for Generator/Storage/Logistics and Backwards Compatibility */}
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
            {/* Radius Overlay on Selection */}
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
};
