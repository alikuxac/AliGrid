import { Edge, Node } from 'reactflow';
import { Decimal, ResourceType } from '@aligrid/engine';
import { RFState, NodeData } from '../../types';

export interface PowerGrid {
    id: number;
    poles: Node<NodeData>[];
    producers: Node<NodeData>[];
    accumulators: Node<NodeData>[];
    consumers: Node<NodeData>[];
    supply: Decimal;
    demand: Decimal;
    efficiency: Decimal;
    updatedAccumulators: Record<string, Decimal>;
    productionEfficiency?: Decimal;
}

export interface TickContext {
    dtSeconds: number;
    state: RFState;
    get: () => RFState;
    nodesById: Record<string, Node<NodeData>>;
    edgesById: Record<string, Edge>;
    outEdgesBySource: Record<string, Edge[]>;
    inEdgesByTarget: Record<string, Edge[]>;
    nodeIncoming: Record<string, Partial<Record<ResourceType, Decimal>>>;
    edgeFlows: Record<string, Partial<Record<ResourceType, Decimal>>>;
    edgeBackpressures: Record<string, Decimal>;
    edgeBottlenecks: Record<string, boolean>;
    globalProduction: Partial<Record<ResourceType, Decimal>>;
    globalConsumption: Partial<Record<ResourceType, Decimal>>;
    cloudProduction: Partial<Record<ResourceType, Decimal>>;
    cloudConsumption: Partial<Record<ResourceType, Decimal>>;
    nextCloudStorage: Record<string, Decimal>; // Thường là Record<ResourceType, Decimal> nhưng dể string cho an toàn map
    nextNodes: Node<NodeData>[];
    nodeBoosts?: Record<string, number>;
}
