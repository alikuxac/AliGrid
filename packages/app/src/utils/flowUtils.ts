import { Connection as RFConnection, Edge, Node, XYPosition } from 'reactflow';
import { Decimal } from '@aligrid/engine';

export const isValidConnectionDelegate = (
    connection: RFConnection,
    nodes: Node[],
    edges: Edge[]
): boolean => {
    if (!connection.targetHandle || !connection.target || !connection.source) return false;

    const sourceNode = nodes.find((n) => n.id === connection.source);
    const targetNode = nodes.find((n) => n.id === connection.target);
    if (!sourceNode || !targetNode) return false;

    const isAntenna = targetNode.type === 'antenna' || targetNode.id.includes('antenna') || targetNode.data?.template?.id?.includes('antenna');
    const isPowerNode = ['powerPole', 'accumulator', 'powerTransmitter', 'powerReceiver', 'hydroGenerator', 'amplifier', 'coalPowerPlant'].includes(targetNode.type || '') ||
        ['power', 'storage'].includes(targetNode.data?.category || '') ||
        ['power', 'storage'].includes(targetNode.data?.template?.category || '') ||
        targetNode.id.toLowerCase().includes('power');
    const handleOccupied = edges.find(
        (e) => e.target === connection.target && e.targetHandle === connection.targetHandle
    );
    if (handleOccupied && !isAntenna && !isPowerNode) return false;

    // --- Wired Power Grid Rules ---
    if (connection.targetHandle === 'electricity') {
        const isSourcePowerHub = ['powerPole', 'accumulator', 'powerTransmitter', 'powerReceiver', 'hydroGenerator', 'coalPowerPlant'].includes(sourceNode.type || '');
        if (!isSourcePowerHub) return false;

        // Note: Direct Generator -> Machine is now allowed for simpler gameplay,
        // though poles are still recommended for range.
    }
    // --------------------------------

    const checkGeneric = (h: string | null | undefined) => {
        if (!h) return true;
        const lower = h.toLowerCase();
        return ['source', 'output', 'target', 'input', 'fuel', 'electricity'].includes(lower) ||
            lower.startsWith('input-') ||
            lower.startsWith('output-');
    };

    const logTypes = ['splitter', 'merger', 'storage', 'downloader', 'antenna', 'sink', 'logistics'];
    const isLogistics = (n: Node) => {
        const type = (n.type || '').toLowerCase();
        const cat = (n.data?.category || '').toLowerCase();
        const tCat = (n.data?.template?.category || '').toLowerCase();
        return logTypes.includes(type) || logTypes.includes(cat) || logTypes.includes(tCat);
    };

    let sourceResourceType: string | undefined = undefined;
    const findSourceRt = (nodeId: string, visited = new Set<string>()): string | undefined => {
        if (visited.has(nodeId)) return undefined;
        visited.add(nodeId);

        const node = nodes.find(n => n.id === nodeId);
        if (!node) return undefined;

        // 1. Direct data or template overrides
        const res = node.data?.resourceType ||
            node.data?.lockedResourceType ||
            node.data?.recipe?.outputType ||
            node.data?.template?.output_type ||
            node.data?.template?.resource_type;
        if (res) return res;

        // 2. Active recipe from list
        if (node.data?.recipes && Array.isArray(node.data.recipes)) {
            const idx = node.data.activeRecipeIndex || 0;
            const recipe = node.data.recipes[idx];
            if (recipe?.outputType) return recipe.outputType;
        }

        // 3. Fallback for generators/pumps and Power Nodes
        if (node.type?.toLowerCase().includes('generator') || node.type?.toLowerCase().includes('pump') ||
            ['powerPole', 'accumulator', 'powerTransmitter', 'powerReceiver'].includes(node.type || '')) {
            const t = node.data?.template;
            if (t?.output_type) return t.output_type;
            if (t?.resource_type) return t.resource_type;
            if (['powerPole', 'accumulator', 'powerTransmitter', 'powerReceiver'].includes(node.type || '')) return 'electricity';
        }

        // 4. Recursively look up through logistics
        if (isLogistics(node)) {
            const inEdge = edges.find(e =>
                e.target === nodeId &&
                (e.targetHandle === 'input' || e.targetHandle === 'target' || e.targetHandle?.startsWith('input-') || !e.targetHandle)
            );
            if (inEdge) {
                if (inEdge.data?.resourceType) return inEdge.data.resourceType;
                return findSourceRt(inEdge.source, visited);
            }
        }
        return undefined;
    };

    if (connection.sourceHandle && !checkGeneric(connection.sourceHandle)) {
        sourceResourceType = connection.sourceHandle;
    } else {
        sourceResourceType = findSourceRt(connection.source);
    }

    const normalize = (s: string | undefined | null) => s?.toLowerCase().replace(/[\s_-]/g, '') || '';
    const normSourceRt = normalize(sourceResourceType);

    // Check if the resource type is valid for ANY recipe in the target node
    const checkAllRecipes = () => {
        // If source type is unknown (e.g. empty splitter), allow connection optimistically
        if (!normSourceRt) return true;

        const recipes = targetNode.data?.recipes;
        if (recipes && Array.isArray(recipes)) {
            return recipes.some((r) => {
                const parts = (r.inputType || r.input_type || '').split(',').map(normalize);
                return parts.includes(normSourceRt);
            });
        }
        const recipe = (targetNode.data?.recipe || targetNode.data?.template) as any;
        if (recipe?.inputType || recipe?.input_type) {
            const parts = (recipe.inputType || recipe.input_type || '').split(',').map(normalize);
            return parts.includes(normSourceRt);
        }
        return false;
    };

    // --- Final Validation Logic ---
    const sourceNodeIsLogistics = isLogistics(sourceNode);
    const targetNodeIsLogistics = isLogistics(targetNode);

    if (sourceNodeIsLogistics || targetNodeIsLogistics) {
        if ((targetNode.type || '').toLowerCase() === 'merger') {
            const locked = targetNode.data?.lockedResourceType;
            if (locked && normSourceRt !== "" && normSourceRt !== normalize(locked)) {
                return false;
            }
        }
        // Even if logistics, if we found a resource type, check if target machine can actually take it
        if (!targetNodeIsLogistics && normSourceRt !== "") {
            return checkAllRecipes();
        }
        return true;
    }

    const isTargetGeneric = checkGeneric(connection.targetHandle);

    if (!isTargetGeneric && sourceResourceType) {
        const targetHandleNorm = normalize(connection.targetHandle || '');
        if (targetHandleNorm !== normSourceRt) {
            // Special case for power handles being connected via generic handles (like mergers)
            if (targetHandleNorm === 'electricity' && normSourceRt === 'electricity') return true;
            return checkAllRecipes();
        }
    } else if (sourceResourceType) {
        return checkAllRecipes();
    }

    return true;
};

