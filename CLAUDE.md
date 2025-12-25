# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a 3D interactive Christmas tree memory visualization built with React Three Fiber and MediaPipe gesture recognition. Users can view their photo memories in a magical 3D space that transitions between a scattered "CHAOS" mode and an organized Christmas tree "FORMED" mode.

## Commands

### Development
```bash
npm run dev      # Start dev server on http://localhost:5173
npm run build    # Production build
npm run preview  # Preview production build
```

## Architecture

### State Management
- **React Context (`TreeContext`)**: Centralized state in `src/App.tsx`
- Key states:
  - `AppState`: 'CHAOS' (scattered memories) | 'FORMED' (tree shape)
  - `pointer`: Mouse/hand position coordinates
  - `clickTrigger`: Timestamp for photo selection
  - `rotationSpeed`, `rotationBoost`: Camera rotation controls
  - `panOffset`, `zoomOffset`: Camera position controls
  - `selectedPhotoUrl`: Currently displayed photo
  - `webcamEnabled`: Toggle for gesture control mode

### Component Hierarchy
```
App (provides TreeContext)
├── AppContent
│   ├── Experience (3D Canvas via React Three Fiber)
│   │   ├── TreeSystem (Main tree logic - 8500 particles, photos)
│   │   ├── CrystalOrnaments (Decorations)
│   │   ├── Rig (Camera animation controller)
│   │   └── OrbitControls (Mouse/touch camera control)
│   ├── GestureInput (MediaPipe hand tracking - conditional)
│   ├── DreamyCursor (Custom cursor with progress ring)
│   ├── TechEffects (Visual overlay effects - conditional)
│   └── PhotoModal (Photo viewer popup)
```

### Key Technical Details

#### 3D Scene Structure
- **Canvas configured in** `src/components/Experience.tsx`
  - Custom shader materials for foliage particles
  - Post-processing: Bloom, Vignette, Noise effects
  - Three.js primitives with custom materials

#### TreeSystem (`src/components/TreeSystem.tsx`)
The heart of the application containing:
- **Particle system**: 8500 foliage particles using custom GLSL shaders
- **Photo objects**: 31 photos rendered as 3D Polaroid-style frames
- **Two position states**: Each particle/photo has `chaosPos` and `treePos`
- **Animation**: Smooth interpolation between states using `useFrame`
- **Photo selection**: Screen-space raycasting for click detection
- **Seeded random**: Uses `createSeededRandom()` for deterministic particle generation (prevents duplicate trees in React Strict Mode)

#### Gesture Control (`src/components/GestureInput.tsx`)
- **MediaPipe Tasks Vision** for hand tracking
- Gestures:
  - Open palm → Switch to CHAOS mode
  - Closed fist → Switch to FORMED mode
  - Single finger pointing → Cursor with dwell-click (1.2s hold)
  - Pinch (thumb+index) → Immediate click
  - Two fingers → Pan the scene
  - Five fingers movement → Rotation boost
  - Two hands distance → Zoom control

### Important File Locations

| File | Purpose |
|------|---------|
| `index.tsx` | App bootstrap with `React.StrictMode` |
| `src/App.tsx` | Main app, TreeContext provider, keyboard/mouse handlers |
| `src/types.ts` | TypeScript type definitions for context |
| `src/components/Experience.tsx` | 3D scene wrapper, Canvas configuration |
| `src/components/TreeSystem.tsx` | Core tree logic, particle animation, photo selection |
| `src/components/GestureInput.tsx` | MediaPipe gesture recognition |
| `vite.config.ts` | Vite build configuration |

### Known Issues & Solutions

#### Duplicate Tree Issue
If you see two Christmas trees rendering:
- **Cause**: `TechEffects` component contains a duplicate Canvas (it's actually an old copy of `Experience.tsx`)
- **Solution**: Only render `<Experience />` from `App.tsx`. Remove any unconditional `<TechEffects />` rendering.

#### Mouse Control Alternative
When webcam is unavailable or disabled:
- Mouse control automatically activates via event listeners in `App.tsx`
- `pointer` state updates on `mousemove`
- `clickTrigger` fires on `click` or `mousedown`
- Photo selection uses the same screen-space distance calculation as gestures

### Photo Management
- Photos stored in `public/photos/` (gitignored)
- Naming convention: `YYYY_MM_序号.jpg` (e.g., `2024_12_1.jpg`)
- Defined in `TreeSystem.tsx` in the `photoFiles` array (line ~212)
- Fallback: Uses `picsum.photos` if local photos fail to load

### Custom Shaders
- **FoliageMaterial**: Custom shader for tree particles with curl noise distortion
- **ShimmerMaterial**: Scanning light effect on photos
- Both extend `@react-three/drei`'s `shaderMaterial`

### Performance Considerations
- Uses `THREE.InstancedMesh` for 500+ light ornaments
- Progressive photo loading (1 photo per 100ms interval)
- Shader-based particle animation for better performance than CPU animation
- `dispose={null}` on groups to prevent React 18 double-mount issues

### Development Notes
- React StrictMode is enabled (causes double mount in dev)
- Vite HMR works well for fast iteration
- TypeScript strict mode enabled
- Tailwind CSS 4 via Vite plugin
