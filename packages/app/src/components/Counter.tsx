import React, { useEffect } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';
import { Decimal } from '@aligrid/engine';
import { formatNumber } from '../utils/formatter';

interface CounterProps {
    value: string | number | Decimal;
    className?: string;
    style?: React.CSSProperties;
}

export const Counter: React.FC<CounterProps> = ({
    value,
    className,
    style
}) => {
    const numericValue = typeof value === 'object' && 'toNumber' in value
        ? (value as Decimal).toNumber()
        : parseFloat(String(value)) || 0;

    const spring = useSpring(numericValue, {
        mass: 0.1,
        stiffness: 80,
        damping: 15
    });

    const display = useTransform(spring, (latest: number) => formatNumber(latest));

    useEffect(() => {
        spring.set(numericValue);
    }, [numericValue, spring]);

    return (
        <motion.span className={className} style={style}>
            {display}
        </motion.span>
    );
};
