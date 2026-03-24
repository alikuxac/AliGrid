import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, { Background, Controls, ReactFlowProvider, ReactFlowInstance, Connection as RFConnection, MiniMap, Node, Edge, NodeChange, EdgeChange, XYPosition } from 'reactflow';
import 'reactflow/dist/style.css';

import { ResourceGeneratorNode } from './nodes/ResourceGeneratorNode';
import { StorageNode } from './nodes/StorageNode';
import { ProcessorNode } from './nodes/ProcessorNode';
import { MergerNode } from './nodes/MergerNode';
import { SplitterNode } from './nodes/SplitterNode';
import { AntennaNode } from './nodes/AntennaNode';
import { CloudDownloaderNode } from './nodes/CloudDownloaderNode';
import { PowerNode } from './nodes/PowerNode';
import { GenericNode } from './nodes/GenericNode';
import { GroupNode } from './nodes/GroupNode';
import { MinerNode } from './nodes/MinerNode';
import { GeneratorNode } from './nodes/GeneratorNode';
import { useStore, NodeData } from './store';
import { FluidEdge, PowerEdge } from './edges/CustomEdges';
import { Sidebar } from './Sidebar';
import { formatNumber } from './utils/formatter';
import {
    NODE_DATA_FACTORY,
    ResourceType,
    Decimal,
    RESOURCE_REGISTRY,
    NODE_COSTS
} from '@aligrid/engine';
import { FALLBACK_NODES } from './config/fallbackNodes';
import { RESOURCE_STATES } from './store/constants';



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
    maxBuffer?: number;
    style_bg?: string;
}

const getId = () => `dndnode_${Date.now()}_${Math.floor(Math.random() * 1000)}`;



