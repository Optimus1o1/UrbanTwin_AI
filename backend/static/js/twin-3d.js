/**
 * UrbanTwin AI - Advanced 3D Transparent Digital Twin Engine
 * Dedicated Command Center Visualizer powered by Three.js WebGL
 * 
 * Features:
 * - Crystalline Translucent Glass Buildings with internal visible floor slices & glowing energy cores
 * - Curved Cybernetic River / Canal with illuminated suspension bridges
 * - Multi-Level Elevated Highway Flyovers with double-decker traffic flows
 * - Animated Vertical LIDAR Scanwave sweeping through city architecture
 * - Volumetric 3D ANPR Radar Cones with rotating sweeps and ground detection rings
 * - 4 Visual Modes: Hologram Glass, X-Ray Structural, Thermal Density Heatmap, Cyber Matrix
 * - Dynamic Transparency Levels: Ghost (15%), Glass (30%), Prism (55%)
 * - Full 360° Mouse Orbit, Pan, and Zoom interaction
 * - Real-Time Trajectory Tube & Chase Vehicle Tracking integration
 */

(function () {
  'use strict';

  // Core Three.js variables
  let container, scene, camera, renderer, raycaster, mouse;
  let buildingsGroup, roadsGroup, flyoversGroup, waterGroup, trafficGroup, sensorNodesGroup, lasersGroup, trajectoryGroup;
  let internalFloorsGroup, scanwaveGroup, vehicleHudGroup;
  let animFrameId = null;

  // State
  let visualMode = 'glass'; // 'glass', 'xray', 'thermal', 'cyber'
  let transparencyLevel = 'medium'; // 'high' (0.12), 'medium' (0.28), 'low' (0.52)
  let opacityMap = { high: 0.12, medium: 0.28, low: 0.52 };
  let currentOpacity = 0.28;
  let cameraMode = 'cinematic'; // 'cinematic', 'drone', 'junction', 'corridor', 'chase', 'manual'
  let isTrackingTarget = false;
  let targetVehicle = null;

  // Camera animation & Orbit interpolation
  let cameraTarget = new THREE.Vector3(0, 0, 0);
  let cameraPosTarget = new THREE.Vector3(0, 36, 52);
  let clock = new THREE.Clock();

  // Mouse drag Orbit / Pan state
  let isDragging = false;
  let isRightDragging = false;
  let prevMousePos = { x: 0, y: 0 };
  let spherical = { radius: 64, phi: Math.PI / 4, theta: Math.PI / 6 };

  // Layers visibility toggles
  const layerStates = {
    floors: true,
    scanwave: true,
    cones: true,
    labels: true,
    flyovers: true,
    heat: false
  };

  // Data collections for dynamic updates
  let buildingMeshItems = [];
  let floorMeshItems = [];
  let roadMeshItems = [];
  let trafficVehicles = [];
  let sensorNodes = [];
  let scanwavePlane = null;
  let scanwaveDirection = 1;

  // Camera Nodes mapped to 3D Space Coordinates
  const CAMERA_NODES = [
    { id: 'CAM_01', name: 'MG Road - Trinity Junction', sector: 'Commercial Core', x: -16, z: -10, flow: 580, speed: '42.5 km/h', status: 'optimal', density: 0.42 },
    { id: 'CAM_02', name: 'Indiranagar 100ft Express', sector: 'East Transit', x: 0, z: -26, flow: 710, speed: '56.0 km/h', status: 'optimal', density: 0.38 },
    { id: 'CAM_03', name: 'Koramangala Financial Core', sector: 'Tech Corridor', x: 18, z: -8, flow: 890, speed: '24.8 km/h', status: 'dense', density: 0.88 },
    { id: 'CAM_04', name: 'West River Crossing Flyover', sector: 'West Gateway', x: -26, z: 14, flow: 460, speed: '62.4 km/h', status: 'optimal', density: 0.25 },
    { id: 'CAM_05', name: 'Outer Ring Road - Bellandur', sector: 'South-East Corridor', x: 6, z: 22, flow: 620, speed: '38.0 km/h', status: 'moderate', density: 0.65 },
    { id: 'CAM_06', name: 'Electronic City Tollway', sector: 'South Tech Corridor', x: 26, z: 18, flow: 510, speed: '48.6 km/h', status: 'optimal', density: 0.35 }
  ];

  // Ground Multi-lane Road Network
  const GROUND_ROADS = [
    [ {x: -42, z: -10}, {x: -16, z: -10}, {x: 0, z: -26}, {x: 38, z: -26} ],
    [ {x: -16, z: -40}, {x: -16, z: -10}, {x: 18, z: -8}, {x: 40, z: -8} ],
    [ {x: -40, z: 14}, {x: -26, z: 14}, {x: 6, z: 22}, {x: 26, z: 18}, {x: 40, z: 18} ],
    [ {x: 0, z: -40}, {x: 0, z: -26}, {x: 6, z: 22}, {x: 6, z: 40} ],
    [ {x: 18, z: -40}, {x: 18, z: -8}, {x: 26, z: 18}, {x: 26, z: 40} ]
  ];

  // Elevated Expressway Flyover Network (Y = 4.2 to 5.5)
  const ELEVATED_ROADS = [
    [ {x: -38, y: 4.8, z: -20}, {x: -18, y: 5.2, z: 0}, {x: 8, y: 5.0, z: 5}, {x: 36, y: 4.5, z: 2} ],
    [ {x: -10, y: 4.5, z: -35}, {x: -2, y: 5.4, z: -6}, {x: 14, y: 4.8, z: 26}, {x: 28, y: 4.2, z: 38} ]
  ];

  // =========================================================================
  // INITIALIZATION
  // =========================================================================
  window.initDigitalTwin3D = function () {
    container = document.getElementById('webgl-canvas-container');
    if (!container) return;

    // Clear previous renderer or children
    container.innerHTML = '';
    if (animFrameId) cancelAnimationFrame(animFrameId);

    // 1. Scene with transparent clear background
    scene = new THREE.Scene();
    scene.background = null; // TRANSPARENT CANVAS: lets underlying glass-card backdrop shine through!
    scene.fog = new THREE.FogExp2(0x060c1c, 0.010);

    // 2. Camera setup
    const aspect = container.clientWidth / (container.clientHeight || 520);
    camera = new THREE.PerspectiveCamera(48, aspect, 0.5, 450);
    updateCameraFromSpherical();

    // 3. High-Performance WebGL Renderer with Alpha: true & Capped Pixel Ratio
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true, // Transparent background!
      powerPreference: "high-performance"
    });
    renderer.setSize(container.clientWidth, container.clientHeight || 520);
    const dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 768 ? 1.0 : 1.25);
    renderer.setPixelRatio(dpr);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    container.appendChild(renderer.domElement);

    // 4. Raycaster & Interaction
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // 5. Scene Hierarchy Groups
    buildingsGroup = new THREE.Group();
    internalFloorsGroup = new THREE.Group();
    roadsGroup = new THREE.Group();
    flyoversGroup = new THREE.Group();
    waterGroup = new THREE.Group();
    trafficGroup = new THREE.Group();
    sensorNodesGroup = new THREE.Group();
    lasersGroup = new THREE.Group();
    scanwaveGroup = new THREE.Group();
    vehicleHudGroup = new THREE.Group();
    trajectoryGroup = new THREE.Group();

    scene.add(waterGroup);
    scene.add(roadsGroup);
    scene.add(flyoversGroup);
    scene.add(buildingsGroup);
    scene.add(internalFloorsGroup);
    scene.add(trafficGroup);
    scene.add(sensorNodesGroup);
    scene.add(lasersGroup);
    scene.add(scanwaveGroup);
    scene.add(vehicleHudGroup);
    scene.add(trajectoryGroup);

    // 6. Build City Infrastructure
    setupLighting();
    buildHolographicRadarFloor();
    buildCyberCanalWaterway();
    buildGroundRoadNetworks();
    buildElevatedFlyovers();
    buildTransparentCrystalCity();
    buildVerticalLidarScanwave();
    buildVolumetricSensorTowers();
    initSimulatedTrafficFlow();

    // 7. Event Listeners
    setupMouseInteractions();
    window.addEventListener('resize', onWindowResize);

    // 8. Start Loop
    clock.start();
    animate();
  };

  // Fallback alias for backward compatibility
  window.initUrbanTwin3D = window.initDigitalTwin3D;

  // =========================================================================
  // LIGHTING
  // =========================================================================
  function setupLighting() {
    const ambient = new THREE.AmbientLight(0x0f2038, 2.4);
    scene.add(ambient);

    // Dual directional holographic rim lights
    const cyanRim = new THREE.DirectionalLight(0x00f0ff, 2.6);
    cyanRim.position.set(45, 60, 35);
    scene.add(cyanRim);

    const violetRim = new THREE.DirectionalLight(0x9d4edd, 2.0);
    violetRim.position.set(-45, 45, -35);
    scene.add(violetRim);

    // Central core beacon
    const centerGlow = new THREE.PointLight(0x06b6d4, 3.2, 80);
    centerGlow.position.set(0, 12, 0);
    scene.add(centerGlow);
  }

  // =========================================================================
  // HOLOGRAPHIC GROUND & RADAR COORDINATE GRID
  // =========================================================================
  function buildHolographicRadarFloor() {
    // Primary Cyber Grid
    const grid = new THREE.GridHelper(96, 48, 0x00f0ff, 0x132644);
    grid.position.y = 0;
    grid.material.transparent = true;
    grid.material.opacity = 0.45;
    scene.add(grid);

    // Fine holographic sub-grid
    const subGrid = new THREE.GridHelper(96, 96, 0x06b6d4, 0x0c1628);
    subGrid.position.y = -0.05;
    subGrid.material.transparent = true;
    subGrid.material.opacity = 0.25;
    scene.add(subGrid);

    // Concentric Radar Distance Rings (10km, 20km, 30km, 40km)
    const ringRadii = [12, 24, 36, 48];
    ringRadii.forEach(r => {
      const ringGeo = new THREE.RingGeometry(r - 0.08, r, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.35 - (r / 200)
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      ringMesh.position.y = 0.02;
      scene.add(ringMesh);
    });

    // Cardinal coordinate axis lines
    const axisMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.6 });
    const ptsX = [new THREE.Vector3(-48, 0.04, 0), new THREE.Vector3(48, 0.04, 0)];
    const ptsZ = [new THREE.Vector3(0, 0.04, -48), new THREE.Vector3(0, 0.04, 48)];
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ptsX), axisMat));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ptsZ), axisMat));
  }

  // =========================================================================
  // CURVED CYBER CANAL & ILLUMINATED SUSPENSION BRIDGES
  // =========================================================================
  function buildCyberCanalWaterway() {
    // Curved canal path cutting diagonally through city
    const canalCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-46, -0.1, 28),
      new THREE.Vector3(-28, -0.1, 16),
      new THREE.Vector3(-8, -0.1, -2),
      new THREE.Vector3(12, -0.1, -16),
      new THREE.Vector3(46, -0.1, -34)
    ]);

    // Translucent glowing water ribbon
    const canalGeo = new THREE.TubeGeometry(canalCurve, 64, 4.2, 4, false);
    const canalMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x0369a1,
      emissiveIntensity: 0.35,
      roughness: 0.1,
      metalness: 0.9,
      transparent: true,
      opacity: 0.45
    });
    const canalMesh = new THREE.Mesh(canalGeo, canalMat);
    canalMesh.scale.set(1, 0.04, 1);
    waterGroup.add(canalMesh);

    // Glowing Canal Embankment Edges
    [-4.2, 4.2].forEach(offset => {
      const edgePoints = canalCurve.getPoints(64).map(p => new THREE.Vector3(p.x, 0.1, p.z + offset * 0.7));
      const edgeGeo = new THREE.BufferGeometry().setFromPoints(edgePoints);
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.8 });
      waterGroup.add(new THREE.Line(edgeGeo, edgeMat));
    });

    // Two Illuminated Suspension Bridges across the canal
    const bridgeLocations = [
      { x: -26, z: 14, angle: 0.35 },
      { x: 14, z: -14, angle: 0.42 }
    ];

    bridgeLocations.forEach(b => {
      const bridgeGroup = new THREE.Group();
      bridgeGroup.position.set(b.x, 0.6, b.z);
      bridgeGroup.rotation.y = b.angle;

      // Transparent bridge deck
      const deckGeo = new THREE.BoxGeometry(11, 0.3, 3.2);
      const deckMat = new THREE.MeshStandardMaterial({
        color: 0x0e2444,
        roughness: 0.2,
        metalness: 0.7,
        transparent: true,
        opacity: 0.55
      });
      const deck = new THREE.Mesh(deckGeo, deckMat);
      bridgeGroup.add(deck);

      // Glowing guardrails
      [-1.5, 1.5].forEach(zOffset => {
        const railGeo = new THREE.BoxGeometry(11, 0.4, 0.1);
        const railMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.85 });
        const rail = new THREE.Mesh(railGeo, railMat);
        rail.position.set(0, 0.3, zOffset);
        bridgeGroup.add(rail);
      });

      // Arch Pylons & Stay Cables
      [-3.5, 3.5].forEach(xOffset => {
        const pylonGeo = new THREE.CylinderGeometry(0.15, 0.25, 4.8, 8);
        const pylonMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.8, roughness: 0.2 });
        const pylon = new THREE.Mesh(pylonGeo, pylonMat);
        pylon.position.set(xOffset, 2.2, 0);
        bridgeGroup.add(pylon);

        // Suspension stay cables
        for (let i = -1.5; i <= 1.5; i += 1.0) {
          const cableGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(xOffset, 4.4, 0),
            new THREE.Vector3(xOffset + i * 1.6, 0.2, 1.5)
          ]);
          const cable = new THREE.Line(cableGeo, new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.5 }));
          bridgeGroup.add(cable);
        }
      });

      waterGroup.add(bridgeGroup);
    });
  }

  // =========================================================================
  // GROUND ROAD NETWORK WITH ILLUMINATED LANES
  // =========================================================================
  function buildGroundRoadNetworks() {
    GROUND_ROADS.forEach(pathPoints => {
      const curve = new THREE.CatmullRomCurve3(
        pathPoints.map(p => new THREE.Vector3(p.x, 0.12, p.z))
      );

      // Translucent Road Surface Ribbon
      const roadGeo = new THREE.TubeGeometry(curve, 64, 1.4, 4, false);
      const roadMat = new THREE.MeshStandardMaterial({
        color: 0x071124,
        roughness: 0.3,
        metalness: 0.7,
        transparent: true,
        opacity: 0.55
      });
      const roadMesh = new THREE.Mesh(roadGeo, roadMat);
      roadMesh.scale.set(1, 0.08, 1);
      roadsGroup.add(roadMesh);
      roadMeshItems.push({ mesh: roadMesh, curve: curve, type: 'ground' });

      // Luminous Centerline Data Stream
      const lineGeo = new THREE.TubeGeometry(curve, 64, 0.08, 4, false);
      const lineMat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.75
      });
      const lineMesh = new THREE.Mesh(lineGeo, lineMat);
      lineMesh.position.y = 0.14;
      roadsGroup.add(lineMesh);
    });
  }

  // =========================================================================
  // MULTI-LEVEL ELEVATED EXPRESSWAY FLYOVERS
  // =========================================================================
  function buildElevatedFlyovers() {
    ELEVATED_ROADS.forEach(pathPoints => {
      const curve = new THREE.CatmullRomCurve3(
        pathPoints.map(p => new THREE.Vector3(p.x, p.y, p.z))
      );

      // Translucent Elevated Road Deck
      const deckGeo = new THREE.TubeGeometry(curve, 72, 1.3, 4, false);
      const deckMat = new THREE.MeshStandardMaterial({
        color: 0x0c213d,
        emissive: 0x07162b,
        emissiveIntensity: 0.4,
        roughness: 0.2,
        metalness: 0.8,
        transparent: true,
        opacity: 0.65
      });
      const deckMesh = new THREE.Mesh(deckGeo, deckMat);
      deckMesh.scale.set(1, 0.12, 1);
      flyoversGroup.add(deckMesh);
      roadMeshItems.push({ mesh: deckMesh, curve: curve, type: 'elevated' });

      // Glowing Neon Guardrails (Upper level safety edges)
      [-1.3, 1.3].forEach(latOffset => {
        const railPoints = curve.getPoints(72).map(pt => new THREE.Vector3(pt.x, pt.y + 0.35, pt.z + latOffset * 0.5));
        const railGeo = new THREE.BufferGeometry().setFromPoints(railPoints);
        const railMat = new THREE.LineBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.85 });
        flyoversGroup.add(new THREE.Line(railGeo, railMat));
      });

      // Supporting Transparent Structural Pylons along the flyover
      const pylonPoints = curve.getSpacedPoints(10);
      pylonPoints.forEach(pt => {
        if (pt.y > 1.5) {
          const pylonGeo = new THREE.CylinderGeometry(0.2, 0.35, pt.y, 8);
          const pylonMat = new THREE.MeshStandardMaterial({
            color: 0x1e3a5f,
            transparent: true,
            opacity: 0.55,
            metalness: 0.8,
            roughness: 0.2
          });
          const pylon = new THREE.Mesh(pylonGeo, pylonMat);
          pylon.position.set(pt.x, pt.y / 2, pt.z);
          flyoversGroup.add(pylon);
        }
      });
    });
  }

  // =========================================================================
  // TRANSPARENT CRYSTAL BUILDINGS WITH INTERNAL FLOOR SLICES
  // =========================================================================
  function buildTransparentCrystalCity() {
    buildingMeshItems = [];
    floorMeshItems = [];

    // Distinct Landmark 1: The Prismatic Spire (Stepped Hexagonal Glass Citadel)
    createPrismaticSpire(0, 0);

    // Distinct Landmark 2: Twin Arc Towers with Skybridge
    createTwinSkybridgeTowers(-18, -20);

    // Distinct Landmark 3: The Diamond Faceted Tower with DNA Energy Core
    createDiamondCoreTower(22, 10);

    // Distinct Landmark 4: Geodesic Hexagonal Transit Dome
    createTransitGeodesicDome(-6, 12);

    // Sector Clusters with Translucent Glass Volumes & Internal Floors
    const sectors = [
      { cx: -28, cz: -22, radius: 10, count: 8, heightScale: 28, color: 0x00f0ff, edgeColor: 0x38bdf8 },
      { cx: 26, cz: -22, radius: 11, count: 9, heightScale: 34, color: 0x8b5cf6, edgeColor: 0xa78bfa },
      { cx: -28, cz: 26, radius: 10, count: 7, heightScale: 24, color: 0x10b981, edgeColor: 0x34d399 },
      { cx: 28, cz: 26, radius: 10, count: 8, heightScale: 30, color: 0x06b6d4, edgeColor: 0x22d3ee },
      { cx: 0, cz: 28, radius: 8, count: 6, heightScale: 22, color: 0x3b82f6, edgeColor: 0x60a5fa }
    ];

    sectors.forEach(sec => {
      for (let i = 0; i < sec.count; i++) {
        const angle = (i / sec.count) * Math.PI * 2 + (Math.random() * 0.4);
        const dist = 3.5 + Math.random() * (sec.radius - 3.5);
        const x = sec.cx + Math.cos(angle) * dist;
        const z = sec.cz + Math.sin(angle) * dist;

        // Ensure buildings don't obstruct main road intersections
        if (isNearIntersection(x, z)) continue;

        const w = 3.0 + Math.random() * 1.8;
        const d = 3.0 + Math.random() * 1.8;
        const h = 8 + Math.random() * sec.heightScale;

        createTransparentSkyscraper(x, z, w, h, d, sec.color, sec.edgeColor);
      }
    });
  }

  function isNearIntersection(x, z) {
    for (const cam of CAMERA_NODES) {
      if (Math.hypot(x - cam.x, z - cam.z) < 4.2) return true;
    }
    return false;
  }

  // Generic Translucent Glass Skyscraper with internal floors & edges
  function createTransparentSkyscraper(x, z, w, h, d, baseColor, edgeColor) {
    const bGeo = new THREE.BoxGeometry(w, h, d);

    // Translucent Glass Material: depthWrite: false prevents z-fighting among overlapping transparent planes!
    const bMat = new THREE.MeshPhysicalMaterial({
      color: baseColor,
      roughness: 0.08,
      metalness: 0.15,
      transparent: true,
      opacity: currentOpacity,
      depthWrite: false,
      transmission: 0.6,
      ior: 1.45,
      reflectivity: 0.5
    });

    const building = new THREE.Mesh(bGeo, bMat);
    building.position.set(x, h / 2, z);
    buildingsGroup.add(building);

    // Glowing Structural Edge Wireframe
    const edgeGeo = new THREE.EdgesGeometry(bGeo);
    const edgeMat = new THREE.LineBasicMaterial({
      color: edgeColor,
      transparent: true,
      opacity: 0.65
    });
    const edgeLine = new THREE.LineSegments(edgeGeo, edgeMat);
    building.add(edgeLine);

    // Visible Internal Floor Slices every 2.5 units
    const floorStep = 2.6;
    const floorCount = Math.floor(h / floorStep);
    const buildingFloors = [];

    for (let f = 1; f < floorCount; f++) {
      const fy = f * floorStep - (h / 2);
      const fGeo = new THREE.PlaneGeometry(w * 0.94, d * 0.94);
      const fMat = new THREE.MeshBasicMaterial({
        color: edgeColor,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const floorPlane = new THREE.Mesh(fGeo, fMat);
      floorPlane.rotation.x = Math.PI / 2;
      floorPlane.position.y = fy;
      building.add(floorPlane);
      buildingFloors.push(floorPlane);
      floorMeshItems.push(floorPlane);
    }

    // Internal vertical core energy shaft
    const coreGeo = new THREE.CylinderGeometry(0.2, 0.2, h * 0.95, 8);
    const coreMat = new THREE.MeshBasicMaterial({
      color: edgeColor,
      transparent: true,
      opacity: 0.45
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    building.add(core);

    // Rooftop Communications Mast on taller structures
    if (h > 22) {
      const mastGeo = new THREE.CylinderGeometry(0.06, 0.12, 4.0, 6);
      const mastMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8 });
      const mast = new THREE.Mesh(mastGeo, mastMat);
      mast.position.set(0, h / 2 + 2.0, 0);
      building.add(mast);

      const beaconGeo = new THREE.SphereGeometry(0.25, 8, 8);
      const beaconMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.set(0, h / 2 + 4.0, 0);
      building.add(beacon);
    }

    buildingMeshItems.push({
      mesh: building,
      mat: bMat,
      edgeMat: edgeMat,
      floors: buildingFloors,
      baseColor: baseColor,
      edgeColor: edgeColor,
      height: h,
      pos: { x, z }
    });
  }

  // Landmark 1: The Prismatic Spire (Stepped Hexagonal Glass Citadel)
  function createPrismaticSpire(cx, cz) {
    const spireGroup = new THREE.Group();
    spireGroup.position.set(cx, 0, cz);

    const tiers = [
      { radius: 5.5, height: 16, yOffset: 8, color: 0x00f0ff },
      { radius: 4.2, height: 16, yOffset: 24, color: 0x38bdf8 },
      { radius: 2.8, height: 14, yOffset: 39, color: 0x8b5cf6 },
      { radius: 1.4, height: 12, yOffset: 52, color: 0xa855f7 }
    ];

    tiers.forEach(t => {
      const geo = new THREE.CylinderGeometry(t.radius * 0.8, t.radius, t.height, 6);
      const mat = new THREE.MeshPhysicalMaterial({
        color: t.color,
        roughness: 0.05,
        metalness: 0.2,
        transparent: true,
        opacity: currentOpacity + 0.05,
        depthWrite: false,
        transmission: 0.65
      });
      const tierMesh = new THREE.Mesh(geo, mat);
      tierMesh.position.y = t.yOffset;
      spireGroup.add(tierMesh);

      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.85 })
      );
      tierMesh.add(edge);

      // Floor rings inside cylinder
      for (let y = -t.height / 2 + 2.5; y < t.height / 2; y += 2.5) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.3, t.radius * 0.85, 6),
          new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide })
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = y;
        tierMesh.add(ring);
        floorMeshItems.push(ring);
      }
    });

    // Needle Beacon on Top
    const needleGeo = new THREE.CylinderGeometry(0.08, 0.2, 7.0, 8);
    const needle = new THREE.Mesh(needleGeo, new THREE.MeshBasicMaterial({ color: 0x00f0ff }));
    needle.position.y = 61.5;
    spireGroup.add(needle);

    // Pulsing Beacon Light
    const spireLight = new THREE.PointLight(0x00f0ff, 3.5, 45);
    spireLight.position.y = 65;
    spireGroup.add(spireLight);

    buildingsGroup.add(spireGroup);
  }

  // Landmark 2: Twin Arc Towers with Skybridge
  function createTwinSkybridgeTowers(cx, cz) {
    const twinGroup = new THREE.Group();
    twinGroup.position.set(cx, 0, cz);

    const h = 42;
    const spacing = 7.5;

    [-spacing / 2, spacing / 2].forEach(xOff => {
      const geo = new THREE.BoxGeometry(4.2, h, 4.2);
      const mat = new THREE.MeshPhysicalMaterial({
        color: 0x8b5cf6,
        roughness: 0.08,
        transparent: true,
        opacity: currentOpacity,
        depthWrite: false
      });
      const tower = new THREE.Mesh(geo, mat);
      tower.position.set(xOff, h / 2, 0);
      twinGroup.add(tower);

      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: 0xc084fc, transparent: true, opacity: 0.75 })
      );
      tower.add(edge);

      // Interior floors
      for (let y = 3; y < h; y += 3) {
        const fl = new THREE.Mesh(
          new THREE.PlaneGeometry(3.9, 3.9),
          new THREE.MeshBasicMaterial({ color: 0xc084fc, transparent: true, opacity: 0.18, side: THREE.DoubleSide })
        );
        fl.rotation.x = Math.PI / 2;
        fl.position.set(xOff, y, 0);
        twinGroup.add(fl);
        floorMeshItems.push(fl);
      }
    });

    // Transparent Connecting Skybridge at Y = 28
    const bridgeGeo = new THREE.BoxGeometry(spacing, 2.2, 2.5);
    const bridgeMat = new THREE.MeshPhysicalMaterial({
      color: 0x00f0ff,
      roughness: 0.1,
      transparent: true,
      opacity: 0.55,
      depthWrite: false
    });
    const skybridge = new THREE.Mesh(bridgeGeo, bridgeMat);
    skybridge.position.set(0, 28, 0);
    twinGroup.add(skybridge);

    const bridgeEdge = new THREE.LineSegments(
      new THREE.EdgesGeometry(bridgeGeo),
      new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.9 })
    );
    skybridge.add(bridgeEdge);

    buildingsGroup.add(twinGroup);
  }

  // Landmark 3: Diamond Faceted Tower with Glowing Internal Core
  function createDiamondCoreTower(cx, cz) {
    const diamondGroup = new THREE.Group();
    diamondGroup.position.set(cx, 0, cz);

    const h = 36;
    const geo = new THREE.OctahedronGeometry(6.5, 0);
    geo.scale(0.8, 3.2, 0.8);

    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x06b6d4,
      roughness: 0.05,
      metalness: 0.1,
      transparent: true,
      opacity: currentOpacity + 0.05,
      depthWrite: false,
      transmission: 0.7
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = h / 2;
    diamondGroup.add(mesh);

    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.85 })
    );
    mesh.add(edge);

    // Glowing Double Helix Core inside
    const coreGeo = new THREE.CylinderGeometry(0.35, 0.35, h * 0.9, 12);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.8 });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.y = h / 2;
    diamondGroup.add(core);

    buildingsGroup.add(diamondGroup);
  }

  // Landmark 4: Geodesic Hexagonal Transit Dome
  function createTransitGeodesicDome(cx, cz) {
    const domeGroup = new THREE.Group();
    domeGroup.position.set(cx, 0, cz);

    const geo = new THREE.SphereGeometry(5.0, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x10b981,
      roughness: 0.1,
      metalness: 0.2,
      transparent: true,
      opacity: currentOpacity + 0.1,
      depthWrite: false,
      transmission: 0.6
    });
    const dome = new THREE.Mesh(geo, mat);
    domeGroup.add(dome);

    const wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.75 })
    );
    domeGroup.add(wire);

    buildingsGroup.add(domeGroup);
  }

  // =========================================================================
  // ANIMATED VERTICAL LIDAR SCANWAVE
  // =========================================================================
  function buildVerticalLidarScanwave() {
    const planeGeo = new THREE.PlaneGeometry(84, 84);
    const planeMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    scanwavePlane = new THREE.Mesh(planeGeo, planeMat);
    scanwavePlane.rotation.x = Math.PI / 2;
    scanwavePlane.position.y = 8;
    scanwaveGroup.add(scanwavePlane);

    // Glowing border outline on the scan plane
    const borderGeo = new THREE.EdgesGeometry(planeGeo);
    const borderMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.7 });
    scanwavePlane.add(new THREE.LineSegments(borderGeo, borderMat));
  }

  // =========================================================================
  // VOLUMETRIC 3D ANPR RADAR CONES & SENSOR TOWERS
  // =========================================================================
  function buildVolumetricSensorTowers() {
    sensorNodes = [];
    CAMERA_NODES.forEach(cfg => {
      const towerGroup = new THREE.Group();
      towerGroup.position.set(cfg.x, 0, cfg.z);
      towerGroup.userData = { isCameraTower: true, config: cfg };

      // Holographic Tower Mast
      const mastGeo = new THREE.CylinderGeometry(0.18, 0.28, 6.2, 8);
      const mastMat = new THREE.MeshStandardMaterial({
        color: 0x0ea5e9,
        metalness: 0.8,
        roughness: 0.2,
        transparent: true,
        opacity: 0.85
      });
      const mast = new THREE.Mesh(mastGeo, mastMat);
      mast.position.y = 3.1;
      towerGroup.add(mast);

      // Camera Head Unit
      const headGeo = new THREE.BoxGeometry(0.9, 0.55, 1.2);
      const headMat = new THREE.MeshStandardMaterial({
        color: 0x0369a1,
        roughness: 0.1,
        metalness: 0.9
      });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.set(0, 6.2, 0);
      towerGroup.add(head);

      // Pulsing Optical Lens Beacon
      const lensGeo = new THREE.SphereGeometry(0.25, 12, 12);
      const lensMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
      const lens = new THREE.Mesh(lensGeo, lensMat);
      lens.position.set(0, 6.2, 0.6);
      towerGroup.add(lens);

      // VOLUMETRIC SCANNING CONE (Projected down to street lanes)
      const coneHeight = 6.2;
      const coneRadius = 4.2;
      const coneGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 24, 1, true);
      const coneMat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const cone = new THREE.Mesh(coneGeo, coneMat);
      // Flip cone downward: apex at head (Y = 6.2), base on ground (Y = 0)
      cone.rotation.x = Math.PI;
      cone.position.set(0, 3.1, 1.8);
      towerGroup.add(cone);

      // Ground Target Detection Pulse Ring
      const ringGeo = new THREE.RingGeometry(3.6, 4.2, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.45
      });
      const targetRing = new THREE.Mesh(ringGeo, ringMat);
      targetRing.rotation.x = Math.PI / 2;
      targetRing.position.set(0, 0.05, 1.8);
      towerGroup.add(targetRing);

      // Floating Camera Sector Label Sprite
      const sprite = createTextSprite(cfg.id, '#00f0ff');
      sprite.position.set(0, 7.8, 0);
      towerGroup.add(sprite);

      sensorNodesGroup.add(towerGroup);
      sensorNodes.push({ group: towerGroup, lens: lens, cone: cone, ring: targetRing, config: cfg });
    });
  }

  // Create lightweight text canvas billboard sprite
  function createTextSprite(text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 48;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(6, 12, 28, 0.85)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(2, 2, 156, 44, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = 'bold 20px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 80, 24);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(4.0, 1.2, 1);
    return sprite;
  }

  // =========================================================================
  // SIMULATED VEHICLES & FLOATING HOLOGRAPHIC PLATE TAGS
  // =========================================================================
  function initSimulatedTrafficFlow() {
    trafficVehicles = [];
    while (trafficGroup.children.length > 0) {
      trafficGroup.remove(trafficGroup.children[0]);
    }

    const keyPlates = [
      { plate: '7XYZ912', model: 'Sedan', color: 0x00f0ff, speed: '52 km/h', isHotlist: false },
      { plate: '3ABC456', model: 'Cruiser', color: 0xef4444, speed: '68 km/h', isHotlist: true },
      { plate: 'KA01MJ5021', model: 'Transit', color: 0x10b981, speed: '44 km/h', isHotlist: false },
      { plate: 'V1023', model: 'Logistics', color: 0xf59e0b, speed: '38 km/h', isHotlist: false }
    ];

    // Spawn ~30 vehicles across ground & elevated networks
    for (let i = 0; i < 28; i++) {
      const isElevated = i % 3 === 0;
      const roadSet = isElevated ? ELEVATED_ROADS : GROUND_ROADS;
      const pathIndex = Math.floor(Math.random() * roadSet.length);
      const pathPoints = roadSet[pathIndex];
      const curve = new THREE.CatmullRomCurve3(
        pathPoints.map(p => new THREE.Vector3(p.x, p.y || 0.12, p.z))
      );

      const isKeyVehicle = i < keyPlates.length;
      const plateData = isKeyVehicle ? keyPlates[i] : {
        plate: `TN${Math.floor(10 + Math.random() * 89)}E${Math.floor(1000 + Math.random() * 8999)}`,
        model: 'Car',
        color: Math.random() > 0.6 ? 0x00f0ff : 0x94a3b8,
        speed: `${Math.floor(35 + Math.random() * 30)} km/h`,
        isHotlist: false
      };

      const vGroup = new THREE.Group();

      // Vehicle Chassis
      const bodyGeo = new THREE.BoxGeometry(0.9, 0.45, 1.8);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: plateData.color,
        roughness: 0.2,
        metalness: 0.8,
        emissive: plateData.color,
        emissiveIntensity: plateData.isHotlist ? 0.8 : 0.35
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      vGroup.add(body);

      // Headlights (Twin forward beams)
      const headlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      [-0.3, 0.3].forEach(x => {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.1), headlightMat);
        hl.position.set(x, 0, 0.95);
        vGroup.add(hl);
      });

      // Red Taillight Glow
      const taillightMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
      [-0.3, 0.3].forEach(x => {
        const tl = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.08), taillightMat);
        tl.position.set(x, 0, -0.95);
        vGroup.add(tl);
      });

      // Floating Holographic Plate Tag for key vehicles
      let badgeSprite = null;
      if (isKeyVehicle || i < 8) {
        badgeSprite = createTextSprite(
          plateData.isHotlist ? `⚠ ${plateData.plate} [STOLEN]` : `${plateData.plate}`,
          plateData.isHotlist ? '#ef4444' : '#00f0ff'
        );
        badgeSprite.position.set(0, 1.8, 0);
        badgeSprite.scale.set(3.2, 0.95, 1);
        vGroup.add(badgeSprite);
      }

      trafficGroup.add(vGroup);

      const vehicleObj = {
        group: vGroup,
        badge: badgeSprite,
        curve: curve,
        progress: Math.random(),
        speed: (0.0006 + Math.random() * 0.0012) * (isElevated ? 1.3 : 1.0),
        data: plateData,
        isKey: isKeyVehicle
      };

      trafficVehicles.push(vehicleObj);

      if (plateData.plate === '3ABC456') {
        targetVehicle = vehicleObj;
      }
    }
  }

  // =========================================================================
  // TRAJECTORY VISUALIZATION (Linked to Single Plate Query in Tab 2)
  // =========================================================================
  window.show3DTrajectory = function (waypoints) {
    if (!trajectoryGroup) return;

    // Clear previous trajectory
    while (trajectoryGroup.children.length > 0) {
      trajectoryGroup.remove(trajectoryGroup.children[0]);
    }

    if (!waypoints || waypoints.length < 2) return;

    const points3D = waypoints.map(w => new THREE.Vector3(w.x_3d, 1.6, w.z_3d));
    const curve = new THREE.CatmullRomCurve3(points3D);

    // Glowing Neon Trajectory Tube Ribbon
    const tubeGeo = new THREE.TubeGeometry(curve, 64, 0.38, 8, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.85
    });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    trajectoryGroup.add(tube);

    // Glowing Waypoint Beacons
    waypoints.forEach(wp => {
      const beaconGroup = new THREE.Group();
      beaconGroup.position.set(wp.x_3d, 1.8, wp.z_3d);

      const sphereGeo = new THREE.SphereGeometry(0.75, 16, 16);
      const sphereMat = new THREE.MeshBasicMaterial({
        color: wp.is_speeding ? 0xef4444 : 0x10b981
      });
      beaconGroup.add(new THREE.Mesh(sphereGeo, sphereMat));

      // Pulsing Ground Halo
      const ringGeo = new THREE.RingGeometry(0.8, 1.6, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: wp.is_speeding ? 0xef4444 : 0x10b981,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      beaconGroup.add(ring);

      trajectoryGroup.add(beaconGroup);
    });

    // Auto-focus camera on trajectory mid-point
    const midPoint = points3D[Math.floor(points3D.length / 2)];
    setCameraFocus(midPoint.x, 26, midPoint.z + 32, midPoint.x, 0, midPoint.z);
  };

  // =========================================================================
  // INTERACTIVE CAMERA PRESETS & MODES
  // =========================================================================
  window.set3DCameraMode = function (mode) {
    cameraMode = mode;
    isTrackingTarget = false;

    // Update camera button active state in UI
    document.querySelectorAll('.cam-mode-btn').forEach(btn => {
      btn.classList.remove('bg-cyan-600', 'text-white', 'border-cyan-400');
      btn.classList.add('bg-slate-900', 'text-cyan-300', 'border-slate-700');
    });
    const activeBtn = document.getElementById(`cam-btn-${mode}`);
    if (activeBtn) {
      activeBtn.classList.remove('bg-slate-900', 'text-cyan-300', 'border-slate-700');
      activeBtn.classList.add('bg-cyan-600', 'text-white', 'border-cyan-400');
    }

    if (mode === 'cinematic' || mode === 'orbit') {
      setCameraFocus(0, 36, 52, 0, 0, 0);
    } else if (mode === 'drone') {
      // 90-degree Top-down Satellite Overview
      setCameraFocus(0, 78, 2, 0, 0, 0);
    } else if (mode === 'junction') {
      // Focus on high-throughput Trinity / Koramangala intersection
      setCameraFocus(16, 18, 14, 18, 0, -8);
    } else if (mode === 'corridor') {
      // Low-altitude Expressway chase perspective
      setCameraFocus(-22, 9, 28, 6, 4, 22);
    } else if (mode === 'chase') {
      // Lock onto target blacklisted vehicle 3ABC456
      isTrackingTarget = true;
    }
  };

  function setCameraFocus(px, py, pz, tx, ty, tz) {
    cameraPosTarget.set(px, py, pz);
    cameraTarget.set(tx, ty, tz);

    // Update spherical coordinates
    const offset = new THREE.Vector3().subVectors(cameraPosTarget, cameraTarget);
    spherical.radius = offset.length();
    spherical.phi = Math.acos(Math.max(-1, Math.min(1, offset.y / spherical.radius)));
    spherical.theta = Math.atan2(offset.x, offset.z);
  }

  function updateCameraFromSpherical() {
    spherical.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, spherical.phi));
    const x = spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
    const y = spherical.radius * Math.cos(spherical.phi);
    const z = spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
    camera.position.set(cameraTarget.x + x, cameraTarget.y + y, cameraTarget.z + z);
    camera.lookAt(cameraTarget);
  }

  // =========================================================================
  // VISUAL TWIN MODES (Hologram Glass, X-Ray, Thermal Density, Cyber Matrix)
  // =========================================================================
  window.setTwinVisualMode = function (mode) {
    visualMode = mode;

    // Update UI active buttons
    document.querySelectorAll('.visual-mode-btn').forEach(b => {
      b.classList.remove('bg-cyan-600', 'text-white', 'border-cyan-400');
      b.classList.add('bg-slate-900', 'text-cyan-300', 'border-slate-800');
    });
    const activeBtn = document.getElementById(`vmode-btn-${mode}`);
    if (activeBtn) {
      activeBtn.classList.remove('bg-slate-900', 'text-cyan-300', 'border-slate-800');
      activeBtn.classList.add('bg-cyan-600', 'text-white', 'border-cyan-400');
    }

    buildingMeshItems.forEach(item => {
      if (mode === 'glass') {
        // Holographic Glass (Default)
        item.mat.color.setHex(item.baseColor);
        item.mat.opacity = currentOpacity;
        item.mat.roughness = 0.08;
        item.edgeMat.color.setHex(item.edgeColor);
        item.edgeMat.opacity = 0.65;
        item.floors.forEach(fl => {
          fl.material.color.setHex(item.edgeColor);
          fl.material.opacity = 0.18;
          fl.visible = layerStates.floors;
        });
      } else if (mode === 'xray') {
        // Ultra-Transparent Ghost X-Ray Twin
        item.mat.color.setHex(0x0a192f);
        item.mat.opacity = 0.08;
        item.mat.roughness = 0.0;
        item.edgeMat.color.setHex(0x00f0ff);
        item.edgeMat.opacity = 0.95;
        item.floors.forEach(fl => {
          fl.material.color.setHex(0x00f0ff);
          fl.material.opacity = 0.35;
          fl.visible = true;
        });
      } else if (mode === 'thermal') {
        // Dynamic Traffic Congestion Heatmap: color by proximity to dense cameras
        const isDenseSector = (item.pos.x > 8 && item.pos.z < 5) || (item.pos.x > 0 && item.pos.z > 14);
        const heatColor = isDenseSector ? 0xef4444 : (Math.hypot(item.pos.x, item.pos.z) < 20 ? 0xf59e0b : 0x10b981);
        item.mat.color.setHex(heatColor);
        item.mat.opacity = currentOpacity + 0.12;
        item.edgeMat.color.setHex(heatColor);
        item.edgeMat.opacity = 0.85;
      } else if (mode === 'cyber') {
        // Cyber Matrix
        item.mat.color.setHex(0x052e16);
        item.mat.opacity = currentOpacity;
        item.edgeMat.color.setHex(0x10b981);
        item.edgeMat.opacity = 0.85;
        item.floors.forEach(fl => {
          fl.material.color.setHex(0x10b981);
          fl.material.opacity = 0.22;
        });
      }
    });

    // Update Telemetry display in UI
    const modeLabels = { glass: 'Hologram Glass', xray: 'X-Ray Structural', thermal: 'Thermal Congestion', cyber: 'Cyber Matrix' };
    const labelEl = document.getElementById('twin-active-mode-label');
    if (labelEl) labelEl.textContent = modeLabels[mode] || mode;
  };

  // =========================================================================
  // TRANSPARENCY LEVEL CONTROLS
  // =========================================================================
  window.setTwinTransparency = function (level) {
    transparencyLevel = level;
    currentOpacity = opacityMap[level] || 0.28;

    // Update UI active buttons
    document.querySelectorAll('.transparency-btn').forEach(b => {
      b.classList.remove('bg-cyan-600', 'text-white', 'border-cyan-400');
      b.classList.add('bg-slate-900', 'text-cyan-300', 'border-slate-800');
    });
    const activeBtn = document.getElementById(`trans-btn-${level}`);
    if (activeBtn) {
      activeBtn.classList.remove('bg-slate-900', 'text-cyan-300', 'border-slate-800');
      activeBtn.classList.add('bg-cyan-600', 'text-white', 'border-cyan-400');
    }

    buildingMeshItems.forEach(item => {
      item.mat.opacity = currentOpacity;
    });

    const valEl = document.getElementById('twin-transparency-val');
    if (valEl) {
      const pctMap = { high: '88% Transparent (Ghost)', medium: '72% Transparent (Glass)', low: '48% Transparent (Prism)' };
      valEl.textContent = pctMap[level] || `${Math.round((1 - currentOpacity) * 100)}% Transparent`;
    }
  };

  // =========================================================================
  // LAYER TOGGLE SWITCHES
  // =========================================================================
  window.toggleTwinLayer = function (layerName) {
    if (layerStates[layerName] !== undefined) {
      layerStates[layerName] = !layerStates[layerName];
      const isVisible = layerStates[layerName];

      if (layerName === 'floors') {
        floorMeshItems.forEach(fl => { fl.visible = isVisible; });
      } else if (layerName === 'scanwave' && scanwavePlane) {
        scanwavePlane.visible = isVisible;
      } else if (layerName === 'cones') {
        sensorNodes.forEach(sn => { sn.cone.visible = isVisible; sn.ring.visible = isVisible; });
      } else if (layerName === 'labels') {
        sensorNodes.forEach(sn => {
          sn.group.children.forEach(c => {
            if (c.isSprite) c.visible = isVisible;
          });
        });
        trafficVehicles.forEach(v => {
          if (v.badge) v.badge.visible = isVisible;
        });
      } else if (layerName === 'flyovers' && flyoversGroup) {
        flyoversGroup.visible = isVisible;
      }

      // Update button toggle UI state
      const btn = document.getElementById(`toggle-layer-${layerName}`);
      if (btn) {
        if (isVisible) {
          btn.classList.remove('opacity-40', 'bg-slate-900');
          btn.classList.add('bg-cyan-900/60', 'text-cyan-300', 'border-cyan-500/50');
        } else {
          btn.classList.remove('bg-cyan-900/60', 'text-cyan-300', 'border-cyan-500/50');
          btn.classList.add('opacity-40', 'bg-slate-900');
        }
      }
    }
  };

  // =========================================================================
  // MOUSE & ORBIT CONTROLS
  // =========================================================================
  function setupMouseInteractions() {
    container.addEventListener('mousedown', e => {
      if (e.button === 0) isDragging = true;
      if (e.button === 2) isRightDragging = true;
      prevMousePos = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
      isRightDragging = false;
    });

    container.addEventListener('contextmenu', e => e.preventDefault());

    container.addEventListener('mousemove', e => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;

      if (isDragging) {
        const dx = e.clientX - prevMousePos.x;
        const dy = e.clientY - prevMousePos.y;
        spherical.theta -= dx * 0.008;
        spherical.phi -= dy * 0.008;
        updateCameraFromSpherical();
        cameraMode = 'manual';
      } else if (isRightDragging) {
        // Pan Target
        const dx = e.clientX - prevMousePos.x;
        const dy = e.clientY - prevMousePos.y;
        const panSpeed = 0.06;
        const forward = new THREE.Vector3().subVectors(cameraTarget, camera.position).normalize();
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
        cameraTarget.addScaledVector(right, -dx * panSpeed);
        cameraTarget.y += dy * panSpeed;
        updateCameraFromSpherical();
        cameraMode = 'manual';
      }

      prevMousePos = { x: e.clientX, y: e.clientY };
    });

    container.addEventListener('wheel', e => {
      e.preventDefault();
      spherical.radius += e.deltaY * 0.06;
      spherical.radius = Math.max(12, Math.min(150, spherical.radius));
      updateCameraFromSpherical();
      cameraMode = 'manual';
    }, { passive: false });

    // Click on Camera Tower, Building, Vehicle, or Road
    container.addEventListener('click', onClickInteractive);
    container.addEventListener('dblclick', onDoubleClickIncident);
  }

  let selectedBuildingOutline = null;
  let selectedRoadOutline = null;

  function onClickInteractive(e) {
    if (!container || !camera) return;
    const rect = container.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // 1. Check Camera Towers
    const camIntersects = raycaster.intersectObjects(sensorNodesGroup.children, true);
    if (camIntersects.length > 0) {
      let node = camIntersects[0].object;
      while (node.parent && !node.userData.isCameraTower) {
        node = node.parent;
      }
      if (node.userData && node.userData.config) {
        openCameraInspectionHUD(node.userData.config);
        return;
      }
    }

    // 2. Check Vehicles
    const vehicleMeshes = trafficVehicles.map(v => v.group);
    const vIntersects = raycaster.intersectObjects(vehicleMeshes, true);
    if (vIntersects.length > 0) {
      let root = vIntersects[0].object;
      while (root.parent && root.parent !== trafficGroup) {
        root = root.parent;
      }
      const foundVehicle = trafficVehicles.find(v => v.group === root);
      if (foundVehicle) {
        targetVehicle = foundVehicle;
        cameraMode = 'chase';
        isTrackingTarget = true;
        openVehicleInspectionHUD(foundVehicle);
        return;
      }
    }

    // 3. Check Buildings
    const bMeshes = buildingMeshItems.map(b => b.mesh);
    const bIntersects = raycaster.intersectObjects(bMeshes, true);
    if (bIntersects.length > 0) {
      let root = bIntersects[0].object;
      while (root.parent && root.parent !== buildingsGroup) {
        root = root.parent;
      }
      const foundBuilding = buildingMeshItems.find(b => b.mesh === root);
      if (foundBuilding) {
        highlightBuilding(foundBuilding);
        openBuildingInspectionHUD(foundBuilding);
        return;
      }
    }

    // 4. Check Road & Flyover Meshes
    const rMeshes = roadMeshItems.map(r => r.mesh);
    const rIntersects = raycaster.intersectObjects(rMeshes, true);
    if (rIntersects.length > 0) {
      const roadObj = roadMeshItems.find(r => r.mesh === rIntersects[0].object);
      if (roadObj) {
        openRoadInspectionHUD(roadObj);
        return;
      }
    }
  }

  function highlightBuilding(item) {
    if (selectedBuildingOutline) {
      selectedBuildingOutline.parent?.remove(selectedBuildingOutline);
      selectedBuildingOutline = null;
    }
    const box = new THREE.BoxHelper(item.mesh, 0x00f0ff);
    box.material.transparent = true;
    box.material.opacity = 0.95;
    scene.add(box);
    selectedBuildingOutline = box;
  }

  function openBuildingInspectionHUD(item) {
    let hud = document.getElementById('camera-3d-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'camera-3d-hud';
      container.parentElement.appendChild(hud);
    }
    hud.className = 'absolute z-30 p-4 bg-slate-950/95 backdrop-blur-xl border border-cyan-500/50 rounded-xl shadow-2xl text-xs max-w-sm w-80 animate-fade-in';
    hud.style.top = '20px';
    hud.style.right = '20px';

    const h = Math.round(item.height);
    const floors = Math.floor(h / 2.6);
    const occ = floors * 45 + Math.floor(Math.random() * 80);

    hud.innerHTML = `
      <div class="flex items-center justify-between pb-2 border-b border-cyan-500/30 mb-2.5">
        <div class="flex items-center space-x-2">
          <i class="fa-solid fa-building text-cyan-400"></i>
          <span class="font-bold text-white font-mono uppercase tracking-wider">Crystalline Skyscraper</span>
        </div>
        <button onclick="document.getElementById('camera-3d-hud').remove(); if(selectedBuildingOutline){selectedBuildingOutline.parent?.remove(selectedBuildingOutline); selectedBuildingOutline=null;}" class="text-gray-400 hover:text-white transition">
          <i class="fa-solid fa-xmark text-sm"></i>
        </button>
      </div>
      <p class="font-bold text-cyan-300 text-sm mb-0.5">Sector Urban Matrix Tower</p>
      <p class="text-gray-400 text-[11px] mb-3">Coords: <span class="text-gray-200 font-mono">X:${Math.round(item.pos.x)}, Z:${Math.round(item.pos.z)}</span></p>
      <div class="grid grid-cols-3 gap-2 text-center mb-3">
        <div class="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
          <div class="text-gray-400 text-[10px] font-mono">HEIGHT</div>
          <div class="text-white font-bold text-sm">${h}m</div>
        </div>
        <div class="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
          <div class="text-gray-400 text-[10px] font-mono">FLOORS</div>
          <div class="text-cyan-400 font-bold text-sm">${floors} Lvl</div>
        </div>
        <div class="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
          <div class="text-gray-400 text-[10px] font-mono">OCCUPANCY</div>
          <div class="text-emerald-400 font-bold text-sm">${occ}</div>
        </div>
      </div>
      <div class="p-2 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-[11px] space-y-1 mb-3">
        <div class="flex justify-between">
          <span class="text-gray-300">Structural Scan:</span>
          <span class="text-emerald-400 font-bold">100% Transparent Glass</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-300">Nearest ANPR:</span>
          <span class="text-cyan-300 font-mono">CAM_01 (140m)</span>
        </div>
      </div>
      <button onclick="window.setTwinVisualMode('xray');" class="w-full py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-lg text-xs transition flex items-center justify-center space-x-1 shadow-md">
        <i class="fa-solid fa-bone mr-1"></i><span>Inspect Interior Floor Slices</span>
      </button>
    `;
  }

  function openVehicleInspectionHUD(v) {
    let hud = document.getElementById('camera-3d-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'camera-3d-hud';
      container.parentElement.appendChild(hud);
    }
    hud.className = 'absolute z-30 p-4 bg-slate-950/95 backdrop-blur-xl border border-cyan-500/50 rounded-xl shadow-2xl text-xs max-w-sm w-80 animate-fade-in';
    hud.style.top = '20px';
    hud.style.right = '20px';

    const isHot = v.data.isHotlist;
    hud.innerHTML = `
      <div class="flex items-center justify-between pb-2 border-b ${isHot ? 'border-rose-500/40' : 'border-cyan-500/30'} mb-2.5">
        <div class="flex items-center space-x-2">
          <span class="w-2.5 h-2.5 rounded-full ${isHot ? 'bg-rose-500 animate-ping' : 'bg-emerald-400 animate-pulse'}"></span>
          <span class="font-bold text-white font-mono uppercase tracking-wider">${v.data.plate}</span>
        </div>
        <button onclick="document.getElementById('camera-3d-hud').remove(); isTrackingTarget=false; cameraMode='cinematic';" class="text-gray-400 hover:text-white transition">
          <i class="fa-solid fa-xmark text-sm"></i>
        </button>
      </div>
      <p class="font-bold ${isHot ? 'text-rose-400' : 'text-cyan-300'} text-sm mb-0.5">${v.data.model} &bull; ${isHot ? 'HOTLIST WANTED' : 'Cruising Entity'}</p>
      <p class="text-gray-400 text-[11px] mb-3">Live Tracking: <span class="text-emerald-400 font-semibold">Optical Lock Active</span></p>
      <div class="grid grid-cols-2 gap-2 text-center mb-3">
        <div class="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
          <div class="text-gray-400 text-[10px] font-mono">VELOCITY</div>
          <div class="text-white font-bold text-sm font-mono">${v.data.speed}</div>
        </div>
        <div class="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
          <div class="text-gray-400 text-[10px] font-mono">STATUS</div>
          <div class="${isHot ? 'text-rose-400' : 'text-emerald-400'} font-bold text-sm">${isHot ? 'ALARM' : 'OPTIMAL'}</div>
        </div>
      </div>
      <div class="space-y-2">
        <button onclick="window.switchTab('tracking'); window.queryPlate('${v.data.plate}');" class="w-full py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold rounded-lg text-xs transition flex items-center justify-center space-x-1.5 shadow-md">
          <i class="fa-solid fa-route"></i>
          <span>Reconstruct Full Trajectory in 2D/3D</span>
        </button>
        <button onclick="window.set3DCameraMode('cinematic');" class="w-full py-1.5 bg-slate-900 hover:bg-slate-800 text-gray-300 rounded-lg text-xs transition border border-slate-800">
          Unlock Camera & Return to Orbit
        </button>
      </div>
    `;
  }

  function openRoadInspectionHUD(road) {
    let hud = document.getElementById('camera-3d-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'camera-3d-hud';
      container.parentElement.appendChild(hud);
    }
    hud.className = 'absolute z-30 p-4 bg-slate-950/95 backdrop-blur-xl border border-cyan-500/50 rounded-xl shadow-2xl text-xs max-w-sm w-80 animate-fade-in';
    hud.style.top = '20px';
    hud.style.right = '20px';

    const isElevated = road.type === 'elevated';
    hud.innerHTML = `
      <div class="flex items-center justify-between pb-2 border-b border-cyan-500/30 mb-2.5">
        <div class="flex items-center space-x-2">
          <i class="fa-solid fa-road text-cyan-400"></i>
          <span class="font-bold text-white font-mono uppercase tracking-wider">${isElevated ? 'Elevated Viaduct Flyover' : 'Ground Arterial Corridor'}</span>
        </div>
        <button onclick="document.getElementById('camera-3d-hud').remove();" class="text-gray-400 hover:text-white transition">
          <i class="fa-solid fa-xmark text-sm"></i>
        </button>
      </div>
      <p class="font-bold text-cyan-300 text-sm mb-0.5">${isElevated ? 'Multi-Level Express Flyover (Deck +5m)' : 'Urban Express Corridor'}</p>
      <div class="grid grid-cols-3 gap-2 text-center my-3">
        <div class="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
          <div class="text-gray-400 text-[10px] font-mono">LANES</div>
          <div class="text-white font-bold text-sm">${isElevated ? '4 Lanes' : '6 Lanes'}</div>
        </div>
        <div class="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
          <div class="text-gray-400 text-[10px] font-mono">SPEED LIMIT</div>
          <div class="text-amber-400 font-bold text-sm">${isElevated ? '80 km/h' : '60 km/h'}</div>
        </div>
        <div class="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
          <div class="text-gray-400 text-[10px] font-mono">SERVICE</div>
          <div class="text-emerald-400 font-bold text-sm">LOS B</div>
        </div>
      </div>
      <p class="text-[11px] text-gray-300">Synchronized with city ANPR network for real-time velocity enforcement and vehicle re-identification.</p>
    `;
  }

  function onDoubleClickIncident(e) {
    if (!container || !camera) return;
    const rect = container.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const targetPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(groundPlane, targetPoint);

    if (targetPoint) {
      // Spawn Warning Beacon
      const alertGeo = new THREE.CylinderGeometry(0.1, 0.4, 4.0, 8);
      const alertMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
      const alertMesh = new THREE.Mesh(alertGeo, alertMat);
      alertMesh.position.set(targetPoint.x, 2.0, targetPoint.z);
      scene.add(alertMesh);

      const ringGeo = new THREE.RingGeometry(0.8, 3.2, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(targetPoint.x, 0.1, targetPoint.z);
      scene.add(ring);

      // Flash Toast
      let toast = document.getElementById('twin-incident-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'twin-incident-toast';
        toast.className = 'fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2.5 bg-rose-950/95 border border-rose-500 rounded-xl text-rose-300 font-bold text-xs shadow-2xl flex items-center space-x-2 animate-bounce';
        document.body.appendChild(toast);
      }
      toast.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-rose-400"></i><span>Simulated Traffic Bottleneck Incident Placed at (X:${Math.round(targetPoint.x)}, Z:${Math.round(targetPoint.z)})</span>`;
      setTimeout(() => { toast.remove(); }, 3500);
    }
  }

  // Global Camera Focus helpers for 2D Map -> 3D Twin coordination
  window.focusCameraOnCoords = function(x, y, z) {
    setCameraFocus(x - 12, y + 16, z + 22, x, y, z);
    cameraMode = 'manual';
  };

  window.focusCameraNode = function(camId) {
    const cam = CAMERA_NODES.find(c => c.id === camId);
    if (cam) {
      setCameraFocus(cam.x - 10, 14, cam.z + 18, cam.x, 0, cam.z);
      cameraMode = 'manual';
      openCameraInspectionHUD(cam);
    }
  };

  function openCameraInspectionHUD(cam) {
    let hud = document.getElementById('camera-3d-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'camera-3d-hud';
      container.parentElement.appendChild(hud);
    }

    hud.className = 'absolute z-30 p-4 bg-slate-950/95 backdrop-blur-xl border border-cyan-500/50 rounded-xl shadow-2xl text-xs max-w-sm w-80 animate-fade-in';
    hud.style.top = '20px';
    hud.style.right = '20px';
    hud.innerHTML = `
      <div class="flex items-center justify-between pb-2 border-b border-cyan-500/30 mb-2.5">
        <div class="flex items-center space-x-2">
          <span class="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
          <span class="font-bold text-white font-mono uppercase tracking-wider">${cam.id}</span>
        </div>
        <button onclick="document.getElementById('camera-3d-hud').remove()" class="text-gray-400 hover:text-white transition">
          <i class="fa-solid fa-xmark text-sm"></i>
        </button>
      </div>
      <p class="font-bold text-cyan-300 text-sm mb-0.5">${cam.name}</p>
      <p class="text-gray-400 text-[11px] mb-3">Sector: <span class="text-gray-200">${cam.sector}</span></p>
      <div class="grid grid-cols-2 gap-2 text-center mb-3">
        <div class="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
          <div class="text-gray-400 text-[10px] font-mono">FLOW RATE</div>
          <div class="text-white font-bold text-sm">${cam.flow} vph</div>
        </div>
        <div class="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
          <div class="text-gray-400 text-[10px] font-mono">AVG SPEED</div>
          <div class="text-emerald-400 font-bold text-sm">${cam.speed}</div>
        </div>
      </div>
      <div class="p-2 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-[11px] space-y-1 mb-3">
        <div class="flex justify-between">
          <span class="text-gray-300">OCR Confidence:</span>
          <span class="text-emerald-400 font-bold">96.8% (>90% SLA)</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-300">Volumetric Coverage:</span>
          <span class="text-cyan-300 font-mono">3 Lanes × 25m</span>
        </div>
      </div>
      <button onclick="if(window.inspectCameraFeed) window.inspectCameraFeed('${cam.id}')" class="w-full py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold rounded-lg text-xs transition flex items-center justify-center space-x-1 shadow-md">
        <i class="fa-solid fa-video mr-1"></i><span>Inspect Camera Optical Feed</span>
      </button>
    `;
  }

  // =========================================================================
  // EMERGENCY GREEN CORRIDOR 3D VISUALIZATION
  // =========================================================================
  let greenCorridorGroup = null;

  window.show3DGreenCorridor = function (waypoints3D, vehicleCoords3D) {
    if (!scene) return;
    if (greenCorridorGroup) {
      scene.remove(greenCorridorGroup);
      greenCorridorGroup = null;
    }

    if (!waypoints3D || waypoints3D.length < 2) return;

    greenCorridorGroup = new THREE.Group();
    greenCorridorGroup.name = 'greenCorridorGroup';

    // 1. CatmullRomCurve3 through 3D waypoints
    const points = waypoints3D.map(pt => new THREE.Vector3(pt[0], (pt[1] !== undefined ? pt[1] : 0) + 0.45, pt[2] !== undefined ? pt[2] : (pt[1] || 0)));
    const curve = new THREE.CatmullRomCurve3(points);

    // 2. High-intensity Emerald Laser Tube
    const tubeGeo = new THREE.TubeGeometry(curve, 64, 0.45, 8, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.85
    });
    const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    greenCorridorGroup.add(tubeMesh);

    // 3. Volumetric Outer Aura Glow Tube
    const auraGeo = new THREE.TubeGeometry(curve, 64, 0.95, 8, false);
    const auraMat = new THREE.MeshBasicMaterial({
      color: 0x34d399,
      transparent: true,
      opacity: 0.22,
      wireframe: true
    });
    const auraMesh = new THREE.Mesh(auraGeo, auraMat);
    greenCorridorGroup.add(auraMesh);

    // 4. Preempted Junction Beacons
    waypoints3D.forEach((pt) => {
      const beaconGroup = new THREE.Group();
      const bx = pt[0];
      const by = (pt[1] !== undefined ? pt[1] : 0) + 0.1;
      const bz = pt[2] !== undefined ? pt[2] : (pt[1] || 0);

      // Green Light Column Beacon
      const pillarGeo = new THREE.CylinderGeometry(0.2, 0.6, 6.0, 16);
      const pillarMat = new THREE.MeshBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0.55
      });
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(bx, by + 3.0, bz);
      beaconGroup.add(pillar);

      // Ground Pulsing Rings
      const ringGeo = new THREE.RingGeometry(0.8, 2.5, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x10b981,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(bx, by + 0.1, bz);
      beaconGroup.add(ring);

      greenCorridorGroup.add(beaconGroup);
    });

    // 5. Moving Emergency Vehicle 3D Model Marker
    const vPos = vehicleCoords3D ? new THREE.Vector3(vehicleCoords3D[0], (vehicleCoords3D[1] || 0) + 0.5, vehicleCoords3D[2] || vehicleCoords3D[1] || 0) : points[0];
    const ambGroup = new THREE.Group();
    ambGroup.position.copy(vPos);

    // Vehicle Body
    const bodyGeo = new THREE.BoxGeometry(1.6, 1.0, 3.0);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.6, roughness: 0.2 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.5;
    ambGroup.add(body);

    // Red Cross / Stripe Decal
    const stripeGeo = new THREE.BoxGeometry(1.65, 0.3, 2.2);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.y = 0.5;
    ambGroup.add(stripe);

    // Flashing Emergency Siren Beacons
    const redLightGeo = new THREE.SphereGeometry(0.2, 8, 8);
    const redLightMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const redLight = new THREE.Mesh(redLightGeo, redLightMat);
    redLight.position.set(-0.4, 1.15, 0.4);
    ambGroup.add(redLight);

    const blueLightGeo = new THREE.SphereGeometry(0.2, 8, 8);
    const blueLightMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6 });
    const blueLight = new THREE.Mesh(blueLightGeo, blueLightMat);
    blueLight.position.set(0.4, 1.15, 0.4);
    ambGroup.add(blueLight);

    greenCorridorGroup.add(ambGroup);
    scene.add(greenCorridorGroup);

    // Focus camera on corridor center
    const midIdx = Math.floor(points.length / 2);
    const centerPt = points[midIdx];
    setCameraFocus(centerPt.x - 18, 22, centerPt.z + 24, centerPt.x, 0, centerPt.z);
    cameraMode = 'corridor';
  };

  window.clear3DGreenCorridor = function () {
    if (scene && greenCorridorGroup) {
      scene.remove(greenCorridorGroup);
      greenCorridorGroup = null;
    }
  };

  function onWindowResize() {
    if (!container || !camera || !renderer) return;
    camera.aspect = container.clientWidth / (container.clientHeight || 520);
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight || 520);
  }

  // =========================================================================
  // MAIN ANIMATION LOOP WITH AUTO-PAUSE
  // =========================================================================
  let isTwinRendering = true;

  window.pauseDigitalTwin3D = function () {
    isTwinRendering = false;
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  };

  window.resumeDigitalTwin3D = function () {
    if (!isTwinRendering) {
      isTwinRendering = true;
      clock.getDelta();
      animate();
    }
  };

  function animate() {
    if (!isTwinRendering) return;
    animFrameId = requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const time = clock.getElapsedTime();

    // 1. Cinematic Auto-Orbit in cinematic mode
    if (cameraMode === 'cinematic') {
      spherical.theta += delta * 0.08;
      updateCameraFromSpherical();
    } else if (cameraMode === 'drone' || cameraMode === 'junction' || cameraMode === 'corridor') {
      // Smooth interpolation to target
      camera.position.lerp(cameraPosTarget, 0.05);
      camera.lookAt(cameraTarget);
    } else if (cameraMode === 'chase' && targetVehicle) {
      const vPos = targetVehicle.group.position;
      camera.position.lerp(new THREE.Vector3(vPos.x - 8, vPos.y + 6, vPos.z - 8), 0.08);
      camera.lookAt(vPos.x, vPos.y + 1, vPos.z);
    }

    // 2. Animated Vertical LIDAR Scanwave
    if (scanwavePlane && layerStates.scanwave) {
      scanwavePlane.position.y += scanwaveDirection * delta * 12;
      if (scanwavePlane.position.y > 48) scanwaveDirection = -1;
      if (scanwavePlane.position.y < 2) scanwaveDirection = 1;
    }

    // 3. Volumetric ANPR Cones - Pulsing & Rotation
    if (layerStates.cones) {
      sensorNodes.forEach(sn => {
        sn.cone.rotation.y += delta * 0.4;
        const pulse = 0.12 + Math.sin(time * 3.5 + sn.config.x) * 0.05;
        sn.cone.material.opacity = pulse;
        sn.lens.material.color.setHSL(0.5 + Math.sin(time * 4) * 0.05, 1, 0.55);
      });
    }

    // 4. Simulated Traffic Vehicle Motion
    trafficVehicles.forEach(v => {
      v.progress += v.speed;
      if (v.progress > 1) v.progress = 0;

      const pt = v.curve.getPointAt(v.progress);
      v.group.position.copy(pt);

      // Orientation along curve
      const tangent = v.curve.getTangentAt(v.progress);
      v.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
    });

    // 5. Render Scene
    renderer.render(scene, camera);
  }

  // Pause when browser tab is hidden/minimized
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      window.pauseDigitalTwin3D();
    } else {
      // Only resume if tab is active
      const tabEl = document.getElementById('tab-3dtwin');
      if (tabEl && !tabEl.classList.contains('hidden')) {
        window.resumeDigitalTwin3D();
      }
    }
  });

  // Auto-init on DOMContentLoaded if container exists
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('webgl-canvas-container')) {
      window.initDigitalTwin3D();
    }
  });

})();
