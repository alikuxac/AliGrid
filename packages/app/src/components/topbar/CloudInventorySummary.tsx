import React from 'react';
import { useStore } from '../../store';
import { RESOURCE_REGISTRY, Decimal } from '@aligrid/engine';
import { formatNumber } from '../../utils/formatter';

interface CloudInventorySummaryProps {
    setActiveTab: (val: any) => void;
    setIsSidebarOpen: (val: boolean) => void;
}

export const CloudInventorySummary = React.memo(({ setActiveTab, setIsSidebarOpen }: CloudInventorySummaryProps) => {
    const cloudLevel = useStore((state) => (state as any).cloudLevel) || 1;
    const cloudStorage = useStore((state) => (state as any).cloudStorage) || {};
    const getCloudCapacity = useStore((state) => (state as any).getCloudCapacity);

    // Calculate aggregate limits
    const activeResourcesCount = Object.values(RESOURCE_REGISTRY).filter(r => r.isUploadAvailable).length;
    const decCap = getCloudCapacity(cloudLevel);
    const globalCap = decCap.times(activeResourcesCount);
    const globalTotal = Object.values(cloudStorage).reduce((s: Decimal, a) => s.plus(new Decimal(a as any)), new Decimal(0));

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>☁️</span>
            <span style={{ fontWeight: 'bold', color: '#f8fafc', fontSize: '14px' }}>Cloud Inventory <span style={{ color: '#60a5fa', fontSize: '12px', marginLeft: '4px' }}>(Lv.{cloudLevel})</span></span>
            <div style={{ background: '#374151', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{formatNumber(globalTotal)} / {formatNumber(globalCap)}</span>
                <button
                    onClick={() => {
                        setActiveTab?.('inventory');
                        setIsSidebarOpen?.(true);
                    }}
                    style={{ background: '#4b5563', border: 'none', color: 'white', padding: '1px 5px', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}
                >
                    Details
                </button>
            </div>
        </div>
    );
});
