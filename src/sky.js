// Camera-locked sky. Sun and nebula live here, not as bodies in the system.
import * as THREE from "three";

export function createSky(scene, camera, fill, km) {
  const SKY_R = 8000 * km;

  function skyMap() {
    const w = 2048;
    const h = 1024;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#07080e";
    ctx.fillRect(0, 0, w, h);
    function blob(x, y, r, color) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // Squashed radial, so a cloud reads as a streak instead of a ball.
    function wisp(x, y, rx, ry, rot, color) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(1, ry / rx);
      blob(0, 0, rx, color);
      ctx.restore();
    }
    ctx.globalCompositeOperation = "lighter";
    blob(180, 160, 260, "rgba(210,40,150,0.42)");
    blob(1680, 140, 300, "rgba(255,120,40,0.34)");
    blob(1860, 780, 240, "rgba(90,50,220,0.4)");
    blob(240, 860, 220, "rgba(20,180,200,0.32)");
    blob(1100, 920, 280, "rgba(160,30,80,0.3)");
    blob(1280, 360, 200, "rgba(40,90,200,0.28)");
    // Spawn looks +Z, about u=0.25 on a Three sphere. Sun sits there.
    blob(512, 310, 70, "rgba(255,250,210,1)");
    blob(512, 310, 150, "rgba(255,170,50,0.7)");
    blob(512, 310, 260, "rgba(255,90,40,0.22)");
    wisp(620, 180, 180, 48, 0.4, "rgba(220,60,160,0.16)");
    wisp(980, 240, 220, 40, -0.5, "rgba(40,200,210,0.14)");
    wisp(1500, 520, 200, 36, 0.8, "rgba(255,150,50,0.13)");
    wisp(400, 640, 160, 32, -0.3, "rgba(140,80,255,0.15)");
    wisp(800, 720, 240, 44, 0.2, "rgba(40,160,200,0.12)");
    wisp(1320, 760, 190, 38, 1.1, "rgba(200,40,120,0.14)");
    wisp(1700, 300, 170, 30, -0.9, "rgba(255,180,80,0.12)");
    wisp(260, 420, 150, 28, 0.6, "rgba(80,80,220,0.13)");
    wisp(1040, 120, 160, 26, 0.15, "rgba(40,210,160,0.1)");
    wisp(560, 880, 200, 34, -0.7, "rgba(180,60,200,0.12)");
    wisp(1480, 160, 140, 24, 1.4, "rgba(20,180,220,0.11)");
    wisp(720, 480, 130, 22, -1.2, "rgba(255,100,60,0.1)");
    ctx.globalCompositeOperation = "source-over";
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(SKY_R, 48, 32),
    new THREE.MeshBasicMaterial({ map: skyMap(), side: THREE.BackSide, depthWrite: false })
  );
  sky.frustumCulled = false;
  scene.add(sky);

  const starPos = new Float32Array(900 * 3);
  const starCol = new Float32Array(900 * 3);
  for (let i = 0; i < 900; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = SKY_R * 0.96;
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.cos(phi);
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    const tint = Math.random();
    starCol[i * 3] = tint > 0.85 ? 1 : tint > 0.7 ? 0.6 : 1;
    starCol[i * 3 + 1] = tint > 0.85 ? 0.7 : tint > 0.7 ? 0.9 : 1;
    starCol[i * 3 + 2] = tint > 0.85 ? 0.45 : tint > 0.7 ? 1 : 0.92;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute("color", new THREE.BufferAttribute(starCol, 3));
  sky.add(
    new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        vertexColors: true,
        size: 1.6,
        sizeAttenuation: false,
        depthWrite: false,
      })
    )
  );

  function hitchSky() {
    sky.position.copy(camera.position);
    fill.position.copy(camera.position);
  }

  function planetMap(hex) {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 32;
    const ctx = c.getContext("2d");
    const r = (hex >> 16) & 255;
    const g = (hex >> 8) & 255;
    const b = hex & 255;
    ctx.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
    ctx.fillRect(0, 0, 64, 32);
    for (let i = 0; i < 420; i++) {
      const n = (Math.random() - 0.35) * 48;
      const rr = Math.max(0, Math.min(255, r + n));
      const gg = Math.max(0, Math.min(255, g + n));
      const bb = Math.max(0, Math.min(255, b + n * 0.7));
      ctx.fillStyle = "rgba(" + (rr | 0) + "," + (gg | 0) + "," + (bb | 0) + ",0.55)";
      ctx.fillRect(Math.random() * 64, Math.random() * 32, 1 + Math.random() * 7, 1 + Math.random() * 3);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  return { hitchSky, planetMap };
}
