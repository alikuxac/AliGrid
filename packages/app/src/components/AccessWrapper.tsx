import React, { useEffect, useState } from 'react';
import { isPlatformAccessAllowed, WEB_ACCESS_PASSWORD } from '../config/accessControl';
import { useStore } from '../store';

interface AccessWrapperProps {
    children: React.ReactNode;
}

export const AccessWrapper: React.FC<AccessWrapperProps> = ({ children }) => {
    const [loading, setLoading] = useState(true);
    const [isAllowed, setIsAllowed] = useState(false);
    const [password, setPassword] = useState('');
    const [authError, setAuthError] = useState('');
    const [platform, setPlatform] = useState<'telegram' | 'discord' | 'web'>('web');

    useEffect(() => {
        const detectPlatformAndCheck = async () => {
            try {
                // Bypass for localhost / Development
                if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                    setIsAllowed(true);
                    setLoading(false);
                    return;
                }

                // 1. Check Telegram
                const tg = (window as any).Telegram?.WebApp;
                if (tg && tg.initDataUnsafe?.user) {
                    setPlatform('telegram');
                    const userId = tg.initDataUnsafe.user.id?.toString();
                    if (isPlatformAccessAllowed('telegram', userId)) {
                        setIsAllowed(true);
                    } else {
                        setAuthError(`Telegram ID ${userId} is not on the whitelist.`);
                    }
                    setLoading(false);
                    return;
                }

                // 2. Check Discord Activity (client-side simple check)
                // Note: Secure check requires OAuth exchange, this is for dev lock screen
                const searchParams = new URLSearchParams(window.location.search);
                const frameId = searchParams.get('frame_id');
                if (frameId || (window as any).DiscordSDK) {
                    setPlatform('discord');
                    // In real Activity, we initialize DiscordSDK here
                    // For client-side locking, we'll wait for SDK or check params
                    setAuthError("Discord Access locked in client; add initialize credentials.");
                    // setLoading(false);
                    // return;
                }

                // Default to Web
                setLoading(false);
                // IF you want to lock web as well, set to false and let password handle it
                // For now, let's open web for local testing unless explicitly locked
                const savedAuth = localStorage.getItem('aligrid_auth_web');
                if (savedAuth === 'true' || WEB_ACCESS_PASSWORD === 'change_me') {
                    setIsAllowed(true);
                }

            } catch (err) {
                console.error("Access check failed", err);
                setLoading(false);
            }
        };

        detectPlatformAndCheck();
    }, []);

    const handlePasswordSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (password === WEB_ACCESS_PASSWORD) {
            setIsAllowed(true);
            localStorage.setItem('aligrid_auth_web', 'true');
            setAuthError('');
        } else {
            setAuthError('Incorrect password.');
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0a0f1d', color: 'white' }}>
                <h2>Verifying access...</h2>
            </div>
        );
    }

    if (!isAllowed) {
        return (
            <div style={{
                display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                height: '100vh', background: '#0a0f1d', color: '#f8fafc', fontFamily: 'sans-serif', padding: '20px'
            }}>
                <div style={{ background: '#111827', padding: '30px', borderRadius: '8px', border: '1px solid #1f2937', textAlign: 'center', maxWidth: '400px' }}>
                    <span style={{ fontSize: '40px' }}>🔒</span>
                    <h2 style={{ margin: '15px 0' }}>Access Restricted</h2>

                    {authError && (
                        <p style={{ color: '#ef4444', fontSize: '14px', marginBottom: '20px' }}>{authError}</p>
                    )}

                    {platform === 'web' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                                <input
                                    type="password"
                                    placeholder="Enter Access Password"
                                    value={password}
                                    onChange={(e) => setPassword(e.currentTarget.value)}
                                    style={{
                                        background: '#1f2937', border: '1px solid #374151', borderRadius: '4px',
                                        padding: '8px 12px', color: 'white', outline: 'none'
                                    }}
                                />
                                <button type="submit" style={{
                                    background: '#2563eb', border: 'none', color: 'white', padding: '8px',
                                    borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
                                }}>
                                    Unlock
                                </button>
                            </form>

                            <div style={{ margin: '10px 0', color: '#6b7280', fontSize: '12px' }}>— OR —</div>

                            <button
                                onClick={() => {
                                    const setIsViewOnly = (useStore.getState() as any).setIsViewOnly;
                                    if (setIsViewOnly) setIsViewOnly(true);
                                    setIsAllowed(true);
                                }}
                                style={{
                                    background: '#374151', border: '1px solid #4b5563', color: '#f3f4f6', padding: '8px',
                                    borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
                                }}>
                                Enter Read-Only Mode
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return <>{children}</>;
};
