import React, { useRef, useMemo, useContext, useState, useEffect } from 'react';
import { useFrame, extend, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { shaderMaterial, Text, Line } from '@react-three/drei';
import { TreeContext, ParticleData, TreeContextType } from '../types';


// 生成文字粒子坐标的核心函数
const generateTextPositions = (text: string, particleCount: number, radius: number = 20) => {
  // 1. 创建虚拟 Canvas
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const width = 1000; // 画布越大，采样精度越高
  const height = 1000;
  canvas.width = width;
  canvas.height = height;

  if (!ctx) return new Float32Array(particleCount * 3);

  // 2. 绘制文字 (黑底白字，或者反过来，只要能区分就行)
  ctx.fillStyle = '#000000'; // 背景黑
  ctx.fillRect(0, 0, width, height);
  
  ctx.fillStyle = '#ffffff'; // 文字白
  // 🌟 关键：使用系统自带粗体，或者你加载的字体
  ctx.font = 'bold 180px "Microsoft YaHei", "SimHei", sans-serif'; 
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2);

  // 3. 读取像素数据
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const validPositions: [number, number][] = [];

  // 4. 扫描像素，收集白色点的坐标
  // step = 4 意味着每隔 4 个像素采一次样，越小粒子越密
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const i = (y * width + x) * 4;
      // data[i] 是 R 通道，如果大于 128 说明是白色（文字部分）
      if (data[i] > 128) {
        validPositions.push([x, y]);
      }
    }
  }

  // 5. 将坐标填充到 Float32Array
  const positions = new Float32Array(particleCount * 3);
  
  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;
    
    // 从有效点中随机取一个 (如果粒子多于文字面积，就重叠；少于则随机分布)
    const index = i % validPositions.length; 
    // 或者完全随机采样： Math.floor(Math.random() * validPositions.length)
    
    const [px, py] = validPositions[Math.floor(Math.random() * validPositions.length)];

    // 坐标映射：把 0~1000 的像素坐标 映射到 -10~10 的 3D 世界坐标
    const x = (px / width - 0.5) * radius;
    const y = -(py / height - 0.5) * radius; // Canvas Y轴向下，3D Y轴向上，所以取反
    
    // 给一点 Z 轴厚度，不然文字太扁了
    const z = (Math.random() - 0.5) * 2.0; 

    positions[i3] = x;
    positions[i3 + 1] = y + 5; // 稍微抬高一点，别沉在地下
    positions[i3 + 2] = z;
  }

  return positions;
};

