import React, { memo, useEffect, useRef, useMemo } from 'react';
import { Handle, Position, NodeProps, useViewport } from 'reactflow';
import { Decimal, ResourceType, getStorageCapacity, RESOURCE_REGISTRY } from '@aligrid/engine';
import { formatNumber } from '../utils/formatter';
import { NodeHeaderMenu } from '../components/NodeHeaderMenu';
import { useStore } from '../store';
import { safeDecimal } from '../store/slices/tick/helpers';
import type { NodeData } from '../store/types';

const StorageNodeComponent = ({ id, data, selected }: NodeProps<NodeData>) => {
    const { zoom } = useViewport();
    const compactMode = useStore(state => state.settings.compactMode);
    const showDetail = zoom > 0.6 && !compactMode;

    const rateRef = useRef<HTMLDivElement>(null);
    const amountRef = useRef<HTMLSpanElement>(null);
    const progressBarRef = useRef<HTMLDivElement>(null);

    const level = useStore(state => state.nodes.find(n => n.id === id)?.data?.level ?? 1);
    const capacity = getStorageCapacity(level);

    useEffect(() => {
        const unsubscribe = useStore.subscribe(
            state => state.nodeStats?.[id],
            (stats) => {
                if (!stats) return;
                try {
                    const amount = safeDecimal(stats.currentAmount || 0);
                    const rate = safeDecimal(stats.actualInputPerSec || 0);

                    if (rateRef.current) {
                        rateRef.current.innerText = rate.gt(0) ? `+${formatNumber(rate)}/s` : '';
                    }
                    if (amountRef.current) {
                        amountRef.current.innerText = formatNumber(amount);
                    }
                    if (progressBarRef.current) {
                        const pct = Math.min(100, (amount.dividedBy(capacity).toNumber() * 100));
                        progressBarRef.current.style.width = `${pct}%`;
                    }
                } catch (e) { }
            }
        );
        return unsubscribe;
    }, [id, capacity]);

    const locked = data?.lockedResourceType as ResourceType | undefined;
    const meta = locked ? RESOURCE_REGISTRY[locked] : null;
    const resColor = meta ? meta.color : '#475569';

    const nodeStyles = useMemo(() => ({
        '--node-accent': '#3b82f6',
    } as React.CSSProperties), []);

    if (!showDetail) {
        return (
            <div className="glass-node" style={{ ...nodeStyles, width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: '32px' }}>{meta?.icon || '📦'}</div>
                <Handle type="target" position={Position.Left} id="input" style={{ left: '-4px', top: '50%', background: resColor, width: '8px', height: '8px', border: '1.5px solid #0d1122' }} />
                <Handle type="source" position={Position.Right} id="output" style={{ right: '-4px', top: '50%', background: resColor, width: '8px', height: '8px', border: '1.5px solid #0d1122' }} />
            </div>
        );
    }

    return (
        <div className="glass-node" style={{ ...nodeStyles, minWidth: '240px', padding: '16px' }}>
            {/* Header */}
            <div className="node-header">
                <div className="node-icon-ring" style={{ background: `linear-gradient(135deg, ${resColor}33, transparent)` }}>
                    {meta?.icon || '📦'}
                </div>
                <div className="node-title-group">
                    <div className="node-title">Storage</div>
                    <div className="node-level">Mk.{level}</div>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                    <NodeHeaderMenu nodeId={id} />
                </div>
            </div>

            {/* Body */}
            <div className="resource-section-title">Resource</div>
            {meta ? (
                <div className="resource-card" style={{ borderLeft: `2px solid ${resColor}` }}>
                    <div className="resource-info">
                        <div className="resource-name">{meta.icon} {meta.label}</div>
                        <div ref={rateRef} className="resource-rate" style={{ color: '#34d399' }}></div>
                    </div>
                    <div className="buffer-container">
                        <div ref={progressBarRef} className="buffer-fill" style={{ width: '0%', backgroundColor: resColor, boxShadow: `0 0 10px ${resColor}66` }} />
                    </div>
                    <div className="buffer-label">
                        <span>CAPACITY</span>
                        <div style={{ color: '#f8fafc', fontWeight: 'bold' }}>
                            <span ref={amountRef}>0</span> <span style={{ color: '#64748b', fontWeight: 'normal' }}>/ {formatNumber(capacity)}</span>
                        </div>
                    </div>
                </div>
            ) : (
                <div style={{ color: '#64748b', fontStyle: 'italic', textAlign: 'center', padding: '12px 0', fontSize: '11px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                    Empty (Connect to lock)
                </div>
            )}

            <Handle type="target" position={Position.Left} id="input"
                style={{ background: resColor, width: '10px', height: '10px', left: '-20px', top: '50%', border: '2px solid #0d1122' }}
            />
            <Handle type="source" position={Position.Right} id="output"
                style={{ background: resColor, width: '10px', height: '10px', right: '-20px', top: '50%', border: '2px solid #0d1122' }}
            />
        </div>
    );
};

export const StorageNode = memo(StorageNodeComponent);
