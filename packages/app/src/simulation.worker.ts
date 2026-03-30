import { runSimulationTick, TickPayload } from './store/slices/tick/engine';
// Force rebuild - 69184

let tickInterval: number | null = null;
let lastTickTime = performance.now();
let currentPayload: TickPayload | null = null;
let lastFullStateSync = 0;
let lastPostTime = 0;

const runTick = () => {
    if (!currentPayload) return;
    try {
        const now = performance.now();
        const dtSeconds = (now - lastTickTime) / 1000;
        lastTickTime = now;
        // console.log('Worker tick:', dtSeconds);

        // Run simulation with latest available payload + calculated DT
        const results = runSimulationTick({
            ...currentPayload,
            dtSeconds: Math.min(dtSeconds, 2.0) // Relaxed cap
        });

        // EVOLVE STATE: Update current payload with results to allow persistent progression
        currentPayload = {
            ...currentPayload,
            nodes: results.nodes,
            edges: results.edges,
            cloudStorage: results.cloudStorage
        };

        const nowTick = Date.now();
        const fpsLimit = (currentPayload as any).fpsLimit || 0;
        let shouldPost = true;

        if (fpsLimit > 0) {
            const minInterval = 1000 / fpsLimit;
            if (nowTick - lastPostTime < (minInterval - 2)) {
                return; // Early return to avoid heavy logic if we won't post anyway
            }
        }

        if (shouldPost) {
            lastPostTime = nowTick;
            const shouldSendFullState = (nowTick - lastFullStateSync) > 1000;

            if (shouldSendFullState) {
                lastFullStateSync = nowTick;
                self.postMessage({ type: 'TICK_RESULTS', payload: results });
            } else {
                // Send lightweight telemetry only to reduce main-thread churn and memory usage
                self.postMessage({
                    type: 'TICK_RESULTS',
                    payload: {
                        nodeStats: results.nodeStats,
                        edgeStats: results.edgeStats,
                        globalStats: results.globalStats,
                        cloudStorage: results.cloudStorage,
                        cloudStorageDeltas: results.cloudStorageDeltas,
                        dtSeconds: dtSeconds,
                        isPartial: true
                    }
                });
            }
        }
    } catch (error) {
        console.error('Simulation Worker Error:', error);
        self.postMessage({ type: 'ERROR', payload: error instanceof Error ? error.message : String(error) });
    }
};

self.onmessage = async (e: MessageEvent) => {
    const { type, payload } = e.data;

    if (type === 'START') {
        if (payload.resourceRegistry) {
            const { setResourceRegistry } = await import('@aligrid/engine');
            setResourceRegistry(payload.resourceRegistry);
        }

        const interval = payload?.rate || 50;
        currentPayload = payload as TickPayload; // FIX: Initialize payload
        if (tickInterval) clearInterval(tickInterval);
        lastTickTime = performance.now();
        tickInterval = setInterval(runTick, interval) as any;
    } else if (type === 'STOP') {
        if (tickInterval) clearInterval(tickInterval);
        tickInterval = null;
    } else if (type === 'SYNC_STATE') {
        if (payload.resourceRegistry) {
            const { setResourceRegistry } = await import('@aligrid/engine');
            setResourceRegistry(payload.resourceRegistry);
        }
        // Update the base state used for subsequent autonomous ticks
        currentPayload = payload as TickPayload;
    } else if (type === 'UPDATE_SETTINGS') {
        if (currentPayload) {
            currentPayload = { ...currentPayload, ...payload };
        }
    } else if (type === 'UPDATE_RATE') {
        const interval = payload || 50;
        if (tickInterval) {
            clearInterval(tickInterval);
            tickInterval = setInterval(runTick, interval) as any;
        }
    }
};
