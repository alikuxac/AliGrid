import React from 'react';
import { useStore } from '../../store';

interface TickControllerProps {
    tickRate: number;
    setTickRate: (r: number) => void;
}

export const TickController = React.memo(({ tickRate, setTickRate }: TickControllerProps) => {
    const tickCount = useStore((state) => (state as any).uiTickCount);
    return (
        <div style={{ background: '#1e293b', border: '1px solid #334155', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
            <div style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: '#10b981',
                boxShadow: tickCount % 2 === 0 ? '0 0 6px 1px #10b981' : 'none',
                transition: 'all 0.05s ease'
            }}></div>
            <span style={{ color: '#94a3b8' }}>Tick:</span>
            <button
                onClick={() => {
                    const speeds = [50, 100, 250, 500];
                    const next = speeds[(speeds.indexOf(tickRate) + 1) % speeds.length];
                    setTickRate(next);
                }}
                style={{ background: 'transparent', border: 'none', color: '#f8fafc', padding: '0 2px', cursor: 'pointer', fontFamily: 'monospace', fontWeight: 'bold' }}
            >
                {tickRate / 1000}s
            </button>
        </div>
    );
});
