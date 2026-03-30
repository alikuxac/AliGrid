import { Decimal } from '@aligrid/engine';

export const formatNumber = (num: Decimal | number | string): string => {
    if (num === undefined || num === null) return "0";

    // Ensure we have a Decimal-like object or a string/number
    let dec: Decimal;
    try {
        if (typeof num === 'object' && num !== null) {
            // Check if it's already a Decimal or has a toNumber method
            if ('abs' in num && typeof (num as any).abs === 'function') {
                dec = num as Decimal;
            } else {
                // Fallback for weird objects from DB/Sim
                dec = new Decimal(String(num));
            }
        } else {
            dec = new Decimal(num as any);
        }
    } catch (e) {
        console.error("formatNumber received invalid value:", num, e);
        return "0";
    }

    const absNum = dec.abs();
    if (absNum.eq(0)) return "0";
    if (absNum.lt(100000)) {
        const val = dec.toNumber();
        const rounded = Math.round(val);
        if (Math.abs(val - rounded) < 0.01) {
            return rounded.toString();
        }
        return val.toFixed(1);
    }
    // Scientific notation for large numbers
    return dec.toExponential(2);
};
