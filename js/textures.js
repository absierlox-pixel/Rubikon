// Procedural Canvas PBR textures (zero external assets, works offline and in Discord)

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d") };
}

function finalizeTex(canvas, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  if (THREE.sRGBEncoding) {
    tex.encoding = THREE.sRGBEncoding;
  }
  return tex;
}

export function createAsphaltTexture() {
  const { c, ctx } = makeCanvas(512, 512);
  ctx.fillStyle = "#2b2d32";
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 14000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const v = 30 + Math.floor(Math.random() * 34);
    ctx.fillStyle = `rgb(${v},${v},${v + 2})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Subtle tire wear tracks
  ctx.fillStyle = "rgba(18, 19, 22, 0.25)";
  ctx.fillRect(110, 0, 54, 512);
  ctx.fillRect(348, 0, 54, 512);

  // Subtle cracks
  ctx.strokeStyle = "rgba(15, 16, 18, 0.45)";
  ctx.lineWidth = 1.2;
  for (let k = 0; k < 5; k++) {
    ctx.beginPath();
    let cx = Math.random() * 512;
    let cy = Math.random() * 512;
    ctx.moveTo(cx, cy);
    for (let s = 0; s < 8; s++) {
      cx += (Math.random() - 0.5) * 45;
      cy += (Math.random() - 0.5) * 45;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  return finalizeTex(c, 36, 36);
}

export function createSidewalkTexture() {
  const { c, ctx } = makeCanvas(256, 256);
  ctx.fillStyle = "#7c7e82";
  ctx.fillRect(0, 0, 256, 256);

  const step = 64;
  for (let gx = 0; gx < 4; gx++) {
    for (let gy = 0; gy < 4; gy++) {
      const v = 118 + ((gx * 7 + gy * 11) % 14);
      ctx.fillStyle = `rgb(${v},${v},${v - 2})`;
      ctx.fillRect(gx * step + 2, gy * step + 2, step - 4, step - 4);
    }
  }

  for (let i = 0; i < 2400; i++) {
    const v = 90 + Math.floor(Math.random() * 60);
    ctx.fillStyle = `rgba(${v},${v},${v},0.18)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }

  ctx.strokeStyle = "rgba(45, 47, 50, 0.45)";
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * step);
    ctx.lineTo(256, i * step);
    ctx.stroke();
  }

  return finalizeTex(c, 4, 4);
}

export function createBuildingFacadeTexture(styleIndex = 0) {
  const { c, ctx } = makeCanvas(512, 512);
  const palettes = [
    { wall: "#8b8d91", trim: "#686b70", winDark: "#1d2736", winLit: "#f3d89c" }, // Panel gray
    { wall: "#9b7a68", trim: "#775c4e", winDark: "#1f2833", winLit: "#ffe1a6" }, // Brick warm
    { wall: "#7c8791", trim: "#59636d", winDark: "#162436", winLit: "#d8ebff" }, // Modern office
    { wall: "#a89d8a", trim: "#847a69", winDark: "#242a32", winLit: "#ffdfb0" }  // Plaster beige
  ];
  const pal = palettes[styleIndex % palettes.length];

  ctx.fillStyle = pal.wall;
  ctx.fillRect(0, 0, 512, 512);

  // Weathering & concrete/brick noise
  for (let i = 0; i < 6500; i++) {
    const a = Math.random() * 0.08;
    ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.4})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 3, 2);
  }

  // Panel / floor horizontal lines
  const rows = 8;
  const cols = 6;
  const rowH = 512 / rows;
  const colW = 512 / cols;

  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 2;
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * rowH);
    ctx.lineTo(512, r * rowH);
    ctx.stroke();
  }

  // Windows with frames, sills, curtains, and occasional warm interior lights
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const wx = col * colW + 12;
      const wy = r * rowH + 12;
      const ww = colW - 24;
      const wh = rowH - 22;

      // Window recess
      ctx.fillStyle = pal.trim;
      ctx.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);

      const lit = ((r * 13 + col * 7 + styleIndex * 5) % 9) === 0;
      const grad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
      if (lit) {
        grad.addColorStop(0, pal.winLit);
        grad.addColorStop(1, "#b58b52");
      } else {
        grad.addColorStop(0, "#2f435c");
        grad.addColorStop(1, pal.winDark);
      }
      ctx.fillStyle = grad;
      ctx.fillRect(wx, wy, ww, wh);

      // Mullion crossbars
      ctx.fillStyle = "rgba(230,235,240,0.45)";
      ctx.fillRect(wx + ww * 0.5 - 1, wy, 2, wh);
      ctx.fillRect(wx, wy + wh * 0.35, ww, 2);

      // Window sill
      ctx.fillStyle = "#52555c";
      ctx.fillRect(wx - 4, wy + wh + 2, ww + 8, 4);
    }
  }

  return finalizeTex(c, 1, 1);
}

