"use client";

import { Canvas } from "@react-three/fiber";
import { ContactShadows, Float, RoundedBox } from "@react-three/drei";

function Gift() {
  return (
    <group>
      <Float speed={2.4} rotationIntensity={0.55} floatIntensity={1.5}>
        <RoundedBox args={[2.1, 1.65, 2.1]} radius={0.16} smoothness={4}>
          <meshStandardMaterial color="#ff6b35" roughness={0.32} metalness={0.08} />
        </RoundedBox>
        <RoundedBox args={[2.42, 0.32, 2.42]} radius={0.1} smoothness={4} position={[0, 0.99, 0]}>
          <meshStandardMaterial color="#e14f1d" roughness={0.4} />
        </RoundedBox>
        <mesh material-color="#fff3ea" position={[0, 0.95, 0]}>
          <boxGeometry args={[0.3, 2.7, 0.3]} />
          <meshStandardMaterial color="#fff3ea" roughness={0.45} />
        </mesh>
        <mesh material-color="#fff3ea" position={[0, 0.95, 0]}>
          <boxGeometry args={[0.3, 0.3, 2.7]} />
          <meshStandardMaterial color="#fff3ea" roughness={0.45} />
        </mesh>
        <mesh position={[0, 1.62, 0]}>
          <sphereGeometry args={[0.34, 20, 20]} />
          <meshStandardMaterial color="#fff3ea" roughness={0.4} />
        </mesh>
      </Float>
    </group>
  );
}

export default function HeroBox3D() {
  return (
    <Canvas
      camera={{ position: [0.4, 1.15, 5], fov: 38 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
      aria-hidden="true"
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 6, 4]} intensity={1.15} />
      <pointLight position={[-4, 2, -3]} intensity={0.45} color="#ffd9c6" />
      <Gift />
      <ContactShadows position={[0, -1.9, 0]} opacity={0.32} scale={5.2} blur={2.2} far={3} />
    </Canvas>
  );
}