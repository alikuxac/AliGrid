import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { NodeTemplate } from '@aligrid/schema';
import { RESOURCE_REGISTRY, Decimal, getUpgradeCost } from '@aligrid/engine';

import { useStore } from '../store';
import { formatNumber } from '../utils/formatter';
import { NodeHeaderMenu } from '../components/NodeHeaderMenu';

import type { NodeData } from '../store/types';

interface ExtendedTemplate extends NodeTemplate {
    resource_type?: string | null;
}

export interface GeneratorNodeProps {
    id: string;
    type: string;
    data: NodeData;
    selected?: boolean;
}

export const GeneratorNode: React.FC<GeneratorNodeProps> = memo(({ id, type, data, selected }) => {
    const cloudStorage = useStore((state) => state.cloudStorage);
    const isViewOnly = useStore((state) => state.isViewOnly);
    const nodeTemplates = useStore((state) => state.nodeTemplates) || [];

    const originalTemplate = data?.template as ExtendedTemplate | undefined || nodeTemplates.find((t) => t.id === type) as ExtendedTemplate | undefined;

    const level = data?.level || 0;

    // Calculate cost based on levels
    const cost = getUpgradeCost(type, level);

    let finalTemplate = originalTemplate;
    if (!finalTemplate) {
        // Fallback
        const isGenerator = type.toLowerCase().includes('water') || type.toLowerCase().includes('lava') || type.toLowerCase().includes('pump') || type.toLowerCase().includes('tree');
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
        template.output_type = template.resource_type;
    }

    const outputs = (template.output_type || '').split(',').filter(Boolean).map((o: string) => o.trim());

    const borderColor = data?.isOff ? '#f87171' : '#10b981';
    const headerColor = 'rgba(255, 255, 255, 0.04)';

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
                <div>
                    <span>Yield: </span>
                    <b style={{ color: '#34d399' }}>{formatNumber(data?.outputRate ?? String(template.initial_rate || 0))}/s</b>
                </div>

                {/* Outputs */}
                {outputs.length > 0 && (
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
                        {outputs.map((output: string) => (
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
        </div>
    );
});
