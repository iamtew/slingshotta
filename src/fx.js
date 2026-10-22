// Path ghost, flown trail, crash burst. Scene objects only; crashMode stays in the loop.
import * as THREE from "three";

export function createFx({ scene, ship, km, shipScale, hullMat, ghostN, craft, bell, rcsJets }) {
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

  const world = new THREE.Vector3();

  function makeTrail(n, step, opacity) {
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setDrawRange(0, 1);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    line.frustumCulled = false;
    scene.add(line);
    const last = new THREE.Vector3();
    let count = 1;
    let armed = false;

    function paint(i, x, y, z, r, g, b) {
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      col[i * 3] = r;
      col[i * 3 + 1] = g;
      col[i * 3 + 2] = b;
    }

    function seed(x, y, z, r, g, b) {
      for (let i = 0; i < n; i++) paint(i, x, y, z, r, g, b);
      count = 1;
      last.set(x, y, z);
      geo.setDrawRange(0, 1);
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      armed = true;
    }

    function sample(x, y, z, r, g, b) {
      if (!armed) {
        seed(x, y, z, r, g, b);
        return;
      }
      if (Math.hypot(x - last.x, y - last.y, z - last.z) < step) return;
      last.set(x, y, z);
      if (count < n) {
        paint(count++, x, y, z, r, g, b);
      } else {
        pos.copyWithin(0, 3);
        col.copyWithin(0, 3);
        paint(n - 1, x, y, z, r, g, b);
      }
      geo.setDrawRange(0, count);
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    }

    function restart() {
      armed = false;
    }

    return { sample, seed, restart };
  }

  const mainTrail = makeTrail(80, 0.8 * shipScale, 0.95);
  const rcsTrails = rcsJets.map(() => makeTrail(24, 0.45 * shipScale, 0.45));
  const rcsWas = rcsJets.map(() => false);

  function atBell() {
    craft.position.set(ship.x, ship.y, ship.z);
    craft.updateMatrixWorld();
    bell.getWorldPosition(world);
    return world;
  }

  function clearTrail() {
    const p = atBell();
    mainTrail.seed(p.x, p.y, p.z, 0.12, 0.22, 0.35);
    for (let i = 0; i < rcsJets.length; i++) {
      rcsJets[i].getWorldPosition(world);
      rcsTrails[i].seed(world.x, world.y, world.z, 0.1, 0.18, 0.28);
      rcsWas[i] = false;
    }
  }

  function sampleTrail(burning) {
    const p = atBell();
    const hot = burning ? 1 : 0.28;
    mainTrail.sample(p.x, p.y, p.z, 0.45 * hot + 0.2, 0.8 * hot + 0.15, hot);
    for (let i = 0; i < rcsJets.length; i++) {
      const jet = rcsJets[i];
      if (jet.visible && !rcsWas[i]) rcsTrails[i].restart();
      rcsWas[i] = jet.visible;
      if (!jet.visible) continue;
      jet.getWorldPosition(world);
      rcsTrails[i].sample(world.x, world.y, world.z, 0.28, 0.5, 0.75);
    }
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
