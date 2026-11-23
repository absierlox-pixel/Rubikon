// Deterministic large 260x260m city layout (no cars) with padded camera raycasting

function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function generateCityLayout() {
  const rand = seededRandom(20261123);
  const buildings = [];
  const trees = [];
  const streetlights = [];
  const sidewalks = [];

  const blockCenters = [-105, -63, -21, 21, 63, 105];
  const blockSize = 26;

  for (let bxIdx = 0; bxIdx < blockCenters.length; bxIdx++) {
    for (let bzIdx = 0; bzIdx < blockCenters.length; bzIdx++) {
      const cx = blockCenters[bxIdx];
      const cz = blockCenters[bzIdx];
      const isCentral = Math.abs(cx) === 21 && Math.abs(cz) === 21;

      sidewalks.push({ x: cx, z: cz, w: blockSize, d: blockSize });

      streetlights.push(
        { x: cx - blockSize / 2 + 0.8, z: cz - blockSize / 2 + 0.8, rot: Math.PI * 0.25 },
        { x: cx + blockSize / 2 - 0.8, z: cz + blockSize / 2 - 0.8, rot: -Math.PI * 0.75 }
      );

      if (isCentral) {
        const signX = cx > 0 ? 1 : -1;
        const signZ = cz > 0 ? 1 : -1;
        const bw = 11 + rand() * 3;
        const bd = 11 + rand() * 3;
        const bh = 12 + rand() * 10;
        buildings.push({
          x: cx + signX * 4.5,
          z: cz + signZ * 4.5,
          w: bw,
          d: bd,
          h: bh,
          style: Math.floor(rand() * 4)
        });
        trees.push(
          { x: cx - signX * 7.5, z: cz - signZ * 7.5, s: 0.9 + rand() * 0.35 },
          { x: cx - signX * 7.5, z: cz + signZ * 5.5, s: 0.85 + rand() * 0.3 }
        );
        continue;
      }

      const split = rand() > 0.45;
      if (split) {
        const horiz = rand() > 0.5;
        if (horiz) {
          for (const off of [-6.2, 6.2]) {
            const w = 18 + rand() * 3.5;
            const d = 9.2 + rand() * 1.6;
            const h = 10 + Math.floor(rand() * 5) * 4.2;
            buildings.push({ x: cx, z: cz + off, w, d, h, style: Math.floor(rand() * 4) });
          }
        } else {
          for (const off of [-6.2, 6.2]) {
            const w = 9.2 + rand() * 1.6;
            const d = 18 + rand() * 3.5;
            const h = 10 + Math.floor(rand() * 5) * 4.2;
            buildings.push({ x: cx + off, z: cz, w, d, h, style: Math.floor(rand() * 4) });
          }
        }
      } else {
        const w = 17 + rand() * 4.5;
        const d = 17 + rand() * 4.5;
        const h = 14 + Math.floor(rand() * 7) * 4.5;
        buildings.push({ x: cx, z: cz, w, d, h, style: Math.floor(rand() * 4) });
      }

      if (rand() > 0.35) {
        trees.push({
          x: cx + (rand() > 0.5 ? 11.2 : -11.2),
          z: cz + (rand() > 0.5 ? 11.2 : -11.2),
          s: 0.85 + rand() * 0.4
        });
      }
    }
  }

  // Building + perimeter wall colliders
  const half = 130;
  const colliders = [
    ...buildings.map((b) => ({
      minX: b.x - b.w / 2,
      maxX: b.x + b.w / 2,
      minZ: b.z - b.d / 2,
      maxZ: b.z + b.d / 2,
      maxY: b.h
    })),
    { minX: -half - 2, maxX: half + 2, minZ: -half - 2, maxZ: -half + 0.7, maxY: 6 },
    { minX: -half - 2, maxX: half + 2, minZ: half - 0.7, maxZ: half + 2, maxY: 6 },
    { minX: -half - 2, maxX: -half + 0.7, minZ: -half - 2, maxZ: half + 2, maxY: 6 },
    { minX: half - 0.7, maxX: half + 2, minZ: -half - 2, maxZ: half + 2, maxY: 6 }
  ];

  return { buildings, trees, streetlights, sidewalks, colliders };
}

export const CITY_LAYOUT = generateCityLayout();

export function resolveCityCollision(x, z, radius) {
  let rx = x;
  let rz = z;
  for (const box of CITY_LAYOUT.colliders) {
    const closestX = Math.max(box.minX, Math.min(rx, box.maxX));
    const closestZ = Math.max(box.minZ, Math.min(rz, box.maxZ));
    const dx = rx - closestX;
    const dz = rz - closestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq < radius * radius) {
      if (distSq > 0.00001) {
        const dist = Math.sqrt(distSq);
        const push = (radius - dist) / dist;
        rx += dx * push;
        rz += dz * push;
      } else {
        const dLeft = Math.abs(rx - box.minX);
        const dRight = Math.abs(box.maxX - rx);
        const dTop = Math.abs(rz - box.minZ);
        const dBot = Math.abs(box.maxZ - rz);
        const m = Math.min(dLeft, dRight, dTop, dBot);
        if (m === dLeft) rx = box.minX - radius;
        else if (m === dRight) rx = box.maxX + radius;
        else if (m === dTop) rz = box.minZ - radius;
        else rz = box.maxZ + radius;
      }
    }
  }
  return { x: rx, z: rz };
}

// Ray vs AABB intersection with optional padding (prevents camera near-plane clipping)
export function raycastCity(ox, oy, oz, dx, dy, dz, maxDist, pad = 0) {
  let closestT = maxDist;
  for (const box of CITY_LAYOUT.colliders) {
    const minX = box.minX - pad;
    const maxX = box.maxX + pad;
    const minZ = box.minZ - pad;
    const maxZ = box.maxZ + pad;
    const maxY = box.maxY + pad;

    let tmin = 0;
    let tmax = closestT;

    if (Math.abs(dx) < 1e-6) {
      if (ox < minX || ox > maxX) continue;
    } else {
      let t1 = (minX - ox) / dx;
      let t2 = (maxX - ox) / dx;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }

    if (Math.abs(dy) < 1e-6) {
      if (oy < 0 || oy > maxY) continue;
    } else {
      let t1 = (0 - oy) / dy;
      let t2 = (maxY - oy) / dy;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }

    if (Math.abs(dz) < 1e-6) {
      if (oz < minZ || oz > maxZ) continue;
    } else {
      let t1 = (minZ - oz) / dz;
      let t2 = (maxZ - oz) / dz;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }

    if (tmin >= 0 && tmin < closestT) {
      closestT = tmin;
    }
  }

  // Also check ground plane (y = pad)
  if (dy < -1e-5 && oy > pad) {
    const tg = (pad - oy) / dy;
    if (tg >= 0 && tg < closestT) {
      closestT = tg;
    }
  }

  return closestT;
}
