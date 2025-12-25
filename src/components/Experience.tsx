import React, { useContext } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, OrbitControls, Stars, Sparkles } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing';
import * as THREE from 'three';
import TreeSystem from './TreeSystem';
import CrystalOrnaments from './CrystalOrnaments';
import { TreeContext, TreeContextType } from '../types';

const Rig = () => {
  const { state, zoomOffset } = useContext(TreeContext) as TreeContextType;
  useFrame((state3d) => {
    const t = state3d.clock.getElapsedTime();
    const baseZ = state === 'CHAOS' ? 22 : 16;
    const targetZ = Math.max(5, Math.min(baseZ + zoomOffset, 50));
    const targetY = state === 'CHAOS' ? 2 : 0;
    state3d.camera.position.z = THREE.MathUtils.lerp(state3d.camera.position.z, targetZ + Math.sin(t * 0.2) * 2, 0.02);
    state3d.camera.position.y = THREE.MathUtils.lerp(state3d.camera.position.y, targetY + Math.cos(t * 0.2) * 1, 0.02);
    state3d.camera.lookAt(0, 0, 0);
  });
  return null;
};

const Experience: React.FC = () => {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 0, 18], fov: 45, near: 0.1, far: 100 }}
      onCreated={({ gl }) => {
         gl.dispose(); 
      }}
      gl={{
        antialias: false,
        alpha: true,
        // 🌟 改动：使用 ACESFilmic，对发光效果支持更好
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.2,
        stencil: false,
        depth: true
      }}
    >
      <ambientLight intensity={0.3} color="#002244" />
      <spotLight position={[10, 20, 10]} angle={0.6} penumbra={1} intensity={12} color="#fff5e0" castShadow />
      <pointLight position={[-10, -5, -10]} intensity={4} color="#005533" />
      <pointLight position={[0, 2, 5]} intensity={3} color="#ffc400" distance={15} />

      <Stars radius={80} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

      <Sparkles count={300} scale={[30, 30, 30]} size={8} speed={0.2} opacity={0.4} color="#ffffff" noise={0.5} />
      <Sparkles count={400} scale={[20, 20, 20]} size={4} speed={0.4} opacity={0.5} color="#ffd700" />
      <Sparkles count={200} scale={[8, 15, 8]} size={6} speed={1.5} opacity={0.8} color="#4ecdc4" noise={1} />

      <Environment preset="city" environmentIntensity={0.2} />

      <group position={[0, -2, 0]}>
        <TreeSystem key="tree-system" />
        <CrystalOrnaments />
      </group>

      <OrbitControls
        enablePan={false}
        enableZoom={true}
        minDistance={8}
        maxDistance={40}
        maxPolarAngle={Math.PI / 1.6}
        target={[0, 2, 0]}
      />
      <Rig />

      <EffectComposer enableNormalPass={false}>
        <Bloom luminanceThreshold={0.65} mipmapBlur intensity={1.8} radius={0.7} levels={9} />
        <Noise opacity={0.04} />
        <Vignette eskil={false} offset={0.1} darkness={1.2} />
      </EffectComposer>
    </Canvas>
  );
};

export default Experience;