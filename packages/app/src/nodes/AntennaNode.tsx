import { Handle, NodeProps, Position, useViewport } from 'reactflow';
import { RESOURCE_REGISTRY, Decimal, ResourceType } from '@aligrid/engine';
import { NodeHeaderMenu } from '../components/NodeHeaderMenu';
import { useStore } from '../store';
import { CLOUD_BASE_CAPACITY, CLOUD_CAPACITY_GROWTH } from '../store/constants';

import type { NodeData } from '../store/types';
import { memo, useEffect, useRef, useMemo } from 'react';

const AntennaNodeComponent = ({ id, data, selected }: NodeProps<NodeData>) => {
    const { zoom } = useViewport();
    const compactMode = useStore(state => state.settings.compactMode);
    const showDetail = zoom > 0.6 && !compactMode;
    const rateRefs = useRef<Record<string, HTMLSpanElement>>({});
    const fullRefs = useRef<Record<string, HTMLSpanElement>>({});
    const statusTextRef = useRef<HTMLSpanElement>(null);

    const cloudLevel = useStore((state) => state.cloudLevel || 1);
    const capacity = new Decimal(CLOUD_BASE_CAPACITY).times(Math.pow(CLOUD_CAPACITY_GROWTH, (cloudLevel || 1) - 1));

    // Structural subscription: only re-render if edges targeting THIS node change
    const incomingEdgesCount = useStore(state => state.edges.filter(e => e.target === id).length);
    const visibleInputs = Math.min(Math.max(incomingEdgesCount + 1, 1), 5);

    useEffect(() => {
        const unsubscribe = useStore.subscribe(
            state => ({ stats: state.nodeStats?.[id], cloud: state.cloudStorage, allEdges: state.edges }),
            ({ stats, cloud, allEdges }) => {
                if (!stats) return;
                try {
                    if (statusTextRef.current) {
                        statusTextRef.current.innerText = (stats.status || 'idle').toUpperCase();
                    }

                    for (let i = 0; i < visibleInputs; i++) {
                        const handleId = `input-${i}`;
                        const target = rateRefs.current[handleId];
                        if (!target) continue;

                        const rate = parseFloat(stats.handleFlows?.[handleId] || '0');
                        const resNameInput = stats.handleResourceTypes?.[handleId];

                        // Try to discover resource type from edge if not in stats
                        let resName = resNameInput;
                        if (!resName) {
                            const edge = allEdges.find(e => e.target === id && e.targetHandle === handleId);
                            if (edge) {
                                resName = (edge.data as any)?.resourceType;
                            }
                        }

                        if (resName) {
                            const meta = RESOURCE_REGISTRY[resName];
                            const label = meta ? meta.label : resName.charAt(0).toUpperCase() + resName.slice(1);
                            target.innerText = `${label} - ${rate.toFixed(1)}/s`;
                        } else {
                            target.innerText = `Line ${i + 1} - 0.0/s`;
                        }

                        const fullBadge = fullRefs.current[handleId];
                        if (fullBadge && resName) {
                            const isFull = new Decimal(cloud[resName] || 0).gte(capacity);
                            fullBadge.style.display = isFull ? 'inline-block' : 'none';
                        }
                    }
                } catch (e) { }
            }
        );
        return unsubscribe;
    }, [id, visibleInputs, capacity]);

    const status = data.status || 'idle';
    const accentColor = status === 'active' ? '#14b8a6' : '#94a3b8';

    const nodeStyles = useMemo(() => ({
        '--node-accent': accentColor,
    } as React.CSSProperties), [accentColor]);

    if (!showDetail) {
        return (
            <div className="glass-node" style={{ ...nodeStyles, width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: '32px' }}>📡</div>
                {Array.from({ length: visibleInputs }, (_, i) => (
                    <Handle
                        key={`input-${i}`}
                        type="target"
                        position={Position.Left}
                        id={`input-${i}`}
                        style={{
                            left: '-4px',
                            top: visibleInputs > 1 ? `${(i / (visibleInputs - 1)) * 44 + 10}px` : '32px',
                            background: '#14b8a6',
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
        <div className="glass-node" style={{ ...nodeStyles, minWidth: '240px', padding: '16px' }}>
            {/* Header */}
            <div className="node-header">
                <div className="node-icon-ring" style={{ background: `linear-gradient(135deg, rgba(20, 184, 166, 0.2), transparent)` }}>
                    📡
                </div>
                <div className="node-title-group">
                    <div className="node-title">{data?.label || 'Uploader'}</div>
                    <div className="node-level">Cloud Sync Node</div>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                    <NodeHeaderMenu nodeId={id} />
                </div>
            </div>

            {/* Status bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.3)', padding: '6px 10px', borderRadius: '8px', marginBottom: '12px' }}>
                <div className={`status-dot ${status === 'active' ? 'status-active' : ''}`} />
                <span ref={statusTextRef} style={{ fontSize: '10px', fontWeight: 'bold', color: '#f8fafc', letterSpacing: '0.05em' }}>
                    {status.toUpperCase()}
                </span>
                <span style={{ fontSize: '10px', color: '#64748b', marginLeft: 'auto' }}>Cloud Lvl {cloudLevel}</span>
            </div>

            {/* Inputs Section */}
            <div className="resource-section-title">Inbound Channels</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {Array.from({ length: visibleInputs }, (_, i) => {
                    const handleId = `input-${i}`;
                    return (
                        <div key={handleId} className="resource-card" style={{ borderLeft: '2px solid #14b8a6' }}>
                            <Handle
                                type="target"
                                position={Position.Left}
                                id={handleId}
                                style={{ left: '-20px', background: '#14b8a6', width: '10px', height: '10px', border: '2px solid #0d1122' }}
                            />
                            <div className="resource-info">
                                <div className="resource-name">📤 <span ref={el => { if (el) rateRefs.current[handleId] = el; }}>Channel {i + 1}</span></div>
                                <span
                                    ref={el => { if (el) fullRefs.current[handleId] = el; }}
                                    style={{
                                        fontSize: '9px',
                                        background: '#dc2626',
                                        color: 'white',
                                        padding: '1px 5px',
                                        borderRadius: '4px',
                                        fontWeight: '900',
                                        display: 'none',
                                        boxShadow: '0 0 10px rgba(220, 38, 38, 0.4)'
                                    }}
                                >
                                    FULL
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div style={{ marginTop: '12px', textAlign: 'center', fontSize: '10px', color: '#64748b', fontStyle: 'italic' }}>
                Active Cloud Interface ({incomingEdgesCount} connected)
            </div>
        </div>
    );
};

export const AntennaNode = memo(AntennaNodeComponent);
