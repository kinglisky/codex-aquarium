import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { createMuseumVisitor } from "./museum-visitor";

const worldVertex = `
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const causticPattern = `
  float caustic(vec2 p, float t) {
    p += vec2(sin(p.y * 1.3 + t * .27), cos(p.x * 1.1 - t * .2)) * .7;
    float a = sin(p.x * 1.8 + sin(p.y * 1.1 - t * .17));
    float b = cos(p.y * 1.7 + sin(p.x * 1.2 + t * .23));
    float line = pow(max(0., 1. - abs(a + b)), 10.);
    float fine = pow(max(0., 1. - abs(sin(p.x * 2.2 - t * .13) + cos(p.y * 2.6 + t * .11))), 18.);
    return line * .7 + fine * .3;
  }
`;

function random(seed: number) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

export function createMuseum(visitorTemplate: THREE.Group) {
  const group = new THREE.Group();
  group.name = "Moonlit aquarium hall";
  const resources = new Set<{ dispose(): void }>();
  const obstacles: THREE.Mesh[] = [];
  const uniforms = { time: { value: 0 }, light: { value: 1 } };
  function mesh<G extends THREE.BufferGeometry, M extends THREE.Material>(geometry: G, material: M, parent: THREE.Object3D = group) {
    resources.add(geometry);
    resources.add(material);
    const object = new THREE.Mesh(geometry, material);
    parent.add(object);
    return object;
  }
  function standard(color: string, roughness = .7, metalness = 0) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
  }
  function box(size: [number, number, number], position: [number, number, number], material: THREE.Material, parent: THREE.Object3D = group) {
    const object = mesh(new THREE.BoxGeometry(...size), material, parent);
    object.position.set(...position);
    return object;
  }
  function orb(position: [number, number, number], scale: [number, number, number], material: THREE.Material, parent: THREE.Object3D = group) {
    const object = mesh(new THREE.SphereGeometry(1, 24, 16), material, parent);
    object.position.set(...position);
    object.scale.set(...scale);
    return object;
  }
  function surface(color: string, intensity: number) {
    const material = standard(color, .92);
    material.onBeforeCompile = (shader) => {
      shader.uniforms.museumTime = uniforms.time;
      shader.uniforms.museumLight = uniforms.light;
      shader.vertexShader = "varying vec3 museumWorld;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nmuseumWorld = (modelMatrix * vec4(transformed, 1.)).xyz;");
      shader.fragmentShader = `varying vec3 museumWorld; uniform float museumTime; uniform float museumLight; ${causticPattern}\n` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\nfloat shimmer = caustic(museumWorld.xz * 1.25, museumTime);\ntotalEmissiveRadiance += vec3(.065, .22, .4) * shimmer * ${intensity.toFixed(2)} * museumLight;`);
    };
    material.customProgramCacheKey = () => `museum-caustic-${intensity}`;
    return material;
  }

  const trim = standard("#142443", .37, .55);
  const stone = standard("#19274b", .94);
  const dark = standard("#080f25", .8);
  const silver = standard("#698a9d", .32, .8);
  const glow = new THREE.MeshBasicMaterial({ color: "#68b8f0", transparent: true, opacity: .5, toneMapped: false });
  box([20.3, .72, 7.1], [0, .08, -2.85], stone);
  box([20.5, .16, 7.3], [0, -.2, -2.85], dark);
  box([18.45, .12, .32], [0, .49, .02], trim);
  box([18.25, .024, .035], [0, .565, .19], glow);
  box([20.3, .8, 7.1], [0, 8.85, -2.85], dark);
  for (const side of [-1, 1]) {
    box([.65, 9.3, 7.5], [side * 9.65, 4.25, -2.9], dark);
    box([.16, 8.2, .2], [side * 9.22, 4.55, .08], trim);
    box([.018, 7.95, .018], [side * 9.12, 4.5, .15], glow);
  }

  const wallMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: worldVertex,
    fragmentShader: `
      uniform float time; uniform float light;
      varying vec2 vUv; varying vec3 vWorld;
      void main() {
        float halo = exp(-pow(abs((vUv.x - .5) * 1.6), 2.)) * smoothstep(0., .9, vUv.y);
        float columns = pow(max(0., sin(vUv.x * 19. + .5)), 36.) * pow(vUv.y, 3.);
        float fibers = pow(max(0., sin(vUv.x * 73. + .4)), 48.) * pow(vUv.y, 5.);
        float grain = fract(sin(dot(vUv * 2000., vec2(12.9898, 78.233))) * 43758.5453) * .007;
        vec3 color = mix(vec3(.002, .006, .035), vec3(.018, .029, .19), halo);
        color += vec3(.018, .04, .09) * columns + vec3(.008, .025, .07) * fibers + grain;
        gl_FragColor = vec4(color * (.5 + light * .5), 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  box([18.7, 8.1, .18], [0, 4.5, -6.12], wallMaterial);
  const portholeInterior = standard("#101a3a", .55, .15);
  const portholeRim = standard("#7c8c92", .36, .7);
  for (let index = 0; index < 7; index += 1) {
    const x = -7.5 + index * 2.5;
    const radius = .48 + Math.sin(index * .9) * .055;
    const opening = mesh(new THREE.CircleGeometry(radius, 48), portholeInterior);
    opening.position.set(x, 6.85, -5.99);
    const rim = mesh(new THREE.TorusGeometry(radius, .038, 8, 48), portholeRim);
    rim.position.set(x, 6.85, -5.95);
    const innerRim = mesh(new THREE.TorusGeometry(radius - .055, .012, 6, 48), trim);
    innerRim.position.set(x, 6.85, -5.93);
    for (const angle of [.65, 2.22, 3.79, 5.36]) {
      const bolt = mesh(new THREE.SphereGeometry(.025, 8, 6), silver);
      bolt.position.set(x + Math.cos(angle) * radius, 6.85 + Math.sin(angle) * radius, -5.91);
      bolt.scale.z = .45;
    }
  }
  for (const x of [-6.25, -3.75, -1.25, 1.25, 3.75, 6.25]) {
    box([.016, 7.7, .025], [x, 4.5, -6], trim);
  }

  const bed = mesh(new THREE.PlaneGeometry(18.1, 5.95, 64, 24), surface("#374d6e", .3));
  const bedPositions = bed.geometry.getAttribute("position");
  for (let index = 0; index < bedPositions.count; index += 1) {
    const x = bedPositions.getX(index);
    const y = bedPositions.getY(index);
    bedPositions.setZ(index, Math.sin(x * .8 + y * .7) * .035 + Math.cos(x * .4 - y) * .025);
  }
  bed.geometry.computeVertexNormals();
  bed.rotation.x = -Math.PI / 2;
  bed.position.set(0, .46, -3.04);

  const rockMaterial = surface("#1e3155", .55);
  const rockLayouts = [
    [-6.9, .75, -4.7, 1.7, .65, 1.05], [-5.4, .64, -4.95, .85, .5, .7],
    [-2.9, .9, -4.1, 1.65, .9, 1.25], [-1.55, .8, -4.8, 1.35, .9, .8],
    [-3.7, .68, -3.25, .95, .55, .7], [.3, .64, -5.1, 1.1, .45, .75],
    [5.7, .76, -4.45, 1.6, .75, 1.15], [7.1, .68, -4.9, 1., .55, .85],
  ];
  for (const [index, layout] of rockLayouts.entries()) {
    const original = new THREE.IcosahedronGeometry(1, 2);
    const vertices = original.getAttribute("position");
    for (let vertex = 0; vertex < vertices.count; vertex += 1) {
      const point = new THREE.Vector3().fromBufferAttribute(vertices, vertex);
      const distortion = .88 + Math.sin(point.x * 4.1 + index) * Math.cos(point.z * 5.3 + point.y) * .13;
      vertices.setXYZ(vertex, point.x * distortion, point.y * distortion, point.z * distortion);
    }
    original.deleteAttribute("normal");
    original.deleteAttribute("uv");
    const geometry = mergeVertices(original);
    original.dispose();
    geometry.computeVertexNormals();
    const rock = mesh(geometry, rockMaterial);
    obstacles.push(rock);
    rock.position.set(layout[0], layout[1], layout[2]);
    rock.scale.set(layout[3], layout[4], layout[5]);
    rock.rotation.set(.06 * index, index * 1.2, Math.sin(index) * .16);
  }

  const floor = mesh(new THREE.PlaneGeometry(40, 32), standard("#0b173b", .72, .12));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -.225, 6);
  const tileLines: number[] = [];
  for (let x = -18; x <= 18; x += 3) tileLines.push(x, -.219, -.5, x, -.219, 20);
  for (let z = 1; z <= 20; z += 3) tileLines.push(-20, -.219, z, 20, -.219, z);
  const tileGeometry = new THREE.BufferGeometry();
  tileGeometry.setAttribute("position", new THREE.Float32BufferAttribute(tileLines, 3));
  const tileMaterial = new THREE.LineBasicMaterial({ color: "#11213c", transparent: true, opacity: .3 });
  resources.add(tileGeometry);
  resources.add(tileMaterial);
  group.add(new THREE.LineSegments(tileGeometry, tileMaterial));
  for (const side of [-1, 1]) {
    box([4.5, 10.5, 9], [side * 12.1, 4.95, 2.5], standard("#111d37", .9));
    box([.1, 3.2, 9], [side * 9.81, 1.38, 2.4], trim);
    box([.08, .04, 9], [side * 9.74, 3.02, 2.4], silver);
  }
  const causticMaterial = new THREE.ShaderMaterial({
    uniforms, vertexShader: worldVertex,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    fragmentShader: `
      uniform float time; uniform float light;
      varying vec2 vUv; varying vec3 vWorld;
      ${causticPattern}
      void main() {
        vec2 p = vWorld.xz;
        vec2 drift = vec2(sin(p.y * .64 + time * .13), cos(p.x * .53 - time * .11)) * .55;
        vec2 central = (p - vec2(-.4, 2.5) + drift) * vec2(.28, .5);
        vec2 left = (p - vec2(-5.5, 1.) - drift) * vec2(.36, .44);
        vec2 right = (p - vec2(5.2, 1.7) + drift.yx) * vec2(.4, .48);
        float pools = exp(-dot(central, central)) + exp(-dot(left, left)) * .7 + exp(-dot(right, right)) * .65;
        float edge = exp(-pow(abs(p.x / 9.5), 6.)) * (1. - smoothstep(5., 10., p.y));
        float pattern = caustic(p * .83, time);
        float ripples = .6 + .4 * sin(p.x * 1.2 + sin(p.y * 1.7 + time * .2));
        vec3 color = mix(vec3(.025, .08, .85), vec3(.07, .32, 1.), pattern);
        gl_FragColor = vec4(color, (pattern * .3 + ripples * .075) * pools * edge * light);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const caustics = mesh(new THREE.PlaneGeometry(30, 19), causticMaterial);
  caustics.rotation.x = -Math.PI / 2;
  caustics.position.set(0, -.212, 5.5);
  caustics.renderOrder = 1;

  function glass(width: number, x: number, z: number, rotation: number) {
    const material = new THREE.ShaderMaterial({
      uniforms: { ...uniforms, pane: { value: new THREE.Vector2(width, 8) } },
      vertexShader: worldVertex,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
      fragmentShader: `
        uniform vec2 pane; uniform float light;
        varying vec2 vUv; varying vec3 vWorld; varying vec3 vNormal;
        void main() {
          vec3 view = normalize(cameraPosition - vWorld);
          float fresnel = pow(max(0., 1. - abs(dot(view, normalize(vNormal)))), 4.);
          vec2 edgeDistance = min(vUv, 1. - vUv) * pane;
          float edge = 1. - smoothstep(0., .055, min(edgeDistance.x, edgeDistance.y));
          float streak = exp(-pow(abs((vUv.x - .065 - vUv.y * .045) / .013), 2.)) * .13;
          float gleam = exp(-pow(abs((vUv.y - .97) / .007), 2.)) * .1;
          float alpha = .012 + fresnel * .15 + edge * .15 + streak + gleam;
          gl_FragColor = vec4(vec3(.38, .63, .85) * (.7 + light * .3), alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    const pane = mesh(new THREE.PlaneGeometry(width, 8), material);
    pane.position.set(x, 4.5, z);
    pane.rotation.y = rotation;
    pane.renderOrder = 12;
  }
  glass(18.2, 0, .085, 0);
  glass(6.05, -9.09, -2.95, -Math.PI / 2);
  glass(6.05, 9.09, -2.95, Math.PI / 2);
  const seam = new THREE.MeshBasicMaterial({ color: "#80b8df", transparent: true, opacity: .15, depthWrite: false });
  for (const x of [-6.8, 6.8]) box([.014, 7.95, .025], [x, 4.5, .108], seam);

  const waterMaterial = new THREE.ShaderMaterial({
    uniforms, vertexShader: worldVertex,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    fragmentShader: `
      uniform float time; uniform float light;
      varying vec2 vUv; varying vec3 vWorld;
      void main() {
        vec2 p = vWorld.xz;
        float ripple = sin(p.x * 4. + sin(p.y * 3. + time * .4) * 1.3 + time * .5);
        float shimmer = pow(max(0., ripple), 24.);
        gl_FragColor = vec4(.18, .46, .78, (.025 + shimmer * .065) * light);
      }
    `,
  });
  const water = mesh(new THREE.PlaneGeometry(18.1, 6), waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 8.4, -3);
  water.renderOrder = 5;
  box([18.1, .024, .023], [0, 8.4, .04], glow);

  const beamMaterial = new THREE.ShaderMaterial({
    uniforms, vertexShader: worldVertex,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fragmentShader: `
      uniform float time; uniform float light;
      varying vec2 vUv; varying vec3 vWorld;
      void main() {
        float sides = pow(max(0., sin(vUv.x * 3.14159)), 3.);
        float height = smoothstep(0., .3, vUv.y) * (1. - smoothstep(.9, 1., vUv.y));
        float shafts = .65 + sin(vUv.x * 54. + time * .11) * .2;
        gl_FragColor = vec4(.13, .42, .85, sides * height * shafts * .026 * light);
      }
    `,
  });
  for (const [x, radius] of [[-5.8, 2.7], [.6, 3.4], [6.1, 2.4]]) {
    const beam = mesh(new THREE.ConeGeometry(radius, 8, 32, 1, true), beamMaterial);
    beam.position.set(x, 4.55, -3.35);
    beam.renderOrder = 4;
    const lamp = new THREE.PointLight("#8abfee", 16, 11, 2);
    lamp.position.set(x, 7.9, -1.7);
    group.add(lamp);
  }
  const visitorLight = new THREE.PointLight("#9fbcf0", 9, 9, 2);
  visitorLight.position.set(-1, 3, 5.2);
  group.add(visitorLight);
  const tankLight = new THREE.PointLight("#547de0", 26, 18, 2);
  tankLight.position.set(1, 4.4, -1.5);
  group.add(tankLight);

  const particlePositions = new Float32Array(180 * 3);
  for (let index = 0; index < 180; index += 1) {
    particlePositions[index * 3] = (random(index + 10) - .5) * 17.5;
    particlePositions[index * 3 + 1] = random(index + 200) * 7.8;
    particlePositions[index * 3 + 2] = -random(index + 400) * 5.5 - .25;
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
  const particleMaterial = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float time; varying float brightness;
      void main() {
        vec3 p = position; p.y = mod(p.y + time * .018, 7.8) + .6;
        p.x += sin(time * .14 + position.y) * .035;
        vec4 view = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * view;
        gl_PointSize = clamp(26. / -view.z, 1., 2.5);
        brightness = .12 + .24 * sin(position.x * 19.) * sin(position.x * 19.);
      }
    `,
    fragmentShader: "varying float brightness; void main() { float a = 1. - smoothstep(.05, .5, length(gl_PointCoord - .5)); gl_FragColor = vec4(.49, .73, 1., a * brightness); }",
  });
  resources.add(particleGeometry);
  resources.add(particleMaterial);
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  particles.renderOrder = 3;
  group.add(particles);

  const visitorRig = createMuseumVisitor(visitorTemplate);
  const visitor = visitorRig.group;
  visitor.position.set(0, -.2, 2.4);
  group.add(visitor);

  const shadow = mesh(new THREE.PlaneGeometry(1.8, 1.2), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: worldVertex,
    fragmentShader: "varying vec2 vUv; void main() { float a = exp(-dot((vUv - .5) * 4., (vUv - .5) * 4.)); gl_FragColor = vec4(.015, .025, .07, a * .42); }",
  }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, -.205, 2.42);
  shadow.renderOrder = 2;

  const plaque = new THREE.Group();
  plaque.position.set(7.6, -.2, 1.05);
  group.add(plaque);
  box([.32, .045, .31], [0, .025, 0], trim, plaque);
  box([.075, .55, .075], [0, .3, 0], silver, plaque);
  const sign = box([.76, .055, .43], [0, .63, 0], trim, plaque);
  sign.rotation.x = .24;
  const inscription = box([.65, .007, .32], [0, .664, 0], standard("#b5c7d4", .5), plaque);
  inscription.rotation.x = .24;
  for (let index = 0; index < 3; index += 1) {
    const line = box([index === 0 ? .33 : .47, .009, .015], [-.025, .67 + index * .014, -.09 + index * .06], trim, plaque);
    line.rotation.x = .24;
  }

  const lights = group.children.flatMap((child) => child instanceof THREE.PointLight ? [{ light: child, intensity: child.intensity }] : []);
  let walkPhase = 0;
  let previousTime: number | undefined;
  return {
    group, obstacles,
    update(time: number, flow: number) {
      const delta = previousTime === undefined ? 0 : Math.max(0, time - previousTime);
      previousTime = time;
      uniforms.time.value += delta * flow;
      visitorRig.look(time);
    },
    setLight(value: number) {
      uniforms.light.value = THREE.MathUtils.clamp(value, .15, 2);
      for (const item of lights) item.light.intensity = item.intensity * uniforms.light.value;
    },
    setVisitorPosition(x: number, walking: boolean, delta: number) {
      const target = THREE.MathUtils.clamp(x, -7.3, 7.3);
      const direction = Math.sign(target - visitor.position.x);
      visitor.position.x = THREE.MathUtils.damp(visitor.position.x, target, 12, delta);
      visitor.rotation.y = THREE.MathUtils.damp(visitor.rotation.y, walking ? direction * -.35 : 0, 8, delta);
      walkPhase += walking ? delta * 8 : 0;
      const step = walking ? Math.sin(walkPhase) : 0;
      visitor.position.y = -.2 + Math.abs(step) * .026;
      visitorRig.walk(step, delta);
      shadow.position.x = visitor.position.x;
    },
    dispose() {
      visitorRig.dispose();
      for (const resource of resources) resource.dispose();
      resources.clear();
      group.clear();
    },
  };
}
