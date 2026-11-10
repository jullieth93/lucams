"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { FitCameraPolar } from "./fit-camera-polar";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";
import { StudioBackdrop, StudioEnvironment } from "./studio-3d-environment";
import {
  advanceOrnamentFoamEnergy,
  createOrnamentFoam,
  orbitAngularVelocity,
  type OrbitMotionSample,
} from "./lib/ornament-foam";
import { createOrnamentRibbonTail, ORNAMENT_BOW_Y } from "./lib/ornament-ribbon";
import { physicalUnitsFromFaces } from "@/features/personalization/product-experience";
import type { Magnet3D } from "./fridge-3d-view";

const INSERT_RADIUS = 2;
const SHELL_RADIUS = 2.3;

function useOrnamentBackTexture() {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#FAF8F5";
    context.fillRect(0, 0, 512, 512);
    context.fillStyle = "#E9E6F0";
    context.font = '700 46px "Dancing Script", cursive';
    context.textAlign = "center";
    for (let y = 60; y < 540; y += 100) {
      for (let x = 0; x < 620; x += 180) {
        context.save();
        context.translate(x + (y % 200 === 60 ? 40 : -20), y);
        context.rotate((-24 * Math.PI) / 180);
        context.fillText("Lucams", 0, 0);
        context.restore();
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
}

function useBowGeometry() {
  return useMemo(() => {
    const loop = new THREE.Shape();
    loop.moveTo(0.02, 0);
    loop.bezierCurveTo(-0.3, 0.32, -0.86, 0.66, -1.04, 0.5);
    loop.lineTo(-0.9, -0.24);
    loop.bezierCurveTo(-0.54, -0.23, -0.17, -0.1, 0.02, 0);

    const fold = new THREE.Shape();
    fold.moveTo(0.02, 0);
    fold.bezierCurveTo(-0.25, 0.06, -0.58, 0.18, -0.87, 0.38);
    fold.lineTo(-0.78, 0.08);
    fold.bezierCurveTo(-0.42, -0.07, -0.16, -0.05, 0.02, 0);

    return {
      loop: new THREE.ExtrudeGeometry(loop, {
        steps: 1,
        depth: 0.055,
        curveSegments: 24,
        bevelEnabled: true,
        bevelThickness: 0.018,
        bevelSize: 0.025,
        bevelSegments: 3,
      }),
      fold: new THREE.ShapeGeometry(fold, 24),
      tailLeft: createOrnamentRibbonTail(-1, SHELL_RADIUS),
      tailRight: createOrnamentRibbonTail(1, SHELL_RADIUS),
    };
  }, []);
}

function RibbonMaterial() {
  return (
    <meshPhysicalMaterial
      color="#B80F2A"
      roughness={0.52}
      metalness={0}
      sheen={0.45}
      sheenColor="#F43F5E"
      sheenRoughness={0.55}
      side={THREE.DoubleSide}
    />
  );
}

function RedBow() {
  const geometry = useBowGeometry();

  useEffect(
    () => () => {
      geometry.loop.dispose();
      geometry.fold.dispose();
      geometry.tailLeft.dispose();
      geometry.tailRight.dispose();
    },
    [geometry],
  );

  return (
    <group position={[0, ORNAMENT_BOW_Y, 0]}>
      {([-1, 1] as const).map((side) => (
        <group key={side}>
          <group
            position={[0, 0, 0.32]}
            scale={[side, 1, 1]}
            rotation={[-0.12, side === 1 ? 0.26 : -0.12, side * 0.07]}
          >
            <mesh geometry={geometry.loop} castShadow receiveShadow>
              <RibbonMaterial />
            </mesh>
            <mesh geometry={geometry.fold} position={[0, 0, 0.079]}>
              <meshStandardMaterial color="#940D25" roughness={0.62} side={THREE.DoubleSide} />
            </mesh>
          </group>
          <mesh
            geometry={side === 1 ? geometry.tailRight : geometry.tailLeft}
            castShadow
            receiveShadow
          >
            <RibbonMaterial />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0, 0.44]} scale={[0.17, 0.135, 0.11]} castShadow>
        <sphereGeometry args={[1, 24, 16]} />
        <RibbonMaterial />
      </mesh>
    </group>
  );
}

function ClearAcrylicMaterial() {
  return (
    <meshPhysicalMaterial
      color="#FFFFFF"
      metalness={0}
      roughness={0.035}
      transmission={1}
      thickness={0.045}
      ior={1.46}
      clearcoat={1}
      clearcoatRoughness={0.06}
      envMapIntensity={0.9}
      transparent
      opacity={1}
      depthWrite={false}
      side={THREE.FrontSide}
    />
  );
}

function FoamFilling({
  angularVelocity,
  reducedMotion,
}: {
  angularVelocity: { current: number };
  reducedMotion: boolean;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const particles = useMemo(() => createOrnamentFoam(), []);
  const transform = useMemo(() => new THREE.Object3D(), []);
  const energy = useRef(0);
  const invalidate = useThree((state) => state.invalidate);

  const updateParticles = useCallback(
    (agitation: number, time: number) => {
      if (!mesh.current) return;
      particles.forEach((particle, index) => {
        const wave = time * (5.2 + particle.sway * 8) + particle.phase;
        let x = particle.position[0] + Math.sin(wave) * particle.sway * agitation;
        let y =
          particle.position[1] +
          particle.lift * agitation * (0.3 + 0.7 * Math.abs(Math.sin(wave * 1.15)));
        let z = particle.position[2] + Math.cos(wave * 0.9) * particle.sway * agitation;
        const centerLimit = SHELL_RADIUS - particle.radius - 0.035;
        const distance = Math.hypot(x, y, z);
        if (distance > centerLimit) {
          const containment = centerLimit / distance;
          x *= containment;
          y *= containment;
          z *= containment;
        }
        transform.position.set(x, y, z);
        transform.scale.setScalar(particle.radius);
        transform.updateMatrix();
        mesh.current!.setMatrixAt(index, transform.matrix);
      });
      mesh.current.instanceMatrix.needsUpdate = true;
      mesh.current.computeBoundingSphere();
    },
    [particles, transform],
  );

  useLayoutEffect(() => {
    updateParticles(0, 0);
    invalidate();
  }, [invalidate, updateParticles]);

  useFrame(({ clock }, delta) => {
    const previous = energy.current;
    const next = advanceOrnamentFoamEnergy(previous, angularVelocity.current, delta, reducedMotion);
    energy.current = next < 0.003 ? 0 : next;
    if (energy.current === 0 && previous === 0) return;
    updateParticles(energy.current, clock.elapsedTime);
    invalidate();
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, particles.length]} castShadow>
      <sphereGeometry args={[1, 10, 8]} />
      <meshStandardMaterial color="#FFFFFF" roughness={0.9} />
    </instancedMesh>
  );
}

function OrnamentModel({
  dataUrl,
  backDataUrl,
  backHasDesign,
  rotation,
  orbitVelocityRef,
}: {
  dataUrl: string;
  backDataUrl?: string;
  backHasDesign: boolean;
  rotation: number;
  orbitVelocityRef: { current: number };
}) {
  const sourceTexture = useTexture(dataUrl);
  const sourceBackTexture = useTexture(backDataUrl ?? dataUrl);
  const texture = useMemo(() => {
    const clone = sourceTexture.clone();
    clone.colorSpace = THREE.SRGBColorSpace;
    clone.anisotropy = 8;
    clone.needsUpdate = true;
    return clone;
  }, [sourceTexture]);
  const backDesignTexture = useMemo(() => {
    const clone = sourceBackTexture.clone();
    clone.colorSpace = THREE.SRGBColorSpace;
    clone.anisotropy = 8;
    clone.needsUpdate = true;
    return clone;
  }, [sourceBackTexture]);
  const backTexture = useOrnamentBackTexture();
  const group = useRef<THREE.Group>(null);
  const angularVelocity = useRef(0);
  const reducedMotion = usePrefersReducedMotion();
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => () => texture.dispose(), [texture]);
  useEffect(() => () => backDesignTexture.dispose(), [backDesignTexture]);
  useEffect(() => () => backTexture?.dispose(), [backTexture]);

  useEffect(() => {
    invalidate();
  }, [invalidate, reducedMotion, rotation, texture, backDesignTexture, backHasDesign]);

  useFrame((_, delta) => {
    if (!group.current) return;
    const difference = rotation - group.current.rotation.y;
    let modelVelocity = 0;
    if (reducedMotion) {
      group.current.rotation.y = rotation;
    } else if (Math.abs(difference) > 0.0005) {
      const previous = group.current.rotation.y;
      const next = previous + difference * Math.min(1, delta * 8);
      modelVelocity = (next - previous) / Math.max(delta, 1 / 240);
      group.current.rotation.y = next;
      invalidate();
    }
    orbitVelocityRef.current *= Math.exp(-delta * 7);
    angularVelocity.current = reducedMotion ? 0 : modelVelocity + orbitVelocityRef.current;
  });

  return (
    <>
      <FitCameraPolar halfW={3.2} halfH={4.1} polarDeg={4} margin={1.08} targetY={0.35} />
      <group ref={group}>
        <mesh position={[0, 0, 0.025]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[INSERT_RADIUS, INSERT_RADIUS, 0.05, 96]} />
          <meshStandardMaterial color="#FAF8F5" roughness={0.65} />
        </mesh>
        <mesh position={[0, 0, 0.052]}>
          <circleGeometry args={[INSERT_RADIUS, 96]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
        {(backHasDesign || backTexture) && (
          <mesh position={[0, 0, -0.002]} rotation={[0, Math.PI, 0]}>
            <circleGeometry args={[INSERT_RADIUS, 96]} />
            <meshBasicMaterial
              map={backHasDesign ? backDesignTexture : backTexture}
              toneMapped={false}
            />
          </mesh>
        )}
        <FoamFilling angularVelocity={angularVelocity} reducedMotion={reducedMotion} />
        <mesh renderOrder={2}>
          <sphereGeometry args={[SHELL_RADIUS, 96, 64]} />
          <ClearAcrylicMaterial />
        </mesh>
        <mesh position={[0, 2.375, 0]} renderOrder={2}>
          <cylinderGeometry args={[0.12, 0.16, 0.25, 40, 1, true]} />
          <ClearAcrylicMaterial />
        </mesh>
        <mesh position={[0, 2.79, 0]} scale={[0.8, 1.2, 1]} renderOrder={2}>
          <torusGeometry args={[0.25, 0.04, 16, 64]} />
          <ClearAcrylicMaterial />
        </mesh>
        <RedBow />
      </group>
    </>
  );
}

export default function OrnamentView3D({
  magnets,
  facesPerUnit = 1,
}: {
  magnets: Magnet3D[];
  facesPerUnit?: number;
}) {
  const [unitIndex, setUnitIndex] = useState(0);
  const [rotation, setRotation] = useState(0);
  const orbitVelocityRef = useRef(0);
  const orbitSample = useRef<OrbitMotionSample | null>(null);
  const faceCount = facesPerUnit === 2 ? 2 : 1;
  const unitCount = physicalUnitsFromFaces(magnets.length, faceCount);
  const currentIndex = Math.min(unitIndex, Math.max(0, unitCount - 1));
  const current = magnets[currentIndex * faceCount];
  const back = faceCount === 2 ? magnets[currentIndex * 2 + 1] : undefined;
  const backHasDesign = faceCount === 2 && Boolean(back?.assetUrl);
  if (!current) return null;

  return (
    <div className="absolute inset-0">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ fov: 40, near: 0.1, far: 100, position: [0, 0.4, 10] }}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        frameloop="demand"
        onCreated={({ gl }) => {
          gl.setClearColor("#F3ECE2");
          gl.transmissionResolutionScale = 0.75;
        }}
      >
        <Suspense fallback={null}>
          <StudioEnvironment intensity={0.9} />
          <StudioBackdrop position={[0, -3.35, -5]} scale={[30, 18, 7]} />
          <ambientLight intensity={0.4} />
          <directionalLight position={[4, 6, 5]} intensity={0.85} castShadow />
          <OrnamentModel
            key={currentIndex}
            dataUrl={current.dataUrl}
            backDataUrl={back?.dataUrl}
            backHasDesign={backHasDesign}
            rotation={rotation}
            orbitVelocityRef={orbitVelocityRef}
          />
          <ContactShadows
            frames={1}
            position={[0, -3.3, 0]}
            opacity={0.2}
            scale={10}
            blur={2.8}
            far={6}
          />
          <OrbitControls
            makeDefault
            enablePan={false}
            minDistance={5}
            maxDistance={18}
            minPolarAngle={Math.PI / 5}
            maxPolarAngle={(Math.PI * 4) / 5}
            onStart={() => {
              orbitSample.current = null;
              orbitVelocityRef.current = 0;
            }}
            onChange={(event) => {
              const controls = event?.target;
              if (!controls) return;
              const azimuth = controls.getAzimuthalAngle();
              const time = performance.now() / 1000;
              orbitVelocityRef.current = orbitAngularVelocity(orbitSample.current, azimuth, time);
              orbitSample.current = { azimuth, time };
            }}
          />
        </Suspense>
      </Canvas>

      {faceCount === 2 && !backHasDesign && (
        <div className="absolute top-12 left-3 rounded-full bg-black/45 px-3 py-1.5 text-xs font-semibold text-white sm:left-5">
          Cara B pendiente
        </div>
      )}

      <div className="absolute top-12 right-3 flex items-center gap-1 rounded-full bg-black/45 px-1 py-1 text-white sm:right-5">
        <button
          type="button"
          aria-label="Unidad anterior"
          onClick={() => setUnitIndex((index) => (index - 1 + unitCount) % unitCount)}
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/15 focus:ring-2 focus:ring-white focus:outline-none"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <span className="min-w-14 text-center text-xs font-semibold tabular-nums">
          {currentIndex + 1} / {unitCount}
        </span>
        <button
          type="button"
          aria-label="Unidad siguiente"
          onClick={() => setUnitIndex((index) => (index + 1) % unitCount)}
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/15 focus:ring-2 focus:ring-white focus:outline-none"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="absolute bottom-14 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/45 p-1 text-white">
        {[
          { label: "Frente", angle: 0 },
          { label: "De perfil", angle: Math.PI / 2 },
          { label: "Reverso", angle: Math.PI },
        ].map((view) => (
          <button
            key={view.label}
            type="button"
            aria-pressed={rotation === view.angle}
            onClick={() => setRotation(view.angle)}
            className={`min-h-10 rounded-full px-3 text-xs font-semibold focus:ring-2 focus:ring-white focus:outline-none ${
              rotation === view.angle ? "text-brand-purple-dark bg-white" : "hover:bg-white/15"
            }`}
          >
            {view.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setRotation((angle) => angle + Math.PI * 2)}
          aria-label="Dar una vuelta completa"
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/15 focus:ring-2 focus:ring-white focus:outline-none"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