function AppRenderer() {
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [reactFlowInstance, setReactFlowInstance] = React.useState<ReactFlowInstance | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [tickRate, setTickRate] = useState(50);
    const [tickCount, setTickCount] = useState(0);
    const workerRef = useRef<Worker | null>(null);
    const [dragStartPos, setDragStartPos] = useState<XYPosition | null>(null);

    const onNodeDragStart = useCallback((event: React.MouseEvent, node: Node) => {
        setDragStartPos({ ...node.position });
    }, []);

    const { nodes, edges, onNodesChange: storeOnNodesChange, onEdgesChange: storeOnEdgesChange, onConnect, addNode, tick, cloudStorage, cloudLevel, upgradeCloudLevel, loadState, saveState, saveStateToServer, loadStateFromServer, loadNodeTemplates, loadEdgeUpgradeCosts, isViewOnly } = useStore();

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

    const globalStats = useStore((state) => state.globalStats) || { production: {}, consumption: {}, cloudProduction: {}, cloudConsumption: {} };
    const decCap = new Decimal(5000).times(Math.pow(2, (cloudLevel || 1) - 1));
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);

    const nodeTemplates = useStore((state) => state.nodeTemplates) || [];

    const nodeTypes = useMemo(() => {
        const base: Record<string, any> = {
            storage: StorageNode,
            merger: MergerNode,
            splitter: SplitterNode,
            antenna: AntennaNode,
            downloader: CloudDownloaderNode,
            powerTransmitter: PowerNode,
            powerReceiver: PowerNode,
            powerPole: PowerNode,
            accumulator: PowerNode,
            generic: GenericNode,
            groupArea: GroupNode,
        };

        const mergedTemplates = [...nodeTemplates];
        FALLBACK_NODES.forEach((f) => {
            if (!mergedTemplates.some((t) => t.id === f.id)) mergedTemplates.push(f as any);
        });

        mergedTemplates.forEach((t) => {
            if (base[t.id]) return;

            if (t.category === 'generator') {
                const res = (t as any).resource_type || (t as any).output_type || '';
                const matter = RESOURCE_STATES[res as ResourceType] || 'solid';
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

        return base as Record<string, React.ComponentType<import('reactflow').NodeProps<NodeData>>>;
    }, [nodeTemplates]);

    useEffect(() => {
        loadNodeTemplates();
        loadEdgeUpgradeCosts();
        loadState();
    }, [loadNodeTemplates, loadEdgeUpgradeCosts, loadState]);

    useEffect(() => {
        const workerCode = `
            let timer = null;
            let interval = 50;
            self.onmessage = (e) => {
                const startTimer = () => {
                    if (timer) clearInterval(timer);
                    let last = performance.now();
                    timer = setInterval(() => {
                        const now = performance.now();
                        const dt = (now - last) / 1000;
                        last = now;
                        self.postMessage(dt);
                    }, interval);
                };

                if (e.data === 'start' || e.data.type === 'start') {
                    interval = e.data.rate || interval;
                    startTimer();
                } else if (e.data.type === 'rate') {
                    interval = e.data.value;
                    if (timer) startTimer();
                } else if (e.data === 'stop') {
                    clearInterval(timer);
                }
            };
        `;
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        const worker = new Worker(workerUrl);

        let lastSave = Date.now();
        worker.onmessage = (e) => {
            const dtSeconds = e.data;
            // Prevent huge time jumps if computer goes to sleep
            if (dtSeconds > 0 && dtSeconds < 1) {
                tick(dtSeconds);
                setTickCount(c => c + 1);

                // Throttle save state every 2 seconds
                if (Date.now() - lastSave > 2000) {
                    lastSave = Date.now();
                    saveState();
                }
            }
        };

        workerRef.current = worker;
        worker.postMessage({ type: 'start', rate: tickRate });

        return () => {
            worker.postMessage('stop');
            worker.terminate();
            URL.revokeObjectURL(workerUrl);
        };
    }, [tick, saveState]);

    useEffect(() => {
        if (workerRef.current) {
            workerRef.current.postMessage({ type: 'rate', value: tickRate });
        }
    }, [tickRate]);

    // Connection validation: 
    const isValidConnection = useCallback((connection: RFConnection) => {
        if (!connection.targetHandle || !connection.target || !connection.source) return false;

        const sourceNode = nodes.find((n) => n.id === connection.source);
        const targetNode = nodes.find((n) => n.id === connection.target);
        if (!sourceNode || !targetNode) return false;

        const isAntenna = targetNode.type === 'antenna';
        const isPowerNode = ['powerPole', 'accumulator', 'powerTransmitter', 'powerReceiver'].includes(targetNode.type || '');
        const handleOccupied = edges.find(
            (e) => e.target === connection.target && e.targetHandle === connection.targetHandle
        );
        if (handleOccupied && !isAntenna && !isPowerNode) return false;

        // --- Wired Power Grid Rules ---
        if (connection.targetHandle === 'electricity') {
            const isSourcePowerHub = ['powerPole', 'accumulator', 'powerTransmitter', 'powerReceiver'].includes(sourceNode.type || '');
            if (!isSourcePowerHub) return false; // Machines can ONLY wire to Power Poles/Hubs!
        }

        const isGenerator = sourceNode.type && (sourceNode.type.toLowerCase().includes('generator') || sourceNode.type.toLowerCase().includes('plant') || sourceNode.type === 'lavaPump');
        const isConsumer = targetNode.data?.powerConsumption && new Decimal(targetNode.data.powerConsumption).gt(0);
        if (isGenerator && isConsumer) {
            return false; // Direct Generator -> Client is FORBIDDEN! Must go through a Pole!
        }
        // --------------------------------

        let sourceResourceType: string | undefined = undefined;
        if (sourceNode.data?.resourceType) {
            sourceResourceType = sourceNode.data.resourceType;
        } else if (sourceNode.data?.recipe?.outputType) {
            sourceResourceType = sourceNode.data.recipe.outputType;
        } else if (sourceNode.data?.template?.output_type) {
            sourceResourceType = sourceNode.data.template.output_type;
        } else if (sourceNode.data?.template?.resource_type) {
            sourceResourceType = sourceNode.data.template.resource_type;
        } else if (sourceNode.type === 'merger' && sourceNode.data?.lockedResourceType) {
            sourceResourceType = sourceNode.data.lockedResourceType;
        } else if (sourceNode.type === 'storage' && sourceNode.data?.lockedResourceType) {
            sourceResourceType = sourceNode.data.lockedResourceType;
        }

        if (targetNode.type === 'merger') { // removed storage from lock enforcement
            const locked = targetNode.data?.lockedResourceType;
            if (locked && sourceResourceType && sourceResourceType !== locked) {
                return false;
            }
        }

        const isDefaultHandle = !connection.targetHandle || connection.targetHandle === 'target' || connection.targetHandle === 'source' || connection.targetHandle === 'input' || connection.targetHandle === 'output' || connection.targetHandle === 'fuel';
        const isListHandleNode = ['antenna', 'merger', 'splitter', 'powerTransmitter', 'powerPole', 'accumulator'].includes(targetNode.type || '');

        if (!isDefaultHandle && sourceResourceType && !isListHandleNode) {
            // Check specific handle ID for multiple-handle support
            if (connection.targetHandle !== sourceResourceType) {
                const recipes = targetNode.data?.recipes;
                if (recipes && Array.isArray(recipes)) {
                    const isValidInput = recipes.some((r) => r.inputType === sourceResourceType);
                    if (isValidInput) return true;
                }
                return false;
            }
        } else if (targetNode.data?.recipe?.inputType && sourceResourceType) {
            // Fallback for single handle nodes
            const inputs = targetNode.data.recipe.inputType.split(',');
            if (!inputs.includes(sourceResourceType)) {
                return false;
            }
        }

        return true;
    }, [edges, nodes]);

    const onNodeDragStop = useCallback((event: React.MouseEvent, draggedNode: Node) => {
        const state = useStore.getState();
        const getAbsPosition = (node: Node, nodes: Node[]) => {
            let x = node.position.x;
            let y = node.position.y;
            let pId = node.parentId;
            while (pId) {
                const parent = nodes.find((n) => n.id === pId);
                if (parent) {
                    x += parent.position.x;
                    y += parent.position.y;
                    pId = parent.parentId;
                } else {
                    break;
                }
            }
            return { x, y };
        };

        // --- 1. Collision Avoidance (Power Pole exclusive cell) ---
        if (draggedNode.type !== 'groupArea') {
            const getBox = (n: Node) => {
                const width = n.data?.width || n.width || 220;
                const height = n.data?.height || n.height || 100;
                const pos = getAbsPosition(n, state.nodes);
                return { x: pos.x, y: pos.y, w: width, h: height };
            };

            const boxA = getBox(draggedNode);
            const otherNodes = state.nodes.filter((n) => n.id !== draggedNode.id && n.type !== 'groupArea');
            let isOverlapping = false;

            for (const other of otherNodes) {
                const boxB = getBox(other);
                const overlaps = (boxA.x < boxB.x + boxB.w && boxA.x + boxA.w > boxB.x && boxA.y < boxB.y + boxB.h && boxA.y + boxA.h > boxB.y);
                if (overlaps && (draggedNode.type === 'powerPole' || other.type === 'powerPole')) {
                    isOverlapping = true;
                    break;
                }
            }

            if (isOverlapping && dragStartPos) {
                storeOnNodesChange([{ id: draggedNode.id, type: 'position', position: dragStartPos }]);
                return; // Abort parenting checks
            }
        }

        const groupNodes = state.nodes.filter((n: Node) => n.type === 'groupArea' && n.id !== draggedNode.id);

        const isDescendant = (nodeId: string, ancestorId: string) => {
            let current = state.nodes.find((n: Node) => n.id === nodeId);
            while (current && current.parentId) {
                const parent = state.nodes.find((n: Node) => n.id === current!.parentId);
                if (!parent) break;
                if (parent.id === ancestorId) return true;
                current = parent;
            }
            return false;
        };

        const absPos = getAbsPosition(draggedNode, state.nodes);
        const absX = absPos.x;
        const absY = absPos.y;

        let matchedGroups: { group: Node; area: number }[] = [];

        for (const group of groupNodes) {
            // Prevent circular nesting
            if (isDescendant(group.id, draggedNode.id)) continue;

            const width = group.data?.width || group.width || 300;
            const height = group.data?.height || group.height || 200;
            const gPos = getAbsPosition(group, state.nodes);

            if (absX >= gPos.x && absX <= gPos.x + width && absY >= gPos.y && absY <= gPos.y + height) {
                matchedGroups.push({ group, area: width * height });
            }
        }

        // Sort by area ascending so we pick the SMALLEST containing group (the innermost subgroup)
        matchedGroups.sort((a, b) => a.area - b.area);
        const targetGroup = matchedGroups[0]?.group || null;

        if (targetGroup) {
            state.addNodeToGroup(draggedNode.id, targetGroup.id);
        } else if (draggedNode.parentId) {
            state.addNodeToGroup(draggedNode.id, null);
        }
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

                if (template.power_consumption) {
                    defaultData.powerConsumption = String(template.power_consumption);
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

    // Calculate aggregate limits
    const globalTotal = Object.values(cloudStorage).reduce((s: Decimal, a) => s.plus(a as Decimal), new Decimal(0));
    const activeResourcesCount = Object.values(RESOURCE_REGISTRY).filter(r => r.isUploadAvailable).length;
    const globalCap = decCap.times(activeResourcesCount);

    const processedNodes = React.useMemo(() => {
        // Calculate nesting depth for proper z-index layering
        const getDepth = (node: Node): number => {
            let depth = 0;
            let current: Node | undefined = node;
            while (current?.parentId) {
                depth++;
                current = nodes.find((n: Node) => n.id === current!.parentId);
            }
            return depth;
        };

        return nodes.map((n: Node) => {
            if (n.type === 'groupArea') {
                const depth = getDepth(n);
                return {
                    ...n,
                    dragHandle: '.group-node-header',
                    zIndex: depth // deeper nested groups render above parents
                };
            }
            // Non-group child nodes should render above their parent group
            const depth = getDepth(n);
            return {
                ...n,
                zIndex: 1000 + depth
            };
        });
    }, [nodes]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100vh', background: '#0a0f1d', position: 'relative', overflow: 'hidden' }}>

            {/* Topbar: Cloud Storage */}
            <div style={{
                background: '#111827',
                borderBottom: '1px solid #1f2937',
                padding: '10px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                zIndex: 10
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '20px' }}>☁️</span>
                    <span style={{ fontWeight: 'bold', color: '#f8fafc', fontSize: '14px' }}>Cloud Inventory <span style={{ color: '#60a5fa', fontSize: '12px', marginLeft: '4px' }}>(Lv.{cloudLevel || 1})</span></span>
                    <div style={{ background: '#374151', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{formatNumber(globalTotal)} / {formatNumber(globalCap)}</span>
                        <button
                            onClick={() => setIsDetailsOpen(!isDetailsOpen)}
                            style={{ background: '#4b5563', border: 'none', color: 'white', padding: '1px 5px', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}
                        >
                            Details
                        </button>
                    </div>

                    {/* Tick Speed Controller */}
                    <div style={{ background: '#1e293b', border: '1px solid #334155', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
                        <div style={{
                            width: '6px', height: '6px', borderRadius: '50%',
                            background: '#10b981',
                            boxShadow: tickCount % 2 === 0 ? '0 0 6px 1px #10b981' : 'none',
                            transition: 'all 0.05s ease'
                        }}></div>
                        <span style={{ color: '#94a3b8' }}>Tick:</span>
                        <button
                            onClick={() => {
                                const speeds = [50, 100, 250, 500];
                                const next = speeds[(speeds.indexOf(tickRate) + 1) % speeds.length];
                                setTickRate(next);
                            }}
                            style={{ background: 'transparent', border: 'none', color: '#f8fafc', padding: '0 2px', cursor: 'pointer', fontFamily: 'monospace', fontWeight: 'bold' }}
                        >
                            {tickRate / 1000}s
                        </button>
                    </div>

                    <div style={{ display: 'flex', gap: '4px', marginLeft: '6px' }}>
                        <button disabled={isViewOnly} onClick={() => useStore.getState().resetNodes()} style={{ background: isViewOnly ? '#4b5563' : '#ef4444', border: 'none', color: 'white', padding: '3px 6px', borderRadius: '3px', cursor: isViewOnly ? 'not-allowed' : 'pointer', fontSize: '10px', fontWeight: 'bold' }}>♻️ Reset Levels</button>
                        <button disabled={isViewOnly} onClick={() => saveStateToServer()} style={{ background: isViewOnly ? '#4b5563' : '#059669', border: 'none', color: 'white', padding: '3px 6px', borderRadius: '3px', cursor: isViewOnly ? 'not-allowed' : 'pointer', fontSize: '10px', fontWeight: 'bold' }}>📤 Push</button>
                        <button disabled={isViewOnly} onClick={() => loadStateFromServer()} style={{ background: isViewOnly ? '#4b5563' : '#2563eb', border: 'none', color: 'white', padding: '3px 6px', borderRadius: '3px', cursor: isViewOnly ? 'not-allowed' : 'pointer', fontSize: '10px', fontWeight: 'bold' }}>📥 Fetch</button>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                    {Object.entries(cloudStorage)
                        .map(([res, amt]) => {
                            const count = amt as Decimal;
                            const stats = globalStats;
                            const prod = stats?.cloudProduction?.[res] || new Decimal(0);
                            const cons = stats?.cloudConsumption?.[res] || new Decimal(0);
                            const net = prod.minus(cons);
                            return { res, count, net };
                        })
                        .filter(item => item.count.gt(0) || item.net.gt(0))
                        .sort((a, b) => b.net.sub(a.net).toNumber())
                        .slice(0, 5)
                        .map(({ res, count, net }) => {
                            const meta = RESOURCE_REGISTRY[res] || { icon: '❓', color: '#94a3b8', label: 'Item' };
                            const isNetNegative = net.lessThan(0);

                            return (
                                <div key={res} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', background: '#1e293b', padding: '4px 8px', borderRadius: '4px', border: `1px solid ${isNetNegative ? '#ef444460' : '#10b98120'}` }}>
                                    <span>{meta.icon}</span>
                                    <span style={{ color: '#e2e8f0', fontWeight: 'bold' }}>{formatNumber(count)}</span>
                                    <span style={{ fontSize: '10px', color: isNetNegative ? '#f87171' : net.gt(0) ? '#4ade80' : '#9ca3af', marginLeft: '2px' }}>
                                        ({net.gt(0) ? '+' : ''}{formatNumber(net)}{(meta as any).unit || ''}/s)
                                    </span>
                                </div>
                            );
                        })
                    }
                </div>
            </div>

            {/* Cloud Details Modal Popover */}
            {isDetailsOpen && (
                <div style={{
                    position: 'absolute', top: '50px', left: '20px', width: '320px',
                    background: 'rgba(31, 41, 55, 0.95)', border: '1px solid #4b5563', borderRadius: '8px',
                    backdropFilter: 'blur(8px)', padding: '15px', zIndex: 20,
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', alignItems: 'center', borderBottom: '1px solid #374151', paddingBottom: '5px' }}>
                        <span style={{ color: 'white', fontWeight: 'bold', fontSize: '13px' }}>Storage Capacities</span>
                        <button onClick={() => setIsDetailsOpen(false)} style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer' }}>✕</button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {Object.values(RESOURCE_REGISTRY).filter(r => r.isUploadAvailable).map((meta) => {
                            const res = meta.id;
                            const cur = cloudStorage[res] || new Decimal(0);
                            const percent = Math.min(100, (cur.toNumber() / decCap.toNumber()) * 100);

                            return (
                                <div key={res} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#f3f4f6' }}>
                                            <span>{meta.icon}</span>
                                            <span>{meta.label}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontSize: '11px', color: '#9ca3af' }}>{formatNumber(cur)}/{formatNumber(decCap)}</span>
                                        </div>
                                    </div>
                                    <div style={{ height: '4px', background: '#374151', borderRadius: '2px', overflow: 'hidden' }}>
                                        <div style={{ width: `${percent}%`, height: '100%', background: meta.color || '#3b82f6', borderRadius: '2px' }} />
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginTop: '1px' }}>
                                        <span style={{ color: '#10b981' }}>+{((globalStats)?.cloudProduction?.[res] || new Decimal(0)).toNumber().toFixed(1)}{(meta as any).unit || ''}/s</span>
                                        <span style={{ color: '#f87171' }}>-{((globalStats)?.cloudConsumption?.[res] || new Decimal(0)).toNumber().toFixed(1)}{(meta as any).unit || ''}/s</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Level Upgrade Footer */}
                    <div style={{ marginTop: '15px', paddingTop: '12px', borderTop: '1px solid #374151', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#9ca3af', fontSize: '12px' }}>Cloud Level: <b style={{ color: '#f8fafc' }}>{cloudLevel || 1}</b></span>
                            <span style={{ color: '#9ca3af', fontSize: '12px' }}>Per Item Cap: <b style={{ color: '#a5b4fc' }}>{formatNumber(decCap)}</b></span>
                        </div>

                        {/* Cost list */}
                        <div style={{ padding: '6px 8px', background: '#11182760', border: '1px solid #374151', borderRadius: '4px', fontSize: '11px' }}>
                            <div style={{ color: '#94a3b8', fontSize: '10px', marginBottom: '3px' }}>Cost to Upgrade Level:</div>
                            {[
                                { id: 'iron', label: 'Iron', icon: '⛏️', cost: new Decimal(100).times(Math.pow(3, (cloudLevel || 1) - 1)) },
                                { id: 'copper', label: 'Copper', icon: '⚒️', cost: new Decimal(100).times(Math.pow(3, (cloudLevel || 1) - 1)) }
                            ].map(item => {
                                const cur = cloudStorage[item.id] || new Decimal(0);
                                const isAffordable = cur.gte(item.cost);
                                return (
                                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', color: isAffordable ? '#10b981' : '#f87171', marginBottom: '2px' }}>
                                        <span>{item.icon} {item.label}</span>
                                        <span>{formatNumber(cur)}/{formatNumber(item.cost)}</span>
                                    </div>
                                )
                            })}
                        </div>

                        <button
                            onClick={() => upgradeCloudLevel()}
                            style={{
                                width: '100%', background: '#2563eb', border: 'none', color: 'white',
                                borderRadius: '4px', padding: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer',
                                transition: 'background 0.2s'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.background = '#1d4ed8'}
                            onMouseOut={(e) => e.currentTarget.style.background = '#2563eb'}
                        >
                            Upgrade Cloud Capacity
                        </button>
                    </div>
                </div>
            )}

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

                <div ref={reactFlowWrapper} style={{ flexGrow: 1, height: '100%', minWidth: 0, position: 'relative', overflow: 'hidden' }}>
                    <ReactFlow
                        nodes={processedNodes}
                        edges={edges}
                        onNodesChange={isViewOnly ? undefined : onNodesChange}
                        onEdgesChange={isViewOnly ? undefined : onEdgesChange}
                        onConnect={isViewOnly ? undefined : onConnect}
                        isValidConnection={isValidConnection}
                        onInit={setReactFlowInstance}
                        onDrop={isViewOnly ? undefined : onDrop}
                        onDragOver={isViewOnly ? undefined : onDragOver}
                        onNodeDragStop={isViewOnly ? undefined : onNodeDragStop}
                        onNodeDragStart={isViewOnly ? undefined : onNodeDragStart}
                        nodeTypes={nodeTypes}
                        nodesDraggable={!isViewOnly}
                        nodesConnectable={!isViewOnly}
                        edgesFocusable={!isViewOnly}
                        edgeTypes={edgeTypes}
                        fitView
                        onlyRenderVisibleElements={true}
                        style={{ background: '#0a0f1d' }}
                    >
                        <Background gap={16} size={1} color="#334155" />
                        <Controls />
                        <MiniMap style={{ background: '#111827', border: '1px solid #19273a' }} nodeColor="#4b5563" maskColor="rgba(0,0,0,0.4)" />
                    </ReactFlow>
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