const FoliageMaterial = shaderMaterial(
  {
    uTime: 0,
    uColorBottom: new THREE.Color('#22ffcc'), //稍微提亮
    uColorMid: new THREE.Color('#ffee44'),
    uColorTop: new THREE.Color('#ffffff'),
    uPixelRatio: 1
  },
  // Vertex Shader (保持不变，高度计算已经很稳了)
  `
    uniform float uTime;
    uniform float uPixelRatio;
    attribute float size;
    varying vec3 vPosition;
    varying float vBlink;
    varying float vHeight;

    vec3 curl(float x, float y, float z) {
      float eps=1.,n1,n2,a,b;
      x/=eps;y/=eps;z/=eps;
      vec3 curl=vec3(0.);
      n1=sin(y+cos(z+uTime)); n2=cos(x+sin(z+uTime)); curl.x=n1-n2;
      n1=sin(z+cos(x+uTime)); n2=cos(y+sin(x+uTime)); curl.z=n1-n2;
      n1=sin(x+cos(y+uTime)); n2=cos(z+sin(y+uTime)); curl.z=n1-n2;
      return curl*0.2;
    }

    void main() {
      vPosition = position;
      vec3 distortedPosition = position + curl(position.x, position.y, position.z);
      vec4 mvPosition = modelViewMatrix * vec4(distortedPosition, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      
      float zDist = max(abs(mvPosition.z), 1.0);
      gl_PointSize = size * uPixelRatio * (150.0 / zDist);
      gl_PointSize = min(gl_PointSize, 60.0);

      vBlink = sin(uTime * 4.0 + position.y * 1.0 + position.x * 2.0);
      vHeight = smoothstep(-7.0, 16.0, position.y);
    }
  `,
  // Fragment Shader (🌟 重点修改区 🌟)
  `
    uniform vec3 uColorBottom;
    uniform vec3 uColorMid;
    uniform vec3 uColorTop;
    varying float vBlink;
    varying float vHeight;

    void main() {
      vec2 xy = gl_PointCoord.xy - vec2(0.5);
      float dist = length(xy);
      
      if(dist > 0.5) discard;

      // 🌟 修复 1：柔化光晕
      // 从 2.5 降到 1.5。这会让粒子看起来更"肉"、更柔和，
      // 减少了边缘极低 Alpha 值堆叠时产生的"黑色切割感"。
      float strength = max(0.0, 1.0 - (dist * 2.0));
      strength = pow(strength, 1.5); 

      // 颜色混合
      float h = clamp(vHeight, 0.0, 1.0);
      vec3 baseColor;
      if (h < 0.5) {
        baseColor = mix(uColorBottom, uColorMid, h * 2.0);
      } else {
        baseColor = mix(uColorMid, uColorTop, (h - 0.5) * 2.0);
      }

      // 🌟 修复 2：色彩托底
      // 加上 0.01 的底色，防止任何数学计算导致颜色归零（变黑）。
      baseColor += vec3(0.01);

      vec3 sparkleColor = vec3(1.0, 1.0, 1.0);
      vec3 colorMix = mix(baseColor, sparkleColor, smoothstep(0.7, 1.0, vBlink));
      
      // 🌟 修复 3：手动预乘 + 强度控制
      // 我们直接把 strength 乘进颜色里，而不是完全依赖 Alpha 混合。
      // 乘以 4.0 保证亮度足够触发 Bloom。
      vec3 finalColor = colorMix * strength * 4.0;

      // 🌟 修复 4：Alpha 安全钳制
      // 即使 blending 是 additive，也不要让 alpha 超过 1.0
      gl_FragColor = vec4(finalColor, clamp(strength, 0.0, 1.0));
    }
  `
);
extend({ FoliageMaterial });

const ShimmerMaterial = shaderMaterial(
  { uTime: 0, uColor: new THREE.Color('#ffffff') },
  ` varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); } `,
  ` uniform float uTime; uniform vec3 uColor; varying vec2 vUv; void main() { float pos = mod(uTime * 0.8, 2.5) - 0.5; float bar = smoothstep(0.0, 0.2, 0.2 - abs(vUv.x + vUv.y * 0.5 - pos)); float alpha = bar * 0.05; gl_FragColor = vec4(uColor, alpha); } `
);
extend({ ShimmerMaterial });

declare module '@react-three/fiber' {
  interface ThreeElements {
    foliageMaterial: any
    shimmerMaterial: any
  }
}

const createSeededRandom = (seed: number) => {
    let m_w = (123456789 + seed) & 0xffffffff;
    let m_z = (987654321 - seed) & 0xffffffff;
    return () => {
        m_z = (36969 * (m_z & 65535) + (m_z >> 16)) & 0xffffffff;
        m_w = (18000 * (m_w & 65535) + (m_w >> 16)) & 0xffffffff;
        let result = ((m_z << 16) + (m_w & 65535)) >>> 0;
        result /= 4294967296;
        return result; 
    };
};

const PolaroidPhoto: React.FC<{ url: string; position: THREE.Vector3; rotation: THREE.Euler; scale: number; id: string; shouldLoad: boolean; year: number }> = ({ url, position, rotation, scale, id, shouldLoad, year }) => {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [loadStatus, setLoadStatus] = useState<'pending' | 'loading' | 'local' | 'fallback'>('pending');

  useEffect(() => {
    if (!shouldLoad || loadStatus !== 'pending') return;
    setLoadStatus('loading');
    const loader = new THREE.TextureLoader();
    loader.load(url, (tex) => { 
        tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true; setTexture(tex); setLoadStatus('local');
    }, undefined, () => {
        const seed = id.split('-')[1] || '55'; const fallbackUrl = `https://picsum.photos/seed/${parseInt(seed) + 100}/400/500`;
        loader.load(fallbackUrl, (fbTex) => { fbTex.colorSpace = THREE.SRGBColorSpace; fbTex.wrapS = THREE.ClampToEdgeWrapping; fbTex.wrapT = THREE.ClampToEdgeWrapping; fbTex.needsUpdate = true; setTexture(fbTex); setLoadStatus('fallback'); }, undefined, () => {});
    });
  }, [url, id, shouldLoad, loadStatus]);

  return (
    <group position={position} rotation={rotation} scale={scale * 1.2}>
      <mesh position={[0, 0, 0]} userData={{ photoId: id, photoUrl: url }}><boxGeometry args={[1, 1.25, 0.02]} /><meshStandardMaterial color="#ffffff" roughness={0.2} metalness={0.1} /></mesh>
      <mesh position={[0, 0.15, 0.015]} userData={{ photoId: id, photoUrl: url }}><planeGeometry args={[0.9, 0.9]} />{texture ? ( <meshStandardMaterial key={texture.uuid} map={texture} roughness={0.5} metalness={0.0} /> ) : ( <meshStandardMaterial color="#333" /> )}</mesh>
      <mesh position={[0, 0.15, 0.02]} scale={[0.9, 0.9, 1]}><planeGeometry args={[1, 1]} /><shimmerMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
    </group>
  );
};

