/**
 * UrbanTwin AI - 3D What-If Macroscopic Network Simulation Engine
 * Interactive WebGL Visualizer powered by Three.js
 * 
 * Features:
 * - 3D Road Network Grid with Junction Pedestals and Holographic City Buildings
 * - Dynamic Congestion Heat Ribbons (Free Flow Green, Moderate Amber, Heavy Rose/Red)
 * - 3D Road Closure Barricades with Pulsing Hazard Light Columns & Detour Signs
 * - Animated Detour Flow Particles showing traffic spillback and rerouting in real time
 * - Raycast Hover Tooltips with Before vs After simulation metrics
 * - Multi-perspective Camera Controls (Isometric, Intervention Zoom, Top-Down Grid)
 */

(function () {
  'use strict';

  // Three.js Core Variables
  let container, scene, camera, renderer, raycaster, mouse;
  let roadsGroup, junctionsGroup, barricadesGroup, particlesGroup, cityGroup, labelsGroup;
  let animFrameId = null;
  let isInitialized = false;

  // Camera Animation & Controls
  let cameraTarget = new THREE.Vector3(0, 0, 0);
  let cameraPosTarget = new THREE.Vector3(0, 38, 54);
  let clock = new THREE.Clock();

  // Mouse Interaction State
  let isDragging = false;
  let isRightDragging = false;
  let prevMousePos = { x: 0, y: 0 };
  let spherical = { radius: 66, phi: Math.PI / 3.8, theta: Math.PI / 5 };

  // Simulation State
  let currentSimData = null;
  let activeClosure = 'ROAD-A-B';
  let activeVolumeSurge = 20;
  let particlesEnabled = true;
  let hoveredRoad = null;

  // Topology Definition
  const JUNCTIONS = {
    "Junction_Trinity": { name: "Trinity Junction", x: -16, z: -10, label: "Trinity" },
    "Junction_Indiranagar": { name: "Indiranagar 100ft", x: 0, z: -26, label: "Indiranagar" },
    "Junction_Domlur": { name: "Domlur Flyover", x: 18, z: -8, label: "Domlur" },
    "Junction_Koramangala": { name: "Koramangala Core", x: 8, z: 20, label: "Koramangala" },
    "Junction_SilkBoard": { name: "Silk Board Interchange", x: -22, z: 16, label: "Silk Board" },
    "Junction_Bellandur": { name: "Bellandur Tech Corridor", x: 24, z: 18, label: "Bellandur" }
  };

  const ROAD_DEFINITIONS = [
    { id: "ROAD-A-B", name: "MG Road - Trinity Corridor", start: "Junction_Trinity", end: "Junction_Indiranagar", lanes: 4 },
    { id: "ROAD-B-C", name: "100ft Road - Domlur Expressway", start: "Junction_Indiranagar", end: "Junction_Domlur", lanes: 4 },
    { id: "ROAD-C-D", name: "Intermediate Ring Road - Koramangala", start: "Junction_Domlur", end: "Junction_Koramangala", lanes: 6 },
    { id: "ROAD-D-E", name: "Hosur Main Road - Silk Board Interchange", start: "Junction_Koramangala", end: "Junction_SilkBoard", lanes: 6 },
    { id: "ROAD-E-F", name: "Outer Ring Road - Bellandur Tech Corridor", start: "Junction_SilkBoard", end: "Junction_Bellandur", lanes: 6 },
    { id: "ROAD-F-A", name: "Electronic City Elevated Tollway", start: "Junction_Bellandur", end: "Junction_Trinity", lanes: 4 }
  ];

  let roadMeshes = {};
  let flowParticles = [];

  // =========================================================================
  // INITIALIZATION
  // =========================================================================
  window.initWhatIf3D = function () {
    container = document.getElementById('whatif-3d-canvas');
    if (!container) return;

    if (isInitialized && renderer) {
      onWindowResize();
      return;
    }

    container.innerHTML = '';
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 520;

    // 1. Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x040814);
    scene.fog = new THREE.FogExp2(0x040814, 0.012);

    // 2. Camera
    camera = new THREE.PerspectiveCamera(45, width / height, 1, 1000);
    updateCameraFromSpherical();

    // 3. Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // 4. Raycaster & Mouse
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2(-999, -999);

    // 5. Lighting
    const ambient = new THREE.AmbientLight(0xdcf8ff, 0.9);
    scene.add(ambient);

    const dirLight1 = new THREE.DirectionalLight(0x38bdf8, 1.2);
    dirLight1.position.set(40, 60, 30);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xa855f7, 0.8);
    dirLight2.position.set(-40, 40, -30);
    scene.add(dirLight2);

    // 6. Master Groups
    cityGroup = new THREE.Group();
    roadsGroup = new THREE.Group();
    junctionsGroup = new THREE.Group();
    barricadesGroup = new THREE.Group();
    particlesGroup = new THREE.Group();
    labelsGroup = new THREE.Group();

    scene.add(cityGroup);
    scene.add(roadsGroup);
    scene.add(junctionsGroup);
    scene.add(barricadesGroup);
    scene.add(particlesGroup);
    scene.add(labelsGroup);

    // 7. Build Environment & Geometry
    buildHologramGridFloor();
    buildAmbientBuildings();
    buildRoadNetwork();
    buildJunctionBeacons();
    initFlowParticles();

    // 8. Event Listeners
    setupEventListeners();

    isInitialized = true;
    animate();

    // Render baseline scenario
    if (window.lastSimulationResult) {
      window.updateWhatIf3DSimulation(window.lastSimulationResult, activeClosure, activeVolumeSurge);
    }
  };

  // =========================================================================
  // ENVIRONMENT MESHES
  // =========================================================================
  function buildHologramGridFloor() {
    const grid = new THREE.GridHelper(140, 40, 0x06b6d4, 0x1e293b);
    grid.position.y = -0.05;
    scene.add(grid);

    // Radial dark ground ring
    const groundGeo = new THREE.CircleGeometry(75, 48);
    const groundMat = new THREE.MeshBasicMaterial({
      color: 0x02040a,
      transparent: true,
      opacity: 0.85
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -0.1;
    scene.add(groundMesh);
  }

  function buildAmbientBuildings() {
    cityGroup.clear();
    const buildingCoords = [
      { x: -32, z: -20, w: 8, h: 22, d: 8 },
      { x: -28, z: -32, w: 6, h: 18, d: 7 },
      { x: -8, z: -36, w: 9, h: 26, d: 8 },
      { x: 12, z: -34, w: 7, h: 20, d: 7 },
      { x: 28, z: -22, w: 9, h: 30, d: 9 },
      { x: 30, z: -6, w: 8, h: 16, d: 7 },
      { x: 22, z: 2, w: 7, h: 24, d: 8 },
      { x: 32, z: 28, w: 8, h: 26, d: 8 },
      { x: 14, z: 32, w: 7, h: 19, d: 7 },
      { x: -6, z: 28, w: 8, h: 28, d: 8 },
      { x: -30, z: 26, w: 8, h: 22, d: 8 },
      { x: -34, z: 2, w: 9, h: 25, d: 9 },
      { x: -18, z: -3, w: 6, h: 15, d: 6 },
      { x: 4, z: -4, w: 7, h: 28, d: 7 }
    ];

    buildingCoords.forEach(b => {
      const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        emissive: 0x0284c7,
        emissiveIntensity: 0.15,
        transparent: true,
        opacity: 0.35,
        roughness: 0.2,
        metalness: 0.8
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(b.x, b.h / 2, b.z);

      // Wireframe contour
      const edges = new THREE.EdgesGeometry(geo);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.4 });
      const wire = new THREE.LineSegments(edges, lineMat);
      mesh.add(wire);

      cityGroup.add(mesh);
    });
  }

  // =========================================================================
  // ROAD NETWORK & JUNCTIONS
  // =========================================================================
  function buildRoadNetwork() {
    roadsGroup.clear();
    roadMeshes = {};

    ROAD_DEFINITIONS.forEach(def => {
      const p1 = JUNCTIONS[def.start];
      const p2 = JUNCTIONS[def.end];
      if (!p1 || !p2) return;

      const v1 = new THREE.Vector3(p1.x, 0.15, p1.z);
      const v2 = new THREE.Vector3(p2.x, 0.15, p2.z);

      const dir = new THREE.Vector3().subVectors(v2, v1);
      const len = dir.length();
      const center = new THREE.Vector3().addVectors(v1, v2).multiplyScalar(0.5);
      const roadWidth = 3.6;

      // Road ribbon plane
      const roadGeo = new THREE.PlaneGeometry(roadWidth, len);
      const roadMat = new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x10b981,
        emissiveIntensity: 0.25,
        roughness: 0.3,
        metalness: 0.6,
        side: THREE.DoubleSide
      });

      const roadMesh = new THREE.Mesh(roadGeo, roadMat);
      roadMesh.position.copy(center);
      roadMesh.rotation.x = -Math.PI / 2;
      roadMesh.rotation.z = -Math.atan2(dir.x, dir.z);
      roadMesh.userData = {
        roadId: def.id,
        roadName: def.name,
        length: len,
        startVec: v1,
        endVec: v2,
        dir: dir.clone().normalize(),
        status: 'NORMAL',
        congestion: 45.0,
        speed: 48.0
      };

      // Glowing curb lines
      const curbGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-roadWidth / 2, -len / 2, 0.05),
        new THREE.Vector3(-roadWidth / 2, len / 2, 0.05)
      ]);
      const curbGeo2 = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(roadWidth / 2, -len / 2, 0.05),
        new THREE.Vector3(roadWidth / 2, len / 2, 0.05)
      ]);
      const curbMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.7 });
      const curb1 = new THREE.Line(curbGeo, curbMat);
      const curb2 = new THREE.Line(curbGeo2, curbMat);
      roadMesh.add(curb1);
      roadMesh.add(curb2);

      // Dashed lane divider
      const dashGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -len / 2, 0.08),
        new THREE.Vector3(0, len / 2, 0.08)
      ]);
      const dashMat = new THREE.LineDashedMaterial({
        color: 0xffffff,
        dashSize: 1.2,
        gapSize: 0.8,
        transparent: true,
        opacity: 0.6
      });
      const divider = new THREE.Line(dashGeo, dashMat);
      divider.computeLineDistances();
      roadMesh.add(divider);

      roadsGroup.add(roadMesh);
      roadMeshes[def.id] = roadMesh;
    });
  }

  function buildJunctionBeacons() {
    junctionsGroup.clear();

    Object.keys(JUNCTIONS).forEach(jKey => {
      const j = JUNCTIONS[jKey];

      // Pedestal Cylinder
      const pedGeo = new THREE.CylinderGeometry(2.4, 2.8, 0.6, 24);
      const pedMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        emissive: 0x06b6d4,
        emissiveIntensity: 0.4,
        roughness: 0.2
      });
      const pedestal = new THREE.Mesh(pedGeo, pedMat);
      pedestal.position.set(j.x, 0.3, j.z);

      // Floating Hologram Ring
      const ringGeo = new THREE.RingGeometry(2.8, 3.4, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.45;
      pedestal.add(ring);

      // Core Light Pillar
      const colGeo = new THREE.CylinderGeometry(0.3, 0.3, 4.0, 16);
      const colMat = new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        transparent: true,
        opacity: 0.35
      });
      const column = new THREE.Mesh(colGeo, colMat);
      column.position.y = 2.0;
      pedestal.add(column);

      // Floating text sprite label
      const labelSprite = createTextSprite(j.label, '#38bdf8');
      labelSprite.position.set(0, 4.8, 0);
      pedestal.add(labelSprite);

      junctionsGroup.add(pedestal);
    });
  }

  function createTextSprite(text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.roundRect(4, 4, 248, 56, 12);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke();

    ctx.font = 'bold 22px Inter, sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(6, 1.5, 1);
    return sprite;
  }

  // =========================================================================
  // DYNAMIC TRAFFIC FLOW PARTICLES
  // =========================================================================
  function initFlowParticles() {
    particlesGroup.clear();
    flowParticles = [];

    const particleCount = 120;
    const particleGeo = new THREE.SphereGeometry(0.28, 12, 12);

    for (let i = 0; i < particleCount; i++) {
      const roadDef = ROAD_DEFINITIONS[i % ROAD_DEFINITIONS.length];
      const mat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.95
      });
      const mesh = new THREE.Mesh(particleGeo, mat);

      const pData = {
        mesh: mesh,
        roadId: roadDef.id,
        progress: Math.random(),
        speedFactor: 0.003 + Math.random() * 0.004,
        offsetY: 0.45,
        laneOffset: (Math.random() - 0.5) * 1.6
      };

      mesh.position.set(0, -100, 0);
      particlesGroup.add(mesh);
      flowParticles.push(pData);
    }
  }

  function updateFlowParticles(delta) {
    if (!particlesEnabled) {
      particlesGroup.visible = false;
      return;
    }
    particlesGroup.visible = true;

    flowParticles.forEach(p => {
      const roadMesh = roadMeshes[p.roadId];
      if (!roadMesh) return;

      const rData = roadMesh.userData;

      // If closed, hide or redirect
      if (rData.status === 'CLOSED') {
        // Divert particle to detour road (e.g. ROAD-B-C or ROAD-C-D)
        const detours = ["ROAD-B-C", "ROAD-C-D", "ROAD-D-E"];
        p.roadId = detours[Math.floor(Math.random() * detours.length)];
        p.progress = 0;
        return;
      }

      // Calculate particle speed based on simulated road speed
      const effectiveSpeed = (rData.speed || 40.0) / 45.0;
      p.progress += p.speedFactor * effectiveSpeed * (delta * 60);
      if (p.progress >= 1.0) {
        p.progress = 0.0;
      }

      // Position along road segment
      const curPos = new THREE.Vector3().lerpVectors(rData.startVec, rData.endVec, p.progress);
      // Lateral lane offset
      const perp = new THREE.Vector3(-rData.dir.z, 0, rData.dir.x).multiplyScalar(p.laneOffset);
      curPos.add(perp);
      curPos.y = p.offsetY;

      p.mesh.position.copy(curPos);

      // Color particle based on road congestion
      if (rData.congestion > 65) {
        p.mesh.material.color.setHex(0xf43f5e); // Crimson
      } else if (rData.congestion > 40) {
        p.mesh.material.color.setHex(0xfbbf24); // Amber
      } else {
        p.mesh.material.color.setHex(0x34d399); // Emerald
      }
    });
  }

  // =========================================================================
  // BARRICADES & CLOSURE HAZARD VISUALS
  // =========================================================================
  function renderClosureBarricades(closedRoadIds) {
    barricadesGroup.clear();

    closedRoadIds.forEach(cId => {
      const roadMesh = roadMeshes[cId];
      if (!roadMesh) return;

      const rData = roadMesh.userData;
      const center = new THREE.Vector3().addVectors(rData.startVec, rData.endVec).multiplyScalar(0.5);

      // 1. Hazard Red Warning Tower
      const towerGeo = new THREE.CylinderGeometry(0.2, 0.4, 9.0, 16);
      const towerMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.45
      });
      const tower = new THREE.Mesh(towerGeo, towerMat);
      tower.position.set(center.x, 4.5, center.z);
      barricadesGroup.add(tower);

      // 2. Pulsing Barrier Ground Rings
      const ringGeo = new THREE.RingGeometry(1.8, 2.6, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xff0033,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9
      });
      const bRing = new THREE.Mesh(ringGeo, ringMat);
      bRing.rotation.x = -Math.PI / 2;
      bRing.position.set(center.x, 0.35, center.z);
      barricadesGroup.add(bRing);

      // 3. Neon Barricade Gate (Crossbeam)
      const gateGeo = new THREE.BoxGeometry(4.2, 1.2, 0.4);
      const gateMat = new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xef4444,
        emissiveIntensity: 0.8,
        roughness: 0.2
      });
      const gate = new THREE.Mesh(gateGeo, gateMat);
      gate.position.set(center.x, 1.2, center.z);
      gate.rotation.y = -Math.atan2(rData.dir.x, rData.dir.z) + Math.PI / 2;
      barricadesGroup.add(gate);

      // 4. Floating 3D Warning Sprite
      const warningSprite = createTextSprite('⛔ ROAD CLOSED', '#ef4444');
      warningSprite.position.set(center.x, 4.2, center.z);
      barricadesGroup.add(warningSprite);
    });
  }

  // =========================================================================
  // SIMULATION UPDATE HANDLER
  // =========================================================================
  window.updateWhatIf3DSimulation = function (simData, closure, volumeSurge) {
    if (!isInitialized) {
      window.initWhatIf3D();
    }

    currentSimData = simData;
    activeClosure = closure || 'none';
    activeVolumeSurge = volumeSurge !== undefined ? volumeSurge : 20;

    const closedRoads = activeClosure !== 'none' ? [activeClosure] : [];

    // 1. Update Road Visuals & Metrics
    if (simData && simData.road_impacts) {
      simData.road_impacts.forEach(impact => {
        const rMesh = roadMeshes[impact.road_id];
        if (!rMesh) return;

        rMesh.userData.congestion = impact.simulated_congestion_pct;
        rMesh.userData.speed = impact.simulated_speed_kmh;
        rMesh.userData.status = impact.status;

        // Apply dynamic material color
        if (impact.is_closed) {
          rMesh.material.color.setHex(0x450a0a); // Deep dark red
          rMesh.material.emissive.setHex(0xef4444); // Neon red glow
          rMesh.material.emissiveIntensity = 0.5;
        } else if (impact.is_detour || impact.simulated_congestion_pct > 65) {
          rMesh.material.color.setHex(0xf43f5e); // Crimson
          rMesh.material.emissive.setHex(0xf43f5e);
          rMesh.material.emissiveIntensity = 0.35;
        } else if (impact.simulated_congestion_pct > 40) {
          rMesh.material.color.setHex(0xf59e0b); // Amber
          rMesh.material.emissive.setHex(0xf59e0b);
          rMesh.material.emissiveIntensity = 0.25;
        } else {
          rMesh.material.color.setHex(0x10b981); // Emerald free flow
          rMesh.material.emissive.setHex(0x10b981);
          rMesh.material.emissiveIntensity = 0.2;
        }
      });
    }

    // 2. Render Barricades on closed roads
    renderClosureBarricades(closedRoads);

    // 3. Update Floating HUD Telemetry
    updateFloatingHud(simData, activeClosure, activeVolumeSurge);
  };

  function updateFloatingHud(sim, closure, vol) {
    const titleEl = document.getElementById('whatif-hud-title');
    const flowEl = document.getElementById('whatif-hud-flow');
    const speedEl = document.getElementById('whatif-hud-speed');
    const congEl = document.getElementById('whatif-hud-congestion');
    const detourEl = document.getElementById('whatif-hud-detour');
    const badgeEl = document.getElementById('whatif-scenario-badge');

    if (titleEl) {
      const roadObj = ROAD_DEFINITIONS.find(r => r.id === closure);
      titleEl.innerText = roadObj ? `${roadObj.name} Closed` : 'All Network Corridors Open';
    }
    if (flowEl) flowEl.innerText = `${vol > 0 ? '+' : ''}${vol}% Surge`;
    if (speedEl) speedEl.innerText = sim ? `${sim.avg_speed_after_kmh || 20.8} km/h` : '20.8 km/h';
    if (congEl) congEl.innerText = sim ? `${sim.overall_congestion_after || 76.5}%` : '76.5%';
    if (detourEl) {
      detourEl.innerText = closure !== 'none' ? 'ROAD-B-C / C-D (Spillover)' : 'No Detour Required';
    }
    if (badgeEl) badgeEl.innerText = closure !== 'none' ? 'INCIDENT DETOUR' : 'STEADY STATE';
  }

  // =========================================================================
  // CAMERA PRESETS & CONTROLS
  // =========================================================================
  window.setWhatIfCamera = function (mode) {
    const buttons = ['whatif-cam-iso', 'whatif-cam-focus', 'whatif-cam-top'];
    buttons.forEach(bId => {
      const btn = document.getElementById(bId);
      if (btn) {
        btn.className = 'px-2 py-1 text-[11px] rounded text-slate-400 hover:text-white transition';
      }
    });

    const activeBtn = document.getElementById(`whatif-cam-${mode}`);
    if (activeBtn) {
      activeBtn.className = 'px-2 py-1 text-[11px] rounded bg-purple-600 text-white font-semibold transition';
    }

    if (mode === 'iso') {
      cameraPosTarget.set(0, 38, 54);
      cameraTarget.set(0, 0, 0);
    } else if (mode === 'focus') {
      // Focus on active closure midpoint or central junction
      const roadMesh = roadMeshes[activeClosure];
      if (roadMesh) {
        const center = new THREE.Vector3().addVectors(roadMesh.userData.startVec, roadMesh.userData.endVec).multiplyScalar(0.5);
        cameraTarget.copy(center);
        cameraPosTarget.set(center.x + 12, 18, center.z + 24);
      } else {
        cameraPosTarget.set(0, 24, 30);
        cameraTarget.set(0, 0, 0);
      }
    } else if (mode === 'top') {
      cameraPosTarget.set(0, 72, 0.1);
      cameraTarget.set(0, 0, 0);
    }
  };

  window.toggleWhatIfParticles = function () {
    particlesEnabled = !particlesEnabled;
    const btn = document.getElementById('whatif-particles-btn');
    if (btn) {
      if (particlesEnabled) {
        btn.className = 'px-2.5 py-1 bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 rounded font-semibold text-[11px] flex items-center space-x-1';
        btn.innerHTML = '<i class="fa-solid fa-wind mr-1"></i><span>Traffic Streams: ON</span>';
      } else {
        btn.className = 'px-2.5 py-1 bg-slate-900 border border-slate-800 text-slate-400 rounded font-semibold text-[11px] flex items-center space-x-1';
        btn.innerHTML = '<i class="fa-solid fa-wind mr-1"></i><span>Traffic Streams: OFF</span>';
      }
    }
  };

  window.resetWhatIf3D = function () {
    window.setWhatIfCamera('iso');
  };

  function updateCameraFromSpherical() {
    camera.position.x = cameraTarget.x + spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
    camera.position.y = cameraTarget.y + spherical.radius * Math.cos(spherical.phi);
    camera.position.z = cameraTarget.z + spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
    camera.lookAt(cameraTarget);
  }

  // =========================================================================
  // MOUSE INTERACTION & RAYCASTING
  // =========================================================================
  function setupEventListeners() {
    container.addEventListener('mousedown', (e) => {
      if (e.button === 0) isDragging = true;
      else if (e.button === 2) isRightDragging = true;
      prevMousePos.x = e.clientX;
      prevMousePos.y = e.clientY;
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
      isRightDragging = false;
    });

    container.addEventListener('contextmenu', (e) => e.preventDefault());

    container.addEventListener('mousemove', (e) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;

      if (isDragging) {
        const deltaX = e.clientX - prevMousePos.x;
        const deltaY = e.clientY - prevMousePos.y;

        spherical.theta -= deltaX * 0.008;
        spherical.phi = Math.max(0.1, Math.min(Math.PI / 2.05, spherical.phi - deltaY * 0.008));
        updateCameraFromSpherical();

        prevMousePos.x = e.clientX;
        prevMousePos.y = e.clientY;
      } else if (isRightDragging) {
        const deltaX = e.clientX - prevMousePos.x;
        const deltaY = e.clientY - prevMousePos.y;

        const panSpeed = 0.05;
        cameraTarget.x -= deltaX * panSpeed;
        cameraTarget.z -= deltaY * panSpeed;
        updateCameraFromSpherical();

        prevMousePos.x = e.clientX;
        prevMousePos.y = e.clientY;
      } else {
        checkRaycastHover(e);
      }
    });

    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      spherical.radius = Math.max(15, Math.min(130, spherical.radius + e.deltaY * 0.05));
      updateCameraFromSpherical();
    }, { passive: false });

    window.addEventListener('resize', onWindowResize);
  }

  function checkRaycastHover(event) {
    if (!raycaster || !camera || !roadsGroup) return;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(roadsGroup.children);
    const tooltip = document.getElementById('whatif-3d-tooltip');

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      if (hit && hit.userData && hit.userData.roadId) {
        hoveredRoad = hit;
        container.style.cursor = 'pointer';

        if (tooltip) {
          const u = hit.userData;
          const rect = container.getBoundingClientRect();
          tooltip.style.left = `${event.clientX - rect.left + 15}px`;
          tooltip.style.top = `${event.clientY - rect.top - 20}px`;
          tooltip.innerHTML = `
            <div class="text-[10px] text-gray-400 font-bold uppercase tracking-wider">${u.roadId}</div>
            <div class="text-white font-bold">${u.roadName}</div>
            <div class="mt-1 flex items-center justify-between space-x-3 text-[11px]">
              <span class="text-gray-300">Congestion:</span>
              <span class="${u.congestion > 65 ? 'text-rose-400 font-bold' : (u.congestion > 40 ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold')}">${u.congestion}%</span>
            </div>
            <div class="flex items-center justify-between space-x-3 text-[11px]">
              <span class="text-gray-300">Speed:</span>
              <span class="text-cyan-300 font-bold">${u.speed} km/h</span>
            </div>
            <div class="mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${u.status === 'CLOSED' ? 'bg-rose-900/60 text-rose-300' : (u.status === 'DETOUR_CONGESTED' ? 'bg-amber-900/60 text-amber-300' : 'bg-emerald-900/60 text-emerald-300')}">
              STATUS: ${u.status}
            </div>
          `;
          tooltip.classList.remove('hidden');
        }
        return;
      }
    }

    hoveredRoad = null;
    container.style.cursor = 'grab';
    if (tooltip) tooltip.classList.add('hidden');
  }

  function onWindowResize() {
    if (!container || !renderer || !camera) return;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 520;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  // =========================================================================
  // ANIMATION LOOP
  // =========================================================================
  function animate() {
    animFrameId = requestAnimationFrame(animate);

    const delta = clock.getDelta();
    const time = clock.getElapsedTime();

    // Smooth camera target interpolation when switching presets
    if (!isDragging && !isRightDragging) {
      camera.position.lerp(cameraPosTarget, 0.05);
      camera.lookAt(cameraTarget);
    }

    // Update traffic particles along roads
    updateFlowParticles(delta);

    // Pulse barricades if active
    if (barricadesGroup && barricadesGroup.children.length > 0) {
      barricadesGroup.children.forEach(child => {
        if (child.isSprite) {
          child.position.y = 4.2 + Math.sin(time * 4) * 0.2;
        }
      });
    }

    renderer.render(scene, camera);
  }

})();
