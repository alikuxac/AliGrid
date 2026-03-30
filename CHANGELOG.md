# Changelog
All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-03-29
### Major Architectural Enhancements
- **Simulation Engine 2.0:** Transitioned from `dtSeconds`-based simulation to a robust cycle-based logic. The simulation engine now runs in a dedicated Worker to ensure 60FPS UI performance.
- **Dynamic Resource Registry:** Resources are now dynamically hydrated from the database, removing hardcoded item definitions and allowing for easy addition of new materials.
- **Power Grid Overhaul:** Refactored the electrical system to separate power from material inputs. Implemented backpressure logic, charging/discharging mechanisms for Accumulators, and optimized transmission across the grid.
- **Store Slicing Architecture:** Monolithic state management refactored into domain-specific slices (`nodeSlice`, `edgeSlice`, `tickSlice`), reducing re-render overhead.
- **O(1) Lookup Optimization:** Replaced large array filters with pre-calculated dictionaries (`inEdgesByTarget`, `nodesById`) for constant-time performance in high-density factory layouts.

### User Interface & Experience
- **Level of Detail (LOD) System:** Implemented a zoom-based rendering system that collapses detailed node bodies into icon-only placeholders when zoomed out, drastically improving performance for large factories.
- **Interactive Wire Rates:** Added real-time flow rate tooltips (Electricity, Fluids, Items) that appear on wire hover, providing instant feedback on factory throughput.
- **Nested Grouping:** Integrated advanced drag-and-drop support for nodes within groups, including recursive coordinate resolution for multi-level group hierarchies.
- **Dynamic Inventory Display:** UI buffers and storage indicators now automatically scale based on machine level and capacity.

### Bug Fixes & Refactorings
- Fixed an issue where power wires would incorrectly report zero flow despite active operation.
- Resolved Cloud Storage overflow bugs by implementing safe transmission limits and overflow handling.
- Standardized `NodeProps<NodeData>` across all machine types (Miner, Splitter, Smelter, Generator, etc.) for better type safety and consistency.
- Standardized Level-scaling logic for both production yields and upgrade costs using diverse material requirements.
