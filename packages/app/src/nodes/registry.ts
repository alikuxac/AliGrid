import React from 'react';
import { StorageNode } from './StorageNode';
import { MergerNode } from './MergerNode';
import { SplitterNode } from './SplitterNode';
import { AntennaNode } from './AntennaNode';
import { CloudDownloaderNode } from './CloudDownloaderNode';
import { PowerNode } from './PowerNode';
import { GenericNode } from './GenericNode';
import { GroupNode } from './GroupNode';
import { MinerNode } from './MinerNode';
import { GeneratorNode } from './GeneratorNode';
import { PowerTransmitterNode } from './PowerTransmitterNode';
import { PowerReceiverNode } from './PowerReceiverNode';
import { FALLBACK_NODES } from '../config/fallbackNodes';
import { NodeTemplate } from '@aligrid/schema';
import { ItemDefinition } from '../store/types';

export const BASE_NODE_TYPES: Record<string, React.ComponentType<any>> = {
    storage: StorageNode,
    merger: MergerNode,
    splitter: SplitterNode,
    antenna: AntennaNode,
    downloader: CloudDownloaderNode,
    powerTransmitter: PowerTransmitterNode,
    powerReceiver: PowerReceiverNode,
    powerPole: PowerNode,
    accumulator: PowerNode,
    generic: GenericNode,
    groupArea: GroupNode,
};

export function getAppNodeTypes(nodeTemplates: NodeTemplate[], itemRegistry?: Record<string, ItemDefinition>) {
    const base = { ...BASE_NODE_TYPES };

    const mergedTemplates = [...nodeTemplates];
    FALLBACK_NODES.forEach((f) => {
        if (!mergedTemplates.some((t) => t.id === f.id)) mergedTemplates.push(f as any);
    });

    mergedTemplates.forEach((t) => {
        if (base[t.id]) return;

        if (t.category === 'generator') {
            const resRaw = (t as any).resource_type || (t as any).output_type || '';
            const res = typeof resRaw === 'string' ? resRaw : Array.isArray(resRaw) ? resRaw[0] : String(resRaw);

            const item = itemRegistry?.[res];
            const matter = (item?.type || 'solid').toLowerCase();
            const powerDemand = (t as any).power_demand ? Number((t as any).power_demand) : 0;

            if (powerDemand === 0) {
                base[t.id] = GeneratorNode;
            } else {
                base[t.id] = matter === 'solid' ? MinerNode : GenericNode;
            }
        } else if (t.category === 'power') {
            base[t.id] = PowerNode;
        } else {
            base[t.id] = GenericNode;
        }
    });

    return base as Record<string, React.ComponentType<any>>;
}
