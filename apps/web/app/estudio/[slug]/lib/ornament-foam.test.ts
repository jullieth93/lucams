import { describe, expect, it } from "vitest";
import {
  advanceOrnamentFoamEnergy,
  createOrnamentFoam,
  orbitAngularVelocity,
} from "./ornament-foam";

describe("createOrnamentFoam", () => {
  it("mantiene todas las bolitas dentro de la parte inferior de la esfera", () => {
    const shellRadius = 2.3;
    const particles = createOrnamentFoam();

    expect(particles).toHaveLength(480);
    for (const particle of particles) {
      expect(Math.hypot(...particle.position) + particle.radius).toBeLessThanOrEqual(
        shellRadius - 0.035 + 1e-10,
      );
      expect(particle.position[1]).toBeLessThan(-1.1);
      expect(particle.radius).toBeGreaterThanOrEqual(0.04);
      expect(particle.radius).toBeLessThanOrEqual(0.075);
    }
  });

  it("genera la misma distribución en cada visita", () => {
    expect(createOrnamentFoam()).toEqual(createOrnamentFoam());
  });

  it("rechaza configuraciones que no pueden contener el relleno", () => {
    expect(() => createOrnamentFoam(0)).toThrow("no es válida");
    expect(() => createOrnamentFoam(10, 0.1)).toThrow("no es válida");
  });
});

describe("advanceOrnamentFoamEnergy", () => {
  it("permanece en reposo sin giro y reacciona a su velocidad", () => {
    expect(advanceOrnamentFoamEnergy(0, 0, 1 / 60)).toBe(0);
    expect(advanceOrnamentFoamEnergy(0, 3, 1 / 60)).toBe(0.5);
    expect(advanceOrnamentFoamEnergy(0, 12, 1 / 60)).toBe(1);
  });

  it("se asienta progresivamente después del giro", () => {
    const moving = advanceOrnamentFoamEnergy(1, 0, 0.25);
    const settled = advanceOrnamentFoamEnergy(moving, 0, 0.5);

    expect(moving).toBeLessThan(1);
    expect(settled).toBeLessThan(moving);
    expect(settled).toBeGreaterThan(0);
  });

  it("omite la agitación con movimiento reducido", () => {
    expect(advanceOrnamentFoamEnergy(1, 12, 1 / 60, true)).toBe(0);
  });
});

describe("orbitAngularVelocity", () => {
  it("no agita en la primera muestra y calcula la velocidad del arrastre", () => {
    expect(orbitAngularVelocity(null, 0, 1)).toBe(0);
    expect(orbitAngularVelocity({ azimuth: 0, time: 1 }, 0.5, 1.25)).toBe(2);
  });

  it("no confunde el cruce entre -π y π con una vuelta completa", () => {
    const speed = orbitAngularVelocity({ azimuth: Math.PI - 0.05, time: 2 }, -Math.PI + 0.05, 2.1);
    expect(speed).toBeCloseTo(1, 8);
  });
});
