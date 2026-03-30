import type { Edge, Node } from 'reactflow';
import { Decimal, ResourceType } from '@aligrid/engine';
import { RFState, NodeData } from '../../types';
import { NodeTemplate } from '@aligrid/schema';

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
    maxCapacity: number;
    edgeIds: string[];
}

export interface TickContext {
    dtSeconds: number;
    state: RFState;
    get: () => RFState;
    totalDt: number; // FULL tick duration for rate calculation
    nodesById: Record<string, Node<NodeData>>;
    edgesById: Record<string, Edge>;
    outEdgesBySource: Record<string, Edge[]>;
    inEdgesByTarget: Record<string, Edge[]>;
    nodeIncoming: Record<string, Partial<Record<ResourceType, Decimal>>>;
    nodeInputRates: Record<string, Partial<Record<ResourceType, Decimal>>>;
    edgeFlows: Record<string, Partial<Record<ResourceType, Decimal>>>;
    tickTotalInputRates: Record<string, Partial<Record<ResourceType, Decimal>>>; // TICK-WIDE accumulation for telemetry
    tickTotalFlows: Record<string, Partial<Record<ResourceType, Decimal>>>;      // TICK-WIDE accumulation for telemetry
    edgeBackpressures: Record<string, Decimal>;
    edgeBottlenecks: Record<string, boolean>;
    globalProduction: Partial<Record<ResourceType, Decimal>>;
    globalConsumption: Partial<Record<ResourceType, Decimal>>;
    cloudProduction: Partial<Record<ResourceType, Decimal>>;
    cloudConsumption: Partial<Record<ResourceType, Decimal>>;
    nextCloudStorage: Record<string, Decimal>;
    cloudConsumptionReservation: Record<string, Decimal>;
    nextNodes: Node<NodeData>[];
    nodeTemplates: NodeTemplate[];
    nodeBoosts?: Record<string, number>;
    nodeDeltas?: Record<string, Partial<NodeData>>; // Track only what changed
    downloaderTier: number;
    edgeTiers: Record<string, number>;
    cloudLevel: number;
    powerGrids: PowerGrid[];
    absPositions?: Record<string, { x: number; y: number }>;
    itemRegistry: Record<string, any>;
    tickActivity?: Record<string, boolean>;
    edgeResourceTypes?: Record<string, ResourceType>; // Store resource type per edge
}
