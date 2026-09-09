/**
 * UrbanTwin AI - 3D Digital Twin City Engine
 * Powered by Three.js WebGL
 * High-Performance Procedural City, Vehicle Simulation, ANPR Laser Towers & 3D Trajectory Tube
 */

(function () {
  'use strict';

  let container, scene, camera, renderer, raycaster, mouse;
  let buildingsGroup, roadsGroup, trafficGroup, sensorNodesGroup, lasersGroup, trajectoryGroup;
  let trafficVehicles = [];
  let sensorNodes = [];
  let isWireframe = false;
  let cameraMode = 'cinematic'; // cinematic, drone, junction, chase
  let targetCameraPos = { x: 0, y: 38, z: 56 };
  let targetLookAt = { x: 0, y: 0, z: 0 };
  let currentLookAt = new THREE.Vector3(0, 0, 0);
  let clock = new THREE.Clock();
  let chaseVehicle = null;

  // Camera Locations mapped to 3D Space Coordinates
  const CAMERA_NODES_CONFIG = [
    { id: 'CAM_01', name: 'MG Road - Trinity Junction', sector: 'Commercial Core', x: -15, z: -10, flow: 580, speed: '42.5 km/h', status: 'optimal' },
    { id: 'CAM_02', name: 'Indiranagar 100ft Express', sector: 'East Transit', x: 0, z: -25, flow: 710, speed: '56.0 km/h', status: 'optimal' },
    { id: 'CAM_03', name: 'Koramangala Financial Core', sector: 'Tech Corridor', x: 18, z: -8, flow: 890, speed: '24.8 km/h', status: 'dense' },
    { id: 'CAM_04', name: 'West River Crossing Flyover', sector: 'West Gateway', x: -25, z: 15, flow: 460, speed: '62.4 km/h', status: 'optimal' },
    { id: 'CAM_05', name: 'Outer Ring Road - Bellandur', sector: 'South-East Corridor', x: 5, z: 20, flow: 620, speed: '38.0 km/h', status: 'moderate' },
    { id: 'CAM_06', name: 'Electronic City Tollway', sector: 'South Tech Corridor', x: 25, z: 18, flow: 510, speed: '48.6 km/h', status: 'optimal' }
  ];

  // Multi-lane Road Network paths
  const ROAD_NETWORKS = [
    [ {x: -35, z: -10}, {x: -15, z: -10}, {x: 0, z: -25}, {x: 35, z: -25} ],
    [ {x: -15, z: -35}, {x: -15, z: -10}, {x: 18, z: -8}, {x: 35, z: -8} ],
    [ {x: -35, z: 15}, {x: -25, z: 15}, {x: 5, z: 20}, {x: 25, z: 18}, {x: 35, z: 18} ],
    [ {x: 0, z: -35}, {x: 0, z: -25}, {x: 5, z: 20}, {x: 5, z: 35} ],
    [ {x: 18, z: -35}, {x: 18, z: -8}, {x: 25, z: 18}, {x: 25, z: 35} ],
    [ {x: -25, z: -35}, {x: -25, z: 15}, {x: -15, z: 35} ]
  ];

  window.initUrbanTwin3D = function () {
    container = document.getElementById('webgl-canvas-container');
    if (!container) return;

    // Clear previous renderer if present
    container.innerHTML = '';

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050811);
    scene.fog = new THREE.FogExp2(0x050811, 0.012);

    // Camera
    camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.5, 300);
    camera.position.set(0, 38, 56);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // Interaction
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Groups
    buildingsGroup = new THREE.Group();
    roadsGroup = new THREE.Group();
    trafficGroup = new THREE.Group();
    sensorNodesGroup = new THREE.Group();
    lasersGroup = new THREE.Group();
    trajectoryGroup = new THREE.Group();

    scene.add(buildingsGroup);
    scene.add(roadsGroup);
    scene.add(trafficGroup);
    scene.add(sensorNodesGroup);
    scene.add(lasersGroup);
    scene.add(trajectoryGroup);

    // Setup elements
    setupLights();
    buildGroundAndGrid();
    buildRoads();
    buildCitySkyscrapers();
    buildSensorTowers();
    initVehiclesSimulation();

    // Event listeners
    window.addEventListener('resize', onWindowResize);
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('click', onClickNode);
    container.addEventListener('mousedown', e => {
      if (e.button === 0) isDragging = true;
      if (e.button === 2) isRightDragging = true;
      prevMousePos = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('mouseup', () => {
      isDragging = false;
      isRightDragging = false;
    });
    let zoomHintTimer = null;
    container.addEventListener('contextmenu', e => e.preventDefault());
    container.addEventListener('wheel', e => {
      // Only zoom 3D twin if Ctrl or Meta is held, allowing normal mouse wheel page scrolling
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        spherical.radius += e.deltaY * 0.05;
        spherical.radius = Math.max(15, Math.min(130, spherical.radius));
        updateCameraFromSpherical();
        cameraMode = 'manual';
      } else {
        const hint = document.getElementById('zoom-scroll-hint');
        if (hint) {
          hint.classList.remove('opacity-0', 'pointer-events-none');
          hint.classList.add('opacity-100');
          clearTimeout(zoomHintTimer);
          zoomHintTimer = setTimeout(() => {
            hint.classList.remove('opacity-100');
            hint.classList.add('opacity-0', 'pointer-events-none');
          }, 1800);
        }
      }
    }, { passive: false });

    // Start render loop
    animate();
  };

  // LIGHTING
  function setupLights() {
    const ambientLight = new THREE.AmbientLight(0x0f172a, 2.0);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x06b6d4, 2.2);
    dirLight1.position.set(30, 50, 40);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x8b5cf6, 1.6);
    dirLight2.position.set(-30, 40, -30);
    scene.add(dirLight2);

    const centerPointLight = new THREE.PointLight(0x06b6d4, 3, 60);
    centerPointLight.position.set(0, 8, 0);
    scene.add(centerPointLight);
  }

  // GROUND & RADAR GRID
  function buildGroundAndGrid() {
    // Holographic Cyber Grid
    const grid = new THREE.GridHelper(90, 45, 0x06b6d4, 0x111c30);
    grid.position.y = 0;
    scene.add(grid);

    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(120, 120);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x070b16,
      roughness: 0.8,
      metalness: 0.5
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    scene.add(ground);

    // Concentric Pulse Rings
    for (let r = 12; r <= 48; r += 12) {
      const ringGeo = new THREE.RingGeometry(r - 0.1, r, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.22 - (r / 250)
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.05;
      scene.add(ring);
    }
  }

  // ROADS WITH ILLUMINATED EDGES
  function buildRoads() {
    ROAD_NETWORKS.forEach(pathPoints => {
      const curve = new THREE.CatmullRomCurve3(
        pathPoints.map(p => new THREE.Vector3(p.x, 0.1, p.z))
      );
      
      // Road Surface Ribbon
      const roadGeo = new THREE.TubeGeometry(curve, 64, 1.4, 4, false);
      const roadMat = new THREE.MeshStandardMaterial({
        color: 0x0a1122,
        roughness: 0.4,
        metalness: 0.7
      });
      const roadMesh = new THREE.Mesh(roadGeo, roadMat);
      roadMesh.scale.set(1, 0.08, 1);
      roadsGroup.add(roadMesh);

      // Glowing Centerline
      const lineGeo = new THREE.TubeGeometry(curve, 64, 0.08, 4, false);
      const lineMat = new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        transparent: true,
        opacity: 0.7
      });
      const lineMesh = new THREE.Mesh(lineGeo, lineMat);
      lineMesh.position.y = 0.12;
      roadsGroup.add(lineMesh);
    });
  }

  // 3D PROCEDURAL SKYSCRAPERS
  function buildCitySkyscrapers() {
    const buildingPalette = [0x0f172a, 0x1e293b, 0x0c1322, 0x111e38];
    const edgePalette = [0x06b6d4, 0x38bdf8, 0x8b5cf6, 0x10b981];

    for (let x = -36; x <= 36; x += 6) {
      for (let z = -36; z <= 36; z += 6) {
        // Skip positions near main crossroads
        if (Math.abs(x + 15) < 3 && Math.abs(z + 10) < 3) continue;
        if (Math.abs(x - 18) < 3 && Math.abs(z + 8) < 3) continue;
        if (Math.abs(x - 5) < 3 && Math.abs(z - 20) < 3) continue;
        if (Math.abs(x) < 3 && Math.abs(z + 25) < 3) continue;

        if (Math.random() > 0.4) {
          const w = 3.2 + Math.random() * 1.5;
          const d = 3.2 + Math.random() * 1.5;
          const distToCenter = Math.sqrt(x * x + z * z);
          let h = Math.max(6, 44 - distToCenter * 0.7) + (Math.random() * 12);
          if (distToCenter < 12) h += 16;

          const bMat = new THREE.MeshStandardMaterial({
            color: buildingPalette[Math.floor(Math.random() * buildingPalette.length)],
            roughness: 0.2,
            metalness: 0.85
          });

          const bGeo = new THREE.BoxGeometry(w, h, d);
          const building = new THREE.Mesh(bGeo, bMat);
          building.position.set(x + (Math.random() - 0.5) * 1.2, h / 2, z + (Math.random() - 0.5) * 1.2);
          buildingsGroup.add(building);

          // Glowing building edge lines
          const edgeGeo = new THREE.EdgesGeometry(bGeo);
          const edgeColor = edgePalette[Math.floor(Math.random() * edgePalette.length)];
          const edgeMat = new THREE.LineBasicMaterial({
            color: edgeColor,
            transparent: true,
            opacity: Math.random() * 0.4 + 0.35
          });
          const edgeLine = new THREE.LineSegments(edgeGeo, edgeMat);
          building.add(edgeLine);

          // Antenna beacon
          if (h > 24) {
            const antGeo = new THREE.CylinderGeometry(0.08, 0.08, 3.5, 8);
            const antMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8 });
            const ant = new THREE.Mesh(antGeo, antMat);
            ant.position.set(0, h / 2 + 1.75, 0);
            building.add(ant);

            const beaconGeo = new THREE.SphereGeometry(0.3, 8, 8);
            const beaconMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
            const beacon = new THREE.Mesh(beaconGeo, beaconMat);
            beacon.position.set(0, h / 2 + 3.5, 0);
            building.add(beacon);
          }
        }
      }
    }
  }

  // 3D ANPR CAMERA TOWERS WITH PULSING SCANNING LASER CONES
  function buildSensorTowers() {
    sensorNodes = [];
    CAMERA_NODES_CONFIG.forEach(cfg => {
      const nodeGroup = new THREE.Group();
      nodeGroup.position.set(cfg.x, 3.8, cfg.z);
      nodeGroup.userData = cfg;

      // Vertical structural lattice mast
      const mastGeo = new THREE.CylinderGeometry(0.15, 0.25, 3.8, 8);
      const mastMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.9, roughness: 0.2 });
      const mast = new THREE.Mesh(mastGeo, mastMat);
      mast.position.y = -1.9;
      nodeGroup.add(mast);

      // Camera Head Housing
      const headGeo = new THREE.BoxGeometry(0.9, 0.6, 1.2);
      const headMat = new THREE.MeshStandardMaterial({
        color: cfg.status === 'dense' ? 0xf59e0b : 0x06b6d4,
        emissive: cfg.status === 'dense' ? 0xd97706 : 0x0891b2,
        emissiveIntensity: 0.85
      });
      const head = new THREE.Mesh(headGeo, headMat);
      head.name = "sensorCore";
      nodeGroup.add(head);

      // Optical Dual-Lens (Cyan Glowing)
      const lensGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.3, 16);
      const lensMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const lens1 = new THREE.Mesh(lensGeo, lensMat);
      lens1.rotation.x = Math.PI / 2;
      lens1.position.set(0.22, 0, 0.6);
      head.add(lens1);

      const lens2 = new THREE.Mesh(lensGeo, lensMat);
      lens2.rotation.x = Math.PI / 2;
      lens2.position.set(-0.22, 0, 0.6);
      head.add(lens2);

      // Holographic Rotating Radar Ring
      const ringGeo = new THREE.TorusGeometry(1.6, 0.05, 8, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.75 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.name = "sensorRing";
      nodeGroup.add(ring);

      // Scanning Laser Cone onto the Road
      const coneGeo = new THREE.ConeGeometry(3.5, 4.0, 16, 1, true);
      const coneMat = new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide
      });
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.set(0, -2.0, 1.8);
      cone.rotation.x = Math.PI / 4;
      cone.name = "laserCone";
      nodeGroup.add(cone);

      // Ground Pulsing Ring
      const groundRingGeo = new THREE.RingGeometry(0.2, 2.5, 32);
      const groundRingMat = new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.35
      });
      const groundRing = new THREE.Mesh(groundRingGeo, groundRingMat);
      groundRing.rotation.x = Math.PI / 2;
      groundRing.position.y = -3.75;
      nodeGroup.add(groundRing);

      sensorNodesGroup.add(nodeGroup);
      sensorNodes.push(nodeGroup);
    });
  }

  // 3D VEHICLES CRUISING SIMULATION
  function initVehiclesSimulation() {
    const vehicleColors = [0x06b6d4, 0x10b981, 0x38bdf8, 0xa855f7, 0xf59e0b, 0xe2e8f0];
    const vehicleCount = 75;

    for (let i = 0; i < vehicleCount; i++) {
      const roadPoints = ROAD_NETWORKS[Math.floor(Math.random() * ROAD_NETWORKS.length)];
      const curve = new THREE.CatmullRomCurve3(roadPoints.map(p => new THREE.Vector3(p.x, 0.35, p.z)));
      
      const vColor = vehicleColors[Math.floor(Math.random() * vehicleColors.length)];
      const vGroup = new THREE.Group();

      // Chassis Body
      const bodyGeo = new THREE.BoxGeometry(0.9, 0.45, 1.8);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: vColor,
        roughness: 0.2,
        metalness: 0.8
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      vGroup.add(body);

      // Cabin / Windshield
      const cabinGeo = new THREE.BoxGeometry(0.75, 0.35, 0.9);
      const cabinMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.1, metalness: 0.9 });
      const cabin = new THREE.Mesh(cabinGeo, cabinMat);
      cabin.position.set(0, 0.35, -0.1);
      vGroup.add(cabin);

      // Headlights (Glowing Cyan/White)
      const lightGeo = new THREE.BoxGeometry(0.2, 0.1, 0.05);
      const headMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe });
      const hlLeft = new THREE.Mesh(lightGeo, headMat);
      hlLeft.position.set(-0.3, 0.05, 0.91);
      vGroup.add(hlLeft);

      const hlRight = new THREE.Mesh(lightGeo, headMat);
      hlRight.position.set(0.3, 0.05, 0.91);
      vGroup.add(hlRight);

      // Tail lights (Red)
      const tailMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
      const tlLeft = new THREE.Mesh(lightGeo, tailMat);
      tlLeft.position.set(-0.3, 0.05, -0.91);
      vGroup.add(tlLeft);

      const tlRight = new THREE.Mesh(lightGeo, tailMat);
      tlRight.position.set(0.3, 0.05, -0.91);
      vGroup.add(tlRight);

      trafficGroup.add(vGroup);

      trafficVehicles.push({
        mesh: vGroup,
        curve: curve,
        progress: Math.random(),
        speed: 0.0008 + Math.random() * 0.0012
      });
    }
  }

  // 3D HOLOGRAPHIC TRAJECTORY TUBE (Exposed Globally)
  window.show3DTrajectory = function (waypoints) {
    if (!trajectoryGroup) return;

    // Clear previous trajectory
    while (trajectoryGroup.children.length > 0) {
      trajectoryGroup.remove(trajectoryGroup.children[0]);
    }

    if (!waypoints || waypoints.length < 2) return;

    const points3D = waypoints.map(w => new THREE.Vector3(w.x_3d, 1.2, w.z_3d));
    const curve = new THREE.CatmullRomCurve3(points3D);

    // Glowing Neon Trajectory Tube
    const tubeGeo = new THREE.TubeGeometry(curve, 64, 0.35, 8, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.85,
      wireframe: false
    });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    trajectoryGroup.add(tube);

    // Add glowing sequential waypoint beacons
    waypoints.forEach((wp, idx) => {
      const beaconGroup = new THREE.Group();
      beaconGroup.position.set(wp.x_3d, 1.5, wp.z_3d);

      const sphereGeo = new THREE.SphereGeometry(0.75, 16, 16);
      const sphereMat = new THREE.MeshBasicMaterial({
        color: wp.is_speeding ? 0xef4444 : 0x10b981
      });
      const sphere = new THREE.Mesh(sphereGeo, sphereMat);
      beaconGroup.add(sphere);

      // Pulsing Ring
      const ringGeo = new THREE.RingGeometry(0.8, 1.5, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: wp.is_speeding ? 0xef4444 : 0x10b981,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      beaconGroup.add(ring);

      trajectoryGroup.add(beaconGroup);
    });

    // Create Chase Vehicle on this path
    if (chaseVehicle) {
      scene.remove(chaseVehicle.mesh);
    }
    const chaseMesh = new THREE.Group();
    const cBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.55, 2.2),
      new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.8 })
    );
    chaseMesh.add(cBody);
    scene.add(chaseMesh);

    chaseVehicle = {
      mesh: chaseMesh,
      curve: curve,
      progress: 0.0,
      speed: 0.003
    };

    // Zoom camera towards first waypoint
    set3DCameraMode('chase');
  };

  window.clear3DTrajectory = function () {
    if (trajectoryGroup) {
      while (trajectoryGroup.children.length > 0) {
        trajectoryGroup.remove(trajectoryGroup.children[0]);
      }
    }
    if (chaseVehicle) {
      scene.remove(chaseVehicle.mesh);
      chaseVehicle = null;
    }
    set3DCameraMode('cinematic');
  };

  // CAMERA MODE CONTROLS
  window.set3DCameraMode = function (mode) {
    cameraMode = mode;
    if (mode === 'cinematic') {
      targetCameraPos = { x: 0, y: 38, z: 56 };
      targetLookAt = { x: 0, y: 0, z: 0 };
    } else if (mode === 'drone') {
      targetCameraPos = { x: 0, y: 75, z: 5 };
      targetLookAt = { x: 0, y: 0, z: 0 };
    } else if (mode === 'junction') {
      targetCameraPos = { x: -15, y: 8, z: -2 };
      targetLookAt = { x: -15, y: 3, z: -10 };
    } else if (mode === 'corridor') {
      targetCameraPos = { x: 22, y: 14, z: 32 };
      targetLookAt = { x: 5, y: 2, z: 20 };
    }
  };

  window.zoom3D = function (delta) {
    spherical.radius += delta;
    spherical.radius = Math.max(15, Math.min(130, spherical.radius));
    updateCameraFromSpherical();
    cameraMode = 'manual';
  };

  // HOTLIST INTERCEPT LASER BEAM
  window.show3DIntercept = function (fromCamId, toCamId) {
    if (!lasersGroup) return;
    while (lasersGroup.children.length > 0) lasersGroup.remove(lasersGroup.children[0]);

    const cam1 = CAMERA_NODES_CONFIG.find(c => c.id === fromCamId) || CAMERA_NODES_CONFIG[2];
    const cam2 = CAMERA_NODES_CONFIG.find(c => c.id === toCamId) || CAMERA_NODES_CONFIG[4];

    const p1 = new THREE.Vector3(cam1.x, 4.0, cam1.z);
    const p2 = new THREE.Vector3(cam2.x, 4.0, cam2.z);

    const lineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
    const lineMat = new THREE.LineDashedMaterial({
      color: 0xef4444,
      dashSize: 1.5,
      gapSize: 0.8,
      linewidth: 3
    });
    const laser = new THREE.Line(lineGeo, lineMat);
    laser.computeLineDistances();
    lasersGroup.add(laser);
  };

  // ANIMATION LOOP
  function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const elapsed = clock.getElapsedTime();

    // 1. Rotate radar rings and pulse sensor lasers
    sensorNodes.forEach(node => {
      const ring = node.getObjectByName("sensorRing");
      if (ring) ring.rotation.z += 0.025;

      const cone = node.getObjectByName("laserCone");
      if (cone) {
        cone.material.opacity = 0.12 + Math.sin(elapsed * 4.0 + node.position.x) * 0.06;
      }
    });

    // 2. Animate traffic vehicles along road paths
    trafficVehicles.forEach(v => {
      v.progress += v.speed;
      if (v.progress > 1.0) v.progress = 0.0;

      const pt = v.curve.getPointAt(v.progress);
      v.mesh.position.copy(pt);

      const tangent = v.curve.getTangentAt(v.progress);
      v.mesh.lookAt(pt.clone().add(tangent));
    });

    // 3. Animate chase vehicle if active
    if (chaseVehicle) {
      chaseVehicle.progress += chaseVehicle.speed;
      if (chaseVehicle.progress > 1.0) chaseVehicle.progress = 0.0;
      const pt = chaseVehicle.curve.getPointAt(chaseVehicle.progress);
      chaseVehicle.mesh.position.copy(pt);
      const tangent = chaseVehicle.curve.getTangentAt(chaseVehicle.progress);
      chaseVehicle.mesh.lookAt(pt.clone().add(tangent));

      if (cameraMode === 'chase') {
        targetCameraPos = { x: pt.x - tangent.x * 12, y: pt.y + 6.5, z: pt.z - tangent.z * 12 };
        targetLookAt = { x: pt.x, y: pt.y + 1, z: pt.z };
      }
    }

    // 4. Smooth Camera Lerp
    if (cameraMode === 'cinematic') {
      const radius = 56;
      const angle = elapsed * 0.05;
      targetCameraPos.x = Math.sin(angle) * radius;
      targetCameraPos.z = Math.cos(angle) * radius;
    }

    camera.position.x += (targetCameraPos.x - camera.position.x) * 0.05;
    camera.position.y += (targetCameraPos.y - camera.position.y) * 0.05;
    camera.position.z += (targetCameraPos.z - camera.position.z) * 0.05;

    currentLookAt.x += (targetLookAt.x - currentLookAt.x) * 0.05;
    currentLookAt.y += (targetLookAt.y - currentLookAt.y) * 0.05;
    currentLookAt.z += (targetLookAt.z - currentLookAt.z) * 0.05;
    camera.lookAt(currentLookAt);

    renderer.render(scene, camera);
  }

  // Interactive Orbit / Pan / Zoom State
  let isDragging = false;
  let isRightDragging = false;
  let prevMousePos = { x: 0, y: 0 };
  let spherical = { radius: 68, phi: Math.PI / 4, theta: Math.PI / 4 };
  let hoveredBuilding = null;
  let activeVehicleTarget = null;

  function updateCameraFromSpherical() {
    spherical.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, spherical.phi));
    const x = spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
    const y = spherical.radius * Math.cos(spherical.phi);
    const z = spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
    targetCameraPos.x = targetLookAt.x + x;
    targetCameraPos.y = targetLookAt.y + y;
    targetCameraPos.z = targetLookAt.z + z;
  }

  // EVENT LISTENERS
  function onWindowResize() {
    if (!container || !renderer || !camera) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }

  function onMouseMove(event) {
    if (!container) return;
    const rect = container.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / container.clientWidth) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / container.clientHeight) * 2 + 1;

    if (isDragging) {
      const dx = event.clientX - prevMousePos.x;
      const dy = event.clientY - prevMousePos.y;
      spherical.theta -= dx * 0.008;
      spherical.phi -= dy * 0.008;
      updateCameraFromSpherical();
      cameraMode = 'manual';
    } else if (isRightDragging) {
      const dx = event.clientX - prevMousePos.x;
      const dy = event.clientY - prevMousePos.y;
      const panSpeed = 0.08;
      const forward = new THREE.Vector3().subVectors(new THREE.Vector3(targetLookAt.x, targetLookAt.y, targetLookAt.z), camera.position).normalize();
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
      targetLookAt.x -= right.x * dx * panSpeed;
      targetLookAt.z -= right.z * dx * panSpeed;
      targetLookAt.y += dy * panSpeed;
      updateCameraFromSpherical();
      cameraMode = 'manual';
    }

    // Hover raycaster for buildings
    if (!isDragging && !isRightDragging && camera) {
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(buildingsGroup.children, false);
      if (intersects.length > 0) {
        const b = intersects[0].object;
        if (hoveredBuilding !== b) {
          if (hoveredBuilding && hoveredBuilding.material) hoveredBuilding.material.emissive?.setHex(0x000000);
          hoveredBuilding = b;
          if (b.material && b.material.emissive) b.material.emissive.setHex(0x06b6d4);
          showHoverBuildingTooltip(event.clientX, event.clientY, b);
        }
      } else {
        if (hoveredBuilding && hoveredBuilding.material) hoveredBuilding.material.emissive?.setHex(0x000000);
        hoveredBuilding = null;
        hideHoverBuildingTooltip();
      }
    }

    prevMousePos = { x: event.clientX, y: event.clientY };
  }

  function showHoverBuildingTooltip(clientX, clientY, building) {
    let tip = document.getElementById('building-3d-hover-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'building-3d-hover-tip';
      tip.className = 'fixed z-50 pointer-events-none p-2 bg-slate-950/90 backdrop-blur-md border border-cyan-500/40 rounded text-[11px] text-cyan-300 font-mono shadow-lg transition-opacity duration-150';
      document.body.appendChild(tip);
    }
    const h = Math.round(building.position.y * 2);
    tip.style.display = 'block';
    tip.style.left = `${clientX + 14}px`;
    tip.style.top = `${clientY - 10}px`;
    tip.innerHTML = `
      <div class="font-bold text-white flex items-center space-x-1">
        <span class="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
        <span>Urban Sector Skyscraper</span>
      </div>
      <div class="text-gray-400 text-[10px]">Height: ${h}m &bull; Monitored Grid</div>
    `;
  }

  function hideHoverBuildingTooltip() {
    const tip = document.getElementById('building-3d-hover-tip');
    if (tip) tip.style.display = 'none';
  }

  function onClickNode(event) {
    if (!camera) return;
    raycaster.setFromCamera(mouse, camera);

    // 1. Check Camera Towers
    if (sensorNodes.length) {
      const intersects = raycaster.intersectObjects(sensorNodes, true);
      if (intersects.length > 0) {
        let root = intersects[0].object;
        while (root.parent && root.parent !== sensorNodesGroup) {
          root = root.parent;
        }
        if (root.userData && root.userData.id) {
          show3DNodeHUD(root.userData);
          return;
        }
      }
    }

    // 2. Check Vehicles
    if (trafficVehicles.length) {
      const vehicleMeshes = trafficVehicles.map(v => v.mesh);
      const vIntersects = raycaster.intersectObjects(vehicleMeshes, true);
      if (vIntersects.length > 0) {
        let root = vIntersects[0].object;
        while (root.parent && root.parent !== trafficGroup) {
          root = root.parent;
        }
        const found = trafficVehicles.find(v => v.mesh === root);
        if (found) {
          activeVehicleTarget = found;
          cameraMode = 'chase';
          chaseVehicle = found;
          showVehicleClickHUD(found);
          return;
        }
      }
    }
  }

  function showVehicleClickHUD(v) {
    let hud = document.getElementById('camera-3d-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'camera-3d-hud';
      hud.className = 'fixed z-50 pointer-events-auto p-4 glass-card border border-cyan-500/40 text-xs shadow-2xl glow-cyan max-w-xs transition-all duration-300';
      document.body.appendChild(hud);
    }
    hud.style.bottom = '24px';
    hud.style.right = '24px';
    hud.innerHTML = `
      <div class="flex items-center justify-between pb-2 border-b border-gray-800 mb-2">
        <div class="flex items-center space-x-2">
          <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
          <span class="font-bold text-white font-mono uppercase">TARGET TRACKING</span>
        </div>
        <button onclick="document.getElementById('camera-3d-hud').remove()" class="text-gray-400 hover:text-white"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <p class="font-bold text-cyan-300 text-sm mb-1">Cruising Urban Entity</p>
      <div class="grid grid-cols-2 gap-2 text-center mb-3">
        <div class="bg-gray-900/80 p-2 rounded border border-gray-800">
          <div class="text-gray-400 text-[10px]">SPEED</div>
          <div class="text-emerald-400 font-bold text-sm font-mono">${Math.round(45 + v.speed * 20000)} km/h</div>
        </div>
        <div class="bg-gray-900/80 p-2 rounded border border-gray-800">
          <div class="text-gray-400 text-[10px]">STATUS</div>
          <div class="text-white font-bold text-sm">Active Flow</div>
        </div>
      </div>
      <button onclick="window.set3DCameraMode('cinematic')" class="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded font-medium text-xs transition border border-slate-700 flex items-center justify-center space-x-1">
        <i class="fa-solid fa-arrow-rotate-left mr-1"></i><span>Return to Orbit View</span>
      </button>
    `;
  }

  function show3DNodeHUD(camData) {
    let hud = document.getElementById('camera-3d-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'camera-3d-hud';
      hud.className = 'fixed z-50 pointer-events-auto p-4 glass-card border border-cyan-500/40 text-xs shadow-2xl glow-cyan max-w-xs transition-all duration-300';
      document.body.appendChild(hud);
    }

    hud.style.bottom = '24px';
    hud.style.right = '24px';
    hud.innerHTML = `
      <div class="flex items-center justify-between pb-2 border-b border-gray-800 mb-2">
        <div class="flex items-center space-x-2">
          <span class="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
          <span class="font-bold text-white uppercase tracking-wider">${camData.id}</span>
        </div>
        <button onclick="document.getElementById('camera-3d-hud').remove()" class="text-gray-400 hover:text-white"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <p class="font-bold text-cyan-300 text-sm mb-1">${camData.name}</p>
      <p class="text-gray-400 text-xs mb-3">Sector: <span class="text-gray-200">${camData.sector || 'Urban Corridor'}</span></p>
      <div class="grid grid-cols-2 gap-2 text-center mb-3">
        <div class="bg-gray-900/80 p-2 rounded border border-gray-800">
          <div class="text-gray-400 text-[10px]">THROUGHPUT</div>
          <div class="text-white font-bold text-sm">${camData.flow} vph</div>
        </div>
        <div class="bg-gray-900/80 p-2 rounded border border-gray-800">
          <div class="text-gray-400 text-[10px]">AVG SPEED</div>
          <div class="text-emerald-400 font-bold text-sm">${camData.speed}</div>
        </div>
      </div>
      <div class="flex items-center justify-between bg-cyan-950/40 border border-cyan-500/30 p-2 rounded mb-2 text-[11px]">
        <span class="text-gray-300">OCR Recognition:</span>
        <span class="text-emerald-400 font-bold">96.8% (>90% Conf)</span>
      </div>
      <button onclick="if(window.inspectCameraFeed) window.inspectCameraFeed('${camData.id}')" class="w-full py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-medium text-xs transition flex items-center justify-center space-x-1">
        <i class="fa-solid fa-video mr-1"></i><span>Inspect Camera Feed</span>
      </button>
    `;
  }

  // Initialize on load
  document.addEventListener('DOMContentLoaded', () => {
    window.initUrbanTwin3D();
  });
})();
