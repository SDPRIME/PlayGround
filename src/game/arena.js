import * as THREE from 'three';
import { COURT, ACTION, PHASE, clamp, lerp, angleLerp } from './constants.js';

const TAU = Math.PI * 2;

function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function canvasTexture(canvas, aniso = 4) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = aniso;
  return texture;
}

function makePitchTexture() {
  const W = 2048;
  const H = 1120;
  const [canvas, ctx] = canvas2d(W, H);
  const px = (x) => ((x + 22) / 44) * W;
  const py = (z) => ((z + 12) / 24) * H;
  const fieldPx = (x) => (x / 44) * W;
  const fieldPy = (z) => (z / 24) * H;

  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#0e4d48');
  grad.addColorStop(0.46, '#116257');
  grad.addColorStop(1, '#0a3838');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // mowing bands
  for (let i = 0; i < 10; i += 1) {
    ctx.fillStyle = i % 2 ? 'rgba(175,255,213,.025)' : 'rgba(0,24,22,.055)';
    ctx.fillRect((i / 10) * W, 0, W / 10, H);
  }

  // soft scuffs and reflections
  for (let i = 0; i < 1400; i += 1) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '190,255,232' : '2,26,27'},${Math.random() * 0.035})`;
    ctx.fillRect(x, y, Math.random() * 5 + 1, Math.random() * 2 + 0.5);
  }
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.42, 10, W * 0.5, H * 0.48, W * 0.5);
  glow.addColorStop(0, 'rgba(170,255,218,.075)');
  glow.addColorStop(1, 'rgba(0,30,30,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const line = 'rgba(225,255,205,.78)';
  ctx.strokeStyle = line;
  ctx.fillStyle = line;
  ctx.lineWidth = 5;

  // outer boundary
  ctx.strokeRect(px(-COURT.halfL), py(-COURT.halfW), fieldPx(COURT.halfL * 2), fieldPy(COURT.halfW * 2));
  // halfway
  ctx.beginPath();
  ctx.moveTo(px(0), py(-COURT.halfW));
  ctx.lineTo(px(0), py(COURT.halfW));
  ctx.stroke();
  // center circle + spot
  ctx.beginPath();
  ctx.arc(px(0), py(0), fieldPx(3), 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px(0), py(0), 6, 0, TAU);
  ctx.fill();

  // futsal penalty arcs
  for (const side of [-1, 1]) {
    const goalX = side * COURT.halfL;
    const postZ = COURT.goalHalf;
    ctx.beginPath();
    ctx.arc(px(goalX), py(-postZ), fieldPx(6), 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px(goalX), py(postZ), fieldPx(6), 0, TAU);
    ctx.stroke();
    const penX = side * (COURT.halfL - 6);
    ctx.beginPath();
    ctx.arc(px(penX), py(0), 5, 0, TAU);
    ctx.fill();
    // second penalty mark
    ctx.beginPath();
    ctx.arc(px(side * (COURT.halfL - 10)), py(0), 4, 0, TAU);
    ctx.fill();
  }

  // center watermark
  ctx.save();
  ctx.translate(px(0), py(0));
  ctx.rotate(-Math.PI / 2);
  ctx.font = '700 215px Rajdhani, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(218,255,195,.035)';
  ctx.fillText('KHAMASI', 0, 0);
  ctx.restore();

  // subtle center logo
  ctx.save();
  ctx.translate(px(0), py(0));
  ctx.globalAlpha = 0.085;
  ctx.strokeStyle = '#d9ff43';
  ctx.lineWidth = 10;
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * TAU - Math.PI / 2;
    const x = Math.cos(a) * 42;
    const y = Math.sin(a) * 42;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  return canvasTexture(canvas, 8);
}

function makeAdTexture(title, sub, bg, fg, accent) {
  const [canvas, ctx] = canvas2d(1024, 192);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 192);
  const g = ctx.createLinearGradient(0, 0, 1024, 192);
  g.addColorStop(0, 'rgba(255,255,255,.08)');
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,.22)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 192);
  ctx.save();
  ctx.translate(58, 40);
  ctx.fillStyle = accent;
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * TAU - Math.PI / 2;
    const x = Math.cos(a) * 29;
    const y = Math.sin(a) * 29;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = bg;
  ctx.font = '700 24px Rajdhani, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('K', 0, 2);
  ctx.restore();
  ctx.fillStyle = fg;
  ctx.font = '700 64px Rajdhani, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '6px';
  ctx.fillText(title, 112, 82);
  ctx.fillStyle = accent;
  ctx.font = '600 24px Rajdhani, sans-serif';
  ctx.letterSpacing = '8px';
  ctx.fillText(sub, 114, 137);
  ctx.strokeStyle = 'rgba(255,255,255,.16)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(940, 38);
  ctx.lineTo(940, 154);
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.font = '600 20px Rajdhani, sans-serif';
  ctx.save();
  ctx.translate(966, 96);
  ctx.rotate(Math.PI / 2);
  ctx.fillText('NIGHT LEAGUE', 0, 0);
  ctx.restore();
  return canvasTexture(canvas, 4);
}

function makeNetTexture() {
  const [canvas, ctx] = canvas2d(256, 256);
  ctx.clearRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(225,250,240,.62)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 256; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeBallTexture() {
  const [canvas, ctx] = canvas2d(512, 256);
  ctx.fillStyle = '#eef0e7';
  ctx.fillRect(0, 0, 512, 256);
  const spots = [
    [52, 60, 30], [150, 38, 26], [260, 62, 32], [380, 36, 26], [478, 66, 30],
    [100, 150, 32], [210, 142, 28], [330, 155, 33], [445, 144, 27],
    [50, 226, 29], [165, 218, 25], [285, 230, 31], [405, 215, 26],
  ];
  ctx.fillStyle = '#111b1e';
  for (const [x, y, r] of spots) {
    ctx.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * TAU - Math.PI / 2;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(20,40,44,.32)';
  ctx.lineWidth = 2;
  for (let x = 25; x < 512; x += 48) {
    ctx.beginPath();
    ctx.arc(x, 130, 40, 0.2, 2.5);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(217,255,67,.9)';
  ctx.font = '700 17px Rajdhani, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('KHAMASI', 256, 136);
  return canvasTexture(canvas, 8);
}

function makeNumberTexture(number, ink) {
  const [canvas, ctx] = canvas2d(128, 160);
  ctx.clearRect(0, 0, 128, 160);
  ctx.fillStyle = ink;
  ctx.font = '700 82px Rajdhani, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), 64, 83);
  return canvasTexture(canvas, 4);
}

function makeBannerTexture(teamA, teamB) {
  const [canvas, ctx] = canvas2d(1024, 256);
  ctx.fillStyle = '#051319';
  ctx.fillRect(0, 0, 1024, 256);
  const g = ctx.createLinearGradient(0, 0, 1024, 0);
  g.addColorStop(0, 'rgba(217,255,67,.12)');
  g.addColorStop(0.5, 'rgba(217,255,67,0)');
  g.addColorStop(1, 'rgba(71,242,208,.1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = '#d9ff43';
  ctx.font = '700 58px Rajdhani, sans-serif';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '14px';
  ctx.fillText('KHAMASI', 512, 105);
  ctx.fillStyle = '#dcebe4';
  ctx.font = '600 30px Cairo, sans-serif';
  ctx.letterSpacing = '4px';
  ctx.fillText(`${teamA.name}  ×  ${teamB.name}`, 512, 168);
  ctx.fillStyle = 'rgba(255,255,255,.36)';
  ctx.font = '500 18px Rajdhani, sans-serif';
  ctx.letterSpacing = '10px';
  ctx.fillText('FIVE-A-SIDE  •  NIGHT LEAGUE', 512, 216);
  return canvasTexture(canvas, 4);
}

export class Arena {
  constructor(canvas, quality = 'high') {
    this.canvas = canvas;
    this.quality = quality;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x031018);
    this.scene.fog = new THREE.FogExp2(0x031018, 0.012);
    this.camera = new THREE.PerspectiveCamera(43, 1, 0.1, 150);
    this.camera.position.set(10, 11, 23);
    this.cameraTarget = new THREE.Vector3(0, 0.4, 0);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality === 'high',
      powerPreference: quality === 'high' ? 'high-performance' : 'low-power',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'high' ? 1.5 : 0.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = quality === 'high';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.mode = 'menu';
    this.time = 0;
    this.shake = 0;
    this.ballTrailPositions = [];
    this.playerViews = new Map();
    this.playerGroup = new THREE.Group();
    this.scene.add(this.playerGroup);
    this.menuPhase = 0;
    this.homeTeam = null;
    this.awayTeam = null;
    this.banner = null;
    this.confetti = null;
    this.confettiData = null;
    this.lastState = null;
    this.qualityEffects = [];
    this.renderFrame = 0;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.build();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  build() {
    this.buildEnvironment();
    this.buildPitch();
    this.buildBoards();
    this.buildGoals();
    this.buildStands();
    this.buildLights();
    this.buildBall();
    this.buildConfetti();
  }

  buildEnvironment() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 55),
      new THREE.MeshStandardMaterial({ color: 0x041319, roughness: 0.95, metalness: 0.05 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.13;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // dark court apron
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(47, 27),
      new THREE.MeshStandardMaterial({ color: 0x061b20, roughness: 0.83, metalness: 0.15 }),
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.02;
    apron.receiveShadow = true;
    this.scene.add(apron);

    // side rails behind boards
    const railMat = new THREE.MeshStandardMaterial({ color: 0x0b262d, metalness: 0.5, roughness: 0.5 });
    for (const z of [-11.15, 11.15]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(43, 0.08, 0.08), railMat);
      rail.position.set(0, 0.92, z);
      this.scene.add(rail);
      for (let x = -20; x <= 20; x += 4) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.06), railMat);
        post.position.set(x, 0.48, z);
        this.scene.add(post);
      }
    }

    // distant hall walls / darkness
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x04141b, roughness: 0.88 });
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(64, 15, 0.5), wallMat);
    backWall.position.set(0, 5.5, -20.5);
    this.scene.add(backWall);
  }

  buildPitch() {
    const texture = makePitchTexture();
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const geometry = new THREE.PlaneGeometry(44, 24);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.58,
      metalness: 0.08,
      envMapIntensity: 0.2,
    });
    const pitch = new THREE.Mesh(geometry, material);
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.y = 0.005;
    pitch.receiveShadow = true;
    this.scene.add(pitch);
  }

  buildBoards() {
    const ads = [
      makeAdTexture('KHAMASI', 'FIVE-A-SIDE', '#081f25', '#e9f7df', '#d9ff43'),
      makeAdTexture('VELOCITY', 'SPORT ENERGY', '#13221d', '#eaf6e3', '#47f2d0'),
      makeAdTexture('NIGHT LEAGUE', 'SEASON 01', '#1e1112', '#fff0e8', '#ff705d'),
      makeAdTexture('ARENA 5', 'PLAY BOLD', '#111527', '#f4efff', '#b18cff'),
    ];
    const boardMat = new THREE.MeshStandardMaterial({ color: 0x07191e, roughness: 0.45, metalness: 0.55 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xd9ff43, transparent: true, opacity: 0.52 });
    const adMats = ads.map((map) => new THREE.MeshStandardMaterial({
      map,
      emissive: 0xffffff,
      emissiveMap: map,
      emissiveIntensity: 0.45,
      roughness: 0.45,
      side: THREE.DoubleSide,
    }));
    const adGeo = new THREE.PlaneGeometry(4.4, 0.82);
    const zPositions = [10.5, -10.5];
    zPositions.forEach((z, side) => {
      for (let i = 0; i < 10; i += 1) {
        const x = -19.8 + i * 4.4;
        const mesh = new THREE.Mesh(adGeo, adMats[(i + side) % 4]);
        mesh.position.set(x, 0.46, z + (z > 0 ? 0.03 : -0.03));
        mesh.rotation.y = side === 0 ? Math.PI : 0;
        this.scene.add(mesh);
        if (i % 2 === 0) {
          const gl = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.025, 0.03), glowMat);
          gl.position.set(x, 0.065, z + (z > 0 ? 0.06 : -0.06));
          this.scene.add(gl);
        }
      }
      const base = new THREE.Mesh(new THREE.BoxGeometry(44.2, 0.88, 0.13), boardMat);
      base.position.set(0, 0.45, z);
      this.scene.add(base);
    });
    // end boards
    const endAdGeo = new THREE.PlaneGeometry(3.7, 0.82);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i += 1) {
        const z = -8.25 + i * 4.4;
        if (Math.abs(z) < 2.4) continue;
        const ad = new THREE.Mesh(endAdGeo, adMats[(i + (side > 0 ? 1 : 3)) % 4]);
        ad.position.set(side * 20.54, 0.46, z);
        ad.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        this.scene.add(ad);
      }
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.88, 21), boardMat);
      base.position.set(side * 20.55, 0.45, 0);
      this.scene.add(base);
    }
  }

  buildGoals() {
    const netTex = makeNetTexture();
    const netMat = new THREE.MeshStandardMaterial({
      map: netTex,
      transparent: true,
      alphaTest: 0.05,
      side: THREE.DoubleSide,
      roughness: 0.8,
      color: 0xcdebe5,
      opacity: 0.75,
    });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xeaf5ef, roughness: 0.32, metalness: 0.62 });
    const backFrameMat = new THREE.MeshStandardMaterial({ color: 0x40625f, roughness: 0.55, metalness: 0.4 });
    for (const side of [-1, 1]) {
      const group = new THREE.Group();
      const x = side * (COURT.halfL + 0.35);
      const goalW = COURT.goalHalf * 2;
      const h = COURT.goalHeight;
      const depth = COURT.netDepth;
      const postGeo = new THREE.CylinderGeometry(0.065, 0.065, h, 10);
      for (const z of [-COURT.goalHalf, COURT.goalHalf]) {
        const post = new THREE.Mesh(postGeo, frameMat);
        post.position.set(x, h / 2, z);
        post.castShadow = true;
        group.add(post);
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, goalW + 0.13, 10), frameMat);
      bar.rotation.x = Math.PI / 2;
      bar.position.set(x, h, 0);
      bar.castShadow = true;
      group.add(bar);

      // net: back, two sides, roof
      const back = new THREE.Mesh(new THREE.PlaneGeometry(goalW, h), netMat);
      back.position.set(x + side * depth, h / 2, 0);
      back.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(back);
      for (const z of [-COURT.goalHalf, COURT.goalHalf]) {
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(depth, h), netMat);
        pane.position.set(x + side * depth / 2, h / 2, z);
        pane.rotation.y = 0;
        group.add(pane);
      }
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(depth, goalW), netMat);
      roof.position.set(x + side * depth / 2, h, 0);
      roof.rotation.x = Math.PI / 2;
      group.add(roof);

      // back frame
      for (const z of [-COURT.goalHalf, COURT.goalHalf]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, h * 0.9, 6), backFrameMat);
        pole.position.set(x + side * depth, h * 0.45, z);
        group.add(pole);
      }
      const backBar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, goalW, 6), backFrameMat);
      backBar.rotation.x = Math.PI / 2;
      backBar.position.set(x + side * depth, h * 0.9, 0);
      group.add(backBar);
      this.scene.add(group);
    }
  }

  buildStands() {
    const standMat = new THREE.MeshStandardMaterial({ color: 0x071b23, roughness: 0.82, metalness: 0.2 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x0e3038, roughness: 0.6, metalness: 0.38 });
    const crowdGeo = new THREE.BoxGeometry(0.18, 0.3, 0.18);
    const crowdMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const colours = ['#d9ff43', '#47f2d0', '#ff705d', '#e9ece0', '#5f9ec7', '#c99b56', '#8b67d1'];
    const instances = [];
    const rows = 10;
    for (const side of [-1, 1]) {
      for (let r = 0; r < rows; r += 1) {
        const z = side * (12.1 + r * 0.56);
        const y = 0.42 + r * 0.31;
        const tier = new THREE.Mesh(new THREE.BoxGeometry(50, 0.34, 0.58), standMat);
        tier.position.set(0, y - 0.2, z);
        tier.receiveShadow = true;
        this.scene.add(tier);
        const trim = new THREE.Mesh(new THREE.BoxGeometry(50, 0.035, 0.05), trimMat);
        trim.position.set(0, y, z - side * 0.27);
        this.scene.add(trim);
        for (let i = 0; i < 76; i += 1) {
          const x = -24 + i * 0.64 + (r % 2) * 0.12;
          if (Math.random() < 0.13) continue;
          instances.push({ x, y: y + 0.17, z: z + (Math.random() - 0.5) * 0.1, color: colours[Math.floor(Math.random() * colours.length)], rot: side < 0 ? Math.PI : 0 });
        }
      }
    }
    // end stands
    for (const side of [-1, 1]) {
      for (let r = 0; r < 7; r += 1) {
        const x = side * (23.2 + r * 0.62);
        const y = 0.34 + r * 0.32;
        const tier = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.36, 35), standMat);
        tier.position.set(x, y - 0.2, 0);
        this.scene.add(tier);
        for (let i = 0; i < 42; i += 1) {
          const z = -10.5 + i * 0.51;
          if (Math.random() < 0.18) continue;
          instances.push({ x: x + (Math.random() - 0.5) * 0.1, y: y + 0.17, z, color: colours[Math.floor(Math.random() * colours.length)], rot: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
        }
      }
    }
    const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, instances.length);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    instances.forEach((item, i) => {
      dummy.position.set(item.x, item.y, item.z);
      dummy.rotation.y = item.rot;
      dummy.updateMatrix();
      crowd.setMatrixAt(i, dummy.matrix);
      color.set(item.color);
      crowd.setColorAt(i, color);
    });
    crowd.instanceMatrix.needsUpdate = true;
    crowd.instanceColor.needsUpdate = true;
    this.scene.add(crowd);

    // far side wall and roof structure
    const wall = new THREE.Mesh(new THREE.BoxGeometry(52, 8, 0.5), new THREE.MeshStandardMaterial({ color: 0x04141b, roughness: 0.85 }));
    wall.position.set(0, 4, -18.7);
    this.scene.add(wall);
    const roofBeamMat = new THREE.MeshStandardMaterial({ color: 0x0b2028, metalness: 0.7, roughness: 0.42 });
    for (let x = -22; x <= 22; x += 5.5) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 16), roofBeamMat);
      beam.position.set(x, 11.7, -5.5);
      beam.rotation.x = -0.08;
      this.scene.add(beam);
    }
    for (let i = 0; i < 3; i += 1) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(55, 0.18, 0.18), roofBeamMat);
      beam.position.set(0, 11.8 + i * 0.25, -12.5 + i * 0.1);
      this.scene.add(beam);
    }

    // hanging jumbotron
    const screenFrame = new THREE.Mesh(new THREE.BoxGeometry(9.4, 2.7, 0.35), new THREE.MeshStandardMaterial({ color: 0x02090c, metalness: 0.6, roughness: 0.35 }));
    screenFrame.position.set(0, 8.35, -17.9);
    this.scene.add(screenFrame);
    this.screen = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 2.3),
      new THREE.MeshBasicMaterial({ color: 0x05151c }),
    );
    this.screen.position.set(0, 8.35, -17.7);
    this.scene.add(this.screen);
    this.screenLight = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xd9ff43 }),
    );
    this.screenLight.position.set(0, 7.18, -17.68);
    this.scene.add(this.screenLight);
    for (let x = -4; x <= 4; x += 2) {
      const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.1, 5), roofBeamMat);
      hanger.position.set(x, 9.85, -17.9);
      this.scene.add(hanger);
    }
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight(0x8ee3df, 0x071512, 0.85);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff8df, 2.5);
    key.position.set(9, 28, 10);
    key.castShadow = this.quality === 'high';
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -28;
    key.shadow.camera.right = 28;
    key.shadow.camera.top = 24;
    key.shadow.camera.bottom = -24;
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 65;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.02;
    this.scene.add(key);
    this.scene.add(key.target);
    key.target.position.set(0, 0, 0);

    const fill = new THREE.DirectionalLight(0x76e7e0, 0.55);
    fill.position.set(-14, 12, -12);
    this.scene.add(fill);

    const lightMat = new THREE.MeshBasicMaterial({ color: 0xd9ff43 });
    const housing = new THREE.MeshStandardMaterial({ color: 0x051318, metalness: 0.6, roughness: 0.3 });
    const positions = [[-18, 12.5, 12.5], [18, 12.5, 12.5], [-18, 12.5, -12.5], [18, 12.5, -12.5]];
    positions.forEach(([x, y, z]) => {
      const box = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 0.45), housing);
      box.position.set(x, y, z);
      box.lookAt(0, 0, 0);
      this.scene.add(box);
      for (let i = -1; i <= 1; i += 1) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 0.06), lightMat);
        lamp.position.set(x + i * 0.68, y, z + (z > 0 ? -0.26 : 0.26));
        lamp.lookAt(0, 0, 0);
        this.scene.add(lamp);
      }
      const spot = new THREE.PointLight(0xd9ffb8, 34, 32, 1.8);
      spot.position.set(x * 0.75, 9, z * 0.55);
      spot.visible = this.quality === 'high';
      this.qualityEffects.push(spot);
      this.scene.add(spot);
    });

    // light shafts
    const shaftMat = new THREE.MeshBasicMaterial({
      color: 0xcfffb0,
      transparent: true,
      opacity: 0.025,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (const [x, y, z] of positions) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(4.3, 18, 20, 1, true), shaftMat);
      cone.position.set(x * 0.7, y - 8, z * 0.55);
      cone.rotation.z = x > 0 ? 0.15 : -0.15;
      cone.visible = this.quality === 'high';
      this.qualityEffects.push(cone);
      this.scene.add(cone);
    }

    // dust motes in the beams
    const moteGeo = new THREE.BufferGeometry();
    const motePos = new Float32Array(420 * 3);
    for (let i = 0; i < 420; i += 1) {
      motePos[i * 3] = (Math.random() - 0.5) * 40;
      motePos[i * 3 + 1] = Math.random() * 10 + 2;
      motePos[i * 3 + 2] = (Math.random() - 0.5) * 20;
    }
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
    const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ color: 0xcaffb0, size: 0.035, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending }));
    this.scene.add(motes);
  }

  buildBall() {
    const texture = makeBallTexture();
    const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.42, metalness: 0.04 });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(COURT.ballRadius, 20, 14), mat);
    this.ball.castShadow = true;
    this.ball.position.set(0, COURT.ballRadius, 0);
    this.scene.add(this.ball);

    const glow = new THREE.PointLight(0xf5ffce, 1.8, 4, 2);
    glow.position.set(0, 0.3, 0);
    this.ball.add(glow);

    const trailGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(22 * 3);
    trailGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xd9ff43, transparent: true, opacity: 0 }));
    this.trail.frustumCulled = false;
    this.scene.add(this.trail);
  }

  buildConfetti() {
    const count = 260;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({ size: 0.13, vertexColors: true, transparent: true, opacity: 0, depthWrite: false });
    this.confetti = new THREE.Points(geo, mat);
    this.confetti.frustumCulled = false;
    this.scene.add(this.confetti);
    this.confettiData = [];
  }

  setMenuTeams(home, away) {
    this.homeTeam = home;
    this.awayTeam = away;
    this.setScreenTeam(home, away);
    this.buildShowcase();
  }

  setScreenTeam(home, away) {
    if (this.screen) {
      const old = this.screen.material.map;
      this.screen.material.map = makeBannerTexture(home, away);
      this.screen.material.needsUpdate = true;
      old?.dispose();
    }
  }

  createPlayerView(player, team, isGk, isHome) {
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const ink = team.ink || '#071215';
    const shirtMat = new THREE.MeshStandardMaterial({ color: isGk ? team.kit.gk : team.kit.shirt, roughness: 0.72, metalness: 0.02 });
    const sleeveMat = new THREE.MeshStandardMaterial({ color: isGk ? team.kit.gk : team.kit.sleeve, roughness: 0.72 });
    const shortsMat = new THREE.MeshStandardMaterial({ color: isGk ? '#1b2730' : team.kit.shorts, roughness: 0.75 });
    const sockMat = new THREE.MeshStandardMaterial({ color: isGk ? team.kit.gk : team.kit.socks, roughness: 0.78 });
    const skinPalette = ['#8d583d', '#b87750', '#d09a72', '#6f452f', '#c88b60', '#e1b089'];
    const skinMat = new THREE.MeshStandardMaterial({ color: skinPalette[player.index % skinPalette.length], roughness: 0.82 });
    const hairMat = new THREE.MeshStandardMaterial({ color: player.index % 3 === 0 ? '#211814' : player.index % 3 === 1 ? '#0b0f11' : '#53362a', roughness: 0.94 });

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.5, 7), shirtMat);
    torso.position.y = 1.15;
    torso.castShadow = true;
    body.add(torso);
    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.23, 0.14, 7), sleeveMat);
    shoulder.position.y = 1.34;
    body.add(shoulder);
    const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.24, 0.26, 7), shortsMat);
    shorts.position.y = 0.81;
    body.add(shorts);
    const shortsTrim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.035, 0.02), new THREE.MeshBasicMaterial({ color: team.accent }));
    shortsTrim.position.set(0, 0.86, 0.205);
    body.add(shortsTrim);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 10, 7), skinMat);
    head.position.y = 1.55;
    head.castShadow = true;
    body.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 5, 0, TAU, 0, Math.PI * 0.58), hairMat);
    hair.position.y = 1.582;
    hair.scale.set(1.045, 0.86, 1.045);
    body.add(hair);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.08, 0.12, 6), skinMat);
    neck.position.y = 1.42;
    body.add(neck);

    const leftLeg = new THREE.Group();
    const rightLeg = new THREE.Group();
    leftLeg.position.set(-0.115, 0.74, 0);
    rightLeg.position.set(0.115, 0.74, 0);
    for (const [leg, x] of [[leftLeg, -1], [rightLeg, 1]]) {
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.082, 0.4, 3, 6), sockMat);
      thigh.position.y = -0.25;
      thigh.castShadow = true;
      leg.add(thigh);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.1, 0.27), new THREE.MeshStandardMaterial({ color: 0x0b1114, roughness: 0.5, metalness: 0.3 }));
      boot.position.set(0, -0.51, 0.07);
      boot.castShadow = true;
      leg.add(boot);
      body.add(leg);
    }

    const leftArm = new THREE.Group();
    const rightArm = new THREE.Group();
    leftArm.position.set(-0.285, 1.33, 0);
    rightArm.position.set(0.285, 1.33, 0);
    for (const [arm, side] of [[leftArm, -1], [rightArm, 1]]) {
      const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.34, 3, 6), skinMat);
      limb.position.y = -0.19;
      limb.castShadow = true;
      arm.add(limb);
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.077, 0.09, 0.15, 6), sleeveMat);
      sleeve.position.y = -0.03;
      arm.add(sleeve);
      arm.rotation.z = side * -0.12;
      body.add(arm);
    }
    if (isGk) {
      for (const [arm, side] of [[leftArm, -1], [rightArm, 1]]) {
        const glove = new THREE.Mesh(new THREE.SphereGeometry(0.085, 6, 5), new THREE.MeshStandardMaterial({ color: 0xd9ff43, roughness: 0.65 }));
        glove.position.set(0, -0.4, 0.015);
        arm.add(glove);
      }
    }

    const number = new THREE.Mesh(
      new THREE.PlaneGeometry(0.27, 0.34),
      new THREE.MeshBasicMaterial({ map: makeNumberTexture(player.number, ink), transparent: true, depthWrite: false }),
    );
    number.position.set(0, 1.14, -0.208);
    number.rotation.y = Math.PI;
    body.add(number);

    const ringMat = new THREE.MeshBasicMaterial({ color: isHome ? 0xd9ff43 : 0x47f2d0, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.48, 0.61, 32), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.028;
    root.add(ring);
    const arrowMat = new THREE.MeshBasicMaterial({ color: isHome ? 0xd9ff43 : 0x47f2d0, transparent: true, opacity: 0.95 });
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.115, 0.24, 3), arrowMat);
    arrow.position.y = 2.14;
    arrow.rotation.z = Math.PI;
    root.add(arrow);

    this.playerGroup.add(root);
    const view = { root, body, leftLeg, rightLeg, leftArm, rightArm, ring, arrow, phase: Math.random() * TAU, speed: 0, player, team, isGk };
    this.playerViews.set(player.id, view);
    return view;
  }

  buildShowcase() {
    for (const view of this.playerViews.values()) {
      this.playerGroup.remove(view.root);
      view.root.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose?.();
      });
    }
    this.playerViews.clear();
    if (!this.homeTeam) return;
    const kick = [
      { role: 'GK', x: -17.5, z: 0 },
      { role: 'LB', x: -7, z: -4.8 },
      { role: 'RB', x: -7, z: 4.8 },
      { role: 'CM', x: 0.5, z: 0.5 },
      { role: 'ST', x: 6, z: -1.6 },
    ];
    const fake = [];
    for (let t = 0; t < 2; t += 1) {
      const team = t === 0 ? this.homeTeam : this.awayTeam;
      for (let i = 0; i < 5; i += 1) {
        finalPos(fake, t, i, kick, team);
      }
    }
    this.showcasePlayers = fake;
    for (const p of fake) {
      this.createPlayerView(p, p.teamObj, p.role === 'GK', p.teamIndex === 0);
    }
    this.menuBallPos = new THREE.Vector3(0, COURT.ballRadius, 0);
  }

  setMatchPlayers(players, homeTeam, awayTeam) {
    this.homeTeam = homeTeam;
    this.awayTeam = awayTeam;
    for (const view of this.playerViews.values()) {
      this.playerGroup.remove(view.root);
    }
    this.playerViews.clear();
    for (const p of players) {
      const team = p.team === 0 ? homeTeam : awayTeam;
      this.createPlayerView(p, team, p.role === 'GK', p.team === 0);
    }
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'menu') {
      this.buildShowcase();
    }
  }

  updateMenu(dt, now, selectedTeam) {
    this.menuPhase += dt;
    const t = now * 0.00009;
    const bob = Math.sin(now * 0.00045);
    const target = new THREE.Vector3(0, 0.6, 0);
    const cam = new THREE.Vector3(
      Math.sin(t * 1.7 + 0.6) * 14.5,
      8.3 + bob * 0.35,
      18.5 + Math.cos(t * 1.25) * 3.5,
    );
    this.camera.position.lerp(cam, 1 - Math.exp(-1.5 * dt));
    this.cameraTarget.lerp(target, 1 - Math.exp(-1.6 * dt));
    this.camera.lookAt(this.cameraTarget);
    if (this.showcasePlayers) {
      for (const p of this.showcasePlayers) {
        const view = this.playerViews.get(p.id);
        if (!view) continue;
        const idx = p.index;
        const sway = Math.sin(now * 0.0011 + idx * 1.7) * 0.12;
        view.root.position.x = p.x;
        view.root.position.z = p.z;
        view.root.rotation.y = Math.PI / 2 - p.dir;
        view.body.position.y = Math.sin(now * 0.0018 + idx) * 0.008;
        view.leftArm.rotation.x = sway;
        view.rightArm.rotation.x = -sway;
        view.leftLeg.rotation.x = -sway * 0.6;
        view.rightLeg.rotation.x = sway * 0.6;
      }
      const ball = this.ball;
      ball.position.y = COURT.ballRadius + Math.abs(Math.sin(now * 0.0022)) * 0.35;
      ball.position.x = Math.sin(now * 0.0007) * 0.2;
      ball.rotation.z += dt * 0.7;
    }
    this.updateConfetti(dt);
    if (this.confetti) this.confetti.material.opacity = Math.max(0, this.confetti.material.opacity - dt * 0.7);
  }

  updateGame(state, dt, now, ownTeam, cameraMode = 'game') {
    this.lastState = state;
    for (const p of state.players) {
      let view = this.playerViews.get(p.id);
      if (!view) {
        const team = p.team === 0 ? this.homeTeam : this.awayTeam;
        view = this.createPlayerView(p, team, p.role === 'GK', p.team === 0);
      }
      view.root.position.x = lerp(view.root.position.x, p.x, 1 - Math.exp(-26 * dt));
      view.root.position.z = lerp(view.root.position.z, p.z, 1 - Math.exp(-26 * dt));
      const wantedRot = Math.PI / 2 - p.dir;
      view.root.rotation.y = angleLerp(view.root.rotation.y, wantedRot, 1 - Math.exp(-16 * dt));
      const speed = Math.hypot(p.vx || 0, p.vz || 0);
      view.speed = lerp(view.speed, speed, 1 - Math.exp(-10 * dt));
      this.animatePlayer(view, p, dt, now);
      const controlled = state.active && state.active[p.team] === p.id && p.team === ownTeam;
      view.ring.visible = controlled;
      view.arrow.visible = controlled;
      if (controlled) {
        const pulse = 1 + Math.sin(now * 0.004) * 0.08;
        view.ring.scale.setScalar(pulse);
        view.arrow.position.y = 2.14 + Math.sin(now * 0.004) * 0.05;
      }
    }
    const ball = this.ball;
    ball.position.set(state.ball.x, state.ball.y, state.ball.z);
    ball.rotation.x += (state.ball.vz || 0) * dt * 3.1;
    ball.rotation.z -= (state.ball.vx || 0) * dt * 3.1;
    this.updateTrail(state, dt);
    this.updateConfetti(dt);
    this.updateCamera(state, dt, now, cameraMode);
    // crowd excitement drives ambient through CSS? handled by audio
  }

  animatePlayer(view, p, dt, now) {
    const speed = view.speed || 0;
    const action = p.action || 0;
    const actionT = p.actionT || 0;
    const moving = speed > 0.35;
    const runSpeed = clamp(speed / 5.4, 0.25, 1.5);
    view.phase += dt * (moving ? 8 + runSpeed * 5 : 2.2);
    let swing = moving ? Math.sin(view.phase) * (0.48 + runSpeed * 0.2) : Math.sin(view.phase) * 0.025;
    let armSwing = moving ? -Math.sin(view.phase) * (0.38 + runSpeed * 0.18) : Math.sin(view.phase * 0.7) * 0.02;
    let bodyY = moving ? Math.abs(Math.sin(view.phase * 2)) * 0.022 : Math.sin(now * 0.002 + p.index) * 0.006;
    let lean = moving ? 0.08 + runSpeed * 0.055 : 0;
    let bodyRot = 0;
    let bodyZ = 0;
    view.body.position.y = bodyY;
    view.body.rotation.x = lean;
    view.body.rotation.z = 0;
    view.body.rotation.y = 0;
    view.root.position.y = 0;

    if (action === ACTION.kick || action === ACTION.shoot || action === ACTION.pass) {
      const kickPhase = Math.sin(clamp(1 - actionT / 0.28, 0, 1) * Math.PI);
      swing = kickPhase * 0.9;
      armSwing = -kickPhase * 0.7;
      bodyRot = kickPhase * 0.12;
    } else if (action === ACTION.slide) {
      const p2 = clamp(actionT / 0.55, 0, 1);
      view.root.position.y = 0.16 + p2 * 0.18;
      view.body.rotation.z = -1.02 + p2 * 0.15;
      view.body.rotation.x = -0.25;
      swing = 0.35;
      armSwing = 0.5;
    } else if (action === ACTION.dive) {
      const p2 = clamp(actionT / 0.55, 0, 1);
      view.root.position.y = 0.25;
      view.body.rotation.z = (p.goalSide || 1) * (-1.12 + p2 * 0.3);
      bodyZ = 0;
      swing = 0.4;
      armSwing = 0.85;
    } else if (action === ACTION.hurt) {
      view.body.rotation.z = 0.2;
      bodyY = 0.03;
    } else if (action === ACTION.celebrate) {
      const hop = Math.abs(Math.sin(now * 0.011 + p.index));
      view.root.position.y = hop * 0.28;
      view.body.rotation.x = -0.1;
      view.leftArm.rotation.x = Math.PI * 0.82;
      view.rightArm.rotation.x = Math.PI * 0.82;
      view.leftArm.rotation.z = -0.3;
      view.rightArm.rotation.z = 0.3;
      view.leftLeg.rotation.x = -0.2;
      view.rightLeg.rotation.x = 0.2;
      return;
    }
    view.leftLeg.rotation.x = swing;
    view.rightLeg.rotation.x = -swing;
    view.leftArm.rotation.x = armSwing;
    view.rightArm.rotation.x = -armSwing;
    view.leftArm.rotation.z = -0.12;
    view.rightArm.rotation.z = 0.12;
    view.body.rotation.y = bodyRot;
    view.body.rotation.z = bodyZ;
  }

  updateTrail(state, dt) {
    const speed = Math.hypot(state.ball.vx || 0, state.ball.vz || 0) + Math.abs(state.ball.vy || 0);
    this.ballTrailPositions.unshift(new THREE.Vector3(state.ball.x, state.ball.y, state.ball.z));
    if (this.ballTrailPositions.length > 22) this.ballTrailPositions.pop();
    const attr = this.trail.geometry.getAttribute('position');
    this.ballTrailPositions.forEach((v, i) => {
      attr.setXYZ(i, v.x, v.y, v.z);
    });
    for (let i = this.ballTrailPositions.length; i < 22; i += 1) {
      const last = this.ballTrailPositions[this.ballTrailPositions.length - 1] || new THREE.Vector3();
      attr.setXYZ(i, last.x, last.y, last.z);
    }
    attr.needsUpdate = true;
    this.trail.material.opacity = lerp(this.trail.material.opacity, clamp((speed - 9) / 20, 0, 0.5), 0.2);
  }

  updateCamera(state, dt, now, cameraMode) {
    let camX;
    let camY;
    let camZ;
    let lookX;
    let lookY;
    let lookZ;
    const ball = state.ball;
    if (state.phase === PHASE.goal) {
      const side = state.lastGoalTeam === 0 ? 1 : -1;
      camX = side * 13.6;
      camY = 7.9;
      camZ = ball.z * 0.3 + 9.5;
      lookX = side * 19.7;
      lookY = 0.8;
      lookZ = ball.z * 0.3;
      camY += Math.sin(now * 0.002) * 0.12;
    } else if (state.phase === PHASE.halftime || state.phase === PHASE.fulltime) {
      const t = now * 0.00008;
      camX = Math.sin(t) * 9;
      camY = 10.5;
      camZ = 20.5;
      lookX = 0;
      lookY = 0;
      lookZ = 0;
    } else {
      camX = clamp(ball.x * 0.5, -7.6, 7.6);
      camY = 13.8 + clamp(Math.abs(ball.x) - 12, 0, 7) * 0.17;
      camZ = 18.4;
      lookX = lerp(ball.x * 0.62, 0, 0.2);
      lookY = 0.6;
      lookZ = ball.z * 0.3;
    }
    if (cameraMode === 'wide') {
      camX = 0;
      camY = 15.2;
      camZ = 23.5;
      lookX = 0;
      lookY = 0.5;
      lookZ = 0;
    }
    const damping = 1 - Math.exp(-3.5 * dt);
    this.camera.position.x = lerp(this.camera.position.x, camX, damping);
    this.camera.position.y = lerp(this.camera.position.y, camY, damping);
    this.camera.position.z = lerp(this.camera.position.z, camZ, damping);
    this.cameraTarget.x = lerp(this.cameraTarget.x, lookX, damping);
    this.cameraTarget.y = lerp(this.cameraTarget.y, lookY, damping);
    this.cameraTarget.z = lerp(this.cameraTarget.z, lookZ, damping);
    if (this.shake > 0.001) {
      this.shake *= Math.exp(-4.5 * dt);
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.5;
    } else this.shake = 0;
    this.camera.lookAt(this.cameraTarget);
  }

  addShake(amount) {
    this.shake = Math.min(0.5, this.shake + amount);
  }

  celebrate(team) {
    const side = team === 0 ? 1 : -1;
    const origin = new THREE.Vector3(side * 18.5, 1.2, (Math.random() - 0.5) * 2);
    this.confettiData = [];
    const colors = [new THREE.Color(0xd9ff43), new THREE.Color(0x47f2d0), new THREE.Color(0xff705d), new THREE.Color(0xffffff)];
    const positions = this.confetti.geometry.getAttribute('position');
    const colorAttr = this.confetti.geometry.getAttribute('color');
    for (let i = 0; i < 260; i += 1) {
      positions.setXYZ(i, origin.x + (Math.random() - 0.5) * 2, origin.y + Math.random() * 2, origin.z + (Math.random() - 0.5) * 3);
      const c = colors[i % colors.length];
      colorAttr.setXYZ(i, c.r, c.g, c.b);
      this.confettiData.push({
        x: origin.x, y: origin.y + Math.random() * 2, z: origin.z + (Math.random() - 0.5) * 3,
        vx: (Math.random() - 0.5) * 5 - side * Math.random() * 2,
        vy: Math.random() * 6 + 2,
        vz: (Math.random() - 0.5) * 8,
      });
    }
    positions.needsUpdate = true;
    colorAttr.needsUpdate = true;
    this.confetti.material.opacity = 1;
    this.shake = 0.22;
    this.netPulse = 1;
  }

  updateConfetti(dt) {
    if (!this.confettiData || this.confetti.material.opacity <= 0) return;
    const positions = this.confetti.geometry.getAttribute('position');
    for (let i = 0; i < this.confettiData.length; i += 1) {
      const p = this.confettiData[i];
      p.vy -= 8.5 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.1) {
        p.y = 0.1;
        p.vy *= -0.25;
        p.vx *= 0.8;
        p.vz *= 0.8;
      }
      positions.setXYZ(i, p.x, p.y, p.z);
    }
    positions.needsUpdate = true;
    this.confetti.material.opacity = Math.max(0, this.confetti.material.opacity - dt * 0.22);
  }

  flashGoal() {
    this.addShake(0.18);
  }

  render() {
    this.renderFrame = (this.renderFrame + 1) % 2;
    if (this.quality !== 'high' && this.renderFrame) return;
    this.renderer.render(this.scene, this.camera);
  }

  setQuality(quality) {
    this.quality = quality;
    const high = quality === 'high';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 1.5 : 0.75));
    this.renderer.shadowMap.enabled = high;
    this.renderer.shadowMap.needsUpdate = true;
    this.qualityEffects.forEach((effect) => { effect.visible = high; });
    this.resize();
  }
}

function finalPos(arr, teamIndex, index, kick, team) {
  const p = kick[index];
  const teamDir = teamIndex === 0 ? 1 : -1;
  const id = `${teamIndex}-${index}`;
  arr.push({
    id,
    index,
    team: teamIndex,
    teamIndex,
    teamObj: team,
    role: p.role,
    number: team.numbers[index],
    name: team.names[index],
    x: p.x * teamDir,
    z: p.z,
    dir: teamDir > 0 ? 0 : Math.PI,
  });
}
