import React from 'react';
import { getBezierPath, EdgeProps, EdgeLabelRenderer } from 'reactflow';
import { useStore } from '../store';

export const FluidEdge: React.FC<EdgeProps & { className?: string }> = ({
    id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style = {}, data, selected, className
}) => {
    const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
    const tier = data?.tier ?? 0;
    const isBottleneck = data?.isBottleneck ?? false;
    const opacityRaw = style.opacity ?? 1;
    const opacity = typeof opacityRaw === 'number' ? opacityRaw : parseFloat(opacityRaw as any) || 1;

    return (
        <>
            {/* Invisible thicker path for hit detection */}
            <path
                d={edgePath}
                fill="none"
                stroke="transparent"
                strokeWidth={20}
                className="react-flow__edge-interaction"
            />
            {/* Visible path */}
            <path
                d={edgePath}
                fill="none"
                strokeWidth={selected ? 5 : 3}
                opacity={opacity}
                className={`react-flow__edge-path ${className || ''}`}
                style={{
                    ...(selected ? { filter: `drop-shadow(0 0 6px currentColor) drop-shadow(0 0 12px currentColor)` } : {}),
                }}
            />

            <EdgeLabelRenderer>
                <div style={{
                    position: 'absolute',
                    transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                    background: '#111827',
                    border: '1px solid #1f2937',
                    padding: '2px 5px',
                    borderRadius: '4px',
                    fontSize: '9px',
                    color: '#e2e8f0',
                    pointerEvents: 'all',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)'
                }}>
                    {isBottleneck && <span style={{ color: '#ef4444', fontWeight: 'bold' }} title="Bottleneck!">⚠️</span>}
                    <span style={{ color: '#94a3b8', fontWeight: 'bold' }}>Mk.{tier + 1}</span>
                    <span style={{ color: '#e2e8f0', fontSize: '8px', marginLeft: '2px' }}>
                        <b style={{ color: '#ffffff' }}>{(parseFloat(data?.flow || "0").toFixed(1))}</b> / {(60 * Math.pow(2, tier))}
                    </span>
                </div>
            </EdgeLabelRenderer>
        </>
    );
};

export const PowerEdge: React.FC<EdgeProps & { className?: string }> = ({
    id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style = {}, data, selected, className
}) => {
    const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
    const tier = data?.tier ?? 0;
    const isBottleneck = data?.isBottleneck ?? false;
    const opacityRaw = style.opacity ?? 1;
    const opacity = typeof opacityRaw === 'number' ? opacityRaw : parseFloat(opacityRaw as any) || 1;

    return (
        <>
            {/* Invisible thicker path for hit detection */}
            <path
                d={edgePath}
                fill="none"
                stroke="transparent"
                strokeWidth={20}
                className="react-flow__edge-interaction"
            />
            {/* Visible path */}
            <path
                d={edgePath}
                fill="none"
                strokeWidth={selected ? 5 : 3}
                opacity={opacity}
                className={`react-flow__edge-path ${className || ''}`}
                style={{
                    ...(selected ? { filter: `drop-shadow(0 0 6px #facc15) drop-shadow(0 0 12px #facc15)` } : {}),
                }}
            />

            <EdgeLabelRenderer>
                <div style={{
                    position: 'absolute',
                    transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                    background: '#111827',
                    border: '1px solid #1f2937',
                    padding: '2px 5px',
                    borderRadius: '4px',
                    fontSize: '9px',
                    color: '#e2e8f0',
                    pointerEvents: 'all',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)'
                }}>
                    {(isBottleneck || data?.isOverloaded) && <span style={{ color: '#ef4444', fontWeight: 'bold' }} title={data?.isOverloaded ? "Overloaded!" : "Bottleneck!"}>⚠️</span>}
                    <span style={{ color: '#facc15', fontWeight: 'bold' }}>Mk.{tier + 1}</span>
                    <span style={{ color: '#e2e8f0', fontSize: '8px', marginLeft: '2px' }}>
                        <b style={{ color: data?.isOverloaded ? '#ef4444' : '#ffffff' }}>{(parseFloat(data?.flow || "0").toFixed(1))}</b> / {data?.capacity || (60 * Math.pow(2, tier))}
                    </span>
                </div>
            </EdgeLabelRenderer>
        </>
    );
};
