/* ============================================================
   3D-ФОН: ночь Хэллоуина на Three.js
   Небо с туманом и звёздами, Луна (настоящая текстура), тыквы-фонари
   с вырезанными лицами, привидения, стая летучих мышей, светлячки.
   Всё движение не зависит от частоты кадров: пружины считаются
   фиксированным шагом, сглаживание — через exp(-k·dt).
   ============================================================ */
const THREE = await import("../vendor/three.module.min.js")
  .catch(() => import("https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js"));

const canvas = document.getElementById("bg");
const isMobile = matchMedia("(pointer:coarse)").matches || innerWidth < 720;
const reduced = matchMedia("(prefers-reduced-motion:reduce)").matches;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, stencil: false, powerPreference: "high-performance" });
} catch (e) {
  document.documentElement.classList.add("no-webgl");
  throw e;
}
const params = new URLSearchParams(location.search);
const STILL = params.has("still");
const lite = params.has("lite");
const baseDPR = Math.min(devicePixelRatio || 1, isMobile ? 1 : 1.5);
renderer.setPixelRatio(lite ? Math.min(baseDPR, 0.75) : baseDPR);
if (lite) document.documentElement.classList.add("lite");
window.__bgInfo = `dpr ${renderer.getPixelRatio().toFixed(2)} · ${lite ? "lite" : "full"}${isMobile ? " · phone" : ""}`;
renderer.setSize(innerWidth, innerHeight, false);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 8.5);

