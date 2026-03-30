import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, { Background, Controls, ReactFlowProvider, ReactFlowInstance, Connection as RFConnection, MiniMap, Node, Edge, NodeChange, EdgeChange, XYPosition } from 'reactflow';
import 'reactflow/dist/style.css';
import './index.css';

import { useStore, NodeData } from './store';
import { FluidEdge, PowerEdge } from './edges/CustomEdges';
import { Sidebar } from './Sidebar';
import { formatNumber } from './utils/formatter';
import {
    ResourceType,
    Decimal,
    NODE_DATA_FACTORY,
    NODE_COSTS
} from '@aligrid/engine';
import { getAppNodeTypes } from './nodes/registry';
import { FlowCanvas } from './components/FlowCanvas';
import { isValidConnectionDelegate, onNodeDragStopDelegate, getAbsPosition } from './utils/flowUtils';
import { Topbar } from './components/topbar/Topbar';
import { SettingsModal } from './components/SettingsModal';



const edgeTypes = {
    fluid: FluidEdge,
    power: PowerEdge
};

interface AppNodeTemplate {
    id: string;
    name: string;
    category: string;
    icon?: string | null;
    resource_type?: string | null;
    output_type?: string | null;
    input_type?: string | null;
    initial_rate?: string | number;
    power_demand?: string | number;
    power_consumption?: string | number;
    base_power_demand?: string | number;
    requires_power?: number | boolean;
    conversion_rate?: string | number;
    recipes?: Array<{
        inputType?: string;
        input_type?: string;
        outputType?: string;
        output_type?: string;
        conversionRate?: string | number;
        conversion_rate?: string | number;
    }>;
    recipeMap?: Record<string, string>;
    radius?: number;
    maxBuffer?: number | string;
    style_bg?: string;
}

const getId = () => `dndnode_${Date.now()}_${Math.floor(Math.random() * 1000)}`;