const TreeSystem: React.FC = () => {
  const { state, rotationSpeed, rotationBoost, pointer, clickTrigger, setSelectedPhotoUrl, selectedPhotoUrl, panOffset } = useContext(TreeContext) as TreeContextType;
  // 🌟 新增 1：控制是否显示文字的状态
  const [showText, setShowText] = useState(false);
  
  // 🌟 新增 2：文字变换的动画进度 (0 = 树, 1 = 文字)
  const textProgress = useRef(0);

  // 🌟 新增 3：监听回车键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        setShowText((prev) => !prev); // 切换开关
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  const { camera } = useThree();
  const pointsRef = useRef<THREE.Points>(null);
  const lightsRef = useRef<THREE.InstancedMesh>(null);
  const trunkRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const progress = useRef(0);
  const treeRotation = useRef(0);
  const currentPan = useRef({ x: 0, y: 0 });
  const [loadedCount, setLoadedCount] = useState(0);
  
  const rng = useMemo(() => createSeededRandom(12345), []);

  const { foliageData, photosData, lightsData, photoObjects, lightSizes } = useMemo(() => {
    const prng = createSeededRandom(42); 
    const particleCount = 8500;
    const foliage = new Float32Array(particleCount * 3); 
    const foliageChaos = new Float32Array(particleCount * 3); 
    const foliageTree = new Float32Array(particleCount * 3); 
    const sizes = new Float32Array(particleCount);
    
    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        const u = prng(); const v = prng(); const theta = 2 * Math.PI * u; const phi = Math.acos(2 * v - 1); const r = Math.cbrt(prng()) * 28;
        foliageChaos[i3] = r * Math.sin(phi) * Math.cos(theta); foliageChaos[i3 + 1] = r * Math.sin(phi) * Math.sin(theta); foliageChaos[i3 + 2] = r * Math.cos(phi);

        // --- 🌟 核心修改：改变高度分布 🌟 ---
        // 原来的线性分布：const h = prng() * 16; 导致上下密度一样。

        // 新的分布：使用幂函数。
        // prng() 生成 0到1 的随机数。
        // Math.pow(t, 1.8) 会让结果更倾向于接近 0（底部），而接近 1（顶部）的概率变小。
        const t = prng();
        // 1.8 是一个经验值，越大顶部越稀疏。你可以尝试 1.5 到 2.5 之间的值。
        const hNormalized = Math.pow(t, 1.8);
        const treeHeight = 16; // 树的总高度范围
        const h = hNormalized * treeHeight;

        // ------------------------------------
        const coneRadius = (16 - h) * 0.5;
        const angle = h * 4.0 + prng() * Math.PI * 2;
        const jitterR = prng() * 0.4;
        const jitterY = prng() * 0.4;
        
        foliageTree[i3] = Math.cos(angle) * (coneRadius + jitterR);
        foliageTree[i3 + 1] = h - 7.5 + jitterY;
        foliageTree[i3 + 2] = Math.sin(angle) * (coneRadius + jitterR);
        sizes[i] = Math.pow(prng(), 2.0) * 3.0 + 0.5;
    }

    const lightCount = 500;
    const lightChaos = new Float32Array(lightCount * 3); 
    const lightTree = new Float32Array(lightCount * 3);
    const generatedLightSizes = new Float32Array(lightCount);

    for (let i = 0; i < lightCount; i++) {
        const i3 = i * 3;
        const u = prng(); const v = prng(); const theta = 2 * Math.PI * u; const phi = Math.acos(2 * v - 1); const r = Math.cbrt(prng()) * 22;
        lightChaos[i3] = r * Math.sin(phi) * Math.cos(theta); lightChaos[i3 + 1] = r * Math.sin(phi) * Math.sin(theta); lightChaos[i3 + 2] = r * Math.cos(phi);

        const t = prng(); const h = t * 15; const coneRadius = (15 - h) * 0.52; const angle = prng() * Math.PI * 2;
        lightTree[i3] = Math.cos(angle) * coneRadius; lightTree[i3 + 1] = h - 7; lightTree[i3 + 2] = Math.sin(angle) * coneRadius;
        generatedLightSizes[i] = prng() * 0.5 + 0.5;
    }

    const photoFiles = ["2024_06_1.jpg", "2024_07_1.jpg", "2024_07_2.jpg", "2024_09_1.jpg", "2024_09_2.jpg", "2024_09_3.jpg", "2024_09_4.jpg", "2024_09_5.jpg", "2024_09_6.jpg", "2024_10_1.jpg", "2024_11_1.jpg", "2024_12_1.jpg", "2024_12_2.jpg", "2024_12_3.jpg", "2025_01_1.jpg", "2025_01_2.jpg", "2025_01_3.jpg", "2025_01_4.jpg", "2025_01_5.jpg", "2025_01_6.jpg", "2025_01_7.jpg", "2025_02_1.jpg", "2025_05_1.jpg", "2025_06_1.jpg", "2025_06_2.jpg", "2025_06_3.jpg", "2025_09_1.jpg", "2025_10_1.jpg", "2025_10_2.jpg", "2025_11_1.jpg", "2025_11_2.jpg"];
    photoFiles.sort();
    const photoCount = photoFiles.length;
    const rawPhotos: ParticleData[] = [];
    
    for (let i = 0; i < photoCount; i++) {
        const fileName = photoFiles[i]; const parts = fileName.split('_'); const year = parseInt(parts[0]); const month = parts[1];
        const t = i / (photoCount - 1); const h = t * 14 - 7; const radius = (7 - (h + 7)) * 0.4 + 1.5; const angle = t * Math.PI * 10;
        const treeX = Math.cos(angle) * radius; const treeY = h; const treeZ = Math.sin(angle) * radius;
        const phi = Math.acos(1 - 2 * (i + 0.5) / photoCount); const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5); const r = 12 + prng() * 4;
        const chaosX = r * Math.sin(phi) * Math.cos(theta); const chaosY = r * Math.sin(phi) * Math.sin(theta) * 0.6; const chaosZ = r * Math.cos(phi);
        const imageUrl = `/photos/${fileName}`;
        rawPhotos.push({ 
            id: `photo-${i}`, type: 'PHOTO', year: year, month: month, 
            chaosPos: [chaosX, chaosY, chaosZ], treePos: [treeX, treeY, treeZ], 
            chaosRot: [(prng() - 0.5) * 0.2, 0 + (prng() - 0.5) * 0.2, (prng() - 0.5) * 0.1], 
            treeRot: [0, -angle + Math.PI / 2, 0], scale: 0.9 + prng() * 0.3, image: imageUrl, color: 'white' 
        });
    }

    const objects = rawPhotos.map(p => ({
        id: p.id, url: p.image!, ref: React.createRef<THREE.Group>(), data: p, pos: new THREE.Vector3(), rot: new THREE.Euler(), scale: p.scale
    }));

    const foliageText = generateTextPositions("解相宜圣诞快乐！", particleCount, 25);
    return { foliageData: { current: foliage, chaos: foliageChaos, tree: foliageTree, sizes, text: foliageText }, photosData: rawPhotos, lightsData: { chaos: lightChaos, tree: lightTree, count: lightCount }, photoObjects: objects, lightSizes: generatedLightSizes };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => { setLoadedCount(prev => (prev >= photoObjects.length ? prev : prev + 1)); }, 100);
    return () => clearInterval(interval);
  }, [photoObjects.length]);

  const photoOpenTimeRef = useRef<number>(0);
  
  useEffect(() => {
    if (state === 'CHAOS' && pointer) {
      if (selectedPhotoUrl && Date.now() - photoOpenTimeRef.current < 3000) return;
      const ndcX = pointer.x * 2 - 1; const ndcY = -(pointer.y * 2) + 1; let closestPhotoId: string | null = null; let minDistance = Infinity; const SELECTION_THRESHOLD = 0.05;
      photoObjects.forEach(obj => {
        if (!obj.ref.current) return; const worldPos = new THREE.Vector3(); obj.ref.current.getWorldPosition(worldPos); const screenPos = worldPos.clone().project(camera);
        if (screenPos.z < 1) { const dist = Math.hypot(screenPos.x - ndcX, screenPos.y - ndcY); if (dist < SELECTION_THRESHOLD && dist < minDistance) { minDistance = dist; closestPhotoId = obj.data.image!; } }
      });
      if (closestPhotoId) { if (selectedPhotoUrl === closestPhotoId) { if (Date.now() - photoOpenTimeRef.current > 3000) setSelectedPhotoUrl(null); } else { setSelectedPhotoUrl(closestPhotoId); photoOpenTimeRef.current = Date.now(); } } else if (selectedPhotoUrl) { if (Date.now() - photoOpenTimeRef.current > 3000) setSelectedPhotoUrl(null); }
    }
  }, [clickTrigger, photoObjects]);

