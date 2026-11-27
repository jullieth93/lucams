"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls, RoundedBox, useTexture } from "@react-three/drei";
import { BookOpenText, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import * as THREE from "three";
import { FitCameraPolar } from "./fit-camera-polar";
import { StudioBackdrop, StudioEnvironment } from "./studio-3d-environment";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import { miniBookGeometry } from "@/features/personalization/product-experience";
import { MAGNET_BACK_COLOR } from "./magnet-3d";
import type { Magnet3D } from "./fridge-3d-view";

const WORLD_PER_CM = 0.85;
const COVER_BOARD_DEPTH = 0.06;
const COVER_RADIUS = 0.025;

type RegionTexture = THREE.Texture;
type BookView = "front" | "spine" | "back";

function usePageEdgeTexture() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) return null;
    const paper = context.createLinearGradient(0, 0, canvas.width, 0);
    paper.addColorStop(0, "#D8D0C1");
    paper.addColorStop(0.08, "#F8F4E9");
    paper.addColorStop(0.85, "#F2ECDD");
    paper.addColorStop(1, "#C9C0AF");
    context.fillStyle = paper;
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 5; y < canvas.height; y += 9) {
      context.fillStyle = y % 27 === 5 ? "#CFC6B5" : "#E2DACA";
      context.fillRect(0, y, canvas.width, 1);
    }
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    result.anisotropy = 8;
    return result;
  }, []);

  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

function PrintedFace({
  texture,
  width,
  height,
  position,
  rotation = [0, 0, 0],
}: {
  texture: RegionTexture;
  width: number;
  height: number;
  position: [number, number, number];
  rotation?: [number, number, number];
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow>
      <planeGeometry args={[width, height]} />
      <meshPhysicalMaterial
        map={texture}
        roughness={0.46}
        metalness={0.015}
        clearcoat={0.24}
        clearcoatRoughness={0.4}
        envMapIntensity={0.35}
      />
    </mesh>
  );
}

