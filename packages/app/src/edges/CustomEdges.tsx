import React from 'react';
import { getBezierPath, EdgeProps, EdgeLabelRenderer, useReactFlow } from 'reactflow';
import { useStore } from '../store';

export const FluidEdge: React.FC<EdgeProps & { className?: string }> = ({
    id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style = {}, data, selected, className
}) => {
    const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
    const opacityRaw = style.opacity ?? 1;
    const opacity = typeof opacityRaw === 'number' ? opacityRaw : parseFloat(opacityRaw as any) || 1;

    const flowRef = React.useRef<HTMLElement>(null);
    const capacityRef = React.useRef<HTMLElement>(null);
    const tierRef = React.useRef<HTMLElement>(null);
    const bottleneckRef = React.useRef<HTMLSpanElement>(null);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const pathRef = React.useRef<SVGPathElement>(null);

    React.useEffect(() => {
        return useStore.subscribe(
            (state) => state.edgeStats[id],
            (newData) => {
                if (!newData) return;
                if (flowRef.current) {
                    flowRef.current.textContent = parseFloat(String(newData.actualFlow || "0")).toFixed(1);
                }
                if (capacityRef.current && newData.capacity) {
                    capacityRef.current.textContent = String(newData.capacity);
                }
                if (tierRef.current && newData.tier !== undefined) {
                    tierRef.current.textContent = `Mk.${(newData.tier) + 1}`;
                }
                if (bottleneckRef.current) {
                    bottleneckRef.current.style.display = newData.isBottleneck ? 'inline' : 'none';
                }
                if (containerRef.current) {
                    // Update animation duration
                    const dur = newData.duration || 1.0;
                    containerRef.current.style.setProperty('--edge-duration', `${dur.toFixed(2)}s`);
                }
                if (pathRef.current) {
                    // Update dynamic class based on flow
                    const isFlowing = parseFloat(String(newData.actualFlow || "0")) > 0.1;
                    const finalClass = `react-flow__edge-path ${newData.className || ''} ${isFlowing ? '' : 'edge-low-flow'}`;
                    pathRef.current.setAttribute('class', finalClass);
                }
            }
        );
    }, [id]);

    const { screenToFlowPosition } = useReactFlow();

    return (
        <>
            <path
                d={edgePath}
                fill="none"
                stroke="transparent"
                strokeWidth={20}
                className="react-flow__edge-interaction"
                onMouseEnter={() => {
                    if (containerRef.current) containerRef.current.style.display = 'flex';
                }}
                onMouseMove={(event) => {
                    if (containerRef.current) {
                        const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
                        containerRef.current.style.transform = `translate(-50%, -100%) translate(${pos.x}px, ${pos.y - 10}px)`;
                    }
                }}
                onMouseLeave={() => {
                    if (containerRef.current) containerRef.current.style.display = 'none';
                }}
            />
            <path
                ref={pathRef}
                d={edgePath}
                fill="none"
                strokeWidth={selected ? 5 : 3}
                opacity={opacity}
                className={`react-flow__edge-path ${className || ''}`}
                style={{ ...(selected ? { filter: `drop-shadow(0 0 6px currentColor) drop-shadow(0 0 12px currentColor)` } : {}) }}
            />

            <EdgeLabelRenderer>
                <div ref={containerRef} style={{
                    position: 'absolute',
                    background: '#111827',
                    border: '1px solid #1f2937',
                    padding: '2px 5px',
                    borderRadius: '4px',
                    fontSize: '9px',
                    color: '#e2e8f0',
                    pointerEvents: 'none',
                    display: 'none', // Hidden by default
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
                    zIndex: 1000
                }}>
                    <span ref={bottleneckRef} style={{ color: '#ef4444', fontWeight: 'bold', display: data?.isBottleneck ? 'inline' : 'none' }} title="Bottleneck!">⚠️</span>
                    <span ref={tierRef} style={{ color: '#94a3b8', fontWeight: 'bold' }}>Mk.{(data?.tier ?? 0) + 1}</span>
                    <span style={{ color: '#e2e8f0', fontSize: '8px', marginLeft: '2px' }}>
                        <b ref={flowRef} style={{ color: '#ffffff' }}>{(parseFloat(String(data?.actualFlow || "0")).toFixed(1))}</b> / <span ref={capacityRef}>{60 * Math.pow(2, data?.tier ?? 0)}</span>
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
    const opacityRaw = style.opacity ?? 1;
    const opacity = typeof opacityRaw === 'number' ? opacityRaw : parseFloat(opacityRaw as any) || 1;

    const flowRef = React.useRef<HTMLElement>(null);
    const capacityRef = React.useRef<HTMLElement>(null);
    const tierRef = React.useRef<HTMLElement>(null);
    const alertRef = React.useRef<HTMLSpanElement>(null);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const pathRef = React.useRef<SVGPathElement>(null);

    React.useEffect(() => {
        return useStore.subscribe(
            (state) => state.edgeStats[id],
            (newData) => {
                if (!newData) return;
                if (flowRef.current) {
                    flowRef.current.textContent = parseFloat(String(newData.actualFlow || "0")).toFixed(1);
                    flowRef.current.style.color = newData.isOverloaded ? '#ef4444' : '#ffffff';
                }
                if (capacityRef.current && newData.capacity) {
                    capacityRef.current.textContent = String(newData.capacity);
                }
                if (tierRef.current && newData.tier !== undefined) {
                    tierRef.current.textContent = `Mk.${(newData.tier) + 1}`;
                }
                if (alertRef.current) {
                    const isAlert = newData.isBottleneck || newData.isOverloaded;
                    alertRef.current.style.display = isAlert ? 'inline' : 'none';
                    alertRef.current.title = newData.isOverloaded ? "Overloaded!" : "Bottleneck!";
                }
                if (containerRef.current) {
                    const dur = newData.duration || 0.3;
                    containerRef.current.style.setProperty('--edge-duration', `${dur.toFixed(2)}s`);
                }
                if (pathRef.current) {
                    const isFlowing = parseFloat(String(newData.actualFlow || "0")) > 0.1;
                    const finalClass = `react-flow__edge-path ${newData.className || ''} ${isFlowing ? '' : 'edge-low-flow'}`;
                    pathRef.current.setAttribute('class', finalClass);

                    if (newData.isTripped) pathRef.current.style.strokeWidth = '3px';
                    else pathRef.current.style.strokeWidth = newData.backpressureRate === '1' ? '2.5px' : '2px';
                }
            }
        );
    }, [id]);

    const { screenToFlowPosition } = useReactFlow();

    return (
        <>
            <path
                d={edgePath}
                fill="none"
                stroke="transparent"
                strokeWidth={20}
                className="react-flow__edge-interaction"
                onMouseEnter={() => {
                    if (containerRef.current) containerRef.current.style.display = 'flex';
                }}
                onMouseMove={(event) => {
                    if (containerRef.current) {
                        const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
                        containerRef.current.style.transform = `translate(-50%, -100%) translate(${pos.x}px, ${pos.y - 10}px)`;
                    }
                }}
                onMouseLeave={() => {
                    if (containerRef.current) containerRef.current.style.display = 'none';
                }}
            />
            <path
                ref={pathRef}
                d={edgePath}
                fill="none"
                strokeWidth={selected ? 5 : 3}
                opacity={opacity}
                className={`react-flow__edge-path ${className || ''}`}
                style={{ ...(selected ? { filter: `drop-shadow(0 0 6px #facc15) drop-shadow(0 0 12px #facc15)` } : {}) }}
            />

            <EdgeLabelRenderer>
                <div ref={containerRef} style={{
                    position: 'absolute',
                    background: '#111827',
                    border: '1px solid #1f2937',
                    padding: '2px 5px',
                    borderRadius: '4px',
                    fontSize: '9px',
                    color: '#e2e8f0',
                    pointerEvents: 'none',
                    display: 'none', // Hidden by default
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
                    zIndex: 1000
                }}>
                    <span ref={alertRef} style={{ color: '#ef4444', fontWeight: 'bold', display: (data?.isBottleneck || data?.isOverloaded) ? 'inline' : 'none' }}>⚠️</span>
                    <span ref={tierRef} style={{ color: '#facc15', fontWeight: 'bold' }}>Mk.{(data?.tier ?? 0) + 1}</span>
                    <span style={{ color: '#e2e8f0', fontSize: '8px', marginLeft: '2px' }}>
                        <b ref={flowRef} style={{ color: data?.isOverloaded ? '#ef4444' : '#ffffff' }}>{(parseFloat(String(data?.actualFlow || "0")).toFixed(1))}</b> / <span ref={capacityRef}>{data?.capacity || (60 * Math.pow(2, data?.tier ?? 0))}</span>
                    </span>
                </div>
            </EdgeLabelRenderer>
        </>
    );
};
