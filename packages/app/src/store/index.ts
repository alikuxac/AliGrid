import { create } from '@aligrid/engine';
import { RFState } from './types';
import { createNodeSlice } from './slices/nodeSlice';
import { createEdgeSlice } from './slices/edgeSlice';
import { createCloudSlice } from './slices/cloudSlice';
import { createSaveSlice } from './slices/saveSlice';
import { createTickSlice } from './slices/tickSlice';

export const useStore = create<RFState>()((set, get) => ({
    ...createNodeSlice(set, get),
    ...createEdgeSlice(set, get),
    ...createCloudSlice(set, get),
    ...createSaveSlice(set, get),
    ...createTickSlice(set, get),
    isViewOnly: false,
    setIsViewOnly: (isViewOnly: boolean) => set({ isViewOnly }),
}));

export * from './types';
export * from './constants';
export * from './helpers';

// Vite HMR
const hot = (import.meta as any).hot;
if (hot) {
    let hasLoaded = false;
    hot.accept();
    hot.dispose((data: any) => {
        const state = useStore.getState();
        data.nodes = state.nodes;
        data.edges = state.edges;
        data.cloudStorage = state.cloudStorage;
    });
    const prevData = hot.data;
    if (prevData?.nodes && prevData?.edges && !hasLoaded) {
        hasLoaded = true;
        useStore.setState({
            nodes: prevData.nodes,
            edges: prevData.edges,
            cloudStorage: prevData.cloudStorage || {}
        });
    }
}