export const getAbsPosition = (node: Node, nodes: Node[]) => {
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

export const onNodeDragStopDelegate = (
    draggedNode: Node,
    nodes: Node[],
    dragStartPos: XYPosition | null,
    storeOnNodesChange: (changes: any) => void,
    addNodeToGroup: (nodeId: string, groupId: string | null) => void
) => {
    const isDescendant = (nodeId: string, ancestorId: string) => {
        let current = nodes.find((n: Node) => n.id === nodeId);
        while (current && current.parentId) {
            const parent = nodes.find((n: Node) => n.id === current!.parentId);
            if (!parent) break;
            if (parent.id === ancestorId) return true;
            current = parent;
        }
        return false;
    };

    // --- 1. Collision Avoidance (Power Pole exclusive cell) ---
    if (draggedNode.type !== 'groupArea') {
        const getBox = (n: Node) => {
            const width = n.data?.width || n.width || 220;
            const height = n.data?.height || n.height || 100;
            const pos = getAbsPosition(n, nodes);
            return { x: pos.x, y: pos.y, w: width, h: height };
        };

        const boxA = getBox(draggedNode);
        const otherNodes = nodes.filter((n) => n.id !== draggedNode.id && n.type !== 'groupArea');
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

    const groupNodes = nodes.filter((n: Node) => n.type === 'groupArea' && n.id !== draggedNode.id);

    const absPos = getAbsPosition(draggedNode, nodes);
    const absX = absPos.x;
    const absY = absPos.y;

    let matchedGroups: { group: Node; area: number }[] = [];

    for (const group of groupNodes) {
        // Prevent circular nesting
        if (isDescendant(group.id, draggedNode.id)) continue;

        const width = group.data?.width || group.width || 300;
        const height = group.data?.height || group.height || 200;
        const gPos = getAbsPosition(group, nodes);

        if (absX >= gPos.x && absX <= gPos.x + width && absY >= gPos.y && absY <= gPos.y + height) {
            matchedGroups.push({ group, area: width * height });
        }
    }

    // Sort by area ascending so we pick the SMALLEST containing group (the innermost subgroup)
    matchedGroups.sort((a, b) => a.area - b.area);
    const targetGroup = matchedGroups[0]?.group || null;

    if (targetGroup) {
        addNodeToGroup(draggedNode.id, targetGroup.id);
    } else if (draggedNode.parentId) {
        addNodeToGroup(draggedNode.id, null);
    }
};
