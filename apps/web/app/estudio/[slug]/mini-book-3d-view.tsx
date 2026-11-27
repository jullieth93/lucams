"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls, RoundedBox, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { FitCameraPolar } from "./fit-camera-polar";
import { StudioEnvironment } from "./studio-3d-environment";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import { miniBookGeometry } from "@/features/personalization/product-experience";
import { MAGNET_BACK_COLOR } from "./magnet-3d";
import type { Magnet3D } from "./fridge-3d-view";

const WORLD_PER_CM = 0.85;

function usePageEdgeTexture() {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#F4F0E6";
    context.fillRect(0, 0, 128, 512);
    for (let y = 8; y < 512; y += 12) {
      context.fillStyle = y % 24 === 8 ? "#D8D2C4" : "#E8E2D6";
      context.fillRect(0, y, 128, 2);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
}

function MiniBookModel({
  dataUrl,
  sizeCm,
  spineWidthCm,
  magnet,
  extended,
  rotation,
}: {
  dataUrl: string;
  sizeCm?: string;
  spineWidthCm: number;
  magnet?: boolean;
  extended: boolean;
  rotation: number;
}) {
  const sourceTexture = useTexture(dataUrl);
  const texture = useMemo(() => {
    const clone = sourceTexture.clone();
    clone.colorSpace = THREE.SRGBColorSpace;
    clone.anisotropy = 8;
    clone.needsUpdate = true;
    return clone;
  }, [sourceTexture]);
  const geometry = useMemo(
    () => miniBookGeometry(sizeCm, spineWidthCm) ?? miniBookGeometry("7.1×5", spineWidthCm)!,
    [sizeCm, spineWidthCm],
  );
  const group = useRef<THREE.Group>(null);
  const reducedMotion = usePrefersReducedMotion();
  const invalidate = useThree((state) => state.invalidate);
  const pageTexture = usePageEdgeTexture();

  useEffect(() => () => texture.dispose(), [texture]);

  useEffect(() => {
    invalidate();
  }, [invalidate, reducedMotion, rotation]);

  const regionTextures = useMemo(() => {
    const make = (region: { offsetX: number; width: number }) => {
      const clone = texture.clone();
      clone.offset.set(region.offsetX, 0);
      clone.repeat.set(region.width, 1);
      clone.colorSpace = THREE.SRGBColorSpace;
      clone.anisotropy = 8;
      clone.needsUpdate = true;
      return clone;
    };
    return {
      back: make(geometry.regions.back),
      spine: make(geometry.regions.spine),
      front: make(geometry.regions.front),
    };
  }, [texture, geometry]);

  useEffect(
    () => () => {
      regionTextures.back.dispose();
      regionTextures.spine.dispose();
      regionTextures.front.dispose();
    },
    [regionTextures],
  );

  useFrame((_, delta) => {
    if (!group.current) return;
    const difference = rotation - group.current.rotation.y;
    if (reducedMotion) group.current.rotation.y = rotation;
    else if (Math.abs(difference) > 0.0005) {
      group.current.rotation.y += difference * Math.min(1, delta * 8);
      invalidate();
    }
  });

  const width = geometry.widthCm * WORLD_PER_CM;
  const height = geometry.heightCm * WORLD_PER_CM;
  const coverWidth = geometry.coverWidthCm * WORLD_PER_CM;
  const thickness = geometry.thicknessCm * WORLD_PER_CM;
  const halfW = (extended ? width : coverWidth) / 2 + 0.35;

  return (
    <>
      <FitCameraPolar halfW={halfW} halfH={height / 2 + 0.45} polarDeg={5} margin={1.12} />
      <group ref={group}>
        {extended ? (
          <group>
            <RoundedBox args={[width, height, 0.07]} radius={0.025} smoothness={3} castShadow>
              <meshStandardMaterial color="#FAF8F5" roughness={0.7} />
            </RoundedBox>
            <mesh position={[0, 0, 0.038]}>
              <planeGeometry args={[width, height]} />
              <meshBasicMaterial map={texture} toneMapped={false} />
            </mesh>
            {[-width / 2 + coverWidth, -width / 2 + coverWidth + thickness].map((x) => (
              <mesh key={x} position={[x, 0, 0.041]}>
                <planeGeometry args={[0.018, height]} />
                <meshBasicMaterial color="#FFFFFF" transparent opacity={0.38} />
              </mesh>
            ))}
          </group>
        ) : (
          <group>
            <RoundedBox
              args={[coverWidth * 0.95, height * 0.95, thickness * 0.82]}
              radius={0.035}
              smoothness={3}
              castShadow
            >
              <meshStandardMaterial color="#F4F0E6" roughness={0.9} />
            </RoundedBox>
            <RoundedBox
              args={[coverWidth, height, 0.065]}
              radius={0.035}
              smoothness={3}
              position={[0, 0, thickness / 2]}
              castShadow
            >
              <meshStandardMaterial color="#FAF8F5" roughness={0.6} />
            </RoundedBox>
            <RoundedBox
              args={[coverWidth, height, 0.065]}
              radius={0.035}
              smoothness={3}
              position={[0, 0, -thickness / 2]}
              castShadow
            >
              <meshStandardMaterial color="#FAF8F5" roughness={0.6} />
            </RoundedBox>
            <mesh position={[0, 0, thickness / 2 + 0.034]}>
              <planeGeometry args={[coverWidth, height]} />
              <meshBasicMaterial map={regionTextures.front} toneMapped={false} />
            </mesh>
            <mesh position={[0, 0, -thickness / 2 - 0.034]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[coverWidth, height]} />
              <meshBasicMaterial map={regionTextures.back} toneMapped={false} />
            </mesh>
            <mesh position={[-coverWidth / 2 - 0.034, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
              <planeGeometry args={[thickness, height]} />
              <meshBasicMaterial map={regionTextures.spine} toneMapped={false} />
            </mesh>
            {pageTexture && (
              <mesh position={[coverWidth / 2 - 0.01, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
                <planeGeometry args={[thickness * 0.78, height * 0.92]} />
                <meshStandardMaterial map={pageTexture} roughness={0.9} />
              </mesh>
            )}
            {magnet === true && (
              <RoundedBox
                args={[coverWidth * 0.56, height * 0.42, 0.075]}
                radius={0.025}
                smoothness={3}
                position={[0, 0, -thickness / 2 - 0.075]}
                castShadow
              >
                <meshStandardMaterial color={MAGNET_BACK_COLOR} roughness={0.95} />
              </RoundedBox>
            )}
          </group>
        )}
      </group>
    </>
  );
}

export default function MiniBookView3D({
  magnets,
  sizeCm,
  spineWidthCm = 0.5,
  magnet,
  context = "detail",
}: {
  magnets: Magnet3D[];
  sizeCm?: string;
  spineWidthCm?: number;
  magnet?: boolean;
  context?: "detail" | "fridge";
}) {
  const [unitIndex, setUnitIndex] = useState(0);
  const [extended, setExtended] = useState(false);
  const [rotation, setRotation] = useState(0);
  const current = magnets[Math.min(unitIndex, magnets.length - 1)] ?? magnets[0];
  if (!current) return null;

  return (
    <div className="absolute inset-0">
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ fov: 40, near: 0.05, far: 100, position: [0, 0.4, 9] }}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        frameloop="demand"
        onCreated={({ gl }) => gl.setClearColor(context === "fridge" ? "#DCE1E7" : "#F3ECE2")}
      >
        <Suspense fallback={null}>
          <StudioEnvironment intensity={0.85} />
          <ambientLight intensity={0.55} />
          <directionalLight position={[4, 6, 5]} intensity={1.05} castShadow />
          {context === "fridge" && !extended && (
            <RoundedBox args={[7, 7.5, 0.25]} radius={0.12} smoothness={4} position={[0, 0, -0.55]}>
              <meshStandardMaterial color="#A0A5AE" metalness={0.25} roughness={0.45} />
            </RoundedBox>
          )}
          <MiniBookModel
            key={`${unitIndex}-${extended}`}
            dataUrl={current.dataUrl}
            sizeCm={sizeCm}
            spineWidthCm={spineWidthCm}
            magnet={magnet}
            extended={extended}
            rotation={rotation}
          />
          <ContactShadows position={[0, -3.2, 0]} opacity={0.25} scale={12} blur={2.6} far={7} />
          <OrbitControls
            makeDefault
            enablePan={false}
            minDistance={4}
            maxDistance={20}
            minPolarAngle={Math.PI / 5}
            maxPolarAngle={(Math.PI * 4) / 5}
          />
        </Suspense>
      </Canvas>

      <div className="absolute top-12 right-3 flex items-center gap-1 rounded-full bg-black/45 px-1 py-1 text-white sm:right-5">
        <button
          type="button"
          aria-label="Mini libro anterior"
          onClick={() => setUnitIndex((index) => (index - 1 + magnets.length) % magnets.length)}
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/15 focus:ring-2 focus:ring-white focus:outline-none"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <span className="min-w-14 text-center text-xs font-semibold tabular-nums">
          {unitIndex + 1} / {magnets.length}
        </span>
        <button
          type="button"
          aria-label="Mini libro siguiente"
          onClick={() => setUnitIndex((index) => (index + 1) % magnets.length)}
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/15 focus:ring-2 focus:ring-white focus:outline-none"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="absolute bottom-14 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/45 p-1 text-white">
        <button
          type="button"
          aria-pressed={!extended}
          onClick={() => setExtended(false)}
          className={`min-h-10 rounded-full px-3 text-xs font-semibold focus:ring-2 focus:ring-white focus:outline-none ${
            !extended ? "text-brand-purple-dark bg-white" : "hover:bg-white/15"
          }`}
        >
          Mini libro
        </button>
        <button
          type="button"
          aria-pressed={extended}
          onClick={() => setExtended(true)}
          className={`min-h-10 rounded-full px-3 text-xs font-semibold focus:ring-2 focus:ring-white focus:outline-none ${
            extended ? "text-brand-purple-dark bg-white" : "hover:bg-white/15"
          }`}
        >
          Carátula extendida
        </button>
        {!extended && (
          <button
            type="button"
            onClick={() => setRotation((angle) => (angle === 0 ? Math.PI : 0))}
            aria-pressed={rotation === Math.PI}
            className="min-h-10 rounded-full px-3 text-xs font-semibold hover:bg-white/15 focus:ring-2 focus:ring-white focus:outline-none"
          >
            {rotation === 0 ? "Ver reverso" : "Ver frente"}
          </button>
        )}
      </div>
    </div>
  );
}
