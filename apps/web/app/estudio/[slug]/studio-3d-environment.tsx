"use client";

/*
 * FB5 (feedback Lucy) — entorno de "estudio de producto" compartido por las escenas 3D del Estudio,
 * para subir el realismo. `<Environment>` con `<Lightformer>` genera un env-map PROCEDURAL en la GPU
 * (sin fetch de HDRI externo → CSP-safe), lo que da reflejos y luz ambiental reales a los materiales
 * PBR (metal de la nevera, marcos, imanes) en vez de verse planos. `<Backdrop>` opcional = ciclorama
 * sin costuras (piso→pared) para que el objeto no "flote" y parezca una foto de producto.
 */

import { Environment, Lightformer, Backdrop } from "@react-three/drei";

/** Env-map procedural: softbox cenital (key) + rellenos frío/cálido + rim trasero. */
export function StudioEnvironment({ intensity = 1 }: { intensity?: number }) {
  return (
    <Environment resolution={256} frames={1}>
      {/* Key: softbox grande cenital-frontal. */}
      <Lightformer
        form="rect"
        intensity={2.4 * intensity}
        position={[0, 5, 3]}
        scale={[10, 6, 1]}
      />
      {/* Relleno izquierdo, ligeramente frío. */}
      <Lightformer
        form="rect"
        intensity={1.1 * intensity}
        position={[-7, 2, 4]}
        scale={[5, 7, 1]}
        color="#e9f0ff"
      />
      {/* Relleno derecho, ligeramente cálido. */}
      <Lightformer
        form="rect"
        intensity={0.95 * intensity}
        position={[7, 1, 3]}
        scale={[5, 7, 1]}
        color="#fff1e2"
      />
      {/* Rim/contraluz para separar el objeto del fondo. */}
      <Lightformer
        form="ring"
        intensity={1.6 * intensity}
        position={[0, 4, -8]}
        scale={[7, 7, 1]}
      />
    </Environment>
  );
}

/**
 * Ciclorama sin costuras (piso curvo → pared) para dar contexto/asiento al objeto. Color neutro
 * cálido por defecto (encaja con la marca crema). `receiveShadow` para recibir las ContactShadows.
 */
export function StudioBackdrop({
  color = "#f3ece2",
  floor = 0.25,
  position = [0, -4, -6] as [number, number, number],
  scale = [40, 22, 8] as [number, number, number],
}: {
  color?: string;
  floor?: number;
  position?: [number, number, number];
  scale?: [number, number, number];
}) {
  return (
    <Backdrop receiveShadow floor={floor} position={position} scale={scale}>
      <meshStandardMaterial color={color} roughness={0.95} metalness={0} />
    </Backdrop>
  );
}