export function createFabricTexture(baseHex = "#3a5f8a") {
  const { c, ctx } = makeCanvas(256, 256);
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);

  // Fine cloth weave
  for (let y = 0; y < 256; y += 3) {
    ctx.fillStyle = y % 6 === 0 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.06)";
    ctx.fillRect(0, y, 256, 1);
  }
  for (let x = 0; x < 256; x += 3) {
    ctx.fillStyle = x % 6 === 0 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.05)";
    ctx.fillRect(x, 0, 1, 256);
  }

  // Subtle wrinkles/folds & center zipper seam
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  ctx.fillRect(126, 0, 4, 256);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(18, 130, 74, 58);
  ctx.strokeRect(164, 130, 74, 58);

  return finalizeTex(c, 1, 1);
}

export function createDenimTexture() {
  const { c, ctx } = makeCanvas(256, 256);
  ctx.fillStyle = "#262c38";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4500; i++) {
    const a = Math.random() * 0.08;
    ctx.fillStyle = Math.random() > 0.5 ? `rgba(180,200,230,${a})` : `rgba(0,0,0,${a * 1.4})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 3);
  }
  // Stitching lines
  ctx.strokeStyle = "rgba(185, 155, 110, 0.28)";
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(128, 0);
  ctx.lineTo(128, 256);
  ctx.stroke();
  return finalizeTex(c, 1, 1);
}

export function createFaceTexture() {
  const { c, ctx } = makeCanvas(256, 256);
  // Natural skin gradient
  const grad = ctx.createRadialGradient(128, 124, 18, 128, 128, 125);
  grad.addColorStop(0, "#f0c8a8");
  grad.addColorStop(0.75, "#dfb08c");
  grad.addColorStop(1, "#c4926f");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Subtle skin pores
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(120, 72, 48, ${Math.random() * 0.06})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }

  // Face features centered around u=0.5 (front of sphere when rotated properly)
  // Eyebrows
  ctx.fillStyle = "#3a291f";
  ctx.fillRect(96, 102, 24, 5);
  ctx.fillRect(136, 102, 24, 5);

  // Eyes (sclera + iris + pupil)
  for (const ex of [108, 148]) {
    ctx.fillStyle = "#f4f4f2";
    ctx.beginPath();
    ctx.ellipse(ex, 118, 9, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#415d73";
    ctx.beginPath();
    ctx.arc(ex, 118, 4.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(ex, 118, 2.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(ex + 1.5, 116.5, 1.0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Nose shadow
  ctx.fillStyle = "rgba(130, 82, 56, 0.35)";
  ctx.beginPath();
  ctx.moveTo(128, 118);
  ctx.lineTo(123, 140);
  ctx.lineTo(133, 140);
  ctx.closePath();
  ctx.fill();

  // Mouth & subtle stubble
  ctx.fillStyle = "rgba(95, 58, 44, 0.45)";
  ctx.beginPath();
  ctx.ellipse(128, 158, 14, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(70, 50, 38, 0.14)";
  ctx.beginPath();
  ctx.ellipse(128, 166, 28, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  return finalizeTex(c, 1, 1);
}

export function createWoodTexture() {
  const { c, ctx } = makeCanvas(256, 128);
  ctx.fillStyle = "#7c3f1d";
  ctx.fillRect(0, 0, 256, 128);
  for (let y = 0; y < 128; y += 2) {
    const wave = Math.sin(y * 0.25) * 18;
    ctx.fillStyle = y % 4 === 0 ? "rgba(45, 18, 6, 0.26)" : "rgba(180, 95, 42, 0.18)";
    ctx.fillRect(0, y, 256, 2);
    ctx.fillStyle = "rgba(35, 12, 4, 0.12)";
    ctx.fillRect((y * 9 + wave) % 256, y, 40, 1);
  }
  return finalizeTex(c, 1, 1);
}

export function createGunmetalTexture() {
  const { c, ctx } = makeCanvas(128, 128);
  ctx.fillStyle = "#26292e";
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1200; i++) {
    const v = 28 + Math.floor(Math.random() * 26);
    ctx.fillStyle = `rgba(${v},${v + 2},${v + 5},0.35)`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 10, 1);
  }
  return finalizeTex(c, 1, 1);
}

export function createCarPaintTexture(baseHex = "#b8252a", stripeHex = null) {
  const { c, ctx } = makeCanvas(256, 256);
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);

  // Subtle metallic flake shimmer
  for (let i = 0; i < 3200; i++) {
    const light = Math.random() > 0.5;
    ctx.fillStyle = light ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.05)";
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }

  // Optional dual racing stripes
  if (stripeHex) {
    ctx.fillStyle = stripeHex;
    ctx.fillRect(98, 0, 22, 256);
    ctx.fillRect(136, 0, 22, 256);
  }

  return finalizeTex(c, 1, 1);
}

export function createCarbonFiberTexture() {
  const { c, ctx } = makeCanvas(64, 64);
  ctx.fillStyle = "#17191d";
  ctx.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 4) {
    for (let x = 0; x < 64; x += 4) {
      const shift = (y / 4) % 2 === 0 ? 0 : 2;
      ctx.fillStyle = "#262a31";
      ctx.fillRect((x + shift) % 64, y, 2, 3);
    }
  }
  return finalizeTex(c, 4, 4);
}

export function createCrackedGlassTexture() {
  const { c, ctx } = makeCanvas(256, 256);
  ctx.fillStyle = "rgba(175, 215, 240, 0.25)";
  ctx.fillRect(0, 0, 256, 256);

  const centers = [
    { x: 96, y: 112 },
    { x: 174, y: 140 }
  ];
  for (const ctr of centers) {
    ctx.strokeStyle = "rgba(240, 248, 255, 0.85)";
    ctx.lineWidth = 1.4;
    for (let r = 12; r <= 72; r += 16) {
      ctx.beginPath();
      ctx.arc(ctr.x, ctr.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + Math.random() * 0.2;
      const len = 35 + Math.random() * 65;
      ctx.beginPath();
      ctx.moveTo(ctr.x, ctr.y);
      ctx.lineTo(ctr.x + Math.cos(a) * len * 0.5, ctr.y + Math.sin(a) * len * 0.5);
      ctx.lineTo(ctr.x + Math.cos(a + 0.12) * len, ctr.y + Math.sin(a + 0.12) * len);
      ctx.stroke();
    }
  }
  return finalizeTex(c, 1, 1);
}

export function createTireTreadTexture() {
  const { c, ctx } = makeCanvas(128, 128);
  ctx.fillStyle = "#191b1e";
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "#101114";
  for (let y = 0; y < 128; y += 16) {
    ctx.fillRect(0, y, 128, 5);
    for (let x = 0; x < 128; x += 24) {
      ctx.fillRect(x, y + 6, 10, 6);
    }
  }
  return finalizeTex(c, 4, 1);
}
