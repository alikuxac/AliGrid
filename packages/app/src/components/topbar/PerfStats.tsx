import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';

interface PerfStatsProps {
    tickRate: number;
}

export const PerfStats = React.memo(({ tickRate }: PerfStatsProps) => {
    const uiTickCount = useStore((state) => (state as any).uiTickCount);
    const [fps, setFps] = useState(0);
    const [tps, setTps] = useState(0);
    const lastTickCountRef = useRef(useStore.getState().uiTickCount);
    const uiTickCountRef = useRef(uiTickCount);

    useEffect(() => {
        uiTickCountRef.current = uiTickCount;
    }, [uiTickCount]);

    useEffect(() => {
        let frameCount = 0;
        let lastTime = performance.now();
        let rafId: number;

        const loop = () => {
            frameCount++;
            const now = performance.now();
            if (now - lastTime >= 1000) {
                setFps(Math.round((frameCount * 1000) / (now - lastTime)));
                frameCount = 0;
                lastTime = now;
            }
            rafId = requestAnimationFrame(loop);
        };
        rafId = requestAnimationFrame(loop);

        const tpsInterval = setInterval(() => {
            const currentTicks = uiTickCountRef.current;
            const delta = currentTicks - lastTickCountRef.current;
            setTps(delta);
            lastTickCountRef.current = currentTicks;
        }, 1000);

        return () => {
            cancelAnimationFrame(rafId);
            clearInterval(tpsInterval);
        };
    }, []);

    return (
        <div style={{ background: '#1e293b', border: '1px solid #334155', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ color: '#94a3b8' }}>Render:</span>
                <span style={{
                    color: fps > 50 ? '#4ade80' : fps > 30 ? '#fbbf24' : '#f87171',
                    fontWeight: 'bold',
                    minWidth: '18px',
                    textAlign: 'right'
                }}>{fps}</span>
            </div>
            <div style={{ width: '1px', height: '10px', background: '#334155' }}></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ color: '#94a3b8' }}>Sim:</span>
                <span style={{
                    color: tps >= (1000 / tickRate) * 0.9 ? '#4ade80' : '#fbbf24',
                    fontWeight: 'bold',
                    minWidth: '18px',
                    textAlign: 'right'
                }}>{tps}</span>
            </div>
        </div>
    );
});
