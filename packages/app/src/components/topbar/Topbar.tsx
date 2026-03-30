import React from 'react';
import { useStore } from '../../store';
import { CloudInventorySummary } from './CloudInventorySummary';
import { TickController } from './TickController';
import { PerfStats } from './PerfStats';

interface TopbarProps {
    tickRate: number;
    setTickRate: (r: number) => void;
    saveStateToServer: () => void;
    loadStateFromServer: () => void;
    isViewOnly?: boolean;
}

export const Topbar = React.memo(({
    tickRate,
    setTickRate,
    saveStateToServer,
    loadStateFromServer,
    isViewOnly
}: TopbarProps) => {
    const setActiveTab = useStore((state) => (state as any).setActiveTab);
    const setIsSidebarOpen = useStore((state) => (state as any).setIsSidebarOpen);

    return (
        <div style={{
            background: '#111827',
            borderBottom: '1px solid #1f2937',
            padding: '10px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            zIndex: 10
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CloudInventorySummary
                    setActiveTab={setActiveTab}
                    setIsSidebarOpen={setIsSidebarOpen}
                />

                <TickController
                    tickRate={tickRate}
                    setTickRate={setTickRate}
                />

                <PerfStats tickRate={tickRate} />

                <div style={{ display: 'flex', gap: '4px', marginLeft: '6px' }}>
                    <button
                        disabled={isViewOnly}
                        onClick={() => useStore.getState().resetNodes()}
                        style={{ background: isViewOnly ? '#4b5563' : '#ef4444', border: 'none', color: 'white', padding: '3px 6px', borderRadius: '3px', cursor: isViewOnly ? 'not-allowed' : 'pointer', fontSize: '10px', fontWeight: 'bold' }}
                    >
                        ♻️ Reset Levels
                    </button>
                    <button
                        disabled={isViewOnly}
                        onClick={() => saveStateToServer()}
                        style={{ background: isViewOnly ? '#4b5563' : '#059669', border: 'none', color: 'white', padding: '3px 6px', borderRadius: '3px', cursor: isViewOnly ? 'not-allowed' : 'pointer', fontSize: '10px', fontWeight: 'bold' }}
                    >
                        📤 Push
                    </button>
                    <button
                        disabled={isViewOnly}
                        onClick={() => loadStateFromServer()}
                        style={{ background: isViewOnly ? '#4b5563' : '#2563eb', border: 'none', color: 'white', padding: '3px 6px', borderRadius: '3px', cursor: isViewOnly ? 'not-allowed' : 'pointer', fontSize: '10px', fontWeight: 'bold' }}
                    >
                        📥 Fetch
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center' }}>
                <button
                    onClick={() => useStore.getState().setIsSettingsOpen(true)}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#94a3b8',
                        fontSize: '20px',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '4px',
                        transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
                    title="Settings"
                >
                    ⚙️
                </button>
            </div>
        </div>
    );
});
