import { Decimal } from '@aligrid/engine';

export const formatNumber = (num: Decimal | number | string): string => {
    const dec = typeof num === 'object' ? num : new Decimal(num);
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
