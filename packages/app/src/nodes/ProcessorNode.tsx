import React from 'react';
import { Handle, Position } from 'reactflow';
import { Decimal, RESOURCE_REGISTRY } from '@aligrid/engine';
import type { ProcessorRecipe } from '@aligrid/engine';
import { useStore } from '../store';

const RESOURCE_META: Record<string, { icon: string; label: string; color: string }> = {
    water: { icon: '💧', label: 'Water', color: '#3b82f6' },
    iron: { icon: '⛏️', label: 'Iron', color: '#94a3b8' },
    copper: { icon: '⚒️', label: 'Copper', color: '#d97706' },
    coal: { icon: '🔥', label: 'Coal', color: '#334155' },
    electricity: { icon: '⚡', label: 'Electricity', color: '#facc15' },
};

export interface ProcessorNodeProps {
    data: {
        processorName: string;
        recipe: ProcessorRecipe;
        actualInputPerSec?: Decimal;
        actualOutputPerSec?: Decimal;
        isOff?: boolean;
        status?: string;
    };
}

export const ProcessorNode: React.FC<ProcessorNodeProps & { id: string }> = ({ id, data }) => {
    const isOff = data?.isOff || false;
    const recipe = data?.recipe;
    const inMeta = RESOURCE_META[recipe?.inputType] || RESOURCE_META.water;
    const outMeta = RESOURCE_META[recipe?.outputType] || RESOURCE_META.electricity;
    const regIn = recipe?.inputType ? RESOURCE_REGISTRY[recipe.inputType] : null;
    const regOut = recipe?.outputType ? RESOURCE_REGISTRY[recipe.outputType] : null;
    const convRate = recipe?.conversionRate ? recipe.conversionRate.toNumber().toFixed(3) : '0';

    const actualIn = data?.actualInputPerSec ? data.actualInputPerSec.toNumber().toFixed(1) : '0.0';
    const actualOut = data?.actualOutputPerSec ? data.actualOutputPerSec.toNumber().toFixed(1) : '0.0';

    const status = data?.status || 'active';
    const borderColor = status === 'warning' ? '#ef4444' : status === 'idle' ? '#eab308' : '#facc15';

    return (
        <div style={{
            background: '#161b2e',
            border: `1px solid ${borderColor}cc`,
            borderRadius: '6px',
            minWidth: '230px',
            color: '#e2e8f0',
            fontFamily: 'monospace',
            overflow: 'hidden',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4)',
            opacity: isOff ? 0.4 : 1,
            filter: isOff ? 'grayscale(0.4)' : 'none',
            transition: 'all 0.3s ease'
        }}>
            {/* Header */}
            <div style={{
                background: '#1e293b',
                padding: '8px 12px',
                borderBottom: '1px solid #facc1540',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px' }}>⚙️</span>
                    <span style={{ textDecoration: isOff ? 'line-through' : 'none', color: isOff ? '#64748b' : '#e2e8f0' }}>{data?.processorName || 'Processor'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <button
                        onClick={() => {
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
                        onClick={() => useStore.getState().updateNodeData(id, { isOff: !isOff })}
                        style={{
                            background: isOff ? '#ef444420' : '#10b98120',
                            border: `1px solid ${isOff ? '#ef4444' : '#10b981'}`,
                            color: isOff ? '#ef4444' : '#10b981',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '9px',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                        }}
                    >
                        {isOff ? 'OFF' : 'ON'}
                    </button>
                </div>
            </div>

            {/* Body */}
            <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>

                {/* Required Input */}
                <div style={{
                    background: '#1e293b', padding: '8px 10px', borderRadius: '4px',
                    borderLeft: `2px solid ${inMeta.color}`,
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>{inMeta.icon}</span>
                            <span style={{ color: '#94a3b8' }}>Requires</span>
                            <span style={{ color: inMeta.color, fontWeight: 'bold' }}>{inMeta.label}</span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#64748b' }}>Consuming</span>
                        <span style={{ color: '#f87171', fontWeight: 'bold', fontSize: '13px' }}>-{actualIn} {regIn?.unit || ''}/s</span>
                    </div>
                </div>

                {/* Conversion Arrow */}
                <div style={{ textAlign: 'center', color: '#64748b', fontSize: '12px' }}>× {convRate} ▼</div>

                {/* Output */}
                <div style={{
                    background: '#1e293b', padding: '8px 10px', borderRadius: '4px',
                    borderLeft: `2px solid ${outMeta.color}`,
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>{outMeta.icon}</span>
                            <span style={{ color: '#94a3b8' }}>Produces</span>
                            <span style={{ color: outMeta.color, fontWeight: 'bold' }}>{outMeta.label}</span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#64748b' }}>Producing</span>
                        <span style={{ color: '#4ade80', fontWeight: 'bold', fontSize: '13px' }}>+{actualOut} {regOut?.unit || ''}/s</span>
                    </div>
                </div>
            </div>

            {/* Handles */}
            <Handle type="target" position={Position.Left} id="input"
                style={{ background: '#2d3748', border: `2px solid ${inMeta.color}`, width: '12px', height: '12px', left: '-6px' }}
            />
            <Handle type="source" position={Position.Right} id="output"
                style={{ background: '#2d3748', border: `2px solid ${outMeta.color}`, width: '12px', height: '12px', right: '-6px' }}
            />
        </div>
    );
};
