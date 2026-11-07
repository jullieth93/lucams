export type OrnamentFoamParticle = {
  position: [number, number, number];
  radius: number;
  phase: number;
  lift: number;
  sway: number;
};

export type OrbitMotionSample = {
  azimuth: number;
  time: number;
};

export function createOrnamentFoam(count = 480, shellRadius = 2.3): OrnamentFoamParticle[] {
  if (!Number.isInteger(count) || count < 1 || shellRadius <= 0.2) {
    throw new Error("La configuración del relleno de la bola no es válida.");
  }

  let seed = 0x4c554341;
  const random = () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  return Array.from({ length: count }, () => {
    const radius = 0.04 + random() * 0.035;
    const centerLimit = shellRadius - radius - 0.035;
    const y = -shellRadius + radius + 0.035 + Math.pow(random(), 1.65) * shellRadius * 0.44;
    const sectionRadius = Math.sqrt(Math.max(0, centerLimit ** 2 - y ** 2));
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * sectionRadius;

    return {
      position: [Math.cos(angle) * distance, y, Math.sin(angle) * distance],
      radius,
      phase: random() * Math.PI * 2,
      lift: 0.12 + random() * 0.28,
      sway: 0.025 + random() * 0.065,
    };
  });
}

export function advanceOrnamentFoamEnergy(
  current: number,
  angularVelocity: number,
  delta: number,
  reducedMotion = false,
) {
  if (reducedMotion) return 0;
  const impulse = Math.min(1, Math.abs(angularVelocity) / 6);
  const settled = current * Math.exp(-Math.max(0, Math.min(delta, 0.1)) * 3);
  return Math.max(impulse, settled);
}

export function orbitAngularVelocity(
  previous: OrbitMotionSample | null,
  azimuth: number,
  time: number,
): number {
  if (!previous) return 0;
  const delta = azimuth - previous.azimuth;
  const wrapped = Math.atan2(Math.sin(delta), Math.cos(delta));
  return Math.abs(wrapped) / Math.max(1 / 240, time - previous.time);
}
