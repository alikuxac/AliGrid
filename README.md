# 🌌 AliGrid - Simulation & Idle Factory Game

> [!CAUTION]
> **Experimental Version (v0.1.0)**: This is an early-stage experimental build and not yet a finished product. Many features are under active development and may change significantly in future updates.

A simulation and idle crafting game focused on managing an interconnected network of infinite resources. Built with a node-based architecture utilizing React Flow and a custom-designed game logic engine.

> [!NOTE]
> **Platform Support**: Currently, only the **Web version** (`apps/web`) is under active development and functional. The **Mobile** and **Desktop** (Tauri) wrappers are placeholders and currently **NOT available**.


---

## 🚀 Core Features

### 1. Production System (Generators)
- **Raw Resource Generators**: Spawns base materials (Water, Iron, Copper, Coal).
- **Level Scaling**: Upgrades incrementally boost standard output rates per second.

### 2. Processing System (Processors)
- **Material Conversion**: Consumes input resources and transforms them into outputs (e.g., `Smelter` consumes Iron Ore + Coal ➔ creates Iron).
- **Multi-Input/Recipe Auto-Switching**: Processors intelligently decide what to craft based on available buffered ingredients, preventing deadlocks.

### 3. Logistics & Spatial Boosters
- **Merger (Combine)**: Combines up to 5 inputs ➔ into 1 output line. Auto-locks to the first connected wire type to prevent mixtures.
- **Splitter (Divide)**: 1 input ➔ distributed up to 5 output handles with configurable proportional weights.
- **Amplifiers (Overclockers)** ✨: Radius-based node consuming heavy Power to boost production/processing speeds of surrounding machines (+100% speed output).

### 4. Cloud Integration
- **Cloud Antenna Node**: Pumps connected grid supplies directly into your Global Cloud inventory for backing downloads.
- **Cross-Save Support**: Distributed state syncing serialized via Strings avoiding JS float overflows safely across clients.

---

## 🛠️ Tech Stack & Tooling

- **Frontends**: React 18, React Flow, Tailwind CSS template triggers.
- **Desktop Wrapper**: **Tauri (Rust)** bundling native binary builds for Win/Mac/Linux.
- **State Management**: Zustand (discrete phase-tick buffers updates).
- **Arithmetics**: `break_infinity.js` supporting massive incremental scales.
- **Backend API**: Cloudflare Workers + Hono DB integration for cloud profiles.
- **Monorepo / DX**: **TurboRepo** pipeline caching alongside **PNPM Workspaces**.

---

## 📂 Monorepo Setup

- `apps/web`: React frontend setup targeting full-canvas browser dashboards.
- `apps/desktop`: Tauri bound entrypoints linking React targets and Rust backbones.
- `apps/mobile`: Targeted configurations for mobile app clients.
- `apps/server`: Cloudflare Hono cluster feeding dynamic nodes templates setup.
- `packages/engine`: Core logics propagation tick engine calculating absolute backpressures.

---

## 💻 Local Sandbox Deployment

1. **Install workspace dependencies**:
   ```bash
   pnpm install
   ```

2. **Spawn local developers servers**:
   ```bash
   pnpm run dev
   ```

3. Navigate your browser to `http://localhost:5173`. Build and maintain your automation network!
