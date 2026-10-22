// Path ghost, flown trail, crash burst. Scene objects only; crashMode stays in the loop.
import * as THREE from "three";

export function createFx({ scene, ship, km, shipScale, hullMat, ghostN }) {
  const ghostPos = new Float32Array(ghostN * 3);
  const ghostGeo = new THREE.BufferGeometry();
  ghostGeo.setAttribute("position", new THREE.BufferAttribute(ghostPos, 3));
  const ghostLine = new THREE.Line(
    ghostGeo,
    new THREE.LineDashedMaterial({
      color: 0x7ecbff,
      dashSize: 1.1 * km,
      gapSize: 0.7 * km,
      transparent: true,
      opacity: 0.9,
    })
  );
  ghostLine.frustumCulled = false;
  ghostLine.visible = false;
  scene.add(ghostLine);

  const TRAIL_N = 80;
  const TRAIL_STEP = 0.8 * shipScale;
  const trailPos = new Float32Array(TRAIL_N * 3);
  const trailCol = new Float32Array(TRAIL_N * 3);
  for (let i = 0; i < TRAIL_N; i++) {
    const t = 0.2 + 0.8 * (i / (TRAIL_N - 1));
    trailCol[i * 3] = 0.49 * t;
    trailCol[i * 3 + 1] = 0.8 * t;
    trailCol[i * 3 + 2] = t;
  }
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute("color", new THREE.BufferAttribute(trailCol, 3));
  trailGeo.setDrawRange(0, 1);
  const trailLine = new THREE.Line(
    trailGeo,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 })
  );
  trailLine.frustumCulled = false;
  scene.add(trailLine);
  const lastTrail = new THREE.Vector3();
  let trailCount = 1;

  function clearTrail() {
    for (let i = 0; i < TRAIL_N; i++) {
      trailPos[i * 3] = ship.x;
      trailPos[i * 3 + 1] = ship.y;
      trailPos[i * 3 + 2] = ship.z;
    }
    trailCount = 1;
    lastTrail.set(ship.x, ship.y, ship.z);
    trailGeo.setDrawRange(0, 1);
    trailGeo.attributes.position.needsUpdate = true;
  }

  function sampleTrail() {
    const dx = ship.x - lastTrail.x;
    const dy = ship.y - lastTrail.y;
    const dz = ship.z - lastTrail.z;
    if (Math.hypot(dx, dy, dz) < TRAIL_STEP) return;
    lastTrail.set(ship.x, ship.y, ship.z);
    if (trailCount < TRAIL_N) {
      const i = trailCount++;
      trailPos[i * 3] = ship.x;
      trailPos[i * 3 + 1] = ship.y;
      trailPos[i * 3 + 2] = ship.z;
    } else {
      trailPos.copyWithin(0, 3);
      trailPos[(TRAIL_N - 1) * 3] = ship.x;
      trailPos[(TRAIL_N - 1) * 3 + 1] = ship.y;
      trailPos[(TRAIL_N - 1) * 3 + 2] = ship.z;
    }
    trailGeo.setDrawRange(0, trailCount);
    trailGeo.attributes.position.needsUpdate = true;
  }

  const debris = [];
  const debrisGeo = new THREE.BoxGeometry(0.22, 0.16, 0.4);
  const fireMat = new THREE.MeshBasicMaterial({
    color: 0xff7a22,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const fireball = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), fireMat);
  fireball.visible = false;
  scene.add(fireball);

  function clearDebris() {
    for (const bit of debris) scene.remove(bit.mesh);
    debris.length = 0;
    fireball.visible = false;
  }

  function spawnBurst(wx, wy, wz, nx, ny, nz, vx, vy, vz) {
    const vrad = vx * nx + vy * ny + vz * nz;
    const tx = vx - vrad * nx;
    const ty = vy - vrad * ny;
    const tz = vz - vrad * nz;
    fireball.userData.ox = wx;
    fireball.userData.oy = wy;
    fireball.userData.oz = wz;
    fireball.userData.nx = nx;
    fireball.userData.ny = ny;
    fireball.userData.nz = nz;
    const fireR = 0.6 * km;
    fireball.position.set(wx + nx * fireR, wy + ny * fireR, wz + nz * fireR);
    fireball.scale.setScalar(fireR);
    fireMat.opacity = 0.95;
    fireball.visible = true;
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(debrisGeo, hullMat);
      mesh.position.set(wx, wy, wz);
      mesh.scale.setScalar(shipScale * (0.7 + Math.random() * 0.6));
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      let rx = Math.random() - 0.5;
      let ry = Math.random() - 0.5;
      let rz = Math.random() - 0.5;
      if (rx * nx + ry * ny + rz * nz < 0) {
        rx = -rx;
        ry = -ry;
        rz = -rz;
      }
      // Drop most of the impact speed or the bits leave the frame in a blink.
      const skim = 0.08;
      const kick = (2.2 + Math.random() * 1.6) * km;
      const spread = (0.7 + Math.random() * 1.1) * km;
      debris.push({
        mesh,
        vx: tx * skim + nx * kick + rx * spread,
        vy: ty * skim + ny * kick + ry * spread,
        vz: tz * skim + nz * kick + rz * spread,
        sx: (Math.random() - 0.5) * 6,
        sy: (Math.random() - 0.5) * 6,
        sz: (Math.random() - 0.5) * 6,
      });
      scene.add(mesh);
    }
  }

  function stepDebris(dt, crashT, burstS) {
    for (const bit of debris) {
      bit.mesh.position.x += bit.vx * dt;
      bit.mesh.position.y += bit.vy * dt;
      bit.mesh.position.z += bit.vz * dt;
      bit.mesh.rotation.x += bit.sx * dt;
      bit.mesh.rotation.y += bit.sy * dt;
      bit.mesh.rotation.z += bit.sz * dt;
    }
    if (!fireball.visible) return;
    const t = Math.min(1, crashT / burstS);
    const fireR = (0.6 + t * 3.4) * km;
    fireball.scale.setScalar(fireR);
    fireball.position.set(
      fireball.userData.ox + fireball.userData.nx * fireR,
      fireball.userData.oy + fireball.userData.ny * fireR,
      fireball.userData.oz + fireball.userData.nz * fireR
    );
    fireMat.opacity = 0.95 * (1 - t);
    if (t >= 1) fireball.visible = false;
  }

  return {
    ghostPos,
    ghostGeo,
    ghostLine,
    clearTrail,
    sampleTrail,
    clearDebris,
    spawnBurst,
    stepDebris,
  };
}