/* ---------- небо: живой градиент, туманность и низкий туман ---------- */
const PALETTES = {
  intro:  { base: "#150c36", a: "#ff6a1f", b: "#6a2cd6", c: "#7dd36a", d: "#2a1c78" },
  quiz:   { base: "#120e34", a: "#ff5a1f", b: "#5a2ec8", c: "#86e07a", d: "#24206e" },
  result: { base: "#1e0a2a", a: "#ff2f5a", b: "#9a2cff", c: "#ffb34d", d: "#3e1058" },
  letter: { base: "#1e1016", a: "#ff8a2a", b: "#8a3a2a", c: "#ffd27a", d: "#3a1a46" },
  finale: { base: "#200b2e", a: "#ff7a1a", b: "#ff4fa0", c: "#ffd27a", d: "#6a2cd6" },
};
const bgUniforms = {
  uTime: { value: 0 }, uAspect: { value: innerWidth / innerHeight }, uExposure: { value: 1.05 },
  uFlash: { value: 0 }, uDim: { value: 0 },
  uBase: { value: new THREE.Color(PALETTES.intro.base) }, uA: { value: new THREE.Color(PALETTES.intro.a) },
  uB: { value: new THREE.Color(PALETTES.intro.b) }, uC: { value: new THREE.Color(PALETTES.intro.c) },
  uD: { value: new THREE.Color(PALETTES.intro.d) },
};
const bgMat = new THREE.ShaderMaterial({
  uniforms: bgUniforms, depthWrite: false, depthTest: false,
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform float uTime, uAspect, uExposure, uFlash, uDim; uniform vec3 uBase,uA,uB,uC,uD; varying vec2 vUv;
    vec3 RRTAndODTFit(vec3 v){ vec3 a=v*(v+0.0245786)-0.000090537; vec3 b=v*(0.983729*v+0.4329510)+0.238081; return a/b; }
    vec3 aces(vec3 c){
      const mat3 inM=mat3(vec3(0.59719,0.07600,0.02840),vec3(0.35458,0.90834,0.13383),vec3(0.04823,0.01566,0.83777));
      const mat3 outM=mat3(vec3(1.60475,-0.10208,-0.00327),vec3(-0.53108,1.10813,-0.07276),vec3(-0.07367,-0.00605,1.07602));
      c*=uExposure/0.6; c=inM*c; c=RRTAndODTFit(c); c=outM*c; return clamp(c,0.0,1.0);
    }
    vec3 toSRGB(vec3 c){ return mix(pow(c,vec3(0.41666))*1.055-vec3(0.055), c*12.92, vec3(lessThanEqual(c,vec3(0.0031308)))); }
    vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
    vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
    vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}
    float snoise(vec2 v){
      const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
      vec2 i=floor(v+dot(v,C.yy)); vec2 x0=v-i+dot(i,C.xx);
      vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
      vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1; i=mod289(i);
      vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
      vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0); m=m*m; m=m*m;
      vec3 x=2.0*fract(p*C.www)-1.0; vec3 h=abs(x)-0.5; vec3 ox=floor(x+0.5); vec3 a0=x-ox;
      m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
      vec3 g; g.x=a0.x*x0.x+h.x*x0.y; g.yz=a0.yz*x12.xz+h.yz*x12.yw; return 130.0*dot(m,g);
    }
    void main(){
      vec2 p=(vUv-0.5)*vec2(uAspect,1.0)*2.0; float t=uTime*0.05; float h=vUv.y;
      float n1=snoise(p*0.55+vec2(t,-t*0.4));
      float n2=snoise(p*1.0+vec2(-t*0.7,t*0.3)+n1*0.6);
      float n3=snoise(p*0.4+vec2(t*0.3,t*0.15)-n2*0.4);
      float n4=snoise(vec2(p.x*0.7+t*2.4,h*2.6-t*0.5)+n1*0.3);
      vec3 col=uBase;
      col=mix(col,uA,smoothstep(0.6,0.0,h)*0.5*(0.7+0.3*n3));              // зарево у горизонта
      col=mix(col,uB,smoothstep(0.05,1.0,n2)*0.45*smoothstep(1.05,0.2,h));  // цветной туман
      col=mix(col,uD,smoothstep(0.0,1.0,n3)*0.55*smoothstep(0.2,1.0,h));    // облака наверху
      col=mix(col,uC,smoothstep(0.45,1.0,n1)*0.08);                          // призрачные прожилки
      float fog=smoothstep(0.42,0.0,h)*(0.55+0.45*n4);
      col=mix(col,mix(uB,vec3(0.78,0.72,0.95),0.55),fog*0.24);              // низкий туман
      float v=smoothstep(2.3,0.2,length(p*vec2(0.85,1.1))); col*=mix(0.42,1.0,v);
      col*=1.0-0.78*uDim;
      col+=uFlash*vec3(0.5,0.56,0.9)*(0.5+0.5*h);
      col+=(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-0.5)/200.0;
      gl_FragColor=vec4(toSRGB(aces(col)),1.0);
    }`,
});
const bgScene = new THREE.Scene(), bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
bgScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat));
let bgRT = null;
const bgShow = new THREE.ShaderMaterial({
  uniforms: { map: { value: null } }, depthWrite: false, depthTest: false, toneMapped: false,
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D map; varying vec2 vUv; void main(){ gl_FragColor=texture2D(map,vUv); }`,
});
const bgPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bgShow);
bgPlane.position.z = -22; bgPlane.renderOrder = -2; scene.add(bgPlane);
let rtW = 0, rtH = 0;
function fitBg() {
  const d = camera.position.z - bgPlane.position.z;
  const h = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.25;
  bgPlane.scale.set(h * camera.aspect, h, 1);
  bgUniforms.uAspect.value = camera.aspect;
  const k = isMobile ? 0.34 : 0.45, w = Math.max(96, Math.round(innerWidth * k)), hh = Math.max(96, Math.round(innerHeight * k));
  if (bgRT && w === rtW && hh === rtH) return;
  rtW = w; rtH = hh;
  if (bgRT) bgRT.dispose();
  bgRT = new THREE.WebGLRenderTarget(w, hh, { depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  bgShow.uniforms.map.value = bgRT.texture;
}

/* ---------- мягкая текстура-точка ---------- */
function softTexture(inner = 0.35) {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(inner, "rgba(255,255,255,.55)"); grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const sprite = softTexture();
const haloTex = softTexture(0.12);

/* ---------- звёзды (мерцают) ---------- */
const STAR_N = isMobile ? 150 : 260;
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(STAR_N * 3), starSeed = new Float32Array(STAR_N);
for (let i = 0; i < STAR_N; i++) {
  starPos[i * 3] = (Math.random() - 0.5) * 46; starPos[i * 3 + 1] = -1 + Math.pow(Math.random(), 0.7) * 13; starPos[i * 3 + 2] = -18;
  starSeed[i] = Math.random();
}
starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
starGeo.setAttribute("aSeed", new THREE.BufferAttribute(starSeed, 1));
const starMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uScale: { value: 400 }, uDim: { value: 0 } },
  vertexShader: `
    attribute float aSeed; uniform float uTime, uScale; varying float vA;
    void main(){
      vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
      float tw = 0.55 + 0.45 * sin(uTime * (0.8 + aSeed * 2.2) + aSeed * 40.0);
      vA = tw * (0.35 + 0.65 * aSeed);
      gl_PointSize = (0.05 + 0.09 * aSeed * aSeed) * uScale / -mv.z * (0.8 + 0.4 * tw);
    }`,
  fragmentShader: `
    uniform float uDim; varying float vA;
    void main(){ float r = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, r); a *= a;
      gl_FragColor = vec4(vec3(1.0, 0.95, 0.85), a * vA * (1.0 - 0.85 * uDim));
      #include <colorspace_fragment>
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
});
const stars = new THREE.Points(starGeo, starMat); stars.renderOrder = -1; stars.frustumCulled = false; scene.add(stars);

/* ---------- Луна: настоящая текстура (three.js examples) + ореол ---------- */
const moonTex = new THREE.TextureLoader().load("assets/moon.jpg");
moonTex.colorSpace = THREE.SRGBColorSpace;
const moonMat = new THREE.ShaderMaterial({
  uniforms: { map: { value: moonTex }, uTint: { value: new THREE.Color("#fff0c8") }, uDim: { value: 0 } },
  vertexShader: `varying vec2 vUv; varying vec3 vN; void main(){ vUv=uv; vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D map; uniform vec3 uTint; uniform float uDim; varying vec2 vUv; varying vec3 vN;
    void main(){
      vec3 n = normalize(vN); float ndv = max(n.z, 0.0);
      vec3 tex = texture2D(map, vUv).rgb;
      float lam = smoothstep(-0.4, 0.7, dot(n, normalize(vec3(-0.45, 0.35, 0.82))));
      vec3 col = tex * uTint * (0.4 + 0.8 * pow(ndv, 0.45)) * mix(0.5, 1.25, lam);
      col += uTint * pow(1.0 - ndv, 2.5) * 0.3;
      col *= 1.0 - 0.6 * uDim;
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`,
});
const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), moonMat);
moon.rotation.set(0.2, -1.9, 0);
const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0xffd9a0, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
halo.scale.setScalar(5.2);
moon.add(halo);

/* ---------- тыква-фонарь ----------
   Сфера с дольками; лицо вырезано в шейдере по исходным координатам сферы и светится свечой. */
function pumpkinGeo(seg, rings) {
  const g = new THREE.SphereGeometry(1, seg, rings), pos = g.attributes.position, n = pos.count;
  const groove = new Float32Array(n), orig = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    orig[i * 3] = x; orig[i * 3 + 1] = y; orig[i * 3 + 2] = z;
    const rib = Math.pow(Math.abs(Math.cos(Math.atan2(z, x) * 4)), 0.45); // широкие дольки, узкие бороздки
    const r = 0.88 + 0.12 * rib, k = 1 - 0.3 * Math.pow(Math.abs(y), 4);  // ямки сверху и снизу
    pos.setXYZ(i, x * r * 1.1, y * 0.8 * k, z * r * 1.1);
    groove[i] = 1 - rib;
  }
  g.computeVertexNormals();
  g.setAttribute("aGroove", new THREE.BufferAttribute(groove, 1));
  g.setAttribute("aOrig", new THREE.BufferAttribute(orig, 3));
  return g;
}
const PUMPKIN_VERT = `
  attribute float aGroove; attribute vec3 aOrig;
  varying vec3 vN, vV, vO; varying float vG;
  void main(){ vO = aOrig; vG = aGroove; vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const PUMPKIN_FRAG = `
  uniform vec3 uBody, uDark, uRim; uniform float uGlow, uDim;
  varying vec3 vN, vV, vO; varying float vG;
  float sdTri(vec2 p, float r){ const float k = 1.7320508; p.x = abs(p.x) - r; p.y = p.y + r / k;
    if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0; p.x -= clamp(p.x, -2.0 * r, 0.0); return -length(p) * sign(p.y); }
  float face(vec3 o){
    if (o.z < 0.12) return 1.0;
    vec2 q = o.xy / (0.55 + 0.45 * o.z);
    float eye = sdTri(vec2(abs(q.x) - 0.32, q.y - 0.2), 0.12);
    float nose = sdTri(vec2(q.x, q.y + 0.02), 0.05);
    float up = -0.15 + 0.5 * q.x * q.x, lo = -0.44 + 0.95 * q.x * q.x;
    float m = max(max(q.y - up, lo - q.y), abs(q.x) - 0.52);
    float t1 = max(abs(abs(q.x) - 0.2) - 0.055, max(q.y - up - 0.02, (up - 0.085) - q.y));
    float t2 = max(abs(q.x) - 0.06, max(q.y - (lo + 0.08), lo - 0.02 - q.y));
    m = max(m, -t1); m = max(m, -t2);
    return min(min(eye, nose), m);
  }
  void main(){
    vec3 n = normalize(vN), v = normalize(vV);
    float ndv = max(dot(n, v), 0.0);
    vec3 L = normalize(vec3(-0.5, 0.7, 0.6));
    float dif = max(dot(n, L), 0.0);
    vec3 base = mix(uBody, uDark, smoothstep(0.3, 1.0, vG) * 0.85);
    base *= 0.5 + 0.62 * dif;
    base += uRim * pow(1.0 - ndv, 2.4) * 0.6;
    base += vec3(1.0, 0.9, 0.7) * pow(max(dot(n, normalize(L + v)), 0.0), 40.0) * 0.22 * (1.0 - vG);
    base *= 1.0 - 0.6 * uDim;
    float d = face(vO);
    float inside = smoothstep(0.01, -0.01, d);
    vec3 hot = mix(vec3(1.0, 0.42, 0.04), vec3(1.0, 0.93, 0.55), smoothstep(0.0, -0.06, d));
    vec3 col = mix(base, hot * 1.5 * uGlow, inside);
    col += vec3(1.0, 0.5, 0.1) * smoothstep(0.1, 0.0, d) * (1.0 - inside) * 0.55 * uGlow;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;
function pumpkinMat() {
  return new THREE.ShaderMaterial({
    uniforms: { uBody: { value: new THREE.Color("#ff7a1a") }, uDark: { value: new THREE.Color("#8a2a06") }, uRim: { value: new THREE.Color("#ffb070") }, uGlow: { value: 1 }, uDim: { value: 0 } },
    vertexShader: PUMPKIN_VERT, fragmentShader: PUMPKIN_FRAG,
  });
}
const STEM_MAT = new THREE.ShaderMaterial({
  uniforms: { uDim: { value: 0 } },
  vertexShader: `varying vec3 vN; varying float vY; void main(){ vY = position.y; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float uDim; varying vec3 vN; varying float vY;
    void main(){ float dif = max(dot(normalize(vN), normalize(vec3(-0.5, 0.7, 0.6))), 0.0);
      vec3 c = mix(vec3(0.16, 0.24, 0.06), vec3(0.36, 0.5, 0.14), smoothstep(-0.2, 0.25, vY)) * (0.45 + 0.75 * dif) * (1.0 - 0.6 * uDim);
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`,
});
const stemGeo = (() => {
  const g = new THREE.CylinderGeometry(0.06, 0.1, 0.42, 10, 4), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + (y + 0.21) * (y + 0.21) * 0.45); }
  g.computeVertexNormals(); return g;
})();
const pGeo = pumpkinGeo(isMobile ? 56 : 72, isMobile ? 40 : 52);
function makePumpkin() {
  const m = new THREE.Mesh(pGeo, pumpkinMat());
  const stem = new THREE.Mesh(stemGeo, STEM_MAT); stem.position.set(0, 0.62, 0); stem.rotation.z = 0.12; m.add(stem);
  return m;
}

/* ---------- привидение ---------- */
const ghostGeo = (() => {
  const pts = [];
  for (let i = 0; i <= 20; i++) { const a = i / 20 * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(0.001, Math.sin(a) * 0.8), 0.32 + Math.cos(a) * 0.8)); }
  [[0.82, 0.1], [0.86, -0.2], [0.9, -0.5], [0.95, -0.78], [0.98, -0.92], [0.9, -0.97], [0.6, -0.87], [0.3, -0.81], [0.001, -0.79]]
    .forEach(([x, y]) => pts.push(new THREE.Vector2(x, y)));
  pts.reverse(); // снизу вверх — тогда нормали смотрят наружу
  return new THREE.LatheGeometry(pts, isMobile ? 40 : 56);
})();
const armGeo = (() => { const g = new THREE.SphereGeometry(1, 16, 12); g.scale(0.26, 0.12, 0.12); return g; })();
const GHOST_VERT = `
  uniform float uTime, uWave;
  varying vec3 vN, vV, vO;
  void main(){
    vec3 p = position; vO = position;
    float ph = atan(p.z, p.x);
    float k = smoothstep(-0.35, -0.95, p.y) * uWave;
    p.y += k * 0.09 * sin(ph * 6.0 + uTime * 3.2);
    p.xz *= 1.0 + k * 0.06 * sin(ph * 6.0 + uTime * 3.2 + 1.2);
    p.x += 0.06 * sin(uTime * 1.3 + p.y * 2.0) * smoothstep(0.6, -0.9, p.y) * uWave;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const GHOST_FRAG = `
  uniform vec3 uTint, uRim; uniform float uAlpha, uDim, uBlink;
  varying vec3 vN, vV, vO;
  void main(){
    vec3 n = normalize(vN), v = normalize(vV);
    float ndv = max(dot(n, v), 0.0), fr = pow(1.0 - ndv, 2.2);
    vec3 L = normalize(vec3(-0.4, 0.8, 0.6)); float dif = max(dot(n, L), 0.0);
    vec3 col = uTint * (0.72 + 0.35 * dif) + uRim * fr * 0.9;
    col += pow(max(dot(n, normalize(L + v)), 0.0), 50.0) * 0.35;
    col *= mix(0.78, 1.0, smoothstep(-0.9, 0.4, vO.y));
    float a = uAlpha + fr * (1.0 - uAlpha);
    if (vO.z > 0.2) {
      vec2 q = vO.xy;
      float eye = length(vec2(abs(q.x) - 0.25, (q.y - 0.42) / max(uBlink, 0.06)) / vec2(0.1, 0.14)) - 1.0;
      float ein = smoothstep(0.08, -0.08, eye);
      col = mix(col, vec3(0.07, 0.02, 0.11), ein);
      float hl = length(vec2(abs(q.x) - 0.22, q.y - 0.47) / vec2(0.032, 0.036)) - 1.0;
      col = mix(col, vec3(1.0), smoothstep(0.25, -0.25, hl) * ein * step(0.4, uBlink));
      float m = length((q - vec2(0.0, 0.16)) / vec2(0.075, 0.095)) - 1.0;
      float min_ = smoothstep(0.1, -0.1, m);
      col = mix(col, vec3(0.2, 0.04, 0.13), min_);
      float bl = length(vec2(abs(q.x) - 0.43, q.y - 0.27) / vec2(0.12, 0.07)) - 1.0;
      col = mix(col, vec3(1.0, 0.5, 0.68), smoothstep(0.7, -0.6, bl) * 0.5);
      a = max(a, max(ein, min_));
    }
    col *= 1.0 - 0.6 * uDim;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
    #include <colorspace_fragment>
  }`;
function makeGhost(alpha = 0.9) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uWave: { value: 1 }, uTint: { value: new THREE.Color("#f6efff") }, uRim: { value: new THREE.Color("#c8a8ff") }, uAlpha: { value: alpha }, uDim: { value: 0 }, uBlink: { value: 1 } },
    vertexShader: GHOST_VERT, fragmentShader: GHOST_FRAG, transparent: true, depthWrite: false, toneMapped: false,
  });
  const g = new THREE.Mesh(ghostGeo, mat);
  // у ручек тот же материал: по высоте волна подола и лицо на них не срабатывают
  const l = new THREE.Mesh(armGeo, mat), r = new THREE.Mesh(armGeo, mat);
  l.position.set(-0.84, 0.02, 0.06); r.position.set(0.84, 0.02, 0.06);
  g.add(l, r); g.userData.arms = [l, r];
  return g;
}

/* ---------- летучие мыши (инстансы, крылья машут в шейдере) ---------- */
const batGeo = (() => {
  const R = [[0, 0.2], [0.05, 0.33], [0.09, 0.17], [0.16, 0.13], [0.42, 0.3], [0.78, 0.35], [1.0, 0.2], [0.88, -0.04], [0.77, 0.03], [0.65, -0.14], [0.52, -0.05], [0.38, -0.2], [0.23, -0.08], [0.09, -0.26], [0, -0.32]];
  const s = new THREE.Shape(); s.moveTo(R[0][0], R[0][1]);
  R.slice(1).forEach(([x, y]) => s.lineTo(x, y));
  R.slice(1, -1).reverse().forEach(([x, y]) => s.lineTo(-x, y));
  s.lineTo(R[0][0], R[0][1]);
  return new THREE.ShapeGeometry(s);
})();
const BAT_N = isMobile ? 6 : 9;
const batMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color("#120818") } },
  vertexShader: `
    attribute float aPhase; uniform float uTime; varying vec2 vP;
    void main(){
      vec3 p = position; vP = p.xy;
      float ax = abs(p.x), w = smoothstep(0.08, 0.3, ax), r = max(ax - 0.12, 0.0);
      float a = sin(uTime * 15.0 + aPhase * 6.2831) * 0.95 * w;
      p.x = sign(p.x) * (min(ax, 0.12) + r * cos(a)); p.z = r * sin(a);
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: `
    uniform vec3 uColor; varying vec2 vP;
    void main(){ vec3 col = uColor;
      float e = min(length(vP - vec2(0.045, 0.17)), length(vP - vec2(-0.045, 0.17)));
      col = mix(col, vec3(1.0, 0.82, 0.3), smoothstep(0.032, 0.012, e));
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`,
  side: THREE.DoubleSide,
});
const batPhase = new Float32Array(BAT_N); for (let i = 0; i < BAT_N; i++) batPhase[i] = Math.random();
batGeo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(batPhase, 1));
const bats = new THREE.InstancedMesh(batGeo, batMat, BAT_N); bats.frustumCulled = false; scene.add(bats);
const batP = Array.from({ length: BAT_N }, (_, i) => ({
  rx: 1.6 + Math.random() * 2.2, ry: 0.5 + Math.random() * 1.1, rz: 0.6 + Math.random() * 1.6,
  w: (0.35 + Math.random() * 0.45) * (i % 2 ? 1 : -1), ph: Math.random() * 6.28, s: 0.28 + Math.random() * 0.26,
}));
const _o = new THREE.Object3D();

/* ---------- сцена ---------- */
const pumpkin = makePumpkin(), mini = makePumpkin(), ghost = makeGhost(0.9), wisp = makeGhost(0.82);
const objs = { moon, pumpkin, ghost, mini, wisp };
const NAMES = Object.keys(objs);
for (const k of NAMES) scene.add(objs[k]);

/* расположение по сценам: [x, y, z, scale] */
const LAYOUT = {
  intro:  { moon: [5.0, 2.9, -8, 1.9],    pumpkin: [-3.75, -1.75, -0.6, 0.95], ghost: [3.7, -0.7, -1.4, 0.8],  mini: [-4.1, 1.5, -3.2, 0.5],  wisp: [-6.0, 3.2, -6, 0.48] },
  quiz:   { moon: [-5.2, 2.9, -8.5, 1.8], pumpkin: [3.8, -2.0, -1, 0.85],      ghost: [-3.8, -0.9, -1.8, 0.75], mini: [4.3, 1.9, -3.2, 0.46], wisp: [6.6, -0.3, -7, 0.46] },
  result: { moon: [4.9, 2.9, -9, 1.9],    pumpkin: [-3.8, -2.0, -1, 0.9],      ghost: [3.8, -0.6, -1.5, 0.8],   mini: [-4.3, 1.8, -3, 0.46],  wisp: [5.8, -2.6, -4.5, 0.42] },
  letter: { moon: [-5.0, 2.9, -8.5, 1.8], pumpkin: [3.8, -2.1, -1.2, 0.8],     ghost: [-3.8, -1.3, -2, 0.72],   mini: [4.3, 2.0, -3.6, 0.44], wisp: [-6.6, 0.4, -6, 0.42] },
  finale: { moon: [0, 3.0, -10, 3.4],     pumpkin: [0, 0.8, 1.2, 1.25],        ghost: [-3.5, 0.4, -1, 0.82],    mini: [3.6, 2.3, -2.6, 0.5],  wisp: [3.4, -0.6, -1.6, 0.5] },
};
// цвета от палитры сцены: [ключ1, ключ2, доля]
const TINT = {
  pumpkin: { rim: ["b", "#ffd0a0", 0.5] },
  mini:    { rim: ["d", "#ffd0a0", 0.4] },
  ghost:   { tint: ["#f6efff", "c", 0.1], rim: ["b", "#ffffff", 0.35] },
  wisp:    { tint: ["#efe6ff", "d", 0.18], rim: ["c", "#ffffff", 0.3] },
};

/* ---------- пружины ---------- */
const SPRING = { k: 22, c: 6.6 };
const STEP = 1 / 120;
let mode = "intro", qIndex = 0, now = 0;
const body = {};
NAMES.forEach((n, i) => body[n] = {
  p: new THREE.Vector3(), v: new THREE.Vector3(), tp: new THREE.Vector3(), next: new THREE.Vector3(),
  s: 1, sv: 0, ts: 1, nextS: 1, wake: 0, order: i, base: 1,
});
function layoutTarget(n, out) {
  const L = LAYOUT[mode] || LAYOUT.intro;
  const spread = THREE.MathUtils.clamp(camera.aspect / 1.6, 0.52, 1.15);
  const lift = camera.aspect < 0.8 ? 1.12 : 1;
  let [x, y, z, s] = L[n];
  if (n === "pumpkin" && mode === "finale" && camera.aspect < 0.8) { s *= 0.7; z -= 0.6; y *= 1.05; }
  if (n === "moon" && camera.aspect < 0.8) { s *= 0.8; }
  if (mode === "quiz" && qIndex > 0 && n !== "moon") {
    const a = qIndex * 2.399 + body[n].order * 1.7;
    x += Math.cos(a) * 0.38; y += Math.sin(a * 1.3) * 0.3; z += Math.sin(a * 0.7) * 0.4;
  }
  out.set(x * spread, y * lift, z);
  return s * body[n].base;
}
function applyLayout(immediate) {
  for (const n of NAMES) {
    const b = body[n];
    b.nextS = layoutTarget(n, b.next);
    b.wake = immediate ? 0 : now + b.order * 0.06;
    if (immediate) { b.tp.copy(b.next); b.ts = b.nextS; b.p.copy(b.next); b.s = b.nextS; b.v.set(0, 0, 0); b.sv = 0; }
  }
}
function integrate(dt) {
  for (const n of NAMES) {
    const b = body[n];
    if (b.wake <= now) { b.tp.copy(b.next); b.ts = b.nextS; }
    let left = dt;
    while (left > 1e-6) {
      const h = Math.min(STEP, left); left -= h;
      b.v.x += (SPRING.k * (b.tp.x - b.p.x) - SPRING.c * b.v.x) * h;
      b.v.y += (SPRING.k * (b.tp.y - b.p.y) - SPRING.c * b.v.y) * h;
      b.v.z += (SPRING.k * (b.tp.z - b.p.z) - SPRING.c * b.v.z) * h;
      b.p.addScaledVector(b.v, h);
      b.sv += (SPRING.k * 1.4 * (b.ts - b.s) - SPRING.c * 1.1 * b.sv) * h;
      b.s += b.sv * h;
    }
  }
}

const colTarget = { base: new THREE.Color(), a: new THREE.Color(), b: new THREE.Color(), c: new THREE.Color(), d: new THREE.Color() };
const col = { base: new THREE.Color(), a: new THREE.Color(), b: new THREE.Color(), c: new THREE.Color(), d: new THREE.Color() };
function setMode(m, q = 0) {
  if (!LAYOUT[m]) return;
  const changed = m !== mode;
  mode = m; qIndex = m === "quiz" ? q : 0;
  applyLayout(STILL);
  const P = PALETTES[m];
  for (const k in colTarget) colTarget[k].set(P[k]);
  if (changed && m === "finale" && !STILL) body.pumpkin.sv += 1.2;
}
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
function pick(spec) {
  _c1.set(spec[0].startsWith("#") ? spec[0] : col[spec[0]]);
  _c2.set(spec[1].startsWith("#") ? spec[1] : col[spec[1]]);
  return _c1.lerp(_c2, spec[2]);
}

/* ---------- светлячки: зелёные и тыквенные огоньки поднимаются из тумана ---------- */
const RISE_N = isMobile ? 80 : 140;
const riseGeo = new THREE.BufferGeometry();
const risePos = new Float32Array(RISE_N * 3), riseSpd = new Float32Array(RISE_N), riseCol = new Float32Array(RISE_N * 3);
const FIRE = [new THREE.Color("#9dff6a"), new THREE.Color("#ffb050"), new THREE.Color("#c69bff")];
for (let i = 0; i < RISE_N; i++) {
  risePos[i * 3] = (Math.random() - 0.5) * 14; risePos[i * 3 + 1] = (Math.random() - 0.5) * 10; risePos[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1;
  riseSpd[i] = 0.12 + Math.random() * 0.4;
  const c = FIRE[i % 3]; riseCol[i * 3] = c.r; riseCol[i * 3 + 1] = c.g; riseCol[i * 3 + 2] = c.b;
}
riseGeo.setAttribute("position", new THREE.BufferAttribute(risePos, 3));
riseGeo.setAttribute("color", new THREE.BufferAttribute(riseCol, 3));
const riseMat = new THREE.PointsMaterial({ size: 0.12, map: sprite, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true, opacity: 0 });
const risePts = new THREE.Points(riseGeo, riseMat); risePts.frustumCulled = false; scene.add(risePts);

/* ---------- вспышки искр ---------- */
const POOL = isMobile ? 420 : 700;
const pPos = new Float32Array(POOL * 3), pVel = new Float32Array(POOL * 3), pLife = new Float32Array(POOL), pDecay = new Float32Array(POOL), pSeed = new Float32Array(POOL);
for (let i = 0; i < POOL; i++) pSeed[i] = Math.random();
const pGeo2 = new THREE.BufferGeometry();
pGeo2.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
pGeo2.setAttribute("aLife", new THREE.BufferAttribute(pLife, 1));
pGeo2.setAttribute("aSeed", new THREE.BufferAttribute(pSeed, 1));
const pMat = new THREE.ShaderMaterial({
  uniforms: { uScale: { value: 400 } },
  vertexShader: `
    attribute float aLife, aSeed; uniform float uScale; varying float vLife, vSeed;
    void main(){
      vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
      float l = clamp(aLife, 0.0, 1.0);
      gl_PointSize = l > 0.0 ? (0.07 + 0.11 * aSeed) * (0.35 + 0.65 * sqrt(l)) * uScale / max(0.5, -mv.z) : 0.0;
      vLife = l; vSeed = aSeed;
    }`,
  fragmentShader: `
    varying float vLife, vSeed;
    void main(){
      float r = length(gl_PointCoord - 0.5);
      float a = smoothstep(0.5, 0.0, r); a *= a;
      vec3 c = vSeed < 0.45 ? vec3(1.0, 0.58, 0.15) : vSeed < 0.75 ? vec3(0.78, 0.5, 1.0) : vec3(0.62, 1.0, 0.42);
      c = mix(c, vec3(1.0), smoothstep(0.22, 0.0, r) * 0.85);
      gl_FragColor = vec4(c, a * min(1.0, vLife * 1.6));
      #include <colorspace_fragment>
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
});
const pPts = new THREE.Points(pGeo2, pMat); pPts.frustumCulled = false; scene.add(pPts);
let pRing = 0, pAlive = 0;
function emit(o, n, power) {
  for (let j = 0; j < n; j++) {
    const i = pRing; pRing = (pRing + 1) % POOL;
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), v = (1.2 + Math.random() * 3.6) * power;
    pPos[i * 3] = o.x; pPos[i * 3 + 1] = o.y; pPos[i * 3 + 2] = o.z;
    pVel[i * 3] = Math.sin(ph) * Math.cos(th) * v; pVel[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * v + 0.8 * power; pVel[i * 3 + 2] = Math.cos(ph) * v * 0.7;
    pLife[i] = 1; pDecay[i] = 1 / (1.1 + Math.random() * 1.5);
  }
  pAlive = 3.0;
}
function updateParticles(dt) {
  if (pAlive <= 0) return;
  pAlive -= dt;
  const drag = Math.exp(-1.5 * dt), g = 1.4 * dt;
  for (let i = 0; i < POOL; i++) {
    if (pLife[i] <= 0) continue;
    pVel[i * 3] *= drag; pVel[i * 3 + 1] = pVel[i * 3 + 1] * drag - g; pVel[i * 3 + 2] *= drag;
    pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    pLife[i] -= pDecay[i] * dt;
  }
  pGeo2.attributes.position.needsUpdate = true; pGeo2.attributes.aLife.needsUpdate = true;
}
const _v = new THREE.Vector3(), _d = new THREE.Vector3();
function screenToWorld(nx, ny, z = 0.8) {
  _v.set(nx, ny, 0.5).unproject(camera); _d.copy(_v).sub(camera.position).normalize();
  return camera.position.clone().addScaledVector(_d, (z - camera.position.z) / _d.z);
}
function burstAt(nx, ny, power = 1, n = 260) { if (STILL) return; emit(screenToWorld(nx, ny), Math.min(n, POOL), reduced ? power * 0.6 : power); }
function burst() { if (!STILL) emit(pumpkin.position, 300, 1); }
function kick(nx, ny, power = 1) {
  if (STILL) return;
  const o = screenToWorld(nx, ny, 0);
  for (const n of NAMES) {
    if (n === "moon") continue;
    const b = body[n]; _d.set(b.p.x - o.x, b.p.y - o.y, 0.6); const dist = _d.length(); _d.normalize();
    b.v.addScaledVector(_d, power * 2.6 / (0.8 + dist * 0.6));
    b.sv += power * 0.35 * b.base;
  }
  emit(screenToWorld(nx, ny), 26, 0.45 * power);
}
// молния и темнота
let boltAt = -10, dimT = 0, dim = 0;
function lightning() { if (!STILL) boltAt = now; }
function setDim(v) { dimT = v ? 1 : 0; }

/* ---------- параллакс камеры ---------- */
let ptx = 0, pty = 0, cpx = 0, cpy = 0;
const fine = matchMedia("(hover:hover) and (pointer:fine)").matches;
window.addEventListener("pointermove", e => { ptx = (e.clientX / innerWidth) * 2 - 1; pty = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });

/* ---------- цикл ---------- */
const smooth = (rate, dt) => 1 - Math.exp(-rate * dt);
let lastMs = performance.now(), t = 0, pulseAmp = 0;
const gauss = (x, c, w) => Math.exp(-((x - c) / w) * ((x - c) / w));
const beat = ph => 0.085 * gauss(ph, 0.1, 0.055) + 0.05 * gauss(ph, 0.3, 0.06);
const RISE_LEVEL = { intro: 0.75, quiz: 0.55, result: 0.7, letter: 0.95, finale: 1 };
function tick() {
  const ms = performance.now(), dt = Math.min(0.05, Math.max(0, (ms - lastMs) / 1000)); lastMs = ms;
  now += dt;
  const speed = reduced ? 0.35 : 1;
  if (!STILL) t += dt * speed;
  const tt = STILL ? 12 : t;
  bgUniforms.uTime.value = tt; starMat.uniforms.uTime.value = tt;
  const kc = STILL ? 1 : smooth(1.6, dt);
  for (const k in col) col[k].lerp(colTarget[k], kc);
  bgUniforms.uBase.value.copy(col.base); bgUniforms.uA.value.copy(col.a); bgUniforms.uB.value.copy(col.b); bgUniforms.uC.value.copy(col.c); bgUniforms.uD.value.copy(col.d);

  // молния: два удара; темнота
  const lt = now - boltAt;
  bgUniforms.uFlash.value = lt < 0 || lt > 1.6 ? 0 : (lt < 0.07 ? 1 : Math.exp(-(lt - 0.07) * 14)) + (lt > 0.2 ? 0.65 * Math.exp(-(lt - 0.2) * 8) : 0);
  dim += (dimT - dim) * (STILL ? 1 : smooth(3, dt));
  bgUniforms.uDim.value = dim; starMat.uniforms.uDim.value = dim; moonMat.uniforms.uDim.value = dim; STEM_MAT.uniforms.uDim.value = dim;
  halo.material.opacity = 0.5 * (1 - 0.7 * dim) + bgUniforms.uFlash.value * 0.25;

  integrate(dt);
  pulseAmp += ((mode === "finale" && !reduced && !STILL ? 1 : 0) - pulseAmp) * smooth(2.2, dt);
  for (const n of NAMES) {
    const o = objs[n], b = body[n];
    const bob = STILL || n === "moon" ? 0 : Math.sin(tt * 0.7 + n.length * 1.7 + n.charCodeAt(0)) * 0.14;
    o.position.set(b.p.x, b.p.y + bob, b.p.z);
    let sx = Math.max(0.01, b.s), sy = sx;
    if (n === "pumpkin" && pulseAmp > 0.001) { const k = beat((tt % 1.3) / 1.3) * pulseAmp; sx *= 1 + k; sy *= 1 + k * 0.75; }
    o.scale.set(sx, sy, sx);
  }
  // Луна медленно вращается
  moon.rotation.y = -1.9 + tt * 0.01;
  // тыквы покачиваются и мерцают свечой
  for (const [o, ph, yaw] of [[pumpkin, 0, 0], [mini, 2.1, 0]]) {
    o.rotation.y = Math.sin(tt * 0.4 + ph) * 0.45 - o.position.x * 0.06 + yaw;
    o.rotation.z = Math.sin(tt * 0.6 + ph) * 0.06;
    o.rotation.x = 0.08 + Math.sin(tt * 0.5 + ph) * 0.05;
    const u = o.material.uniforms, flick = 0.82 + 0.12 * Math.sin(tt * 9.0 + ph) * Math.sin(tt * 13.7 + ph * 2.0) + 0.06 * Math.sin(tt * 23.0 + ph);
    const pulse = o === pumpkin && pulseAmp > 0.001 ? beat((tt % 1.3) / 1.3) * pulseAmp * 5 : 0;
    u.uGlow.value = (STILL ? 1 : flick) + pulse; u.uDim.value = dim;
    u.uRim.value.copy(pick(TINT[o === pumpkin ? "pumpkin" : "mini"].rim));
  }
  // привидения парят, машут ручками и моргают
  for (const [o, ph, key] of [[ghost, 0, "ghost"], [wisp, 3.3, "wisp"]]) {
    const u = o.material.uniforms;
    u.uTime.value = tt + ph; u.uDim.value = dim;
    o.rotation.y = Math.sin(tt * 0.5 + ph) * 0.35 - o.position.x * 0.05;
    o.rotation.z = Math.sin(tt * 0.9 + ph) * 0.08;
    const bt = (tt + ph) % 3.7; u.uBlink.value = STILL ? 1 : (bt < 0.16 ? Math.abs(bt - 0.08) / 0.08 : 1);
    const [l, r] = o.userData.arms, sw = Math.sin(tt * 2.2 + ph) * 0.25;
    l.rotation.z = -0.55 - sw; r.rotation.z = 0.55 + sw;
    u.uTint.value.copy(pick(TINT[key].tint)); u.uRim.value.copy(pick(TINT[key].rim));
  }
  // летучие мыши кружат у Луны
  batMat.uniforms.uTime.value = tt;
  const mc = moon.position;
  for (let i = 0; i < BAT_N; i++) {
    const p = batP[i], a = tt * p.w + p.ph;
    _o.position.set(mc.x + Math.cos(a) * p.rx, mc.y + Math.sin(a * 1.3) * p.ry * 0.6 + Math.sin(a) * p.ry * 0.4 - 0.3, mc.z + 2.2 + Math.sin(a) * p.rz);
    const vx = -Math.sin(a) * p.rx * p.w, vy = (Math.cos(a * 1.3) * 1.3 * p.ry * 0.6 + Math.cos(a) * p.ry * 0.4) * p.w;
    _o.rotation.set(0, 0, THREE.MathUtils.clamp(Math.atan2(vy, Math.abs(vx) + 0.001) * 0.4, -0.5, 0.5) * Math.sign(vx || 1));
    _o.scale.setScalar(p.s * (1 - 0.35 * dim));
    _o.updateMatrix(); bats.setMatrixAt(i, _o.matrix);
  }
  bats.instanceMatrix.needsUpdate = true;

  // светлячки
  const wantRise = (RISE_LEVEL[mode] ?? 0.6) * (1 - 0.6 * dim);
  riseMat.opacity += (wantRise - riseMat.opacity) * (STILL ? 1 : smooth(1.2, dt));
  if (!STILL) {
    for (let i = 0; i < RISE_N; i++) {
      risePos[i * 3 + 1] += riseSpd[i] * dt * speed; risePos[i * 3] += Math.sin(tt * 0.8 + i) * 0.14 * dt;
      if (risePos[i * 3 + 1] > 5.5) { risePos[i * 3 + 1] = -5.5; risePos[i * 3] = (Math.random() - 0.5) * 14; }
    }
    riseGeo.attributes.position.needsUpdate = true;
  }
  updateParticles(dt);
  pPts.visible = pAlive > 0;

  // камера
  const ax = STILL ? 0 : fine ? ptx : Math.sin(tt * 0.25) * 0.35, ay = STILL ? 0 : fine ? pty : Math.cos(tt * 0.2) * 0.25;
  const kcam = smooth(2.4, dt);
  cpx += (ax - cpx) * kcam; cpy += (ay - cpy) * kcam;
  camera.position.x = cpx * 0.75; camera.position.y = -cpy * 0.5;
  camera.lookAt(0, 0.15, 0);

  renderer.setRenderTarget(bgRT); renderer.render(bgScene, bgCam);
  renderer.setRenderTarget(null); renderer.render(scene, camera);
}

const _sz = new THREE.Vector2();
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.getDrawingBufferSize(_sz);
  const sc = _sz.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  pMat.uniforms.uScale.value = sc; starMat.uniforms.uScale.value = sc;
  fitBg(); applyLayout(false);
}
window.addEventListener("resize", resize);
document.addEventListener("visibilitychange", () => { lastMs = performance.now(); renderer.setAnimationLoop(document.hidden ? null : tick); });

resize();
pPts.visible = true; renderer.compile(scene, camera); pPts.visible = false;
mode = window.__bgMode || "intro"; qIndex = window.__bgQ || 0;
setMode(mode, qIndex); applyLayout(true);
for (const k in col) col[k].copy(colTarget[k]);
lastMs = performance.now();
renderer.setAnimationLoop(tick);
window.__bg = { setMode, burst, burstAt, kick, lightning, dim: setDim };
document.documentElement.classList.add("has-3d");
