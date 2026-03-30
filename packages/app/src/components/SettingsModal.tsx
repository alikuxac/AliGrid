import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store';

export const SettingsModal: React.FC = () => {
    const isSettingsOpen = useStore((state) => state.isSettingsOpen);
    const setIsSettingsOpen = useStore((state) => state.setIsSettingsOpen);
    const settings = useStore((state) => state.settings);
    const updateSettings = useStore((state) => state.updateSettings);

    const fpsOptions = [30, 60, 120, 240, 0];
    const isDev = (import.meta as any).env.DEV;

    if (!isSettingsOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.7)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
                onClick={() => setIsSettingsOpen(false)}
            >
                <motion.div
                    initial={{ scale: 0.9, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.9, y: 20 }}
                    style={{
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '16px',
                        padding: '24px',
                        width: '400px',
                        maxWidth: '90%',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                        color: '#f8fafc',
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>Settings</h2>
                        <button
                            onClick={() => setIsSettingsOpen(false)}
                            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '20px' }}
                        >
                            ✕
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {/* FPS Limit */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>FPS Limit</span>
                            <select
                                value={settings.fpsLimit}
                                onChange={(e) => updateSettings({ fpsLimit: Number(e.target.value) })}
                                style={{ background: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '4px', padding: '4px 8px' }}
                            >
                                {fpsOptions.map(fps => (
                                    <option key={fps} value={fps}>{fps === 0 ? 'Unlimited' : fps}</option>
                                ))}
                            </select>
                        </div>

                        {/* Animated */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Animations</span>
                            <input
                                type="checkbox"
                                checked={settings.animationsEnabled}
                                onChange={(e) => updateSettings({ animationsEnabled: e.target.checked })}
                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                            />
                        </div>

                        {/* Compact Mode */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Compact Mode</span>
                            <input
                                type="checkbox"
                                checked={settings.compactMode}
                                onChange={(e) => updateSettings({ compactMode: e.target.checked })}
                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                            />
                        </div>

                        {/* Auto-save */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Auto-save (sec)</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input
                                    type="number"
                                    value={settings.autoSaveInterval}
                                    min={0}
                                    max={3600}
                                    onChange={(e) => updateSettings({ autoSaveInterval: Math.min(3600, Math.max(0, Number(e.target.value))) })}
                                    style={{
                                        width: '60px',
                                        background: '#0f172a',
                                        border: '1px solid #334155',
                                        color: 'white',
                                        borderRadius: '4px',
                                        padding: '4px 8px'
                                    }}
                                />
                                <span style={{ fontSize: '10px', color: '#64748b' }}>0=Off</span>
                            </div>
                        </div>

                        {/* Debug Info (Dev only) */}
                        {isDev && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #334155', paddingTop: '16px' }}>
                                <span style={{ color: '#fbbf24' }}>Show Debug Info (Dev)</span>
                                <input
                                    type="checkbox"
                                    checked={settings.showDebugInfo}
                                    onChange={(e) => updateSettings({ showDebugInfo: e.target.checked })}
                                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                />
                            </div>
                        )}

                        {/* Credits */}
                        <div style={{ marginTop: '20px', padding: '16px', background: '#0f172a', borderRadius: '8px', fontSize: '13px', color: '#94a3b8' }}>
                            <div style={{ fontWeight: 'bold', color: '#f8fafc', marginBottom: '8px' }}>Credits</div>
                            <div>AliGrid Simulation Engine v1.0.0</div>
                            <div style={{ marginTop: '4px' }}>Developed with ❤️ for infinity factory lovers.</div>
                            <div style={{ marginTop: '8px', fontSize: '11px', opacity: 0.7 }}>Powered by ReactFlow & Engine</div>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
