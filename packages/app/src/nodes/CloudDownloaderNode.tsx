import React, { memo, useEffect, useRef, useMemo } from 'react';
import { Handle, Position, NodeProps, useViewport } from 'reactflow';
import { useStore } from '../store';
import { RESOURCE_REGISTRY, ResourceType, Decimal } from '@aligrid/engine';
import { formatNumber } from '../utils/formatter';
import { NodeHeaderMenu } from '../components/NodeHeaderMenu';
import { safeDecimal } from '../store/slices/tick/helpers';
import { NodeData } from '../store/types';

// Using NodeProps<NodeData> instead of custom interface

const CloudDownloaderNodeComponent = ({ id, data, selected }: NodeProps<NodeData>) => {
    const { zoom } = useViewport();
    const compactMode = useStore(state => state.settings.compactMode);
    const showDetail = zoom > 0.6 && !compactMode;
    const updateNodeData = useStore((state) => state.updateNodeData);
    const liveRateRef = useRef<HTMLSpanElement>(null);

    // Real-time metrics via Refs to avoid re-renders
    useEffect(() => {
        const unsubscribe = useStore.subscribe(
            state => state.nodeStats?.[id],
            (stats) => {
                if (!stats) return;
                try {
                    if (liveRateRef.current && stats.actualOutputPerSec) {
                        liveRateRef.current.innerText = `${formatNumber(safeDecimal(stats.actualOutputPerSec))}/s`;
                    }
                } catch (e) { }
            }
        );
        return unsubscribe;
    }, [id]);

    // Use primitives for stable selectors
    const resourceType = useStore(state => state.nodes.find(n => n.id === id)?.data?.resourceType || 'iron' as ResourceType);
    const cloudReservePercent = useStore(state => state.nodes.find(n => n.id === id)?.data?.cloudReservePercent || 0);
    const edgeTiers = useStore((state) => state.edgeTiers);
    const itemRegistry = useStore((state) => state.itemRegistry);

    // Detect if this node has outgoing connections
    const isConnected = useStore(state => state.edges.some(e => e.source === id));

    const selectedRes = resourceType;
    const item = itemRegistry[selectedRes];
    const resState = (item?.type || 'solid').toLowerCase();
    const currentGlobalTier = edgeTiers?.[resState as string] || 0;

    // Theoretical rate based on Global Belt/Pipe Tier
    const tierRate = safeDecimal(60 * Math.pow(2, currentGlobalTier));
    const effectiveRate = tierRate;

    const meta = RESOURCE_REGISTRY[selectedRes] || { icon: '❓', label: selectedRes, color: '#94a3b8' };

    const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        if (isConnected) return; // Guard
        updateNodeData(id, { resourceType: e.target.value as ResourceType });
    };

    const handleReserveChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value, 10);
        updateNodeData(id, { cloudReservePercent: val });
    };

    const nodeStyles = useMemo(() => ({
        '--node-accent': '#4f46e5',
    } as React.CSSProperties), []);

    if (!showDetail) {
        return (
            <div className="glass-node" style={{ ...nodeStyles, width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: '32px' }}>📥</div>
                <Handle
                    type="source"
                    position={Position.Right}
                    id="output"
                    style={{ right: '-4px', top: '32px', background: '#10b981', width: '8px', height: '8px', border: '1.5px solid #0d1122' }}
                />
            </div>
        );
    }

    return (
        <div className="glass-node" style={{ ...nodeStyles, minWidth: '240px', padding: '16px' }}>
            {/* Header */}
            <div className="node-header">
                <div className="node-icon-ring" style={{ background: `linear-gradient(135deg, rgba(79, 70, 229, 0.2), transparent)` }}>
                    📥
                </div>
                <div className="node-title-group">
                    <div className="node-title">{data?.label || 'Cloud Downloader'}</div>
                    <div className="node-level">{resState.toUpperCase()} Tier {currentGlobalTier} Interface</div>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                    <NodeHeaderMenu nodeId={id} />
                </div>
            </div>

            {/* Selector Section */}
            <div className="resource-section-title">Cloud Resource Extraction</div>
            <div style={{ position: 'relative', marginBottom: '12px' }}>
                <select
                    value={selectedRes}
                    onChange={handleTypeChange}
                    disabled={isConnected}
                    style={{
                        width: '100%',
                        background: 'rgba(0,0,0,0.3)',
                        border: `1px solid ${isConnected ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255,255,255,0.1)'}`,
                        color: isConnected ? '#94a3b8' : '#f8fafc',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        cursor: isConnected ? 'not-allowed' : 'pointer',
                        appearance: 'none',
                        outline: 'none'
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
                {isConnected && (
                    <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: '#ef4444', fontWeight: 'bold' }}>
                        LOCKED 🔒
                    </div>
                )}
            </div>

            {/* slider section */}
            <div className="resource-section-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Throughput Limit</span>
                <span style={{ color: '#a5b4fc' }}>{cloudReservePercent}%</span>
            </div>
            <div style={{ padding: '4px 0 12px 0' }}>
                <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={cloudReservePercent}
                    onChange={handleReserveChange}
                    onPointerDown={(e) => e.stopPropagation()}
                    style={{
                        width: '100%',
                        accentColor: '#4f46e5',
                        height: '6px',
                        cursor: 'pointer',
                        borderRadius: '3px'
                    }}
                    className="nodrag"
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '9px', color: '#64748b' }}>
                    <span>0%</span>
                    <span>{formatNumber(effectiveRate.times(cloudReservePercent / 100))}/s</span>
                    <span>100%</span>
                </div>
            </div>

            {/* Output Stream */}
            <div className="resource-card" style={{ borderRight: '2px solid #10b981' }}>
                <div className="resource-info">
                    <div className="resource-name">{meta.icon} Extraction flow</div>
                    <span ref={liveRateRef} style={{ fontSize: '12px', color: '#a5b4fc', fontWeight: '800' }}>0.0/s</span>
                </div>
                <Handle
                    type="source"
                    position={Position.Right}
                    id="output"
                    style={{ right: '-20px', background: '#10b981', width: '10px', height: '10px', border: '2px solid #0d1122' }}
                />
            </div>
        </div>
    );
};

export const CloudDownloaderNode = memo(CloudDownloaderNodeComponent);

