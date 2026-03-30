export const FALLBACK_NODES = [
    { id: 'waterGenerator', name: 'Water Pump', category: 'generator', icon: '💧', resource_type: 'water', initial_rate: '2.5', power_demand: '0', style_bg: '#064e3b' },
    { id: 'ironGenerator', name: 'Iron Miner', category: 'generator', icon: '⛏️', resource_type: 'iron_ore', initial_rate: '1.0', power_demand: '2', style_bg: '#1e1b4b' },
    { id: 'copperGenerator', name: 'Copper Miner', category: 'generator', icon: '⚒️', resource_type: 'copper_ore', initial_rate: '1.0', power_demand: '2', style_bg: '#431407' },
    { id: 'coalGenerator', name: 'Coal Miner', category: 'generator', icon: '🔥', resource_type: 'coal', initial_rate: '1.5', power_demand: '2', style_bg: '#111827' },
    { id: 'lavaPump', name: 'Lava Pump', category: 'generator', icon: '🌋', resource_type: 'lava', initial_rate: '2.5', power_demand: '0', style_bg: '#450a0a' },
    {
        id: 'hydroGenerator',
        name: 'Fluid Generator',
        category: 'processor',
        icon: '⚡',
        recipes: [
            { inputType: 'water', outputType: 'electricity', conversionRate: '0.333' },
            { inputType: 'lava', outputType: 'electricity', conversionRate: '5.0' }
        ],
        style_bg: '#1e3a8a'
    },
    { id: 'storage', name: 'Storage', category: 'storage', icon: '📦', style_bg: '#065f46' },
    { id: 'merger', name: 'Merger', category: 'logistics', icon: '🔀', style_bg: '#374151' },
    { id: 'splitter', name: 'Splitter', category: 'logistics', icon: '↗️', style_bg: '#374151' },
    { id: 'antenna', name: 'Uploader', category: 'logistics', icon: '📡', style_bg: '#134e4a' },
    { id: 'downloader', name: 'Downloader', category: 'logistics', icon: '📥', style_bg: '#134e4a' },
    {
        id: 'smelter',
        name: 'Smelter',
        category: 'processor',
        icon: '🔥',
        power_demand: '0',
        recipes: [
            { inputType: 'iron_ore,coal', outputType: 'iron', conversionRate: '1.0' },
            { inputType: 'copper_ore,coal', outputType: 'copper', conversionRate: '1.0' }
        ],
        style_bg: '#ff4444'
    },
    { id: 'accumulator', name: 'Accumulator', category: 'storage', icon: '🔋', radius: 200, maxBuffer: 5000, style_bg: '#047857' },
    { id: 'powerTransmitter', name: 'Power Transmitter', category: 'power', icon: '📡', radius: 200, style_bg: '#1e3a8a' },
    { id: 'powerReceiver', name: 'Power Receiver', category: 'power', icon: '🔌', radius: 200, style_bg: '#1e3a8a' },
    { id: 'powerPole', name: 'Power Pole', category: 'power', icon: '🗼', radius: 200, style_bg: '#1e1b4b' },
    { id: 'amplifier', name: 'Amplifier', category: 'power', icon: '🚀', radius: 150, powerConsumption: '10', style_bg: '#312e81' },
    { id: 'tree', name: 'Tree', category: 'generator', icon: '🌳', resource_type: 'wood_log,leaf', initial_rate: '1.0', power_demand: '0', style_bg: '#065f46' },
    { id: 'cobbleGen', name: 'Cobblestone Gen', category: 'processor', icon: '🧱', input_type: 'water,lava,electricity', output_type: 'cobblestone', power_demand: '2', conversion_rate: '1.0', style_bg: '#4b5563' },
    { id: 'autoHammerGravel', name: 'Auto Hammer (Gravel)', category: 'processor', icon: '🔨', input_type: 'cobblestone,electricity', output_type: 'gravel', power_demand: '2', conversion_rate: '1.0', style_bg: '#374151' },
    { id: 'autoHammerSand', name: 'Auto Hammer (Sand)', category: 'processor', icon: '🔨', input_type: 'gravel,electricity', output_type: 'sand', power_demand: '2', conversion_rate: '1.0', style_bg: '#374151' },
    { id: 'autoSieve', name: 'Auto Sieve', category: 'processor', icon: '🕸️', input_type: 'sand,electricity', output_type: 'iron_ore', power_demand: '4', conversion_rate: '0.25', style_bg: '#1e1b4b' },
    { id: 'sink', name: 'Recycler', category: 'storage', icon: '🗑️', style_bg: '#1e3a8a', maxBuffer: 'Infinity' },
    {
        id: 'composter',
        name: 'Composter',
        category: 'processor',
        power_demand: '0',
        requires_power: 0,
        recipes: [
            { inputType: 'leaf,water', outputType: 'compost', conversionRate: '1.0' }
        ],
        style_bg: '#451a03'
    },
    {
        id: 'greenhouse',
        name: 'Greenhouse',
        category: 'processor',
        icon: '🏛️',
        recipes: [
            { inputType: 'compost,water', outputType: 'plant_fiber', conversionRate: '1.0' }
        ],
        power_demand: '0',
        requires_power: 0,
        style_bg: '#16a34a'
    },
    {
        id: 'bioplasticMixer',
        name: 'Bioplastic Mixer',
        category: 'processor',
        icon: '🧪',
        recipes: [
            { inputType: 'plant_fiber,water', outputType: 'bioplastic', conversionRate: '1.0' }
        ],
        power_demand: '0',
        requires_power: 0,
        style_bg: '#15803d'
    },
    {
        id: 'sawmill',
        name: 'Sawmill',
        category: 'processor',
        icon: '🪚',
        recipes: [
            { inputType: 'wood_log', outputType: 'wood_plank', conversionRate: '2.0' }
        ],
        power_demand: 0,
        requires_power: 0,
        style_bg: '#8b5a2b'
    },
];
