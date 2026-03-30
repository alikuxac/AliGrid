import React, { useMemo } from 'react';
import ReactFlow, { Background, Controls, Node, Edge, NodeChange, EdgeChange } from 'reactflow';
import { useStore } from '../store';
import { getAppNodeTypes } from '../nodes/registry';
import { useShallow } from 'zustand/react/shallow';

interface FlowCanvasProps {
    nodes?: Node[];
    edges?: Edge[];
    onNodesChange: (changes: NodeChange[]) => void;
    onEdgesChange: (changes: EdgeChange[]) => void;
    onNodeClick?: (event: React.MouseEvent, node: Node) => void;
    onEdgeClick?: (event: React.MouseEvent, edge: Edge) => void;
    onInit: (instance: any) => void;
    onSelectionChange: (params: { nodes: Node[]; edges: Edge[] }) => void;
    onContextMenu: (event: React.MouseEvent) => void;
    onDragOver: (event: React.DragEvent) => void;
    onDrop: (event: React.DragEvent) => void;
    onNodeDragStop: (event: React.MouseEvent, node: Node) => void;
    isValidConnection: (connection: any) => boolean;
    edgeTypes?: any;
}

export const FlowCanvas = React.memo(({
    onNodesChange,
    onEdgesChange,
    onNodeClick,
    onEdgeClick,
    onInit,
    onSelectionChange,
    onContextMenu,
    onDragOver,
    onDrop,
    onNodeDragStop,
    isValidConnection,
    edgeTypes
}: FlowCanvasProps) => {
    // Use local state to manage "Stable" versions of nodes/edges.
    // This allows us to use useStore.subscribe with custom equality checks
    // to COMPLETELY isolate the canvas from simulation ticks.
    const [nodeSkeletons, setNodeSkeletons] = React.useState<Node[]>([]);
    const [stableEdges, setStableEdges] = React.useState<Edge[]>([]);

    React.useEffect(() => {
        // Calculate nesting depth for proper z-index layering
        const getDepth = (node: Node, allNodes: Node[]): number => {
            let depth = 0;
            let current: Node | undefined = node;
            while (current?.parentId) {
                depth++;
                current = allNodes.find((n: Node) => n.id === current!.parentId);
            }
            return depth;
        };

        const processNodes = (nodes: Node[]) => {
            return nodes.map(n => {
                const depth = getDepth(n, nodes);
                return {
                    ...n,
                    zIndex: n.type === 'groupArea' ? depth : (1000 + depth),
                    data: { id: n.id, template: n.data?.template } // Only pass structural data
                };
            });
        };

        const areNodesPhysicallyEqual = (oldNodes: Node[], newNodes: Node[]) => {
            if (oldNodes.length !== newNodes.length) return false;
            for (let i = 0; i < oldNodes.length; i++) {
                const a = oldNodes[i];
                const b = newNodes[i];
                if (a.id !== b.id || a.type !== b.type || a.parentId !== b.parentId) return false;
                if (a.position.x !== b.position.x || a.position.y !== b.position.y) return false;
                if (a.selected !== b.selected || a.dragging !== b.dragging) return false;
                if (a.width !== b.width || a.height !== b.height) return false;
                if (a.data?.template?.id !== b.data?.template?.id) return false;
            }
            return true;
        };

        const areEdgesStructurallyEqual = (oldEdges: Edge[], newEdges: Edge[]) => {
            if (oldEdges.length !== newEdges.length) return false;
            for (let i = 0; i < oldEdges.length; i++) {
                const a = oldEdges[i];
                const b = newEdges[i];
                if (a.id !== b.id || a.source !== b.source || a.target !== b.target) return false;
                if (a.sourceHandle !== b.sourceHandle || a.targetHandle !== b.targetHandle) return false;
                if (a.data?.tier !== b.data?.tier || a.selected !== b.selected) return false;
            }
            return true;
        };

        const unsubNodes = useStore.subscribe(
            (state) => state.nodes,
            (nodes) => {
                setNodeSkeletons(processNodes(nodes));
            },
            { equalityFn: areNodesPhysicallyEqual, fireImmediately: true }
        ) as () => void;

        const unsubEdges = useStore.subscribe(
            (state) => state.edges,
            (edges) => {
                setStableEdges(edges);
            },
            { equalityFn: areEdgesStructurallyEqual, fireImmediately: true }
        ) as () => void;

        return () => {
            unsubNodes();
            unsubEdges();
        };
    }, []);

    const nodeTemplates = useStore((state) => state.nodeTemplates) || [];
    const nodeTypes = useMemo(() => getAppNodeTypes(nodeTemplates), [nodeTemplates]);

    const onConnect = useStore((state) => state.onConnect);

    return (
        <ReactFlow
            nodes={nodeSkeletons as any}
            edges={stableEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={onInit}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onSelectionChange={onSelectionChange}
            onContextMenu={onContextMenu}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onNodeDragStop={onNodeDragStop}
            isValidConnection={isValidConnection}
            minZoom={0.1}
            maxZoom={2}
            fitView
            fitViewOptions={{ padding: 0.5 }}
            snapToGrid
            snapGrid={[15, 15]}
            onError={(id, message) => {
                // Completely silence standard library noise
            }}
        >
            <Background color="#1f2937" gap={30} />
            <Controls />
        </ReactFlow>
    );
});
