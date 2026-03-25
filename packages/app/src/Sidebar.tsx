import React from 'react';
import { useStore } from './store';
import { NODE_COSTS, RESOURCE_REGISTRY, Decimal } from '@aligrid/engine';
import { formatNumber } from './utils/formatter';
import { EDGE_UPGRADE_COSTS } from './store/constants';
import { FALLBACK_NODES } from './config/fallbackNodes';

export const Sidebar: React.FC = () => {
    const cloudStorage = useStore((state) => state.cloudStorage);
    const edgeTiers = useStore((state) => state.edgeTiers) || {};
    const downloaderTier = useStore((state) => state.downloaderTier) || 0;
    const nodeTemplates = useStore((state) => state.nodeTemplates) || [];
    const edgeUpgradeCosts = useStore((state) => state.edgeUpgradeCosts);
    const isViewOnly = useStore((state) => state.isViewOnly);
    const [search, setSearch] = React.useState('');
    const activeTab = useStore((state) => state.activeTab) || 'nodes';
    const setActiveTab = useStore((state) => state.setActiveTab);
    const globalStats = useStore((state) => state.globalStats);
    const cloudLevel = useStore((state) => state.cloudLevel) || 1;
    const decCap = new Decimal(5000).times(Math.pow(2, cloudLevel - 1));
    const upgradeCloudLevel = useStore((state) => state.upgradeCloudLevel);

    const nodes = useStore((state) => state.nodes);

    const categoryNames: Record<string, string> = {
        generator: "Generator",
        processor: "Processor",
        logistics: "Logistics",
        storage: "Storage",
        power: "Power",
        layout: "Layout"
    };

    const categories: { key: string; name: string; nodes: { type: string; label: string; icon: string; template?: any }[] }[] = [];
    const grouped: Record<string, { type: string; label: string; icon: string; template?: any }[]> = {};

    const mergedTemplates = [...nodeTemplates];
    FALLBACK_NODES.forEach((f: any) => {
        if (!mergedTemplates.some((t: any) => t.id === f.id)) mergedTemplates.push(f);
    });

    mergedTemplates
        .filter(t => t.id !== 'lavaGenerator')
        .forEach(t => {
            let cat = t.category || 'other';
            if (t.id === 'accumulator') cat = 'power';
            if (!grouped[cat]) grouped[cat] = [];

            grouped[cat].push({
                type: t.id,
                label: t.name,
                icon: t.icon || '❓',
                template: t
            });
        });

    if (!grouped['layout']) grouped['layout'] = [];
    if (!grouped['layout'].some(n => n.type === 'groupArea')) {
        grouped['layout'].push({ type: 'groupArea', label: 'Group Area', icon: '📦' });
    }

    const preferredOrder = ['generator', 'processor', 'logistics', 'power', 'layout'];

    preferredOrder.forEach(cat => {
        if (grouped[cat]) {
            categories.push({
                key: cat,
                name: categoryNames[cat] || cat,
                nodes: grouped[cat]
            });
        }
    });

    Object.keys(grouped).forEach(cat => {
        if (!preferredOrder.includes(cat)) {
            categories.push({
                key: cat,
                name: categoryNames[cat] || cat,
                nodes: grouped[cat]
            });
        }
    });

    const onDragStart = (event: React.DragEvent, node: any) => {
        if (isViewOnly) {
            event.preventDefault();
            return;
        }
        const payload = { type: node.type, template: node.template };
        event.dataTransfer.setData('application/reactflow', JSON.stringify(payload));
        event.dataTransfer.effectAllowed = 'move';
    };

    return (
        <aside style={{
            width: '300px',
            background: '#1e293b', // slate-800
            borderRight: '1px solid #0f172a',
            color: '#f8fafc', // slate-50
            display: 'flex',
            flexDirection: 'column',
            padding: '16px',
            fontFamily: 'sans-serif',
            overflowY: 'auto',
            height: '100%',
            boxSizing: 'border-box',
            minHeight: 0
        }}>
            <h2 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#94a3b8' }}>Elements Panel</h2>

            {/* Tabs Header */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
                <button
                    onClick={() => setActiveTab('nodes')}
                    style={{ flex: 1, padding: '6px', background: activeTab === 'nodes' ? '#2563eb' : '#334155', border: 'none', color: 'white', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
                    Nodes
                </button>
                <button
                    onClick={() => setActiveTab('upgrades')}
                    style={{ flex: 1, padding: '6px', background: activeTab === 'upgrades' ? '#2563eb' : '#334155', border: 'none', color: 'white', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
                    Upgrades
                </button>
                <button
                    onClick={() => setActiveTab('inventory')}
                    style={{ flex: 1, padding: '6px', background: activeTab === 'inventory' ? '#2563eb' : '#334155', border: 'none', color: 'white', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
                    Inventory
                </button>
            </div>

            {activeTab === 'nodes' && (
                <>
                    <input
                        type="text"
                        placeholder="Search nodes..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{
                            background: '#334155',
                            border: '1px solid #475569',
                            borderRadius: '4px',
                            padding: '6px 10px',
                            color: '#f8fafc',
                            fontSize: '12px',
                            marginBottom: '20px',
                            outline: 'none',
                            width: '100%',
                            boxSizing: 'border-box'
                        }}
                    />
                    {categories.map((category) => {
                        const filteredNodes = category.nodes.filter(node =>
                            node.label.toLowerCase().includes(search.toLowerCase()) ||
                            node.type.toLowerCase().includes(search.toLowerCase())
                        );
                        if (filteredNodes.length === 0) return null;

                        return (
                            <div key={category.name} style={{ marginBottom: '24px' }}>
                                <h3 style={{
                                    fontSize: '14px',
                                    textTransform: 'uppercase',
                                    color: '#64748b',
                                    margin: '0 0 12px 0',
                                    letterSpacing: '0.05em'
                                }}>
                                    {category.name}
                                </h3>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {filteredNodes.map((node) => {
                                        const cost = node.template?.cost || NODE_COSTS[node.type] || {};
                                        const canAfford = Object.entries(cost).every(([r, a]) => (cloudStorage[r] || new Decimal(0)).gte(a as Decimal));

                                        const isLimited = category.key === 'generator';
                                        const currentCount = nodes.filter((n: any) => {
                                            const placedId = n.data?.template?.id;
                                            if (placedId) {
                                                return placedId === node.type;
                                            }
                                            return n.type === node.type;
                                        }).length;
                                        const limitReached = isLimited && currentCount >= 1;

                                        return (
                                            <div
                                                key={node.type === 'generic' ? node.template.id : node.type}
                                                className="dndnode"
                                                onDragStart={(event) => { if (!limitReached) onDragStart(event, node); }}
                                                draggable={!limitReached && !isViewOnly}
                                                style={{
                                                    background: '#334155',
                                                    border: `1px solid ${canAfford && !limitReached ? '#475569' : '#f8717140'}`,
                                                    borderRadius: '6px',
                                                    padding: '10px 8px',
                                                    cursor: isViewOnly ? 'not-allowed' : limitReached ? 'not-allowed' : 'grab',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    width: 'calc(50% - 4px)',
                                                    gap: '4px',
                                                    transition: 'background 0.2s',
                                                    opacity: canAfford && !limitReached ? 1 : 0.5
                                                }}
                                                onMouseOver={(e) => { if (!limitReached) e.currentTarget.style.background = '#475569'; }}
                                                onMouseOut={(e) => { if (!limitReached) e.currentTarget.style.background = '#334155'; }}
                                            >
                                                <span style={{ fontSize: '22px' }}>{node.icon}</span>
                                                <span style={{ fontSize: '11px', textAlign: 'center', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                    {node.label}
                                                    {isLimited && (
                                                        <span style={{ color: limitReached ? '#f87171' : '#4ade80', fontSize: '9px', fontWeight: 'normal' }}>
                                                            ({currentCount}/1)
                                                        </span>
                                                    )}
                                                </span>

                                                {/* Cost Requirements */}
                                                <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '3px' }}>
                                                    {Object.entries(cost).map(([res, amt]) => {
                                                        const meta = RESOURCE_REGISTRY[res] || { icon: '❓' };
                                                        return (
                                                            <div key={res} style={{ display: 'flex', alignItems: 'center', gap: '1px', fontSize: '9px', color: (cloudStorage[res] || new Decimal(0)).gte(amt as Decimal) ? '#4ade80' : '#f87171' }}>
                                                                <span>{meta.icon}</span>
                                                                <span>{formatNumber(amt as Decimal)}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </>
            )}

            {activeTab === 'upgrades' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Global Connection Upgrades</div>
                    {[['solid', 'Solid (Items)'], ['liquid', 'Liquid (Fluids)'], ['gas', 'Gas (Air)'], ['power', 'Power Grid']].map(([key, label]) => {
                        const edgeCosts = edgeUpgradeCosts;

                        const tier = (edgeTiers as any)[key] || 0;
                        const baseCost = (edgeCosts as any)[key] || {};
                        const cost: any = {};
                        for (const [r, a] of Object.entries(baseCost)) {
                            cost[r] = (a as Decimal).times(Math.pow(3, tier));
                        }
                        const canAfford = Object.entries(cost).every(([r, a]) => (cloudStorage[r] || new Decimal(0)).gte(a as Decimal));

                        return (
                            <div key={key} style={{ background: '#334155', borderRadius: '6px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 'bold', fontSize: '12px' }}>{label}</span>
                                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>Lv.{tier}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {Object.entries(cost).map(([res, amt]) => {
                                        const meta = RESOURCE_REGISTRY[res] || { icon: '❓' };
                                        return (
                                            <div key={res} style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '10px', color: (cloudStorage[res] || new Decimal(0)).gte(amt as any) ? '#4ade80' : '#f87171' }}>
                                                <span>{meta.icon}</span>
                                                <span>{formatNumber(amt as any)}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <button
                                    onClick={() => (useStore.getState() as any).upgradeEdgeTier(key)}
                                    disabled={!canAfford || isViewOnly}
                                    style={{
                                        width: '100%', background: isViewOnly ? '#4b5563' : canAfford ? '#2563eb' : '#4b5563', border: 'none', color: 'white',
                                        borderRadius: '4px', padding: '5px', fontSize: '11px', fontWeight: 'bold', cursor: isViewOnly ? 'not-allowed' : canAfford ? 'pointer' : 'not-allowed',
                                        marginTop: '4px'
                                    }}
                                >
                                    Upgrade (60 x2^{tier + 1}/s)
                                </button>
                            </div>
                        );
                    })}

                    {/* Downloader Speed Upgrade */}
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '12px', marginTop: '4px' }}>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '8px' }}>Downloader Speed</div>
                        {(() => {
                            const dlBaseCost: Record<string, Decimal> = { iron: new Decimal(50), copper: new Decimal(30) };
                            const dlCost: Record<string, Decimal> = {};
                            for (const [r, a] of Object.entries(dlBaseCost)) {
                                dlCost[r] = a.times(Math.pow(3, downloaderTier as number));
                            }
                            const dlCanAfford = Object.entries(dlCost).every(([r, a]) => (cloudStorage[r] || new Decimal(0)).gte(a));
                            const currentRate = Math.pow(2, downloaderTier as number);
                            const nextRate = Math.pow(2, (downloaderTier as number) + 1);

                            return (
                                <div style={{ background: '#334155', borderRadius: '6px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 'bold', fontSize: '12px' }}>📥 All Downloaders</span>
                                        <span style={{ fontSize: '10px', color: '#94a3b8' }}>Lv.{downloaderTier as number} ({currentRate}/s)</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        {Object.entries(dlCost).map(([res, amt]) => {
                                            const meta = RESOURCE_REGISTRY[res] || { icon: '❓' };
                                            return (
                                                <div key={res} style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '10px', color: (cloudStorage[res] || new Decimal(0)).gte(amt) ? '#4ade80' : '#f87171' }}>
                                                    <span>{meta.icon}</span>
                                                    <span>{formatNumber(amt)}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <button
                                        onClick={() => (useStore.getState() as any).upgradeDownloaderTier()}
                                        disabled={!dlCanAfford || isViewOnly}
                                        style={{
                                            width: '100%', background: isViewOnly ? '#4b5563' : dlCanAfford ? '#2563eb' : '#4b5563', border: 'none', color: 'white',
                                            borderRadius: '4px', padding: '5px', fontSize: '11px', fontWeight: 'bold', cursor: isViewOnly ? 'not-allowed' : dlCanAfford ? 'pointer' : 'not-allowed',
                                            marginTop: '4px'
                                        }}
                                    >
                                        Upgrade → {nextRate}/s per Downloader
                                    </button>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}

            {activeTab === 'inventory' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', alignItems: 'center', borderBottom: '1px solid #374151', paddingBottom: '3px' }}>
                        <span style={{ color: 'white', fontWeight: 'bold', fontSize: '13px' }}>Storage Capacities</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {Object.values(RESOURCE_REGISTRY).filter(r => r.isUploadAvailable).map((meta) => {
                            const res = meta.id;
                            const cur = cloudStorage[res] || new Decimal(0);
                            const percent = Math.min(100, (cur.toNumber() / decCap.toNumber()) * 100);

                            return (
                                <div key={res} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#f3f4f6' }}>
                                            <span>{meta.icon}</span>
                                            <span>{meta.label}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontSize: '11px', color: '#9ca3af' }}>{formatNumber(cur)}/{formatNumber(decCap)}</span>
                                        </div>
                                    </div>
                                    <div style={{ height: '4px', background: '#374151', borderRadius: '2px', overflow: 'hidden' }}>
                                        <div style={{ width: `${percent}%`, height: '100%', background: meta.color || '#3b82f6', borderRadius: '2px' }} />
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginTop: '1px' }}>
                                        <span style={{ color: '#10b981' }}>+{((globalStats)?.cloudProduction?.[res] || new Decimal(0)).toNumber().toFixed(1)}{(meta as any).unit || ''}/s</span>
                                        <span style={{ color: '#f87171' }}>-{((globalStats)?.cloudConsumption?.[res] || new Decimal(0)).toNumber().toFixed(1)}{(meta as any).unit || ''}/s</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Level Upgrade Footer */}
                    <div style={{ marginTop: '15px', paddingTop: '12px', borderTop: '1px solid #374151', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#9ca3af', fontSize: '12px' }}>Level: <b style={{ color: '#f8fafc' }}>{cloudLevel || 1}</b></span>
                            <span style={{ color: '#9ca3af', fontSize: '12px' }}>Cap: <b style={{ color: '#a5b4fc' }}>{formatNumber(decCap)}</b></span>
                        </div>

                        {/* Cost list */}
                        <div style={{ padding: '6px 8px', background: '#11182760', border: '1px solid #374151', borderRadius: '4px', fontSize: '11px' }}>
                            <div style={{ color: '#94a3b8', fontSize: '10px', marginBottom: '3px' }}>Cost to Upgrade Level:</div>
                            {[
                                { id: 'iron', label: 'Iron', icon: '⛏️', cost: new Decimal(100).times(Math.pow(3, (cloudLevel || 1) - 1)) },
                                { id: 'copper', label: 'Copper', icon: '⚒️', cost: new Decimal(100).times(Math.pow(3, (cloudLevel || 1) - 1)) }
                            ].map(item => {
                                const cur = cloudStorage[item.id] || new Decimal(0);
                                const isAffordable = cur.gte(item.cost);
                                return (
                                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', color: isAffordable ? '#10b981' : '#f87171', marginBottom: '2px' }}>
                                        <span>{item.icon} {item.label}</span>
                                        <span>{formatNumber(cur)}/{formatNumber(item.cost)}</span>
                                    </div>
                                )
                            })}
                        </div>

                        <button
                            onClick={() => upgradeCloudLevel()}
                            disabled={isViewOnly}
                            style={{
                                width: '100%', background: isViewOnly ? '#4b5563' : '#2563eb', border: 'none', color: 'white',
                                borderRadius: '4px', padding: '6px', fontSize: '12px', fontWeight: 'bold', cursor: isViewOnly ? 'not-allowed' : 'pointer',
                                transition: 'background 0.2s'
                            }}
                        >
                            Upgrade Cloud Capacity
                        </button>
                    </div>
                </div>
            )}

            <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <button
                    onClick={() => {
                        if (isViewOnly) return;
                        if (confirm("Are you sure you want to RESET ALL DATA? This cannot be undone!")) {
                            (useStore.getState() as any).resetAllData();
                        }
                    }}
                    style={{
                        width: '100%',
                        background: '#dc2626',
                        border: 'none',
                        color: 'white',
                        borderRadius: '4px',
                        padding: '10px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        cursor: isViewOnly ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        opacity: isViewOnly ? 0.5 : 1
                    }}
                    onMouseOver={(e) => { if (!isViewOnly) e.currentTarget.style.background = '#ef4444'; }}
                    onMouseOut={(e) => { if (!isViewOnly) e.currentTarget.style.background = '#dc2626'; }}
                >
                    <span>🗑️</span>
                    <span>Reset All Data</span>
                </button>
            </div>
        </aside>
    );
};
