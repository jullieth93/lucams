import { describe, expect, it } from "vitest";
import { createOrnamentRibbonTail, ORNAMENT_BOW_Y } from "./ornament-ribbon";

describe("createOrnamentRibbonTail", () => {
  it.each([-1, 1] as const)("mantiene la cinta %i por fuera de la esfera", (side) => {
    const radius = 2.3;
    const geometry = createOrnamentRibbonTail(side, radius);
    const positions = geometry.getAttribute("position");
    let verticesOnShell = 0;

    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index) + ORNAMENT_BOW_Y;
      const z = positions.getZ(index);
      expect(Math.hypot(x, y, z)).toBeGreaterThan(radius - 1e-6);

      if (x * x + y * y < radius * radius) {
        const surface = Math.sqrt(radius * radius - x * x - y * y);
        expect(z).toBeGreaterThanOrEqual(surface + 0.025);
        verticesOnShell += 1;
      }
    }

    expect(verticesOnShell).toBeGreaterThan(100);
    geometry.dispose();
  });

  it("curva la cinta hacia adelante al descender por la carcasa", () => {
    const geometry = createOrnamentRibbonTail(1);
    const positions = geometry.getAttribute("position");
    let upperDepth = 0;
    let lowerDepth = 0;

    for (let index = 0; index < positions.count; index += 1) {
      const worldY = positions.getY(index) + ORNAMENT_BOW_Y;
      if (worldY > 2.15) upperDepth = Math.max(upperDepth, positions.getZ(index));
      if (worldY < 1.85) lowerDepth = Math.max(lowerDepth, positions.getZ(index));
    }

    expect(lowerDepth).toBeGreaterThan(upperDepth + 0.5);
    geometry.dispose();
  });
});
