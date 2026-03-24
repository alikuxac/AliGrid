import { NodeChange, applyNodeChanges, Node } from 'reactflow';
import { Decimal, NODE_COSTS, getUpgradeCost } from '@aligrid/engine';
import { NodeData } from '../types';
import { debouncedCloudSave } from '../helpers';
import { FALLBACK_NODES } from '../../config/fallbackNodes';

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8787';

export const createNodeSlice = (set: any, get: any) => ({
    nodes: [],
    nodeTemplates: [],

    loadNodeTemplates: async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/nodes`);
            if (!res.ok) throw new Error("Load error");
            const data = await res.json();
            set({ nodeTemplates: data });
        } catch (err) {
            console.error("Load templates failed from server, loading local fallback node recipes", err);
            set({ nodeTemplates: FALLBACK_NODES });
        }
    },

    onNodesChange: (changes: NodeChange[]) => {
        const currentNodes = get().nodes;
        const removedIds = changes
            .filter((c: any) => c.type === 'remove')
            .map((c: any) => c.id);

        let updatedNodes = applyNodeChanges(changes, currentNodes);



        if (removedIds.length > 0) {
            const removedSet = new Set(removedIds);
            updatedNodes = updatedNodes.map((n: any) => {
                if (n.parentId && removedSet.has(n.parentId)) {
                    const parentNode = currentNodes.find((p: any) => p.id === n.parentId);
                    const parentPos = parentNode ? parentNode.position : { x: 0, y: 0 };
                    return {
                        ...n,
                        parentId: undefined,
                        extent: undefined,
                        position: { x: n.position.x + parentPos.x, y: n.position.y + parentPos.y }
                    };
                }
                return n;
            });
        }

        set({ nodes: updatedNodes });
        if (changes.some(c => c.type === 'position' || c.type === 'remove')) {
            debouncedCloudSave(get());
        }
    },

    addNode: (node: Node<NodeData>) => {
        set({ nodes: [...get().nodes, node] });
        debouncedCloudSave(get());
    },

    updateNodeData: (nodeId: string, newData: Partial<NodeData>) => {
        set((state: any) => ({
            nodes: state.nodes.map((n: any) =>
                n.id === nodeId ? { ...n, data: { ...n.data, ...newData } } : n
            ),
        }));
        debouncedCloudSave(get());
    },

    upgradeNode: (nodeId: string) => {
        const node = get().nodes.find((n: any) => n.id === nodeId);
        if (!node || !node.type) return;

        const level = node.data.level || 0;
        const cost = getUpgradeCost(node.type, level);

        if (!get().canAfford(cost)) {
            alert("Not enough materials to upgrade!");
            return;
        }

        get().deductMaterials(cost);

        set((state: any) => ({
            nodes: state.nodes.map((n: any) => {
                if (n.id === nodeId) {
                    let nextLevel = (n.data.level || 0) + 1;
                    let nextTier = n.data.tier || 0;
                    if (nextLevel >= 100) {
                        nextLevel = 0;
                        nextTier += 1;
                    }
                    let baseRate = new Decimal(1);
                    if (n.type === 'waterGenerator' || n.type === 'lavaPump') baseRate = new Decimal(1.0);
                    else if (n.type === 'ironGenerator') baseRate = new Decimal(1.0);
                    else if (n.type === 'copperGenerator') baseRate = new Decimal(1.0);
                    else if (n.type === 'coalGenerator') baseRate = new Decimal(1);
                    else if (n.type === 'cobbleGen') baseRate = new Decimal(1.0);
                    else if (n.type === 'downloader') baseRate = new Decimal(1.0);
                    else if (n.type === 'powerReceiver') baseRate = new Decimal(2.0);

                    let rate = baseRate.times(Math.pow(2, nextLevel)).round();
                    if (n.type === 'cobbleGen') {
                        rate = new Decimal(Math.pow(2, Math.max(0, nextLevel - 1)));
                    }
                    let maxBuffer = n.data.maxBuffer;
                    if (n.type === 'accumulator') {
                        const baseMax = new Decimal(5000);
                        maxBuffer = baseMax.times(Math.pow(2, nextLevel)).toString();
                    }
                    return { ...n, data: { ...n.data, level: nextLevel, tier: nextTier, outputRate: rate, maxBuffer } };
                }
                return n;
            })
        }));
        debouncedCloudSave(get());
    },

    resetNodes: () => {
        const templates = get().nodeTemplates;
        set((state: any) => ({
            nodes: state.nodes.map((n: any) => {
                const template = templates.find((t: any) => t.id === n.type);
                const initialRate = template?.initial_rate ? new Decimal(template.initial_rate) : new Decimal(1);
                return {
                    ...n,
                    data: { ...n.data, level: 0, outputRate: initialRate }
                };
            })
        }));
        if (get().saveState) get().saveState();
        debouncedCloudSave(get());
    },

    toggleNodePower: (nodeId: string) => {
        set((state: any) => ({
            nodes: state.nodes.map((n: any) => {
                if (n.id === nodeId) {
                    const nextOff = !n.data.isOff;
                    return { ...n, data: { ...n.data, isOff: nextOff } };
                }
                return n;
            })
        }));
        debouncedCloudSave(get());
    },

    setNodeDraggable: (nodeId: string, draggable: boolean) => {
        set((state: any) => ({
            nodes: state.nodes.map((n: any) =>
                n.id === nodeId ? { ...n, draggable } : n
            )
        }));
        debouncedCloudSave(get());
    },

    addNodeToGroup: (nodeId: string, groupId: string | null) => {
        const state = get();
        const node = state.nodes.find((n: any) => n.id === nodeId);
        if (!node) return;

        // Calculate absolute position
        const getAbsPosition = (targetNode: any) => {
            let x = targetNode.position.x;
            let y = targetNode.position.y;
            let pId = targetNode.parentId;
            while (pId) {
                const p = state.nodes.find((n: any) => n.id === pId);
                if (p) {
                    x += p.position.x;
                    y += p.position.y;
                    pId = p.parentId;
                } else {
                    break;
                }
            }
            return { x, y };
        };

        const absNodePos = getAbsPosition(node);

        if (groupId === null) {
            if (node.parentId) {
                set((state: any) => ({
                    nodes: state.nodes.map((n: any) =>
                        n.id === nodeId ? {
                            ...n,
                            parentId: undefined,
                            extent: undefined,
                            position: { x: absNodePos.x, y: absNodePos.y }
                        } : n
                    )
                }));
            }
        } else {
            const parent = state.nodes.find((n: any) => n.id === groupId);
            if (!parent) return;
            const absParentPos = getAbsPosition(parent);
            const alreadyInGroup = node.parentId === groupId;

            if (!alreadyInGroup) {
                set((state: any) => ({
                    nodes: state.nodes.map((n: any) =>
                        n.id === nodeId ? {
                            ...n,
                            parentId: groupId,
                            position: { x: absNodePos.x - absParentPos.x, y: absNodePos.y - absParentPos.y }
                        } : n
                    )
                }));
            }
        }
        debouncedCloudSave(get());
    },
});