function AppRenderer() {
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [reactFlowInstance, setReactFlowInstance] = React.useState<ReactFlowInstance | null>(null);
    const isSidebarOpen = useStore((state) => (state as any).isSidebarOpen ?? true);
    const setIsSidebarOpen = useStore((state) => (state as any).setIsSidebarOpen);
    const setActiveTab = useStore((state) => (state as any).setActiveTab);
    const animationsEnabled = useStore((state) => state.settings.animationsEnabled);
    const [tickRate, setTickRate] = useState(50);
    const workerRef = useRef<Worker | null>(null);
    const [dragStartPos, setDragStartPos] = useState<XYPosition | null>(null);

    const onNodeDragStart = useCallback((event: React.MouseEvent, node: Node) => {
        setDragStartPos({ ...node.position });
    }, []);

    const storeOnNodesChange = useStore((state) => state.onNodesChange);
    const storeOnEdgesChange = useStore((state) => state.onEdgesChange);
    const addNode = useStore((state) => state.addNode);
    const nodeTemplates = useStore((state) => state.nodeTemplates) || [];
    const itemRegistry = useStore((state) => state.itemRegistry) || {};
    const nodeTypes = useMemo(() => getAppNodeTypes(nodeTemplates, itemRegistry), [nodeTemplates, itemRegistry]);
    const isViewOnly = useStore((state) => state.isViewOnly);

    // Store Actions
    const loadState = useStore((state) => state.loadState);
    const saveState = useStore((state) => state.saveState);
    const saveStateToServer = useStore((state) => state.saveStateToServer);
    const loadStateFromServer = useStore((state) => state.loadStateFromServer);
    const loadNodeTemplates = useStore((state) => state.loadNodeTemplates);
    const loadItems = useStore((state) => state.loadItems);
    const loadEdgeUpgradeCosts = useStore((state) => state.loadEdgeUpgradeCosts);

    const onNodesChange = useCallback((changes: NodeChange[]) => {
        if (changes.some((c) => c.type === 'remove')) {
            if (!window.confirm("Are you sure you want to delete the selected node(s)? Investments won't be refunded!")) return;
        }
        storeOnNodesChange(changes);
    }, [storeOnNodesChange]);

    const onEdgesChange = useCallback((changes: EdgeChange[]) => {
        if (changes.some((c) => c.type === 'remove')) {
            if (!window.confirm("Are you sure you want to delete the selected wire(s)?")) return;
        }
        storeOnEdgesChange(changes);
    }, [storeOnEdgesChange]);

    const interactionMode = useStore((state) => state.interactionMode);
    const setInteractionMode = useStore((state) => state.setInteractionMode);

    const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
        if (interactionMode === 'demolish') {
            if (window.confirm(`Demolish ${node.data.name || node.type}?`)) {
                storeOnNodesChange([{ type: 'remove', id: node.id }]);
            }
        }
    }, [interactionMode, storeOnNodesChange]);

    const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
        if (interactionMode === 'demolish') {
            if (window.confirm(`Delete this connection?`)) {
                storeOnEdgesChange([{ type: 'remove', id: edge.id }]);
            }
        }
    }, [interactionMode, storeOnEdgesChange]);

    const globalStats = useStore((state) => (state as any).globalStats) || { production: {}, consumption: {}, cloudProduction: {}, cloudConsumption: {} };
    // These will be moved to subcomponents to avoid AppRenderer re-renders
    // const decCap = getCloudCapacity(cloudLevel);


    useEffect(() => {
        loadNodeTemplates();
        loadItems();
        loadEdgeUpgradeCosts();
        loadState();
    }, [loadNodeTemplates, loadItems, loadEdgeUpgradeCosts, loadState]);

    useEffect(() => {
        // Initialize Simulation Worker
        const simWorker = new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' });

        simWorker.onmessage = (e) => {
            const { type, payload } = e.data;
            if (type === 'TICK_RESULTS') {
                useStore.getState().applyTickResults(payload);
            } else if (type === 'ERROR') {
                console.error('SimWorker Error:', payload);
            }
        };

        const startSim = async () => {
            const state = useStore.getState();
            const { RESOURCE_REGISTRY } = await import('@aligrid/engine');
            try {
                simWorker.postMessage({
                    type: 'START',
                    payload: {
                        rate: tickRate,
                        nodes: state.nodes.map(n => ({ id: n.id, type: n.type, data: n.data, parentId: n.parentId, position: n.position })),
                        edges: state.edges.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle, type: e.type, data: e.data })),
                        nodeTemplates: state.nodeTemplates,
                        cloudStorage: state.cloudStorage,
                        downloaderTier: state.downloaderTier || 0,
                        edgeTiers: state.edgeTiers || {},
                        cloudLevel: state.cloudLevel || 1,
                        itemRegistry: state.itemRegistry || {},
                        resourceRegistry: RESOURCE_REGISTRY,
                        fpsLimit: state.settings.fpsLimit
                    }
                });
            } catch (err) {
                console.error("Critical: Failed to start Simulation Worker. Likely a serialization error.", err);
            }
        };

        // Slow sync timer to ensure worker doesn't drift too far or miss main thread deletions
        let lastAutoSave = Date.now();
        const syncInterval = setInterval(async () => {
            const state = useStore.getState();
            const { RESOURCE_REGISTRY } = await import('@aligrid/engine');
            try {
                simWorker.postMessage({
                    type: 'SYNC_STATE',
                    payload: {
                        nodes: state.nodes.map(n => ({ id: n.id, type: n.type, data: n.data, parentId: n.parentId, position: n.position })),
                        edges: state.edges.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle, type: e.type, data: e.data })),
                        nodeTemplates: state.nodeTemplates,
                        cloudStorage: state.cloudStorage,
                        downloaderTier: state.downloaderTier || 0,
                        edgeTiers: state.edgeTiers || {},
                        cloudLevel: state.cloudLevel || 1,
                        itemRegistry: state.itemRegistry || {},
                        resourceRegistry: RESOURCE_REGISTRY,
                        fpsLimit: state.settings.fpsLimit
                    }
                });
            } catch (err) {
                console.warn("Worker SYNC failed:", err);
            }

            // Auto-save logic
            const autoSaveInterval = state.settings.autoSaveInterval;
            if (autoSaveInterval > 0 && Date.now() - lastAutoSave > autoSaveInterval * 1000) {
                lastAutoSave = Date.now();
                state.saveState();
            }
        }, 1000);

        startSim();

        // Immediate settings sync
        const settingsUnsub = useStore.subscribe(
            (state) => state.settings,
            (settings) => {
                simWorker.postMessage({
                    type: 'UPDATE_SETTINGS',
                    payload: settings
                });
            }
        );

        return () => {
            clearInterval(syncInterval);
            settingsUnsub();
            simWorker.terminate();
        };
    }, [tickRate]);
    // Removed tick/saveState dependency as we use store.getState()

    useEffect(() => {
        if (workerRef.current) {
            workerRef.current.postMessage({ type: 'rate', value: tickRate });
        }
    }, [tickRate]);

    const isValidConnection = useCallback((connection: RFConnection) => {
        const { nodes, edges } = useStore.getState();
        return isValidConnectionDelegate(connection, nodes, edges);
    }, []);



    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();
            if (!reactFlowInstance || !reactFlowWrapper.current) return;
            const payloadStr = event.dataTransfer.getData('application/reactflow');
            if (!payloadStr) return;

            let type = '';
            let template: AppNodeTemplate | null = null;
            try {
                const parsed = JSON.parse(payloadStr);
                type = parsed.type;
                template = parsed.template;
            } catch (err) {
                type = payloadStr;
            }

            const cost = NODE_COSTS[type];
            if (cost) {
                const state = useStore.getState();
                if (!state.canAfford(cost)) {
                    alert("Not enough materials to place this node!");
                    return;
                }
                state.deductMaterials(cost);
            }

            const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
            const position = reactFlowInstance.project({
                x: event.clientX - reactFlowBounds.left,
                y: event.clientY - reactFlowBounds.top,
            });

            let defaultData: Partial<NodeData> & { label?: string } = template ? { template: template as any } : {};
            if (NODE_DATA_FACTORY[type]) {
                defaultData = { ...defaultData, ...NODE_DATA_FACTORY[type]() };
            }

            if (template) {
                defaultData.template = template as unknown as any; // Allow nested template storage

                const powerVal = template.power_consumption || template.power_demand || template.base_power_demand;
                if (powerVal !== undefined) {
                    defaultData.powerConsumption = String(powerVal);
                }
                if (template.category === 'generator') {
                    defaultData.resourceType = (template.resource_type || template.output_type) as string;
                    defaultData.outputRate = parseFloat(String(template.initial_rate || 1));
                }

                if (template.recipes && Array.isArray(template.recipes)) {
                    defaultData.recipes = template.recipes.map((r) => ({
                        inputType: (r.inputType || r.input_type || '') as string,
                        outputType: (r.outputType || r.output_type || '') as string,
                        conversionRate: String(r.conversionRate || r.conversion_rate || template.initial_rate || 1)
                    }));
                } else if (template.recipeMap) {
                    const rate = new Decimal(template.initial_rate || 1);
                    defaultData.recipes = Object.entries(template.recipeMap).map(([input, output]) => ({
                        inputType: input,
                        outputType: output,
                        conversionRate: rate.toString()
                    }));
                } else if (template.category === 'processor') {
                    defaultData.recipe = {
                        inputType: (template.input_type || '') as string,
                        outputType: (template.output_type || '') as string,
                        conversionRate: String(template.initial_rate || 1)
                    };
                }
            }

            if (type === 'groupArea') {
                defaultData = { ...defaultData, label: 'Group Area' };
            }

            const newNode: import('reactflow').Node<import('./store/types').NodeData> = {
                id: getId(),
                type,
                position,
                data: defaultData
            };

            if (type === 'groupArea') {
                newNode.style = { width: 300, height: 200 };
                newNode.dragHandle = '.group-node-header';
            }

            addNode(newNode);
        },
        [reactFlowInstance, addNode]
    );

    // Moved to subcomponents
    // const globalTotal = Object.values(cloudStorage).reduce((s: Decimal, a) => s.plus(a as Decimal), new Decimal(0));
    // const activeResourcesCount = Object.values(RESOURCE_REGISTRY).filter(r => r.isUploadAvailable).length;
    // const globalCap = decCap.times(activeResourcesCount);


    const onNodeDragStop = useCallback((event: React.MouseEvent, draggedNode: Node) => {
        const state = useStore.getState();
        onNodeDragStopDelegate(
            draggedNode,
            state.nodes,
            dragStartPos,
            storeOnNodesChange,
            state.addNodeToGroup
        );
    }, [dragStartPos, storeOnNodesChange]);

    return (
        <div
            className={!animationsEnabled ? 'animations-disabled' : ''}
            style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100vh', background: '#0a0f1d', position: 'relative', overflow: 'hidden' }}
        >
            <SettingsModal />

            {/* Topbar Modularized */}
            <Topbar
                tickRate={tickRate}
                setTickRate={setTickRate}
                saveStateToServer={saveStateToServer}
                loadStateFromServer={loadStateFromServer}
                isViewOnly={isViewOnly}
            />

            {/* Cloud Details Modal Popover */}


            <div style={{ display: 'flex', flexGrow: 1, position: 'relative', overflow: 'hidden' }}>
                <button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    style={{
                        position: 'absolute', top: '16px', left: isSidebarOpen ? '316px' : '16px',
                        zIndex: 10, background: '#1e293b', color: '#f8fafc',
                        border: '1px solid #334155', borderRadius: '4px', padding: '8px 12px',
                        cursor: 'pointer', transition: 'all 0.3s ease',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.3)'
                    }}
                >
                    {isSidebarOpen ? '◀ Close' : '▶ Menu'}
                </button>

                <div style={{ width: '300px', height: '100%', marginLeft: isSidebarOpen ? '0' : '-300px', transition: 'margin 0.3s ease', flexShrink: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <Sidebar />
                </div>

                <div ref={reactFlowWrapper} className={interactionMode === 'demolish' ? 'mode-demolish' : ''} style={{ flexGrow: 1, height: '100%', minWidth: 0, position: 'relative', overflow: 'hidden' }}>
                    <FlowCanvas
                        onInit={setReactFlowInstance}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onNodeClick={onNodeClick}
                        onEdgeClick={onEdgeClick}
                        onSelectionChange={(params) => {
                            // Selection handled by store via onNodesChange if needed
                        }}
                        onContextMenu={(e) => e.preventDefault()}
                        onDragOver={onDragOver}
                        onDrop={onDrop}
                        onNodeDragStop={onNodeDragStop}
                        isValidConnection={isValidConnection}
                        edgeTypes={edgeTypes}
                    />

                    {/* Interactions Toolbar */}
                    <div style={{
                        position: 'absolute',
                        bottom: '24px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 100,
                        background: '#111827E0',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid #1f2937',
                        borderRadius: '12px',
                        padding: '6px',
                        display: 'flex',
                        gap: '4px',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                    }}>
                        <button
                            onClick={() => setInteractionMode('select')}
                            title="Select / Drag / Build"
                            style={{
                                background: interactionMode === 'select' ? '#3b82f6' : 'transparent',
                                color: interactionMode === 'select' ? 'white' : '#94a3b8',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '8px 16px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                transition: 'all 0.2s ease',
                                fontWeight: interactionMode === 'select' ? '600' : '400',
                            }}
                        >
                            <span>🖱️</span> Select
                        </button>
                        <button
                            onClick={() => setInteractionMode('demolish')}
                            title="Demolish Mode (One-click delete)"
                            style={{
                                background: interactionMode === 'demolish' ? '#ef4444' : 'transparent',
                                color: interactionMode === 'demolish' ? 'white' : '#9ca3af',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '8px 16px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                transition: 'all 0.2s ease',
                                fontWeight: interactionMode === 'demolish' ? '600' : '400',
                            }}
                        >
                            <span>💣</span> Demolish
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function App() {
    return (
        <ReactFlowProvider>
            <AppRenderer />
        </ReactFlowProvider>
    );
}
