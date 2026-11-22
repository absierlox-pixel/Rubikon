import { CONFIG } from "./config.js";

export class PlaneRenderer3D {
  constructor(canvas, overlayCanvas) {
    this.canvas = canvas;
    this.overlay = overlayCanvas;
    this.octx = overlayCanvas.getContext("2d");
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.zoom = 1;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#111318");
    this.scene.fog = new THREE.Fog("#111318", 55, 165);

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 400);
    this.camera.position.set(0, 24, 24);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this.playerMeshes = new Map();
    this.targetMarker = null;

    this.buildWorld();
    this.resize();
  }

  buildWorld() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.65);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight.position.set(35, 65, 30);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 180;
    const d = 65;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    this.scene.add(dirLight);

    const floorGeo = new THREE.PlaneGeometry(CONFIG.WORLD_SIZE, CONFIG.WORLD_SIZE);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1b1e26,
      roughness: 0.9,
      metalness: 0.08
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(CONFIG.WORLD_SIZE, CONFIG.GRID_DIVISIONS, 0x3b4254, 0x262a35);
    grid.position.y = 0.02;
    this.scene.add(grid);

    const ringGeo = new THREE.RingGeometry(8.5, 9.2, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x5865f2, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    this.scene.add(ring);

    const half = CONFIG.WORLD_SIZE / 2;
    const pillarGeo = new THREE.BoxGeometry(2.2, 5, 2.2);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x5865f2, emissive: 0x1e2460, roughness: 0.4 });
    const corners = [
      [-half, -half],
      [half, -half],
      [half, half],
      [-half, half]
    ];
    for (const [cx, cz] of corners) {
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(cx, 2.5, cz);
      pillar.castShadow = true;
      this.scene.add(pillar);
    }

    const borderMat = new THREE.LineBasicMaterial({ color: 0xf23f43 });
    const borderPts = [
      new THREE.Vector3(-half, 0.15, -half),
      new THREE.Vector3(half, 0.15, -half),
      new THREE.Vector3(half, 0.15, half),
      new THREE.Vector3(-half, 0.15, half),
      new THREE.Vector3(-half, 0.15, -half)
    ];
    const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPts);
    this.scene.add(new THREE.Line(borderGeo, borderMat));

    const markerGeo = new THREE.RingGeometry(0.7, 1.05, 32);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0x5865f2, side: THREE.DoubleSide });
    this.targetMarker = new THREE.Mesh(markerGeo, markerMat);
    this.targetMarker.rotation.x = -Math.PI / 2;
    this.targetMarker.position.y = 0.06;
    this.targetMarker.visible = false;
    this.scene.add(this.targetMarker);
  }

  createPlayerMesh(player, isLocal) {
    const group = new THREE.Group();

    const bodyGeo = new THREE.CylinderGeometry(0.75, 0.88, 1.8, 20);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: player.color || "#5865f2",
      roughness: 0.45,
      metalness: 0.15
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.95;
    body.castShadow = true;
    group.add(body);

    const headGeo = new THREE.SphereGeometry(0.65, 20, 16);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.y = 2.2;
    head.castShadow = true;
    group.add(head);

    const visorGeo = new THREE.BoxGeometry(0.72, 0.28, 0.35);
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x99aaff,
      emissiveIntensity: 0.4
    });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 2.24, 0.52);
    group.add(visor);

    if (isLocal) {
      const baseRingGeo = new THREE.RingGeometry(1.15, 1.35, 32);
      const baseRingMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      const baseRing = new THREE.Mesh(baseRingGeo, baseRingMat);
      baseRing.rotation.x = -Math.PI / 2;
      baseRing.position.y = 0.05;
      group.add(baseRing);
    }

    this.scene.add(group);
    return { group, bodyMat };
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);

    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.width, this.height, false);

    this.overlay.width = Math.floor(this.width * this.dpr);
    this.overlay.height = Math.floor(this.height * this.dpr);
    this.octx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  adjustZoom(delta) {
    this.zoom = Math.max(0.55, Math.min(1.85, this.zoom + delta));
  }

  screenToWorld(sx, sy) {
    const ndc = new THREE.Vector2(
      (sx / this.width) * 2 - 1,
      -(sy / this.height) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, hit)) {
      return { x: hit.x, z: hit.z };
    }
    return null;
  }

  render(game) {
    for (const [id, entry] of this.playerMeshes.entries()) {
      if (!game.players.has(id)) {
        this.scene.remove(entry.group);
        this.playerMeshes.delete(id);
      }
    }

    for (const [id, player] of game.players.entries()) {
      let entry = this.playerMeshes.get(id);
      if (!entry) {
        entry = this.createPlayerMesh(player, id === game.localId);
        this.playerMeshes.set(id, entry);
      }
      entry.bodyMat.color.set(player.color || "#5865f2");
      const bob = Math.abs(Math.sin(player.walkPhase || 0)) * 0.22;
      entry.group.position.set(player.x, bob, player.z);
      entry.group.rotation.y = player.angle || 0;
    }

    if (game.clickTarget) {
      this.targetMarker.visible = true;
      this.targetMarker.position.set(game.clickTarget.x, 0.06, game.clickTarget.z);
    } else {
      this.targetMarker.visible = false;
    }

    const lp = game.localPlayer;
    const camDist = 23 * this.zoom;
    const camHeight = 20 * this.zoom;
    const targetCamX = lp.x;
    const targetCamY = camHeight;
    const targetCamZ = lp.z + camDist;

    this.camera.position.x += (targetCamX - this.camera.position.x) * 0.14;
    this.camera.position.y += (targetCamY - this.camera.position.y) * 0.14;
    this.camera.position.z += (targetCamZ - this.camera.position.z) * 0.14;
    this.camera.lookAt(lp.x, 1.2, lp.z);

    this.renderer.render(this.scene, this.camera);
    this.renderOverlay(game);
  }

  renderOverlay(game) {
    const ctx = this.octx;
    ctx.clearRect(0, 0, this.width, this.height);

    const now = Date.now();
    const vec = new THREE.Vector3();

    for (const player of game.players.values()) {
      vec.set(player.x, 3.6, player.z);
      vec.project(this.camera);
      if (vec.z > 1) {
        continue;
      }
      const sx = (vec.x * 0.5 + 0.5) * this.width;
      const sy = (-vec.y * 0.5 + 0.5) * this.height;

      const label = player.isHost ? `👑 ${player.name}` : player.name;
      ctx.font = "600 12px Inter, sans-serif";
      ctx.textAlign = "center";
      const tw = ctx.measureText(label).width;
      const boxW = tw + 14;
      const boxH = 20;

      ctx.fillStyle = "rgba(17, 18, 20, 0.8)";
      ctx.beginPath();
      ctx.roundRect(sx - boxW / 2, sy - boxH, boxW, boxH, 6);
      ctx.fill();

      ctx.fillStyle = "#f2f3f5";
      ctx.fillText(label, sx, sy - 6);

      if (player.emote && now < (player.emoteUntil || 0)) {
        ctx.font = "22px sans-serif";
        ctx.fillText(player.emote, sx, sy - 28);
      }
    }

    this.drawMinimap(ctx, game);
  }

  drawMinimap(ctx, game) {
    const size = 104;
    const margin = 12;
    const mx = this.width - size - margin;
    const my = this.height - size - margin;
    const half = CONFIG.WORLD_SIZE / 2;

    ctx.save();
    ctx.fillStyle = "rgba(30, 31, 34, 0.82)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(mx, my, size, size, 10);
    ctx.fill();
    ctx.stroke();

    for (const p of game.players.values()) {
      const px = mx + ((p.x + half) / CONFIG.WORLD_SIZE) * size;
      const py = my + ((p.z + half) / CONFIG.WORLD_SIZE) * size;
      ctx.beginPath();
      ctx.arc(px, py, p.id === game.localId ? 3.5 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = p.id === game.localId ? "#ffffff" : p.color;
      ctx.fill();
    }
    ctx.restore();
  }
}
