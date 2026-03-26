import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { useStore } from '../store';
import { RESOURCE_REGISTRY, ResourceType, Decimal } from '@aligrid/engine';
import { formatNumber } from '../utils/formatter';
import { NodeHeaderMenu } from '../components/NodeHeaderMenu';

export interface CloudDownloaderNodeProps {
    id: string;
    data: {
        resourceType?: ResourceType;
        outputRate?: Decimal;
        level?: number;
    };
}

export const CloudDownloaderNode: React.FC<CloudDownloaderNodeProps> = memo(({ id, data }) => {
    const stats = useStore((state) => state.nodeStats[id]);
    const liveData = { ...data, ...stats };
    const updateNodeData = useStore((state) => state.updateNodeData);
    const selectedRes = liveData?.resourceType || 'iron';
    const downloaderTier = useStore((state) => state.downloaderTier) || 0;

    // Theoretical rate for when machine is idle
    const rate = liveData?.outputRate
        ? (typeof liveData.outputRate === 'string' ? new Decimal(liveData.outputRate) : liveData.outputRate)
        : new Decimal(1);
    const globalRate = new Decimal(Math.pow(2, downloaderTier));
    const effectiveRate = Decimal.max(rate, globalRate);

    // Live rate from simulation
    const liveRate = liveData?.actualOutputPerSec ? new Decimal(liveData.actualOutputPerSec as any) : new Decimal(0);

    const meta = RESOURCE_REGISTRY[selectedRes] || { icon: '❓', label: 'Unknown', color: '#94a3b8' };

    const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        updateNodeData(id, { resourceType: e.target.value as ResourceType });
    };

    return (
        <div style={{
            background: '#161b2e',
            border: `1px solid ${meta.color}80`,
            borderRadius: '6px',
            minWidth: '220px',
            color: '#e2e8f0',
            fontFamily: 'monospace',
            overflow: 'visible',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4)',
            position: 'relative'
        }}>
            <div style={{
                background: 'rgba(79, 70, 229, 0.1)',
                padding: '8px 12px',
                borderBottom: `1px solid ${meta.color}aa`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px' }}>📥</span>
                    <span style={{ fontWeight: 'bold' }}>Downloader</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>Tier {downloaderTier}</span>
                    <NodeHeaderMenu nodeId={id} />
                </div>
            </div>

            {/* Body */}
            <div style={{ padding: '12px', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ color: '#94a3b8', fontSize: '9px' }}>EXTRACT RESOURCE:</label>
                    <select
                        value={selectedRes}
                        onChange={handleTypeChange}
                        style={{
                            width: '100%',
                            background: '#1e293b',
                            border: '1px solid #334155',
                            color: '#f8fafc',
                            padding: '4px 6px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            fontFamily: 'monospace'
                        }}
                        className="nodrag"
                    >
                        {Object.values(RESOURCE_REGISTRY)
                            .filter(r => r.isUploadAvailable && r.id !== 'electricity')
                            .map(r => (
                                <option key={r.id} value={r.id}>{r.icon} {r.label}</option>
                            ))
                        }
                    </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', height: '16px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '6px', marginTop: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#a5b4fc' }}>
                        <span>Draining</span>
                    </div>
                    <span style={{ fontWeight: 'bold', color: '#a5b4fc' }}>{formatNumber(liveRate.gt(0) ? liveRate : effectiveRate)}/s</span>
                    <Handle
                        type="source"
                        position={Position.Right}
                        id="output"
                        style={{ right: '-16px', background: '#10b981', width: '8px', height: '8px', border: '1.5px solid #0a0f1d' }}
                    />
                </div>
            </div>
        </div>
    );
});
