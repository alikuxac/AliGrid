import type { Node, Edge, OnNodesChange, OnEdgesChange, OnConnect } from 'reactflow';
import { ResourceType, Decimal } from '@aligrid/engine';
import { NodeTemplate } from '@aligrid/schema';

export interface RecipeConfig {
    id?: string;
    inputType: string;
    outputType: string;
    conversionRate: string | number | Decimal;
    inputRates?: string;
    ingredients?: Array<{ itemId: string; amount: number; usageType: string }>;
}

export interface ItemDefinition {
    id: string;
    name: string;
    type: string; // SOLID, LIQUID, GAS, POWER
    icon?: string;
}

export interface NodeData {
    level?: number;
    status?: string;
    boost?: number;
    boostedCount?: number;
    debugLog?: string;
    debugInfo?: string;
    isOff?: boolean;
    resourceType?: string;
    powerConsumption?: string | number;
    incomingRates?: Record<string, { res: string; rate: string } | Array<{ res: string; rate: string }>>;
    recipes?: RecipeConfig[];
    recipe?: RecipeConfig;
    buffer?: string | number | Decimal;
    maxBuffer?: string | number | Decimal;
    wirelessEfficiency?: number | Decimal | string;
    productionEfficiency?: number | Decimal | string;
    gridSupply?: Decimal | string;
    gridDemand?: Decimal | string;
    ratios?: number[];
    maxOutputs?: number;
    activeInputs?: number;
    maxInputs?: number;
    lockedResourceType?: string;
    template?: NodeTemplate;
    actualInputPerSec?: Decimal | string;
    actualOutputPerSec?: Decimal | string;
    currentAmount?: Decimal | string;
    width?: number;
    height?: number;
    tier?: number;
    outputRate?: number | string | Decimal;
    efficiency?: number | Decimal | string;
    inputEfficiency?: Decimal | string;
    activeRecipeIndex?: number;
    inputBuffer?: Partial<Record<string, number | Decimal | string>>;
    inputRates?: Partial<Record<string, number | Decimal | string>>;
    outputBuffer?: Partial<Record<string, number | Decimal | string>>;
    label?: string;
    color?: string;
    isLocked?: boolean;
    backpressure?: string;
    category?: string;
    channel?: number;
    handleFlows?: Record<string, string>;
    handleResourceTypes?: Record<string, string>;
    cloudReserve?: string | number | Decimal;
    cloudReservePercent?: number;
    requiresPower?: boolean;
}

export type RFState = {
    nodes: Node<NodeData>[];
    edges: Edge[];
    cloudStorage: Partial<Record<string, string | Decimal>>;
    cloudLevel: number;
    getCloudAmount: (res: string) => Decimal;
    getCloudCapacity: (level?: number) => Decimal;
    onNodesChange: OnNodesChange;
    onEdgesChange: OnEdgesChange;
    onConnect: OnConnect;
    addNode: (node: Node<NodeData>) => void;
    updateNodeData: (nodeId: string, newData: Partial<NodeData>) => void;
    upgradeCloudLevel: () => void;
    upgradeNode: (nodeId: string) => void;
    resetNodes: () => void;
    toggleNodePower: (nodeId: string) => void;
    upgradeEdge: (edgeId: string) => void;
    canAfford: (cost: Partial<Record<string, Decimal>>) => boolean;
    deductMaterials: (cost: Partial<Record<string, Decimal>>) => void;
    saveState: () => void;
    loadState: () => void;
    saveStateToServer: () => Promise<void>;
    loadStateFromServer: () => Promise<void>;
    tick: (dtSeconds: number) => void;
    applyTickResults: (results: any) => void;
    setInteractionMode: (mode: 'select' | 'demolish') => void;
    getCloudUpgradeCost: (level?: number) => Record<string, Decimal>;
    globalStats?: {
        production: Partial<Record<string, string | Decimal>>;
        consumption: Partial<Record<string, string | Decimal>>;
        cloudProduction?: Partial<Record<string, string | Decimal>>;
        cloudConsumption?: Partial<Record<string, string | Decimal>>;
    };
    edgeTiers: Record<string, number>;
    upgradeEdgeTier: (matter: 'solid' | 'liquid' | 'gas' | 'power') => void;
    nodeTemplates: NodeTemplate[];
    loadNodeTemplates: () => Promise<void>;
    edgeUpgradeCosts: Record<string, Partial<Record<ResourceType, Decimal>>>;
    loadEdgeUpgradeCosts: () => Promise<void>;
    isViewOnly?: boolean;
    setIsViewOnly?: (val: boolean) => void;
    addNodeToGroup: (nodeId: string, groupId: string | null) => void;
    downloaderTier?: number;
    activeTab: 'nodes' | 'upgrades' | 'inventory';
    setActiveTab: (val: 'nodes' | 'upgrades' | 'inventory') => void;
    isSidebarOpen: boolean;
    setIsSidebarOpen: (val: boolean) => void;
    nodeStats: Record<string, Partial<NodeData>>;
    edgeStats: Record<string, Partial<FlowEdgeData>>;
    interactionMode: 'select' | 'demolish';
    flushNode: (nodeId: string) => void;
    uiTickCount: number;
    incrementUiTickCount: () => void;
    itemRegistry: Record<string, ItemDefinition>;
    loadItems: () => Promise<void>;
    // Settings
    settings: SettingsState;
    updateSettings: (newSettings: Partial<SettingsState>) => void;
    isSettingsOpen: boolean;
    setIsSettingsOpen: (val: boolean) => void;
};

export interface SettingsState {
    fpsLimit: number;
    animationsEnabled: boolean;
    showDebugInfo: boolean;
    autoSaveInterval: number;
    compactMode: boolean;
}

export interface FlowEdgeData {
    flow?: number | string | Decimal;
    actualFlow?: number | string | Decimal;
    tier?: number;
    isBottleneck?: boolean;
    backpressureRate?: string;
    isTripped?: boolean;
    resourceType?: string;
    capacity?: string | number;
    isOverloaded?: boolean;
    duration?: number;
    className?: string;
}
