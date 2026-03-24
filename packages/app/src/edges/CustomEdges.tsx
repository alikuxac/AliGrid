import React from 'react';
import { getBezierPath, EdgeProps, EdgeLabelRenderer } from 'reactflow';
import { useStore } from '../store';

const edgeStyles = `
  @keyframes fluidFlow {
    from { stroke-dashoffset: 20; }
    to { stroke-dashoffset: 0; }
  }
  .fluid-edge {
    stroke-dasharray: 8, 6;
    animation: fluidFlow 0.6s linear infinite;
  }

  @keyframes powerPulse {
    from { stroke-dashoffset: 12; }
    to { stroke-dashoffset: 0; }
  }
  .power-edge {
    stroke-dasharray: 4, 4;
    animation: powerPulse 0.25s linear infinite;
  }
`;

export const FluidEdge: React.FC<EdgeProps> = ({
    id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style = {}, data, selected
}) => {
    const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
    const backpressureRate = data?.backpressureRate ?? 1;
    const tier = data?.tier ?? 0;
    const isBottleneck = data?.isBottleneck ?? false;
    const isFlowing = data?.flow && parseFloat(data.flow) > 0;
    const opacityRaw = style.opacity ?? 1;
    const opacity = typeof opacityRaw === 'number' ? opacityRaw : parseFloat(opacityRaw as any) || 1;
    const strokeColor = style.stroke || '#3b82f6';

    return (
        <>
            <path
                d={edgePath}
                fill="none"
                stroke={strokeColor}
                strokeWidth={selected ? 5 : 3}
                opacity={opacity}
                style={selected ? { filter: `drop-shadow(0 0 6px ${strokeColor}) drop-shadow(0 0 12px ${strokeColor})` } : {}}
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
                    <span style={{ color: '#e2e8f0', fontSize: '8px' }}>
                        {(parseFloat(data?.flow || "0").toFixed(1))}/{(60 * Math.pow(2, tier))}
                    </span>
                </div>
            </EdgeLabelRenderer>
        </>
    );
};

export const PowerEdge: React.FC<EdgeProps> = ({
    id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style = {}, data, selected
}) => {
    const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
    const isFlowing = data?.flow && parseFloat(data.flow) > 0;
    const tier = data?.tier ?? 0;
    const isBottleneck = data?.isBottleneck ?? false;
    const opacityRaw = style.opacity ?? 1;
    const opacity = typeof opacityRaw === 'number' ? opacityRaw : parseFloat(opacityRaw as any) || 1;
    const strokeColor = style.stroke || '#facc15';

    return (
        <>
            <path
                d={edgePath}
                fill="none"
                stroke={strokeColor}
                strokeWidth={selected ? 5 : 3}
                opacity={opacity}
                style={selected ? { filter: `drop-shadow(0 0 6px ${strokeColor}) drop-shadow(0 0 12px ${strokeColor})` } : {}}
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
                    <span style={{ color: '#facc15', fontWeight: 'bold' }}>Mk.{tier + 1}</span>
                    <span style={{ color: '#e2e8f0', fontSize: '8px' }}>
                        {(parseFloat(data?.flow || "0").toFixed(1))}/{(60 * Math.pow(2, tier))}
                    </span>
                </div>
            </EdgeLabelRenderer>
        </>
    );
};
