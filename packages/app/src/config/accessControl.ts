// src/config/accessControl.ts

export const ALLOWED_TELEGRAM_IDS = (import.meta.env.VITE_ALLOWED_TELEGRAM_IDS || "")
    .split(",")
    .filter(Boolean);

export const ALLOWED_DISCORD_IDS = (import.meta.env.VITE_ALLOWED_DISCORD_IDS || "")
    .split(",")
    .filter(Boolean);

export const WEB_ACCESS_PASSWORD = import.meta.env.VITE_WEB_ACCESS_PASSWORD || "change_me";

export function isPlatformAccessAllowed(platform: 'telegram' | 'discord' | 'web', userId?: string): boolean {
    if (platform === 'telegram' && userId) {
        return ALLOWED_TELEGRAM_IDS.includes(userId);
    }
    if (platform === 'discord' && userId) {
        return ALLOWED_DISCORD_IDS.includes(userId);
    }
    return false;
}