useFrame((state3d, delta) => {
    // --- 1. 状态进度计算 ---
    
    // A. 树的成型进度 (Chaos <-> Tree)
    const targetProgress = state === 'FORMED' ? 1 : 0;
    progress.current = THREE.MathUtils.damp(progress.current, targetProgress, 2.0, delta);
    const ease = progress.current * progress.current * (3 - 2 * progress.current);

    // B. 文字的变形进度 (Tree <-> Text)
    // showText 是我们在上一步定义的 state
    const targetTextProgress = showText ? 1 : 0;
    textProgress.current = THREE.MathUtils.damp(textProgress.current, targetTextProgress, 1.5, delta);
    const textEase = textProgress.current * textProgress.current * (3 - 2 * textProgress.current);

    // C. 旋转与平移
    treeRotation.current += (state === 'FORMED' ? (rotationSpeed + rotationBoost) : 0.05) * delta;
    currentPan.current.x = THREE.MathUtils.lerp(currentPan.current.x, panOffset.x, 0.2);
    currentPan.current.y = THREE.MathUtils.lerp(currentPan.current.y, panOffset.y, 0.2);
    
    if (groupRef.current) {
      groupRef.current.position.x = currentPan.current.x;
      groupRef.current.position.y = currentPan.current.y;
    }

    // --- 2. 粒子动画核心 (树 + 文字混合) ---
    if (pointsRef.current) {
      // @ts-ignore
      pointsRef.current.material.uniforms.uTime.value = state3d.clock.getElapsedTime();
      const positions = pointsRef.current.geometry.attributes.position.array as Float32Array;
      
      for (let i = 0; i < positions.length / 3; i++) {
        const i3 = i * 3;

        // [原始数据]
        const cx = foliageData.chaos[i3];
        const cy = foliageData.chaos[i3 + 1];
        const cz = foliageData.chaos[i3 + 2];
        const tx = foliageData.tree[i3];
        const ty = foliageData.tree[i3 + 1];
        const tz = foliageData.tree[i3 + 2];
        
        // [文字数据] (如果在 useMemo 里没生成 text 数据，这里加个 fallback 防止报错)
        const fontX = foliageData.text ? foliageData.text[i3] : 0;
        const fontY = foliageData.text ? foliageData.text[i3 + 1] : 0;
        const fontZ = foliageData.text ? foliageData.text[i3 + 2] : 0;

        // [步骤 1: 计算树的形态 (含漩涡效果)]
        const y = THREE.MathUtils.lerp(cy, ty, ease);
        const tr = Math.sqrt(tx * tx + tz * tz);
        const tAngle = Math.atan2(tz, tx);
        const cr = Math.sqrt(cx * cx + cz * cz);
        const r = THREE.MathUtils.lerp(cr, tr, ease);
        
        // 漩涡扭曲计算
        const vortexTwist = (1 - ease) * 15.0;
        const currentAngle = tAngle + vortexTwist + treeRotation.current;

        // 暂存树的坐标
        const treeX = THREE.MathUtils.lerp(cr * Math.cos(Math.atan2(cz, cx) + treeRotation.current * 0.5), r * Math.cos(currentAngle), ease);
        const treeY = y;
        const treeZ = THREE.MathUtils.lerp(cr * Math.sin(Math.atan2(cz, cx) + treeRotation.current * 0.5), r * Math.sin(currentAngle), ease);

        // [步骤 2: 混合文字形态]
        // 当 textEase 为 1 时，完全变成文字坐标；为 0 时，保持树的坐标
        positions[i3]     = THREE.MathUtils.lerp(treeX, fontX, textEase);
        positions[i3 + 1] = THREE.MathUtils.lerp(treeY, fontY, textEase);
        positions[i3 + 2] = THREE.MathUtils.lerp(treeZ, fontZ, textEase);
      }
      pointsRef.current.geometry.attributes.position.needsUpdate = true;
    }

    // --- 3. 灯光动画 (变成文字时缩小隐藏) ---
    if (lightsRef.current) {
        const dummy = new THREE.Object3D();
        for (let i = 0; i < lightsData.count; i++) {
          const i3 = i * 3; 
          // ... (省略灯光位置计算，保持原逻辑) ...
          const cx = lightsData.chaos[i3]; const cy = lightsData.chaos[i3 + 1]; const cz = lightsData.chaos[i3 + 2]; 
          const tx = lightsData.tree[i3]; const ty = lightsData.tree[i3 + 1]; const tz = lightsData.tree[i3 + 2];
          const y = THREE.MathUtils.lerp(cy, ty, ease); const tr = Math.sqrt(tx * tx + tz * tz); const tAngle = Math.atan2(tz, tx); const cr = Math.sqrt(cx * cx + cz * cz); const r = THREE.MathUtils.lerp(cr, tr, ease);
          const vortexTwist = (1 - ease) * 12.0; const currentAngle = tAngle + vortexTwist + treeRotation.current;
          const fx = THREE.MathUtils.lerp(cr * Math.cos(Math.atan2(cz, cx) + treeRotation.current * 0.3), r * Math.cos(currentAngle), ease); 
          const fz = THREE.MathUtils.lerp(cr * Math.sin(Math.atan2(cz, cx) + treeRotation.current * 0.3), r * Math.sin(currentAngle), ease);
          
          dummy.position.set(fx, y, fz);
          
          // 🌟 修改：当显示文字时，将灯光缩放至 0 (隐藏)
          const scaleMix = lightSizes[i] * (1 - textEase); 
          dummy.scale.setScalar(scaleMix); 
          
          dummy.updateMatrix(); 
          lightsRef.current.setMatrixAt(i, dummy.matrix);
        }
        lightsRef.current.instanceMatrix.needsUpdate = true;
    }
    
    // --- 4. 照片动画 (变成文字时跟随树移动并缩小隐藏) ---
    photoObjects.forEach((obj) => {
        if (!obj.ref.current) return; 
        // ... (保持原有的位置计算逻辑) ...
        const { chaosPos, treePos, chaosRot, treeRot } = obj.data; const [cx, cy, cz] = chaosPos; const [tx, ty, tz] = treePos;
        const y = THREE.MathUtils.lerp(cy, ty, ease); const cr = Math.sqrt(cx * cx + cz * cz); const tr = Math.sqrt(tx * tx + tz * tz); const r = THREE.MathUtils.lerp(cr, tr, ease);
        const tAngle = Math.atan2(tz, tx); const vortexTwist = (1 - ease) * 10.0; const currentAngle = tAngle + vortexTwist + treeRotation.current;
        const targetX = r * Math.cos(currentAngle); const targetZ = r * Math.sin(currentAngle);
        
        obj.ref.current.position.set(
            THREE.MathUtils.lerp(cr * Math.cos(Math.atan2(cz, cx) + treeRotation.current * 0.2), targetX, ease), 
            y, 
            THREE.MathUtils.lerp(cr * Math.sin(Math.atan2(cz, cx) + treeRotation.current * 0.2), targetZ, ease)
        );

        // 旋转
        const lookAtAngle = -currentAngle + Math.PI / 2;
        obj.ref.current.rotation.x = THREE.MathUtils.lerp(chaosRot[0], treeRot[0], ease); 
        obj.ref.current.rotation.y = THREE.MathUtils.lerp(chaosRot[1], lookAtAngle, ease); 
        obj.ref.current.rotation.z = THREE.MathUtils.lerp(chaosRot[2], treeRot[2], ease);

        // 🌟 修改：当显示文字时，照片缩小至 0
        const currentScale = obj.scale * (1 - textEase);
        obj.ref.current.scale.setScalar(Math.max(0.001, currentScale)); // 防止 scale 为 0 导致矩阵警告
    });
    
    // 刷新照片时间
    photoObjects.forEach(obj => { if (obj.ref.current) obj.ref.current.traverse((child: any) => { if (child.material?.uniforms?.uTime) child.material.uniforms.uTime.value = state3d.clock.getElapsedTime() + parseInt(obj.id.split('-')[1] || '0'); }); });
    
    // --- 5. 树干动画 (变成文字时淡出) ---
    if (trunkRef.current) {
      const trunkScaleY = THREE.MathUtils.smoothstep(ease, 0.0, 1.0); 
      trunkRef.current.scale.set(1, trunkScaleY, 1);
      trunkRef.current.position.y = THREE.MathUtils.lerp(-10, 0.5, ease);
      trunkRef.current.rotation.y = treeRotation.current;
      
      // 🌟 修改：计算透明度，当 textEase 为 1 时透明度为 0
      const baseOpacity = THREE.MathUtils.lerp(0, 0.1, ease);
      (trunkRef.current.material as THREE.MeshStandardMaterial).opacity = baseOpacity * (1 - textEase);
    }
  });

  return (
    <group ref={groupRef} dispose={null}>
      <mesh ref={trunkRef} position={[0, 0, 0]}>
        <cylinderGeometry args={[0.02, 0.3, 15, 16]} />
        <meshStandardMaterial 
            color="#ffd700" 
            emissive="#ffaa00"
            emissiveIntensity={2}
            transparent 
            opacity={0.1} 
            depthWrite={false} 
            blending={THREE.AdditiveBlending}
        />
      </mesh>

      <points ref={pointsRef}>
        <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={foliageData.current.length / 3} array={foliageData.current} itemSize={3} />
            <bufferAttribute attach="attributes-size" count={foliageData.sizes.length} array={foliageData.sizes} itemSize={1} />
        </bufferGeometry>
        {/* 🌟 修复：显式传递所有颜色 Uniform，确保着色器能正确接收 */}
        <foliageMaterial 
          transparent 
          depthWrite={false} 
          blending={THREE.AdditiveBlending} 
          toneMapped={false} 
          uColorBottom={new THREE.Color('#00ff88')}
          uColorMid={new THREE.Color('#ffd700')}
          uColorTop={new THREE.Color('#ffffff')}
        />
      </points>

      <instancedMesh ref={lightsRef} args={[undefined, undefined, lightsData.count]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial color="#ffea00" emissive="#ffdd00" emissiveIntensity={5} toneMapped={false} />
      </instancedMesh>

      {/* 照片渲染逻辑保持不变 */}
      {photoObjects.map((obj, index) => (
        <group key={obj.id} ref={(el) => { obj.ref.current = el; }}>
          <PolaroidPhoto url={obj.url} position={obj.pos} rotation={obj.rot} scale={obj.scale} id={obj.id} shouldLoad={index < loadedCount} year={obj.data.year} />
          {obj.data.year && (index === 0 || photoObjects[index - 1].data.year !== obj.data.year) && (
            <group position={[0, 0.65, 0.05]}>
              <Text position={[0.01, -0.01, -0.01]} fontSize={0.18} maxWidth={1.2} color="#000000" font="/fonts/Cinzel-Bold.ttf" characters="0123456789-" anchorX="center" anchorY="bottom" fillOpacity={0.5}>{`${obj.data.year}-${obj.data.month}`}</Text>
              <Text fontSize={0.18} maxWidth={1.2} color="#ffd700" font="/fonts/Cinzel-Bold.ttf" characters="0123456789-" anchorX="center" anchorY="bottom" fillOpacity={state === 'FORMED' ? 1 : 0.9} outlineWidth={0}>{`${obj.data.year}-${obj.data.month}`}</Text>
            </group>
          )}
        </group>
      ))}
      {state === 'FORMED' && ( <Line points={photoObjects.map(obj => new THREE.Vector3(...obj.data.treePos))} color="#ffd700" opacity={0.4} transparent lineWidth={1.5} /> )}
    </group>
  );
};

export default TreeSystem;