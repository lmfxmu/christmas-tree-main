# CLAUDE.md (中文版)

本文件为 Claude Code (claude.ai/code) 在此代码仓库中工作时提供指导。

## 项目概述

这是一个基于 React Three Fiber 和 MediaPipe 手势识别的 3D 交互式圣诞树记忆展示项目。用户可以在魔法般的 3D 空间中查看照片记忆，并在散落的"混沌模式"和整齐的"树形模式"之间切换。

## 命令

### 开发
```bash
npm run dev      # 启动开发服务器 http://localhost:5173
npm run build    # 生产环境构建
npm run preview  # 预览生产构建版本
```

## 架构

### 状态管理
- **React Context (`TreeContext`)**: 在 `src/App.tsx` 中的集中式状态管理
- 关键状态：
  - `AppState`: 'CHAOS'（记忆散落）| 'FORMED'（树形排列）
  - `pointer`: 鼠标/手势位置坐标
  - `clickTrigger`: 照片选择的时间戳
  - `rotationSpeed`, `rotationBoost`: 相机旋转控制
  - `panOffset`, `zoomOffset`: 相机位置控制
  - `selectedPhotoUrl`: 当前显示的照片
  - `webcamEnabled`: 手势控制模式开关

### 组件层级
```
App (提供 TreeContext)
├── AppContent
│   ├── Experience (通过 React Three Fiber 创建 3D Canvas)
│   │   ├── TreeSystem (核心树逻辑 - 8500粒子、照片)
│   │   ├── CrystalOrnaments (装饰品)
│   │   ├── Rig (相机动画控制器)
│   │   └── OrbitControls (鼠标/触控相机控制)
│   ├── GestureInput (MediaPipe 手势追踪 - 条件渲染)
│   ├── DreamyCursor (带进度环的自定义光标)
│   ├── TechEffects (视觉叠加特效 - 条件渲染)
│   └── PhotoModal (照片查看弹窗)
```

### 关键技术细节

#### 3D 场景结构
- **Canvas 配置在** `src/components/Experience.tsx`
  - 树叶粒子使用自定义着色器材质
  - 后处理效果：Bloom（泛光）、Vignette（暗角）、Noise（噪点）
  - 使用自定义材质的 Three.js 基础几何体

#### TreeSystem (`src/components/TreeSystem.tsx`)
应用的核心，包含：
- **粒子系统**: 8500 个树叶粒子，使用自定义 GLSL 着色器
- **照片对象**: 31 张照片渲染为 3D 拍立得相框样式
- **两种位置状态**: 每个粒子/照片都有 `chaosPos`（混沌位置）和 `treePos`（树形位置）
- **动画**: 使用 `useFrame` 在状态间平滑插值
- **照片选择**: 使用屏幕空间射线检测进行点击识别
- **种子随机**: 使用 `createSeededRandom()` 确保确定性粒子生成（防止 React StrictMode 出现重复树）

#### 手势控制 (`src/components/GestureInput.tsx`)
- 使用 **MediaPipe Tasks Vision** 进行手部追踪
- 手势说明：
  - 张开手掌 → 切换到 CHAOS 模式
  - 握拳 → 切换到 FORMED 模式
  - 单指指向 → 光标悬停点击（按住 1.2 秒）
  - 捏合（拇指+食指）→ 立即点击
  - 两指 → 平移场景
  - 五指移动 → 旋转加速
  - 双手距离变化 → 缩放控制

### 重要文件位置

| 文件 | 用途 |
|------|------|
| `index.tsx` | 应用启动入口，使用 `React.StrictMode` |
| `src/App.tsx` | 主应用，TreeContext 提供者，键盘/鼠标事件处理 |
| `src/types.ts` | Context 的 TypeScript 类型定义 |
| `src/components/Experience.tsx` | 3D 场景容器，Canvas 配置 |
| `src/components/TreeSystem.tsx` | 核心树逻辑，粒子动画，照片选择 |
| `src/components/GestureInput.tsx` | MediaPipe 手势识别 |
| `vite.config.ts` | Vite 构建配置 |

### 已知问题与解决方案

#### 双圣诞树问题
如果你看到渲染了两棵圣诞树：
- **原因**: `TechEffects` 组件包含一个重复的 Canvas（它实际上是 `Experience.tsx` 的旧副本）
- **解决方案**: 只从 `App.tsx` 渲染 `<Experience />`。移除任何无条件的 `<TechEffects />` 渲染。

#### 鼠标控制替代方案
当摄像头不可用或被禁用时：
- 鼠标控制通过 `App.tsx` 中的事件监听器自动激活
- `mousemove` 更新 `pointer` 状态
- `click` 或 `mousedown` 触发 `clickTrigger`
- 照片选择使用与手势相同的屏幕空间距离计算

### 照片管理
- 照片存储在 `public/photos/` 目录（被 gitignore）
- 命名规范：`YYYY_MM_序号.jpg`（例如：`2024_12_1.jpg`）
- 在 `TreeSystem.tsx` 的 `photoFiles` 数组中定义（约第 212 行）
- 失败回退：如果本地照片加载失败，使用 `picsum.photos` 随机图片

### 自定义着色器
- **FoliageMaterial**: 树粒子自定义着色器，带卷曲噪点扭曲效果
- **ShimmerMaterial**: 照片上的扫描光效
- 两者都扩展自 `@react-three/drei` 的 `shaderMaterial`

### 性能考虑
- 使用 `THREE.InstancedMesh` 渲染 500+ 个装饰灯光
- 渐进式照片加载（每 100ms 加载 1 张）
- 基于着色器的粒子动画，性能优于 CPU 动画
- 组上使用 `dispose={null}` 防止 React 18 双重挂载问题

### 开发注意事项
- React StrictMode 已启用（开发环境下会导致双重挂载）
- Vite HMR 支持快速迭代
- TypeScript strict 模式已启用
- 通过 Vite 插件使用 Tailwind CSS 4

### 交互逻辑要点

#### 照片点击检测
- 不使用传统的 3D 射线检测
- 使用屏幕空间距离计算：将每个照片的世界坐标投影到屏幕空间，计算与指针的距离
- 阈值：0.05 NDC 单位内判定为可点击
- 3 秒锁定机制：照片打开后 3 秒内不能关闭，防止误触

#### 动画系统
- 使用 `THREE.MathUtils.damp` 实现平滑阻尼
- 自定义缓动函数：`ease = t * t * (3 - 2 * t)`
- 旋转速度 = 基础速度 + 加速度（boost）
- boost 会随时间衰减（乘以 0.95）

#### 粒子生成算法
- **CHAOS 模式**: 球面均匀分布（Fibonacci sphere）
- **FORMED 模式**: 圆锥体分布模拟圣诞树形状
- 使用确定性随机数生成器确保每次渲染相同的树形