function ExtendedCover({
  width,
  height,
  coverWidth,
  spineWidth,
  textures,
}: {
  width: number;
  height: number;
  coverWidth: number;
  spineWidth: number;
  textures: Record<"back" | "spine" | "front", RegionTexture>;
}) {
  const segments = [
    { key: "back" as const, width: coverWidth, x: -width / 2 + coverWidth / 2 },
    { key: "spine" as const, width: spineWidth, x: -width / 2 + coverWidth + spineWidth / 2 },
    { key: "front" as const, width: coverWidth, x: width / 2 - coverWidth / 2 },
  ];
  const folds = [-width / 2 + coverWidth, -width / 2 + coverWidth + spineWidth];

  return (
    <group rotation={[-0.035, 0, 0]}>
      {segments.map((segment) => (
        <group key={segment.key} position={[segment.x, 0, 0]}>
          <RoundedBox
            args={[segment.width, height, COVER_BOARD_DEPTH]}
            radius={COVER_RADIUS}
            smoothness={4}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color="#E8E0D3" roughness={0.72} />
          </RoundedBox>
          <PrintedFace
            texture={textures[segment.key]}
            width={segment.width}
            height={height}
            position={[0, 0, COVER_BOARD_DEPTH / 2 + 0.002]}
          />
        </group>
      ))}
      {folds.map((x) => (
        <group key={x}>
          <mesh position={[x - 0.014, 0, COVER_BOARD_DEPTH / 2 + 0.004]}>
            <planeGeometry args={[0.022, height * 0.985]} />
            <meshBasicMaterial color="#07131F" transparent opacity={0.26} />
          </mesh>
          <mesh position={[x + 0.012, 0, COVER_BOARD_DEPTH / 2 + 0.005]}>
            <planeGeometry args={[0.012, height * 0.985]} />
            <meshBasicMaterial color="#FFFFFF" transparent opacity={0.2} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function ClosedBook({
  coverWidth,
  height,
  thickness,
  magnet,
  pageTexture,
  textures,
}: {
  coverWidth: number;
  height: number;
  thickness: number;
  magnet?: boolean;
  pageTexture: THREE.Texture | null;
  textures: Record<"back" | "spine" | "front", RegionTexture>;
}) {
  const pageWidth = coverWidth * 0.92;
  const pageHeight = height * 0.94;
  const pageDepth = Math.max(0.08, thickness - COVER_BOARD_DEPTH * 2.2);
  const frontZ = thickness / 2 + COVER_BOARD_DEPTH / 2 + 0.002;
  const backZ = -frontZ;

  return (
    <group>
      <RoundedBox
        args={[pageWidth, pageHeight, pageDepth]}
        radius={0.018}
        smoothness={3}
        position={[coverWidth * 0.025, 0, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#F1EBDD" roughness={0.94} />
      </RoundedBox>

      {pageTexture && (
        <>
          <mesh position={[coverWidth * 0.485, 0, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
            <planeGeometry args={[pageDepth, pageHeight]} />
            <meshStandardMaterial map={pageTexture} roughness={0.94} />
          </mesh>
          <mesh position={[coverWidth * 0.025, pageHeight / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[pageWidth, pageDepth]} />
            <meshStandardMaterial map={pageTexture} roughness={0.94} />
          </mesh>
          <mesh position={[coverWidth * 0.025, -pageHeight / 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[pageWidth, pageDepth]} />
            <meshStandardMaterial map={pageTexture} roughness={0.94} />
          </mesh>
        </>
      )}

      <RoundedBox
        args={[coverWidth, height, COVER_BOARD_DEPTH]}
        radius={COVER_RADIUS}
        smoothness={4}
        position={[0, 0, thickness / 2]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#E8E0D3" roughness={0.7} />
      </RoundedBox>
      <PrintedFace
        texture={textures.front}
        width={coverWidth}
        height={height}
        position={[0, 0, frontZ]}
      />

      <RoundedBox
        args={[coverWidth, height, COVER_BOARD_DEPTH]}
        radius={COVER_RADIUS}
        smoothness={4}
        position={[0, 0, -thickness / 2]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#E8E0D3" roughness={0.7} />
      </RoundedBox>
      <PrintedFace
        texture={textures.back}
        width={coverWidth}
        height={height}
        position={[0, 0, backZ]}
        rotation={[0, Math.PI, 0]}
      />

      <RoundedBox
        args={[0.09, height, thickness + COVER_BOARD_DEPTH]}
        radius={0.035}
        smoothness={4}
        position={[-coverWidth / 2 + 0.02, 0, 0]}
        castShadow
      >
        <meshStandardMaterial color="#DCD3C5" roughness={0.68} />
      </RoundedBox>
      <PrintedFace
        texture={textures.spine}
        width={thickness}
        height={height}
        position={[-coverWidth / 2 - 0.027, 0, 0]}
        rotation={[0, -Math.PI / 2, 0]}
      />

      {magnet === true && (
        <RoundedBox
          args={[coverWidth * 0.5, height * 0.2, 0.075]}
          radius={0.025}
          smoothness={4}
          position={[0, -height * 0.3, -thickness / 2 - 0.085]}
          castShadow
        >
          <meshStandardMaterial color={MAGNET_BACK_COLOR} roughness={0.96} />
        </RoundedBox>
      )}
    </group>
  );
}

function MiniBookModel({
  dataUrl,
  sizeCm,
  spineWidthCm,
  magnet,
  extended,
  rotation,
  context,
}: {
  dataUrl: string;
  sizeCm?: string;
  spineWidthCm: number;
  magnet?: boolean;
  extended: boolean;
  rotation: number;
  context: "detail" | "fridge";
}) {
  const sourceTexture = useTexture(dataUrl);
  const geometry = useMemo(
    () => miniBookGeometry(sizeCm, spineWidthCm) ?? miniBookGeometry("7.1×5", spineWidthCm)!,
    [sizeCm, spineWidthCm],
  );
  const group = useRef<THREE.Group>(null);
  const reducedMotion = usePrefersReducedMotion();
  const invalidate = useThree((state) => state.invalidate);
  const pageTexture = usePageEdgeTexture();
  const regionTextures = useMemo(() => {
    const make = (region: { offsetX: number; width: number }) => {
      const clone = sourceTexture.clone();
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
  }, [sourceTexture, geometry]);

  useEffect(
    () => () => {
      regionTextures.back.dispose();
      regionTextures.spine.dispose();
      regionTextures.front.dispose();
    },
    [regionTextures],
  );

  useEffect(() => {
    invalidate();
  }, [invalidate, reducedMotion, rotation, extended]);

  useFrame((_, delta) => {
    if (!group.current) return;
    const difference = rotation - group.current.rotation.y;
    if (reducedMotion) {
      group.current.rotation.y = rotation;
      return;
    }
    if (Math.abs(difference) > 0.0005) {
      group.current.rotation.y += difference * Math.min(1, delta * 7);
      invalidate();
    }
  });

  const width = geometry.widthCm * WORLD_PER_CM;
  const height = geometry.heightCm * WORLD_PER_CM;
  const coverWidth = geometry.coverWidthCm * WORLD_PER_CM;
  const thickness = geometry.thicknessCm * WORLD_PER_CM;
  const halfW = (extended ? width : coverWidth) / 2 + 0.38;
  const floorY = -height / 2 - 0.12;

  return (
    <>
      <FitCameraPolar
        halfW={halfW}
        halfH={height / 2 + 0.48}
        polarDeg={extended ? 10 : 5}
        margin={1.12}
      />
      {context === "detail" && (
        <StudioBackdrop position={[0, floorY - 2.1, -5]} scale={[24, 15, 7]} />
      )}
      <group ref={group}>
        {extended ? (
          <ExtendedCover
            width={width}
            height={height}
            coverWidth={coverWidth}
            spineWidth={thickness}
            textures={regionTextures}
          />
        ) : (
          <ClosedBook
            coverWidth={coverWidth}
            height={height}
            thickness={thickness}
            magnet={magnet}
            pageTexture={pageTexture}
            textures={regionTextures}
          />
        )}
      </group>
      <ContactShadows
        position={[0, floorY, 0]}
        opacity={context === "fridge" ? 0.12 : 0.3}
        scale={Math.max(8, width * 1.8)}
        blur={2.8}
        far={5}
      />
    </>
  );
}

const VIEW_ROTATION: Record<BookView, number> = {
  front: 0,
  spine: Math.PI / 2,
  back: Math.PI,
};

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
  const [view, setView] = useState<BookView>("front");
  const current = magnets[Math.min(unitIndex, magnets.length - 1)] ?? magnets[0];
  if (!current) return null;

  const selectUnit = (index: number) => {
    setUnitIndex((index + magnets.length) % magnets.length);
    setView("front");
  };
  const resetView = () => {
    setExtended(false);
    setView("front");
  };
  const rotation = VIEW_ROTATION[view];

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
          <StudioEnvironment intensity={0.9} />
          <ambientLight intensity={0.28} />
          <hemisphereLight args={["#FFF6EA", "#D8CDBE", 0.24]} />
          <directionalLight
            position={[4, 6, 5]}
            intensity={0.82}
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
          />
          <directionalLight position={[-4, 2, -4]} intensity={0.32} />
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
            context={context}
          />
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

      <div className="absolute top-12 right-3 flex items-center gap-1 rounded-full border border-white/15 bg-[#171321]/75 px-1 py-1 text-white shadow-lg backdrop-blur-md sm:right-5">
        <button
          type="button"
          aria-label="Mini libro anterior"
          onClick={() => selectUnit(unitIndex - 1)}
          className="flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-white/15 focus:ring-2 focus:ring-white focus:outline-none"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <span className="min-w-14 text-center text-xs font-semibold tabular-nums">
          {unitIndex + 1} / {magnets.length}
        </span>
        <button
          type="button"
          aria-label="Mini libro siguiente"
          onClick={() => selectUnit(unitIndex + 1)}
          className="flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-white/15 focus:ring-2 focus:ring-white focus:outline-none"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="absolute bottom-14 left-1/2 grid w-[calc(100%-1.5rem)] -translate-x-1/2 grid-cols-4 items-center justify-center gap-1 rounded-2xl border border-white/15 bg-[#171321]/80 p-1.5 text-white shadow-xl backdrop-blur-md sm:flex sm:w-auto">
        <button
          type="button"
          aria-pressed={extended}
          onClick={() => {
            setView("front");
            setExtended((value) => !value);
          }}
          className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors focus:ring-2 focus:ring-white focus:outline-none ${
            extended
              ? "text-brand-purple-dark col-span-3 bg-white sm:col-auto"
              : "col-span-4 hover:bg-white/15 sm:col-auto"
          }`}
        >
          <BookOpenText className="h-4 w-4" aria-hidden />
          {extended ? "Cerrar libro" : "Carátula extendida"}
        </button>
        {!extended && (
          <>
            <span className="hidden h-6 w-px shrink-0 bg-white/20 sm:block" aria-hidden />
            {(["front", "spine", "back"] as const).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() => setView(key)}
                className={`min-h-11 shrink-0 rounded-xl px-2 text-xs font-semibold transition-colors focus:ring-2 focus:ring-white focus:outline-none sm:px-3 ${
                  view === key ? "text-brand-purple-dark bg-white" : "hover:bg-white/15"
                }`}
              >
                {key === "front" ? "Portada" : key === "spine" ? "Lomo" : "Contraportada"}
              </button>
            ))}
          </>
        )}
        <button
          type="button"
          aria-label="Restablecer vista del mini libro"
          title="Restablecer vista"
          onClick={resetView}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-white/15 focus:ring-2 focus:ring-white focus:outline-none"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <span className="sr-only" aria-live="polite">
        {extended
          ? "Vista de la carátula extendida"
          : `Vista de ${view === "front" ? "la portada" : view === "spine" ? "el lomo" : "la contraportada"}`}
      </span>
    </div>
  );
}
