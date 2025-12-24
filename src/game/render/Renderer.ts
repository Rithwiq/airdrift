import * as THREE from "three";

export class Renderer {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 5000);
  renderer = new THREE.WebGLRenderer({ antialias: true });

  // Atmosphere
  private skyDome!: THREE.Mesh;
  private sunLight!: THREE.DirectionalLight;
  private ambient!: THREE.AmbientLight;
  private hemi!: THREE.HemisphereLight; // ✅ NEW: city visibility fill
  private sunSprite!: THREE.Sprite;

  // Clouds
  private clouds!: THREE.Mesh;
  private cloudMat!: THREE.MeshBasicMaterial;
  private cloudTex!: THREE.CanvasTexture;
  private cloudOffset = new THREE.Vector2(0, 0);

  // Day/Night
  private day = 0.22; // ✅ start slightly brighter than before (still "night")
  private keyState = new Set<string>();

  constructor() {
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    // Keep SRGB + ACES (your look) but boost exposure a bit
    // @ts-ignore
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // @ts-ignore
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // ✅ was 1.1; too dark + foggy for dark city materials
    // @ts-ignore
    this.renderer.toneMappingExposure = 1.55;

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.renderer.domElement.style.position = "fixed";
    this.renderer.domElement.style.inset = "0";
    this.renderer.domElement.style.display = "block";
    document.body.appendChild(this.renderer.domElement);

    // ✅ Fog fix: push fog way farther and tint slightly lighter than background
    this.scene.background = new THREE.Color("#0b1220");
    this.scene.fog = new THREE.Fog("#111a2a", 140, 950);

    this.camera.position.set(0, 4, 10);
    this.camera.lookAt(0, 2, 0);

    this.addSkyDome();
    this.addLights();
    this.addSunHaze();
    this.addCloudLayer();
    this.addDayNightControls();

    this.applyDayNight();
    this.emitDayNight();

    window.addEventListener("resize", this.onResize);
  }

  update(dt: number) {
    this.skyDome.position.copy(this.camera.position);

    // Clouds drift
    this.cloudOffset.x += dt * 0.0035;
    this.cloudOffset.y += dt * 0.0018;
    if (this.cloudOffset.x > 1) this.cloudOffset.x -= 1;
    if (this.cloudOffset.y > 1) this.cloudOffset.y -= 1;

    this.cloudMat.map!.offset.set(this.cloudOffset.x, this.cloudOffset.y);

    const speed = dt * 0.6;
    let changed = false;

    if (this.keyState.has("BracketLeft")) {
      this.day = Math.max(0, this.day - speed);
      changed = true;
    }
    if (this.keyState.has("BracketRight")) {
      this.day = Math.min(1, this.day + speed);
      changed = true;
    }

    if (changed) {
      this.applyDayNight();
      this.emitDayNight();
    }

    // Clouds above camera
    const cam = this.camera.position;
    this.clouds.position.set(cam.x, 60, cam.z);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  // =========================
  // Sky dome (your original gradient version)
  // =========================
  private addSkyDome() {
    const skyGeo = new THREE.SphereGeometry(1200, 24, 16);

    const top = new THREE.Color("#070b14");
    const mid = new THREE.Color("#0b1220");
    const bot = new THREE.Color("#1c2d4d");

    const pos = skyGeo.attributes.position;
    const colors: number[] = [];

    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = THREE.MathUtils.clamp((y / 1200 + 1) / 2, 0, 1);

      const c = new THREE.Color();
      if (t < 0.55) c.copy(bot).lerp(mid, t / 0.55);
      else c.copy(mid).lerp(top, (t - 0.55) / 0.45);

      colors.push(c.r, c.g, c.b);
    }

    skyGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    const skyMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      depthWrite: false,
    });

    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.skyDome.frustumCulled = false;
    this.scene.add(this.skyDome);
  }

  // =========================
  // Lights (FIXED)
  // =========================
  private addLights() {
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(30, 55, 25);
    sun.castShadow = true;

    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.00015;
    sun.shadow.normalBias = 0.02;

    const d = 180; // ✅ slightly larger for city chunks
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 520;

    this.scene.add(sun);
    this.sunLight = sun;

    // ✅ Hemisphere light = makes dark objects readable even at night
    this.hemi = new THREE.HemisphereLight(
      new THREE.Color("#9fb7ff"), // sky tint
      new THREE.Color("#121722"), // ground tint
      0.55 // base intensity (day/night scales this)
    );
    this.scene.add(this.hemi);

    // ✅ Ambient a bit stronger
    this.ambient = new THREE.AmbientLight(0xffffff, 0.45);
    this.scene.add(this.ambient);
  }

  // =========================
  // Sun haze (your original)
  // =========================
  private addSunHaze() {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);

    g.addColorStop(0.0, "rgba(255, 245, 210, 0.98)");
    g.addColorStop(0.18, "rgba(255, 220, 160, 0.45)");
    g.addColorStop(1.0, "rgba(255, 160, 80, 0.0)");

    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;

    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.65,
    });

    const sprite = new THREE.Sprite(mat);

    const sunDir = new THREE.Vector3().copy(this.sunLight.position).normalize();
    sprite.position.copy(sunDir.multiplyScalar(650));
    sprite.scale.set(220, 220, 1);

    this.scene.add(sprite);
    this.sunSprite = sprite;
  }

  // =========================
  // Clouds (your original)
  // =========================
  private addCloudLayer() {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;

    ctx.clearRect(0, 0, 512, 512);

    for (let i = 0; i < 220; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const r = 18 + Math.random() * 55;

      const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, "rgba(255,255,255,0.16)");
      grd.addColorStop(0.6, "rgba(255,255,255,0.07)");
      grd.addColorStop(1, "rgba(255,255,255,0.0)");

      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 0.65;
    ctx.drawImage(canvas, 2, 2);
    ctx.globalAlpha = 1.0;

    this.cloudTex = new THREE.CanvasTexture(canvas);
    this.cloudTex.wrapS = THREE.RepeatWrapping;
    this.cloudTex.wrapT = THREE.RepeatWrapping;
    this.cloudTex.repeat.set(8, 8);

    this.cloudMat = new THREE.MeshBasicMaterial({
      map: this.cloudTex,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });

    const geo = new THREE.PlaneGeometry(1000, 1000, 1, 1);
    geo.rotateX(-Math.PI / 2);

    this.clouds = new THREE.Mesh(geo, this.cloudMat);
    this.clouds.position.set(0, 60, 0);
    this.clouds.renderOrder = 10;

    this.scene.add(this.clouds);
  }

  // =========================
  // Day/Night (FIXED visibility)
  // =========================
  private applyDayNight() {
    const t = this.day;

    const nightSky = new THREE.Color("#0b1220");
    const nightFog = new THREE.Color("#111a2a"); // ✅ lighter than sky = readable silhouettes

    const daySky = new THREE.Color("#87bfff");
    const dayFog = new THREE.Color("#bfe6ff");

    const sky = nightSky.clone().lerp(daySky, t);
    const fog = nightFog.clone().lerp(dayFog, t);

    this.scene.background = sky;
    (this.scene.fog as THREE.Fog).color.copy(fog);

    // ✅ Push fog out so city is visible
    (this.scene.fog as THREE.Fog).near = THREE.MathUtils.lerp(140, 220, t);
    (this.scene.fog as THREE.Fog).far = THREE.MathUtils.lerp(950, 1600, t);

    // ✅ Lights scale better at night
    this.sunLight.intensity = THREE.MathUtils.lerp(1.0, 2.3, t);
    this.ambient.intensity = THREE.MathUtils.lerp(0.52, 0.75, t);
    this.hemi.intensity = THREE.MathUtils.lerp(0.70, 1.25, t);

    (this.sunSprite.material as THREE.SpriteMaterial).opacity = THREE.MathUtils.lerp(0.18, 0.85, t);
    this.cloudMat.opacity = THREE.MathUtils.lerp(0.45, 0.72, t);

    const nightSun = new THREE.Color("#cfd8ff");
    const daySun = new THREE.Color("#fff2d2");
    this.sunLight.color.copy(nightSun.clone().lerp(daySun, t));
  }

  private emitDayNight() {
    const mode = this.day >= 0.55 ? "DAY" : "NIGHT";
    window.dispatchEvent(new CustomEvent("altnair:daynight", { detail: { mode, level: this.day } }));
  }

  private addDayNightControls() {
    const isDnKey = (code: string) => code === "KeyN" || code === "BracketLeft" || code === "BracketRight";

    const onDown = (e: KeyboardEvent) => {
      if (isDnKey(e.code)) {
        e.preventDefault();
        this.keyState.add(e.code);
      }

      if (e.code === "KeyN" && !e.repeat) {
        this.day = this.day > 0.5 ? 0.22 : 0.92; // ✅ night default now brighter
        this.applyDayNight();
        this.emitDayNight();
      }
    };

    const onUp = (e: KeyboardEvent) => {
      if (isDnKey(e.code)) {
        e.preventDefault();
        this.keyState.delete(e.code);
        this.emitDayNight();
      }
    };

    window.addEventListener("keydown", onDown, { passive: false });
    window.addEventListener("keyup", onUp, { passive: false });
    window.addEventListener("blur", () => this.keyState.clear());
  }

  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };
}