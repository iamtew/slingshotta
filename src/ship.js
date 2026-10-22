// Slingshot Racer. Domed heat shield nose, two green pressure vessels, service section, big bell,
// and a truss holding 8 thruster pods (the RCS). Local +Z is the nose.
import * as THREE from "three";

export function createRacer(scene, shipScale) {
  const craft = new THREE.Group();
  const hullMat = new THREE.MeshLambertMaterial({ color: 0x4a6b45, emissive: 0x162414, emissiveIntensity: 0.35 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x2a2e33, emissive: 0x0a0c10, emissiveIntensity: 0.2 });
  const whiteMat = new THREE.MeshLambertMaterial({ color: 0xe6e1d3, emissive: 0x2a2824, emissiveIntensity: 0.22 });
  const copperMat = new THREE.MeshLambertMaterial({ color: 0xa8643a, emissive: 0x2a1208, emissiveIntensity: 0.2 });
  const dishMat = new THREE.MeshLambertMaterial({ color: 0xb8b4aa, emissive: 0x222018, emissiveIntensity: 0.22, side: THREE.DoubleSide });
  const metalMat = new THREE.MeshLambertMaterial({ color: 0x55575c, emissive: 0x12141a, emissiveIntensity: 0.25, side: THREE.DoubleSide });
  const strutMat = new THREE.MeshLambertMaterial({ color: 0x48577a, emissive: 0x10141c, emissiveIntensity: 0.25 });
  const podMat = new THREE.MeshLambertMaterial({ color: 0xc8b07a, emissive: 0x2a2010, emissiveIntensity: 0.2 });

  // Cylinders and cones grow along +Y; this lays one along Z at z.
  function alongZ(mesh, z) {
    mesh.rotation.x = Math.PI / 2;
    mesh.position.z = z;
    craft.add(mesh);
    return mesh;
  }
  // Convex heat shield: a cap cut from a sphere of radius 1.49 (rim radius 0.78,
  // dome depth 0.22). The sphere center sits back so the rim lands at z 1.35.
  alongZ(new THREE.Mesh(new THREE.SphereGeometry(1.49, 16, 4, 0, Math.PI * 2, 0, 0.55), dishMat), 0.08);
  const orbital = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 8), hullMat);
  orbital.position.z = 0.95;
  alongZ(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 10), darkMat), 0.48);
  const vessel = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), hullMat);
  vessel.scale.z = 1.3;
  vessel.position.z = -0.05;
  craft.add(orbital, vessel);
  alongZ(new THREE.Mesh(new THREE.CylinderGeometry(0.51, 0.51, 0.12, 12), whiteMat), 0);
  alongZ(new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.12, 12), whiteMat), -0.25);
  alongZ(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.6, 10), darkMat), -0.8);
  alongZ(new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.08, 10), copperMat), -0.6);
  // Bell: narrow end forward (+Y top maps to +Z).
  alongZ(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.52, 0.75, 14, 1, true), metalMat), -1.45);

  const yAxis = new THREE.Vector3(0, 1, 0);
  const strutGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 5);
  const strutDir = new THREE.Vector3();
  function strut(a, b) {
    const m = new THREE.Mesh(strutGeo, strutMat);
    strutDir.subVectors(b, a);
    m.scale.y = strutDir.length();
    m.position.addVectors(a, b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(yAxis, strutDir.normalize());
    craft.add(m);
  }

  // Cold gas. Exhaust leaves the pod; thrust pushes the other way.
  const rcsGeo = new THREE.SphereGeometry(0.09, 8, 6);
  const rcsMat = new THREE.MeshBasicMaterial({
    color: 0x7eb4d8,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const rcsHaloMat = new THREE.MeshBasicMaterial({
    color: 0x4a88b8,
    transparent: true,
    opacity: 0.09,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const rcsJets = [];
  const rcsThrust = new THREE.Vector3();
  function rcsJet(pod, dx, dy) {
    const jet = new THREE.Mesh(rcsGeo, rcsMat);
    const out = new THREE.Vector3(dx, dy, 0);
    jet.position.copy(pod).addScaledVector(out, 0.4);
    jet.quaternion.setFromUnitVectors(yAxis, out);
    jet.scale.set(1.05, 1.9, 1.05);
    const halo = new THREE.Mesh(rcsGeo, rcsHaloMat);
    halo.scale.set(1.65, 1.25, 1.65);
    jet.add(halo);
    // Torque this jet puts on the ship: pod x thrust. Fires when it agrees with spin.
    rcsThrust.copy(out).negate();
    jet.userData.torque = new THREE.Vector3().crossVectors(pod, rcsThrust).normalize();
    jet.visible = false;
    craft.add(jet);
    rcsJets.push(jet);
  }

  const podGeo = new THREE.BoxGeometry(0.22, 0.22, 0.26);
  const POD_R = 1.5;
  const HULL_R = 0.32;
  function placePod(angle, z) {
    const p = new THREE.Vector3(Math.cos(angle) * POD_R, Math.sin(angle) * POD_R, z);
    const pod = new THREE.Mesh(podGeo, podMat);
    pod.position.copy(p);
    craft.add(pod);
    rcsJet(p, Math.cos(angle - Math.PI / 4), Math.sin(angle - Math.PI / 4));
    rcsJet(p, Math.cos(angle + Math.PI / 4), Math.sin(angle + Math.PI / 4));
    const inner = new THREE.Vector3(Math.cos(angle) * HULL_R, Math.sin(angle) * HULL_R, z);
    const body = new THREE.Vector3(Math.cos(angle) * HULL_R, Math.sin(angle) * HULL_R, z * 0.35);
    strut(p, inner);
    strut(p, body);
  }
  for (let i = 0; i < 4; i++) {
    placePod(Math.PI / 4 + (i * Math.PI) / 2, 0.95);
    placePod((i * Math.PI) / 2, -1.15);
  }
  const RCS_DZ = 0.18;

  const plume = new THREE.Group();
  plume.rotation.x = -Math.PI / 2;
  plume.position.z = -2.4;
  function addPlume(r0, r1, h, color, opacity) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(r0, r1, h, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    plume.add(m);
  }
  addPlume(0.03, 0.08, 1.9, 0xeef8ff, 0.85);
  addPlume(0.1, 0.22, 1.7, 0x6ad0ff, 0.4);
  addPlume(0.2, 0.42, 1.45, 0x2a6cff, 0.18);
  const bell = new THREE.Object3D();
  bell.position.z = -2.4;
  craft.add(plume, bell);
  craft.scale.setScalar(shipScale);
  scene.add(craft);

  return { craft, plume, bell, rcsJets, RCS_DZ, hullMat };
}
