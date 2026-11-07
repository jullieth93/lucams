import * as THREE from "three";

export const ORNAMENT_BOW_Y = 2.64;

export function createOrnamentRibbonTail(side: -1 | 1, shellRadius = 2.3, bowY = ORNAMENT_BOW_Y) {
  const tail = new THREE.Shape();
  tail.moveTo(0.02, 0);
  tail.bezierCurveTo(-0.16, -0.28, -0.38, -0.58, -0.67, -0.88);
  tail.lineTo(-0.84, -0.76);
  tail.lineTo(-1.01, -1.1);
  tail.bezierCurveTo(-0.72, -1.04, -0.36, -0.75, -0.1, -0.39);
  tail.bezierCurveTo(-0.02, -0.24, 0.02, -0.08, 0.02, 0);

  const geometry = new THREE.ExtrudeGeometry(tail, {
    steps: 1,
    depth: 0.055,
    curveSegments: 24,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.025,
    bevelSegments: 3,
  });
  const positions = geometry.getAttribute("position");
  const lengthScale = side === 1 ? 1.08 : 0.88;

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index) * side;
    const localY = positions.getY(index) * lengthScale;
    const worldY = bowY + localY;
    const depth = positions.getZ(index);
    const surface = Math.sqrt(Math.max(0, shellRadius ** 2 - x ** 2 - worldY ** 2));
    const attachment = Math.max(0, (worldY - shellRadius) / (bowY - shellRadius)) * 0.24;
    positions.setXYZ(index, x, localY, surface + 0.065 + attachment + depth);
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
