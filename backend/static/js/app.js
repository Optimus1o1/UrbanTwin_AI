/**
 * UrbanTwin AI - Master Frontend Controller
 * Centralized Multi-Camera ANPR, Single-Plate Trajectory Tracking, Macro Traffic & Alert System
 */

let cityMap = null;
let trajectoryMap = null;
let trajPolyline = null;
let trajMarkers = [];
let animVehicleMarker = null;
let corridorMap = null;
let corridorPolyline = null;
let corridorMarkers = [];
let corridorVehicleMarker = null;
let activeCorridorId = 'CORRIDOR-AMB-911';
let currentCorridorData = null;
let currentTab = '3dtwin';
let activeTrackedPlate = '7XYZ912';
let speedChart = null;
let heatmapLayerActive = true;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initLeafletMaps();
  loadInitialDashboardData();
  
  // Hash route detection (e.g. #tracking, #corridor, #ocr, #alerts)
  const hash = window.location.hash.replace('#', '');
  if (hash && ['3dtwin', 'tracking', 'corridor', 'macro', 'ocr', 'alerts', 'simulation'].includes(hash)) {
    switchTab(hash);
  } else {
    switchTab('3dtwin');
  }

  // Periodic refresh
  setInterval(() => {
    if (currentTab === 'corridor') loadCorridorData();
    if (currentTab === 'macro') loadMacroTraffic();
    if (currentTab === 'alerts') loadAlerts();
  }, 12000);
});

// Live UTC Clock
function initClock() {
  const clockEl = document.getElementById('live-clock');
  function update() {
    const now = new Date();
    if (clockEl) clockEl.innerText = now.toUTCString().split(' ')[4] + ' UTC';
  }
  update();
  setInterval(update, 1000);
}

// TAB SWITCHER
window.switchTab = function (tabId) {
  currentTab = tabId;
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('text-white', 'bg-cyan-600/30', 'border-cyan-500/40');
    btn.classList.add('text-slate-400');
  });

  const activePanel = document.getElementById(`tab-${tabId}`);
  if (activePanel) activePanel.classList.remove('hidden');

  const activeBtn = document.getElementById(`nav-${tabId}`);
  if (activeBtn) {
    activeBtn.classList.remove('text-slate-400');
    activeBtn.classList.add('text-white', 'bg-cyan-600/30', 'border-cyan-500/40');
  }

  if (tabId === '3dtwin') {
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      if (window.set3DCameraMode) window.set3DCameraMode('cinematic');
    }, 50);
  } else if (tabId === 'tracking') {
    setTimeout(() => {
      if (trajectoryMap) trajectoryMap.invalidateSize();
      runTrajectorySearch();
    }, 100);
  } else if (tabId === 'corridor') {
    setTimeout(() => {
      if (corridorMap) corridorMap.invalidateSize();
      loadCorridorData();
    }, 100);
  } else if (tabId === 'macro') {
    setTimeout(() => {
      if (cityMap) cityMap.invalidateSize();
      loadMacroTraffic();
    }, 100);
  } else if (tabId === 'ocr') {
    runOCRTest();
  } else if (tabId === 'alerts') {
    loadAlerts();
  } else if (tabId === 'simulation') {
    setTimeout(() => {
      if (window.initWhatIf3D) window.initWhatIf3D();
      if (!window.hasRunWhatIfInitial) {
        window.hasRunWhatIfInitial = true;
        window.runSimulation();
      }
    }, 80);
  }
};

// INITIAL DATA LOADING
async function loadInitialDashboardData() {
  try {
    const [camsRes, macroRes] = await Promise.all([
      fetch('/api/v1/cameras'),
      fetch('/api/v1/traffic/macro')
    ]);

    if (camsRes.ok) {
      const cams = await camsRes.json();
      populateCameraPins(cams);
    }

    if (macroRes.ok) {
      const macro = await macroRes.json();
      document.getElementById('kpi-ocr').innerHTML = `${macro.system_ocr_accuracy_benchmark_pct}% <span class="text-xs text-gray-400 font-normal">(>90% Spec)</span>`;
      document.getElementById('kpi-speed').innerText = `${macro.current_city_avg_speed_kmh} km/h`;
      document.getElementById('kpi-plates').innerText = macro.total_plates_scanned_today.toLocaleString();
    }
  } catch (e) {
    console.warn("Failed loading live metrics:", e);
  }
}

// LEAFLET MAPS INITIALIZATION
function initLeafletMaps() {
  if (typeof L === 'undefined') return;

  const bangaloreCenter = [12.9450, 77.6250];

  // 1. Macro City Map
  const cityEl = document.getElementById('city-map');
  if (cityEl) {
    cityMap = L.map('city-map', { zoomControl: true }).setView(bangaloreCenter, 12);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; CARTO &copy; OpenStreetMap'
    }).addTo(cityMap);
  }

  // 2. Trajectory Map
  const trajEl = document.getElementById('trajectory-map');
  if (trajEl) {
    trajectoryMap = L.map('trajectory-map', { zoomControl: true }).setView(bangaloreCenter, 12);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; CARTO &copy; OpenStreetMap'
    }).addTo(trajectoryMap);
  }

  // 3. Green Corridor Map
  const corrEl = document.getElementById('corridor-map');
  if (corrEl && !corridorMap) {
    corridorMap = L.map('corridor-map', { zoomControl: true }).setView(bangaloreCenter, 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; CARTO &copy; OpenStreetMap'
    }).addTo(corridorMap);
  }
}

function createCustomPin(label, color = '#06b6d4') {
  return L.divIcon({
    className: 'custom-pin',
    html: `
      <div style="background:${color}; width:28px; height:28px; border-radius:50%; border:2px solid #fff; box-shadow:0 0 15px ${color}; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:bold; font-size:11px; font-family:monospace;">
        ${label}
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
}

// Interactive Trajectory Playback & Scrubbing State
let activeTrajData = null;
let isPlayingTraj = false;
let playbackRatio = 0;
let playbackSpeed = 1;
let playbackTimer = null;

// Interactive Macro Layers & Simulation State
let macroLayerStates = { heat: true, cams: true, corridors: true, od: true };
let macroCameraMarkers = [];
let macroCorridorLayers = [];
let macroODVectorLayers = [];
let activeSimHour = 8.5;
let baseDensities = [];
let baseODData = null;
let activeHighlightedCorridor = null;

function populateCameraPins(cams) {
  if (!cityMap) return;
  macroCameraMarkers.forEach(m => cityMap.removeLayer(m));
  macroCameraMarkers = [];

  cams.forEach(c => {
    const marker = L.marker([c.latitude, c.longitude], {
      icon: createCustomPin(c.camera_id.split('_')[1], '#06b6d4')
    }).addTo(cityMap);

    marker.bindPopup(`
      <div class="custom-leaflet-popup p-1.5 text-xs max-w-xs">
        <div class="flex items-center justify-between border-b border-cyan-500/30 pb-1 mb-1.5">
          <span class="font-bold text-cyan-400 font-mono">${c.camera_id}</span>
          <span class="px-1.5 py-0.2 bg-emerald-950 text-emerald-400 border border-emerald-500/30 rounded text-[9px] font-bold">ONLINE</span>
        </div>
        <div class="font-bold text-white mb-0.5">${c.name}</div>
        <div class="text-gray-400 text-[10px] mb-2">Sector: <strong class="text-gray-200">${c.sector}</strong></div>
        <div class="grid grid-cols-2 gap-1.5 bg-slate-900/80 p-1.5 rounded border border-slate-800 text-[11px] mb-2">
          <div>Flow: <strong class="text-white">${c.flow_rate_vph} vph</strong></div>
          <div>Speed: <strong class="text-emerald-400">${c.avg_speed_kmh} km/h</strong></div>
        </div>
        <button onclick="window.switchTab('3dtwin'); if(window.focusCameraNode) window.focusCameraNode('${c.camera_id}');" class="w-full py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded text-[10px] font-bold transition flex items-center justify-center space-x-1 shadow">
          <i class="fa-solid fa-cube mr-1"></i><span>Inspect in 3D Digital Twin</span>
        </button>
      </div>
    `);
    macroCameraMarkers.push(marker);
  });
}

// SINGLE PLATE TRAJECTORY TRACKING ENGINE
window.queryPlate = function (plate) {
  const input = document.getElementById('plate-search-input');
  if (input) input.value = plate;
  activeTrackedPlate = plate;
  runTrajectorySearch();
};

window.runTrajectorySearch = async function () {
  const input = document.getElementById('plate-search-input');
  const plate = input ? input.value.trim().toUpperCase() : activeTrackedPlate;
  activeTrackedPlate = plate;

  try {
    const res = await fetch(`/api/v1/vehicles/${encodeURIComponent(plate)}/trajectory`);
    if (!res.ok) {
      alert(`No trajectory records found for plate '${plate}'. Try '7XYZ912' or '3ABC456'.`);
      return;
    }
    const data = await res.json();
    renderTrajectory(data);
  } catch (e) {
    console.error("Failed reconstructing trajectory:", e);
  }
};

function renderTrajectory(traj) {
  activeTrajData = traj;
  pausePlayback();
  playbackRatio = 0;

  // Update banner
  document.getElementById('traj-plate-display').innerText = traj.plate_text;
  document.getElementById('traj-vehicle-desc').innerText = `${traj.vehicle_class} &bull; ${traj.vehicle_color}`;
  document.getElementById('traj-time-window').innerText = `First Sighted: ${traj.first_seen} &bull; Last Seen: ${traj.last_seen}`;
  document.getElementById('traj-checkpoints-count').innerText = `${traj.total_waypoints} Nodes`;
  document.getElementById('traj-distance').innerText = `${traj.total_distance_km} km`;
  document.getElementById('traj-avg-speed').innerText = `${traj.avg_speed_kmh} km/h`;
  document.getElementById('traj-peak-speed').innerText = `${traj.max_speed_kmh} km/h`;

  // Update 3D Digital Twin Trajectory Tube
  if (window.show3DTrajectory && traj.waypoints) {
    window.show3DTrajectory(traj.waypoints);
  }

  // Update 2D Leaflet Trajectory Map
  if (trajectoryMap && traj.route_coordinates) {
    if (trajPolyline) trajectoryMap.removeLayer(trajPolyline);
    trajMarkers.forEach(m => trajectoryMap.removeLayer(m));
    trajMarkers = [];
    if (animVehicleMarker) trajectoryMap.removeLayer(animVehicleMarker);

    // Draw route polyline with cyan neon glow
    trajPolyline = L.polyline(traj.route_coordinates, {
      color: '#06b6d4',
      weight: 5,
      opacity: 0.85,
      dashArray: '8, 8'
    }).addTo(trajectoryMap);

    // Add numbered waypoint markers (1, 2, 3...)
    traj.waypoints.forEach(wp => {
      const pinColor = wp.is_speeding ? '#ef4444' : '#10b981';
      const m = L.marker([wp.lat, wp.lng], { icon: createCustomPin(wp.step, pinColor) }).addTo(trajectoryMap);
      m.bindPopup(`
        <div class="custom-leaflet-popup p-1.5 text-xs max-w-xs">
          <div class="flex items-center justify-between border-b ${wp.is_speeding ? 'border-rose-500/40' : 'border-cyan-500/30'} pb-1 mb-1">
            <span class="font-bold ${wp.is_speeding ? 'text-rose-400' : 'text-cyan-400'} font-mono">Step ${wp.step}</span>
            <span class="text-gray-400 font-mono text-[10px]">${wp.timestamp}</span>
          </div>
          <div class="font-bold text-white mb-0.5">${wp.camera_name}</div>
          <div class="text-gray-300 text-[11px] mb-1.5">Speed: <strong class="${wp.is_speeding ? 'text-rose-400 font-bold' : 'text-emerald-400'}">${wp.speed_kmh} km/h</strong> (Heading ${wp.direction_heading})</div>
          ${wp.is_speeding ? '<div class="p-1 bg-rose-950/60 border border-rose-500/40 rounded text-rose-300 font-bold text-[10px] mb-1.5"><i class="fa-solid fa-triangle-exclamation mr-1"></i>SPEED VIOLATION DETECTED</div>' : ''}
          <button onclick="window.focusWaypointIn3D(${wp.x_3d}, ${wp.z_3d}, '${wp.camera_name}')" class="w-full py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-[10px] font-bold transition flex items-center justify-center space-x-1 shadow">
            <i class="fa-solid fa-cube mr-1"></i><span>Focus in 3D Digital Twin</span>
          </button>
        </div>
      `);
      trajMarkers.push(m);
    });

    // Create Animated Car Marker
    const carIcon = L.divIcon({
      className: 'car-icon',
      html: `<div style="background:#00f0ff; width:18px; height:18px; border-radius:50%; border:3px solid #fff; box-shadow:0 0 18px #00f0ff; display:flex; align-items:center; justify-content:center; color:#000; font-size:9px;"><i class="fa-solid fa-car-side"></i></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
    animVehicleMarker = L.marker(traj.route_coordinates[0], { icon: carIcon }).addTo(trajectoryMap);

    trajectoryMap.fitBounds(trajPolyline.getBounds(), { padding: [40, 40] });
  }

  // Render Chronological Timeline Cards (Clickable to fly map!)
  const cardsContainer = document.getElementById('trajectory-timeline-cards');
  if (cardsContainer && traj.waypoints) {
    cardsContainer.innerHTML = traj.waypoints.map(wp => `
      <div onclick="window.focusWaypointOn2D(${wp.step})" class="p-3 bg-slate-900/90 hover:bg-cyan-950/30 rounded-lg border ${wp.is_speeding ? 'border-rose-500/50 bg-rose-950/10' : 'border-slate-800'} hover:border-cyan-500/60 space-y-1 cursor-pointer transition transform hover:-translate-x-0.5">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <span class="w-5 h-5 rounded-full ${wp.is_speeding ? 'bg-rose-500 text-white' : 'bg-cyan-500/20 text-cyan-400'} flex items-center justify-center font-bold text-[10px]">${wp.step}</span>
            <span class="text-white font-bold text-xs">${wp.camera_id}: ${wp.camera_name.split('-')[0]}</span>
          </div>
          <span class="font-mono text-xs ${wp.is_speeding ? 'text-rose-400 font-bold' : 'text-emerald-400'}">${wp.speed_kmh} km/h</span>
        </div>
        <div class="flex justify-between text-[11px] text-gray-400 font-mono">
          <span>Time: ${wp.timestamp}</span>
          <span>Heading: ${wp.direction_heading}</span>
        </div>
        ${wp.is_speeding ? '<div class="text-[10px] text-rose-400 font-semibold pt-0.5"><i class="fa-solid fa-triangle-exclamation mr-1"></i>Speed Violation (Limit 60 km/h)</div>' : ''}
      </div>
    `).join('');
  }

  // Render Speed Profile Chart
  renderSpeedChart(traj.waypoints);

  // Initialize scrubber at 0
  const scrubber = document.getElementById('traj-scrubber');
  if (scrubber) scrubber.value = 0;
  onScrubTrajectory(0);
}

function renderSpeedChart(waypoints) {
  const canvas = document.getElementById('trajectory-speed-chart');
  if (!canvas) return;

  if (speedChart) speedChart.destroy();

  const labels = waypoints.map(w => `WP ${w.step}`);
  const speeds = waypoints.map(w => w.speed_kmh);
  const limits = waypoints.map(() => 60.0);

  speedChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Vehicle Speed (km/h)',
          data: speeds,
          borderColor: '#06b6d4',
          backgroundColor: 'rgba(6,182,212,0.15)',
          fill: true,
          tension: 0.3,
          pointBackgroundColor: speeds.map(s => s > 60 ? '#ef4444' : '#10b981'),
          pointRadius: 5
        },
        {
          label: 'Speed Limit (60 km/h)',
          data: limits,
          borderColor: '#ef4444',
          borderDash: [5, 5],
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#94a3b8', font: { size: 9 } }, grid: { display: false } },
        y: { min: 20, max: 90, ticks: { color: '#94a3b8', font: { size: 9 } }, grid: { color: '#1e293b' } }
      }
    }
  });
}

// =========================================================================
// INTERACTIVE PLAYBACK & SCRUBBING CONTROLLER
// =========================================================================
window.onScrubTrajectory = function (val) {
  if (!activeTrajData || !activeTrajData.route_coordinates) return;
  playbackRatio = Math.max(0, Math.min(100, val)) / 100;

  const scrubValEl = document.getElementById('traj-scrub-val');
  if (scrubValEl) scrubValEl.innerText = `${Math.round(playbackRatio * 100)}%`;

  const coords = activeTrajData.route_coordinates;
  const idx = Math.min(coords.length - 1, Math.floor(playbackRatio * (coords.length - 1)));
  const currentCoord = coords[idx];

  if (animVehicleMarker && trajectoryMap) {
    animVehicleMarker.setLatLng(currentCoord);
  }

  // Find nearest waypoint
  const waypoints = activeTrajData.waypoints;
  if (waypoints && waypoints.length) {
    const wpIdx = Math.min(waypoints.length - 1, Math.floor(playbackRatio * waypoints.length));
    const activeWp = waypoints[wpIdx];

    const camEl = document.getElementById('hud-wp-camera');
    const spdEl = document.getElementById('hud-wp-speed');
    const timeEl = document.getElementById('hud-wp-time');
    const violEl = document.getElementById('hud-wp-violation');

    if (camEl) camEl.innerText = `Step ${activeWp.step}: ${activeWp.camera_name}`;
    if (spdEl) {
      spdEl.innerText = `${activeWp.speed_kmh} km/h`;
      spdEl.className = activeWp.is_speeding ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold';
    }
    if (timeEl) timeEl.innerText = activeWp.timestamp;
    if (violEl) {
      if (activeWp.is_speeding) violEl.classList.remove('hidden');
      else violEl.classList.add('hidden');
    }
  }
};

window.togglePlayPause = function () {
  if (isPlayingTraj) {
    pausePlayback();
  } else {
    startPlayback();
  }
};

window.playTrajectoryAnimation = function () {
  playbackRatio = 0;
  startPlayback();
};

function startPlayback() {
  isPlayingTraj = true;
  updatePlayButtonUI(true);

  if (playbackTimer) clearInterval(playbackTimer);
  playbackTimer = setInterval(() => {
    playbackRatio += 0.015 * playbackSpeed;
    if (playbackRatio >= 1.0) {
      playbackRatio = 1.0;
      onScrubTrajectory(100);
      const scrubber = document.getElementById('traj-scrubber');
      if (scrubber) scrubber.value = 100;
      pausePlayback();
      return;
    }
    const pct = Math.round(playbackRatio * 100);
    const scrubber = document.getElementById('traj-scrubber');
    if (scrubber) scrubber.value = pct;
    onScrubTrajectory(pct);
  }, 100);
}

function pausePlayback() {
  isPlayingTraj = false;
  if (playbackTimer) clearInterval(playbackTimer);
  playbackTimer = null;
  updatePlayButtonUI(false);
}

function updatePlayButtonUI(playing) {
  const icon = document.getElementById('playback-btn-icon');
  const mainIcon = document.getElementById('traj-play-icon');
  const mainText = document.getElementById('traj-play-text');
  const btn = document.getElementById('traj-playback-toggle-btn');

  if (playing) {
    if (icon) icon.className = 'fa-solid fa-pause text-xs';
    if (mainIcon) mainIcon.className = 'fa-solid fa-pause';
    if (mainText) mainText.innerText = 'Pause Replay';
    if (btn) { btn.classList.remove('bg-emerald-600'); btn.classList.add('bg-amber-600'); }
  } else {
    if (icon) icon.className = 'fa-solid fa-play text-xs';
    if (mainIcon) mainIcon.className = 'fa-solid fa-play';
    if (mainText) mainText.innerText = 'Play Journey';
    if (btn) { btn.classList.remove('bg-amber-600'); btn.classList.add('bg-emerald-600'); }
  }
}

window.setPlaySpeed = function (spd) {
  playbackSpeed = spd;
  [1, 2, 4].forEach(s => {
    const b = document.getElementById(`spd-btn-${s}`);
    if (b) {
      if (s === spd) {
        b.className = 'px-2 py-0.5 bg-cyan-600 text-white rounded text-[11px] border border-cyan-400';
      } else {
        b.className = 'px-2 py-0.5 bg-slate-900 text-cyan-300 rounded text-[11px] border border-slate-700';
      }
    }
  });
  if (isPlayingTraj) {
    startPlayback();
  }
};

window.stepTrajForward = function () {
  if (!activeTrajData || !activeTrajData.waypoints) return;
  const count = activeTrajData.waypoints.length;
  const currentStep = Math.floor(playbackRatio * count);
  const nextStep = Math.min(count - 1, currentStep + 1);
  const pct = Math.round((nextStep / (count - 1)) * 100);
  const scrubber = document.getElementById('traj-scrubber');
  if (scrubber) scrubber.value = pct;
  onScrubTrajectory(pct);
};

window.stepTrajBackward = function () {
  if (!activeTrajData || !activeTrajData.waypoints) return;
  const count = activeTrajData.waypoints.length;
  const currentStep = Math.floor(playbackRatio * count);
  const prevStep = Math.max(0, currentStep - 1);
  const pct = Math.round((prevStep / (count - 1)) * 100);
  const scrubber = document.getElementById('traj-scrubber');
  if (scrubber) scrubber.value = pct;
  onScrubTrajectory(pct);
};

window.focusWaypointOn2D = function (step) {
  if (!activeTrajData || !activeTrajData.waypoints || !trajectoryMap) return;
  const wp = activeTrajData.waypoints.find(w => w.step === step);
  if (wp) {
    trajectoryMap.flyTo([wp.lat, wp.lng], 15, { animate: true, duration: 0.8 });
    const m = trajMarkers.find((_, i) => activeTrajData.waypoints[i].step === step);
    if (m) m.openPopup();
  }
};

window.focusWaypointIn3D = function (x_3d, z_3d, name) {
  window.switchTab('3dtwin');
  setTimeout(() => {
    if (window.focusCameraOnCoords) {
      window.focusCameraOnCoords(x_3d, 0, z_3d);
    }
  }, 100);
};

// =========================================================================
// INTERACTIVE MACRO TRAFFIC FLOW, LAYERS & HOURLY SIMULATOR
// =========================================================================
window.toggleMacroLayer = function (layer) {
  if (macroLayerStates[layer] !== undefined) {
    macroLayerStates[layer] = !macroLayerStates[layer];
    const isOn = macroLayerStates[layer];

    const btn = document.getElementById(`btn-toggle-${layer}`);
    if (btn) {
      if (isOn) {
        btn.className = 'px-2.5 py-1 bg-cyan-600 text-white rounded font-semibold text-[11px] border border-cyan-400 transition';
        btn.innerHTML = `<i class="fa-solid fa-${getLayerIcon(layer)} mr-1"></i>${getLayerTitle(layer)}: ON`;
      } else {
        btn.className = 'px-2.5 py-1 bg-slate-900 text-slate-400 rounded font-semibold text-[11px] border border-slate-800 transition opacity-60';
        btn.innerHTML = `<i class="fa-solid fa-${getLayerIcon(layer)} mr-1"></i>${getLayerTitle(layer)}: OFF`;
      }
    }

    if (layer === 'cams') {
      macroCameraMarkers.forEach(m => {
        if (isOn) m.addTo(cityMap);
        else cityMap.removeLayer(m);
      });
    } else if (layer === 'corridors') {
      macroCorridorLayers.forEach(l => {
        if (isOn) l.addTo(cityMap);
        else cityMap.removeLayer(l);
      });
    } else if (layer === 'od') {
      macroODVectorLayers.forEach(l => {
        if (isOn) l.addTo(cityMap);
        else cityMap.removeLayer(l);
      });
    } else if (layer === 'heat') {
      window.toggleHeatmapLayer();
    }
  }
};

function getLayerIcon(layer) {
  const map = { heat: 'fire', cams: 'video', corridors: 'road', od: 'arrows-split-up-and-left' };
  return map[layer] || 'layer-group';
}

function getLayerTitle(layer) {
  const map = { heat: 'Heatmap', cams: 'Cameras', corridors: 'Corridors', od: 'OD Vectors' };
  return map[layer] || layer;
}

window.onMacroHourSlide = function (val) {
  activeSimHour = parseFloat(val);
  const hour = Math.floor(activeSimHour);
  const min = (activeSimHour % 1) === 0 ? '00' : '30';
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);

  let desc = 'Normal Urban Transit';
  if (activeSimHour >= 8 && activeSimHour <= 10) desc = 'Morning Rush Peak (High Density)';
  else if (activeSimHour >= 12 && activeSimHour <= 14) desc = 'Midday Lull (Free Flow)';
  else if (activeSimHour >= 17.5 && activeSimHour <= 20) desc = 'Evening Commuter Congestion';
  else if (activeSimHour >= 21) desc = 'Late Night Transit (Optimal Flow)';

  const readout = document.getElementById('macro-time-readout');
  if (readout) {
    readout.innerText = `${h12}:${min} ${ampm} (${desc})`;
  }

  // Update dynamic speed & flow simulation based on active hour
  updateSimulatedMacroDynamics(activeSimHour);
};

window.setSimHour = function (val) {
  const slider = document.getElementById('macro-hour-slider');
  if (slider) slider.value = val;
  window.onMacroHourSlide(val);
};

function updateSimulatedMacroDynamics(hour) {
  if (!baseDensities.length) return;

  // Congestion curve: Peaks around 8.5 and 18.5
  const mPeak = Math.exp(-Math.pow(hour - 8.5, 2) / 2.5);
  const ePeak = Math.exp(-Math.pow(hour - 18.5, 2) / 3.0);
  const congestionFactor = Math.min(1.0, 0.25 + mPeak * 0.7 + ePeak * 0.65);

  const losList = document.getElementById('macro-los-list');
  if (losList) {
    losList.innerHTML = baseDensities.map(d => {
      const isCongestedCam = d.camera_id === 'CAM_03' || d.camera_id === 'CAM_05';
      const effCongestion = isCongestedCam ? Math.min(0.96, congestionFactor * 1.25) : congestionFactor * 0.75;
      const speed = Math.round(70 - effCongestion * 48);
      const flow = Math.round(d.flow_rate_vph * (0.6 + effCongestion * 0.7));
      const los = speed < 28 ? 'LOS E (Bottleneck)' : (speed < 42 ? 'LOS C (Moderate)' : 'LOS A (Free Flow)');

      return `
        <div class="p-2.5 bg-slate-900 rounded-lg border border-slate-800 flex items-center justify-between text-xs">
          <div>
            <div class="text-white font-bold">${d.camera_id}: ${d.camera_name.split('-')[0]}</div>
            <div class="text-[10px] text-gray-400 font-mono">${flow} vph &bull; ${Math.round(effCongestion * 85)}% occ</div>
          </div>
          <div class="text-right">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold ${speed < 30 ? 'bg-rose-950 text-rose-400 border border-rose-500/30' : (speed < 45 ? 'bg-amber-950 text-amber-400 border border-amber-500/30' : 'bg-emerald-950 text-emerald-400 border border-emerald-500/30')}">${los.split(' ')[0]}</span>
            <div class="text-[10px] text-gray-300 font-mono mt-0.5">${speed} km/h</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Update corridor line colors on map
  drawCongestionCorridors(congestionFactor);
}

function drawCongestionCorridors(factor) {
  if (!cityMap) return;
  macroCorridorLayers.forEach(l => cityMap.removeLayer(l));
  macroCorridorLayers = [];

  if (!macroLayerStates.corridors) return;

  const corridors = [
    { name: 'MG Road - Trinity Arterial', coords: [[12.9716, 77.5946], [12.9784, 77.6408]], dense: false },
    { name: 'Indiranagar 100ft Flyover', coords: [[12.9784, 77.6408], [12.9352, 77.6245]], dense: factor > 0.6 },
    { name: 'Koramangala Financial Transit', coords: [[12.9352, 77.6245], [12.9279, 77.6271]], dense: factor > 0.45 },
    { name: 'Outer Ring Road Expressway', coords: [[12.9279, 77.6271], [12.8452, 77.6602]], dense: factor > 0.55 },
    { name: 'West River Gateway Viaduct', coords: [[12.9611, 77.5500], [12.9716, 77.5946]], dense: false }
  ];

  corridors.forEach(c => {
    const color = c.dense ? '#ef4444' : (factor > 0.6 ? '#f59e0b' : '#10b981');
    const poly = L.polyline(c.coords, {
      color: color,
      weight: 6,
      opacity: 0.8
    }).addTo(cityMap);

    poly.bindPopup(`
      <div class="custom-leaflet-popup p-1 text-xs">
        <div class="font-bold text-white mb-0.5">${c.name}</div>
        <div class="text-[11px] ${c.dense ? 'text-rose-400 font-bold' : 'text-emerald-400'}">Flow State: ${c.dense ? 'LOS E Bottleneck' : 'LOS B Optimal'}</div>
      </div>
    `);
    macroCorridorLayers.push(poly);
  });
}

window.highlightODCorridor = function (originName, destName) {
  if (!cityMap) return;

  if (activeHighlightedCorridor) {
    cityMap.removeLayer(activeHighlightedCorridor);
    activeHighlightedCorridor = null;
  }

  // Find origin and dest coordinates
  const originNode = baseDensities.find(d => d.camera_name.includes(originName.split(' ')[0]));
  const destNode = baseDensities.find(d => d.camera_name.includes(destName.split(' ')[0]));

  if (originNode && destNode) {
    const pts = [[originNode.latitude, originNode.longitude], [destNode.latitude, destNode.longitude]];
    activeHighlightedCorridor = L.polyline(pts, {
      color: '#00f0ff',
      weight: 8,
      opacity: 0.95,
      dashArray: '12, 12'
    }).addTo(cityMap);

    cityMap.fitBounds(activeHighlightedCorridor.getBounds(), { padding: [60, 60] });

    // Toast
    let toast = document.getElementById('od-corridor-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'od-corridor-toast';
      toast.className = 'fixed top-20 right-8 z-50 p-3 bg-slate-950/95 border border-cyan-400 rounded-xl text-xs shadow-2xl text-cyan-300 font-mono flex items-center space-x-2 animate-fade-in';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<i class="fa-solid fa-arrows-split-up-and-left text-cyan-400"></i><span>Active Corridor: ${originName} &bull; ${destName}</span>`;
    setTimeout(() => { toast.remove(); }, 3500);
  }
};

// MACRO TRAFFIC FLOW & OD MATRIX
async function loadMacroTraffic() {
  try {
    const [densRes, odRes] = await Promise.all([
      fetch('/api/v1/traffic/density'),
      fetch('/api/v1/traffic/od-matrix')
    ]);

    if (densRes.ok) {
      baseDensities = await densRes.json();
      updateSimulatedMacroDynamics(activeSimHour);
      populateCameraPins(baseDensities);
    }

    if (odRes.ok) {
      baseODData = await odRes.json();
      const tbody = document.getElementById('od-table-body');
      if (tbody && baseODData.top_origin_destination_pairs) {
        tbody.innerHTML = baseODData.top_origin_destination_pairs.map(p => `
          <tr onclick="window.highlightODCorridor('${p.origin_name}', '${p.destination_name}')" class="hover:bg-cyan-950/40 cursor-pointer transition border-b border-slate-800/60" title="Click to highlight corridor on 2D map">
            <td class="p-3 font-bold text-white flex items-center space-x-1.5">
              <i class="fa-solid fa-location-dot text-cyan-400 text-[10px]"></i>
              <span>${p.origin_name}</span>
            </td>
            <td class="p-3 text-cyan-300 font-medium">${p.destination_name}</td>
            <td class="p-3 font-mono font-bold text-white">${p.trips_per_hour}</td>
            <td class="p-3 font-mono text-gray-300">${p.avg_transit_minutes} min</td>
            <td class="p-3 text-gray-400">${p.dominant_vehicle_type}</td>
            <td class="p-3 font-mono font-bold ${p.congestion_index > 70 ? 'text-rose-400' : 'text-emerald-400'}">${p.congestion_index}%</td>
          </tr>
        `).join('');
      }
    }
  } catch (e) {
    console.warn("Failed loading macro traffic:", e);
  }
}

window.toggleHeatmapLayer = function () {
  heatmapLayerActive = !heatmapLayerActive;
  const btn = document.getElementById('btn-toggle-heat');
  if (btn) {
    if (heatmapLayerActive) {
      btn.className = 'px-2.5 py-1 bg-cyan-600 text-white rounded font-semibold text-[11px] border border-cyan-400 transition';
      btn.innerHTML = '<i class="fa-solid fa-fire mr-1"></i>Heatmap: ON';
    } else {
      btn.className = 'px-2.5 py-1 bg-slate-900 text-slate-400 rounded font-semibold text-[11px] border border-slate-800 transition opacity-60';
      btn.innerHTML = '<i class="fa-solid fa-fire mr-1"></i>Heatmap: OFF';
    }
  }
};

// HOTLIST ALERTS & SECURITY
async function loadAlerts() {
  try {
    const [regRes, routesRes] = await Promise.all([
      fetch('/api/v1/anomalies/registry'),
      fetch('/api/v1/anomalies/routes')
    ]);

    if (regRes.ok) {
      const registry = await regRes.json();
      const tbody = document.getElementById('blacklist-table-body');
      if (tbody) {
        tbody.innerHTML = registry.map(item => `
          <tr class="hover:bg-slate-900/60 transition">
            <td class="p-3 font-mono font-bold text-cyan-300">${item.plate_text}</td>
            <td class="p-3 text-white font-medium">${item.vehicle_desc}</td>
            <td class="p-3 text-gray-300">${item.reason}</td>
            <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${item.severity === 'CRITICAL' ? 'bg-rose-950 text-rose-400 border border-rose-500/40' : 'bg-amber-950 text-amber-400 border border-amber-500/40'}">${item.severity}</span></td>
            <td class="p-3 font-mono text-gray-400">${item.warrant_id}</td>
            <td class="p-3 text-gray-300">${item.registered_owner}</td>
          </tr>
        `).join('');
      }
    }

    if (routesRes.ok) {
      const routes = await routesRes.json();
      const listEl = document.getElementById('route-anomalies-list');
      if (listEl) {
        listEl.innerHTML = routes.map(r => `
          <div class="p-3.5 bg-slate-950 rounded-xl border border-rose-500/30 space-y-1.5">
            <div class="flex justify-between items-center">
              <span class="font-mono font-bold text-rose-400">${r.anomaly_type}</span>
              <span class="px-2 py-0.5 bg-rose-950 text-rose-300 font-bold rounded text-[10px]">${Math.round(r.confidence * 100)}% Conf</span>
            </div>
            <div class="text-white font-bold">${r.plate_text}</div>
            <p class="text-[11px] text-gray-300 leading-relaxed">${r.description}</p>
          </div>
        `).join('');
      }
    }
  } catch (e) {
    console.warn("Failed loading alerts:", e);
  }
}

// WHAT-IF SIMULATION & 3D DIGITAL TWIN INTEGRATION
window.runSimulation = async function () {
  const closureSelect = document.getElementById('sim-closure-select');
  const volumeSlider = document.getElementById('sim-volume-slider');
  const closure = closureSelect ? closureSelect.value : 'ROAD-A-B';
  const vol = volumeSlider ? (parseFloat(volumeSlider.value) || 20.0) : 20.0;

  const payload = {
    closed_roads: closure !== 'none' ? [closure] : [],
    traffic_volume_change_pct: vol,
    signal_timing_adjustments: { "Junction_Trinity": 35.0 }
  };

  try {
    const res = await fetch('/api/v1/simulation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) return;
    const sim = await res.json();
    window.lastSimulationResult = sim;

    const congAfter = sim.overall_congestion_after !== undefined ? sim.overall_congestion_after : (sim.metrics && sim.metrics[0] ? parseFloat(sim.metrics[0].after) : 76.5);
    const speedAfter = sim.avg_speed_after_kmh !== undefined ? sim.avg_speed_after_kmh : (sim.metrics && sim.metrics[1] ? parseFloat(sim.metrics[1].after) : 20.8);
    const delayAfter = sim.avg_delay_after_min !== undefined ? sim.avg_delay_after_min : (sim.metrics && sim.metrics[2] ? parseFloat(sim.metrics[2].after) : 10.3);

    const congEl = document.getElementById('sim-res-congestion');
    if (congEl) congEl.innerText = `${congAfter}%`;

    const congDeltaEl = document.getElementById('sim-res-congestion-delta');
    if (congDeltaEl && sim.metrics && sim.metrics[0]) {
      congDeltaEl.innerText = `${sim.metrics[0].change_pct > 0 ? '+' : ''}${sim.metrics[0].change_pct}% change`;
    }

    const speedEl = document.getElementById('sim-res-speed');
    if (speedEl) speedEl.innerText = `${speedAfter} km/h`;

    const speedDeltaEl = document.getElementById('sim-res-speed-delta');
    if (speedDeltaEl && sim.metrics && sim.metrics[1]) {
      speedDeltaEl.innerText = `${sim.metrics[1].change_pct > 0 ? '+' : ''}${sim.metrics[1].change_pct}% speed`;
    }

    const delayEl = document.getElementById('sim-res-delay');
    if (delayEl) delayEl.innerText = `${delayAfter} min`;

    const delayDeltaEl = document.getElementById('sim-res-delay-delta');
    if (delayDeltaEl && sim.metrics && sim.metrics[2]) {
      delayDeltaEl.innerText = `${sim.metrics[2].change_pct > 0 ? '+' : ''}${sim.metrics[2].change_pct}% delay`;
    }

    // 1. Pass updated scenario data to 3D simulation visualizer
    if (window.updateWhatIf3DSimulation) {
      window.updateWhatIf3DSimulation(sim, closure, vol);
    }

    // 2. Render road-by-road impact matrix cards
    renderWhatIfRoadRack(sim.road_impacts || []);

  } catch (e) {
    console.error("Simulation error:", e);
  }
};

function renderWhatIfRoadRack(impacts) {
  const rack = document.getElementById('whatif-road-breakdown-rack');
  if (!rack) return;
  if (!impacts || impacts.length === 0) {
    rack.innerHTML = '<div class="text-xs text-gray-500 col-span-full py-2">Executing simulation calculations...</div>';
    return;
  }

  rack.innerHTML = impacts.map(r => {
    let badgeClass = 'bg-emerald-950/70 text-emerald-400 border-emerald-500/30';
    let statusText = 'NORMAL';
    let icon = 'fa-check';

    if (r.is_closed || r.status === 'CLOSED') {
      badgeClass = 'bg-rose-950/90 text-rose-300 border-rose-500/50 animate-pulse';
      statusText = 'CLOSED';
      icon = 'fa-ban';
    } else if (r.is_detour || r.status === 'DETOUR_CONGESTED') {
      badgeClass = 'bg-amber-950/90 text-amber-300 border-amber-500/50';
      statusText = 'DETOUR SPIKE';
      icon = 'fa-triangle-exclamation';
    } else if (r.simulated_congestion_pct > 65) {
      badgeClass = 'bg-rose-950/90 text-rose-300 border-rose-500/50';
      statusText = 'HEAVY';
      icon = 'fa-fire-flame-curved';
    } else if (r.simulated_congestion_pct < 35) {
      badgeClass = 'bg-cyan-950/80 text-cyan-300 border-cyan-500/40';
      statusText = 'FREE FLOW';
      icon = 'fa-bolt';
    }

    return `
      <div class="p-3 bg-slate-950/90 rounded-xl border border-slate-800 space-y-1.5 transition hover:border-cyan-500/40 hover:bg-slate-900/60 shadow-lg">
        <div class="flex items-center justify-between text-[10px] font-mono">
          <span class="text-gray-400 truncate max-w-[85px]">${r.road_id}</span>
          <span class="px-1.5 py-0.5 rounded border text-[9px] font-bold ${badgeClass}">
            <i class="fa-solid ${icon} mr-0.5"></i>${statusText}
          </span>
        </div>
        <div class="text-xs font-bold text-white truncate" title="${r.road_name}">${r.road_name}</div>
        <div class="grid grid-cols-2 gap-1 text-[11px] font-mono pt-1 border-t border-slate-800/80">
          <div>
            <span class="text-gray-500 text-[10px]">CONG: </span>
            <span class="${r.simulated_congestion_pct > 65 ? 'text-rose-400 font-bold' : (r.simulated_congestion_pct > 40 ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold')}">${r.simulated_congestion_pct}%</span>
          </div>
          <div>
            <span class="text-gray-500 text-[10px]">SPD: </span>
            <span class="text-cyan-300 font-bold">${r.simulated_speed_kmh} km/h</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Reactive debounced slider & select listeners
let whatIfDebounceTimer = null;
document.addEventListener('DOMContentLoaded', () => {
  const closureSelect = document.getElementById('sim-closure-select');
  const volumeSlider = document.getElementById('sim-volume-slider');

  if (closureSelect) {
    closureSelect.addEventListener('change', () => {
      window.runSimulation();
    });
  }

  if (volumeSlider) {
    volumeSlider.addEventListener('input', () => {
      clearTimeout(whatIfDebounceTimer);
      whatIfDebounceTimer = setTimeout(() => {
        window.runSimulation();
      }, 150);
    });
  }
});

// =========================================================================
// DYNAMIC EMERGENCY GREEN CORRIDOR ROUTING CONTROLLER
// =========================================================================

async function loadCorridorData() {
  try {
    let url = activeCorridorId ? `/api/v1/corridors/${activeCorridorId}` : `/api/v1/corridors`;
    let res = await fetch(url);
    if (!res.ok && activeCorridorId) {
      res = await fetch('/api/v1/corridors');
    }
    if (!res.ok) return;

    let data = await res.json();
    if (Array.isArray(data)) {
      if (data.length === 0) return;
      data = data.find(c => c.active) || data[0];
    }
    currentCorridorData = data;
    activeCorridorId = data.corridor_id;

    renderCorridorTelematics(data);
    renderSignalControllersRack(data);
    renderCorridorOnMap(data);

    const coords3D = data.route_3d_coordinates || data.waypoints_3d;
    if (window.show3DGreenCorridor && coords3D && coords3D.length > 0) {
      const vCoords3D = data.current_step_index !== undefined && coords3D[data.current_step_index] 
        ? coords3D[data.current_step_index] 
        : coords3D[0];
      window.show3DGreenCorridor(coords3D, vCoords3D);
    }

    loadCorridorTelemetry();
  } catch (err) {
    console.error("Failed to load corridor data:", err);
  }
}

async function loadCorridorTelemetry() {
  try {
    const res = await fetch('/api/v1/corridors/telemetry');
    if (!res.ok) return;
    const t = await res.json();
    const runsEl = document.getElementById('corr-macro-runs');
    const totalRuns = t.total_active_corridors_today ?? t.active_corridors_count ?? t.total_emergency_runs_today ?? 0;
    if (runsEl) runsEl.innerText = `${totalRuns} Incidents`;
    const minsEl = document.getElementById('corr-macro-mins');
    const avgMins = t.average_time_saved_per_run_min ?? t.avg_minutes_saved ?? t.average_time_saved_minutes ?? 0;
    if (minsEl) minsEl.innerText = `${avgMins} min`;
  } catch (e) {
    console.warn("Failed corridor telemetry fetch:", e);
  }
}

function renderCorridorTelematics(c) {
  const v = c.vehicle || {};
  const callsignEl = document.getElementById('corr-vehicle-callsign');
  if (callsignEl) callsignEl.innerText = v.callsign || 'EMERGENCY UNIT';

  const plateEl = document.getElementById('corr-vehicle-plate');
  if (plateEl) plateEl.innerText = v.plate_number || v.license_plate || 'KA-01-EMG';

  const priorityEl = document.getElementById('corr-priority-badge');
  if (priorityEl) priorityEl.innerText = (v.priority_level || 'CODE_RED').replace('_', ' ');

  const incidentEl = document.getElementById('corr-incident-name');
  if (incidentEl) incidentEl.innerText = v.incident_type || 'Emergency Response';

  const speedEl = document.getElementById('corr-speed-val');
  if (speedEl) speedEl.innerText = `${v.current_speed_kmh || 60} km/h`;

  const gainEl = document.getElementById('corr-speed-gain');
  if (gainEl) gainEl.innerText = `+${c.speed_improvement_pct || 42}%`;

  const originEl = document.getElementById('corr-origin-name');
  if (originEl) originEl.innerText = c.origin_name || 'Emergency Origin';

  const destEl = document.getElementById('corr-destination-name');
  if (destEl) destEl.innerText = c.destination_name || 'Hospital Trauma Center';

  const statusBadge = document.getElementById('corr-status-badge');
  if (statusBadge) {
    if (c.active && (c.preemption_enabled || c.preemption_active)) {
      statusBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span><span class="text-emerald-400 font-mono">GREEN WAVE ACTIVE</span>`;
    } else if (c.active) {
      statusBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span><span class="text-amber-400 font-mono">STANDBY / DISPATCHED</span>`;
    } else {
      statusBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-gray-500"></span><span class="text-gray-400 font-mono">CYCLES RESTORED</span>`;
    }
  }

  const preemptCountEl = document.getElementById('corr-preempt-count');
  if (preemptCountEl && c.junctions) {
    const greenCount = c.junctions.filter(j => j.signal_state === 'PREEMPTED_GREEN').length;
    preemptCountEl.innerText = `${greenCount} of ${c.junctions.length} Signals Locked`;
  }

  const savedTimeEl = document.getElementById('corr-saved-time');
  if (savedTimeEl) savedTimeEl.innerText = `${c.time_saved_min ?? c.time_saved_minutes ?? 0} min`;

  const etaTimeEl = document.getElementById('corr-eta-time');
  if (etaTimeEl) etaTimeEl.innerText = `${c.eta_with_corridor_min ?? c.eta_corridor_minutes ?? 0} min`;

  const hudTitle = document.getElementById('map-hud-corridor-title');
  if (hudTitle) hudTitle.innerText = `Corridor: ${c.origin_name} → ${c.destination_name}`;

  const nextJunc = (c.junctions || []).find(j => (j.estimated_arrival_seconds ?? j.eta_seconds ?? 0) > 0) || (c.junctions || [])[(c.junctions || []).length - 1];
  const nextEtaEl = document.getElementById('corr-next-eta');
  if (nextEtaEl && nextJunc) {
    const nextEtaSec = nextJunc.estimated_arrival_seconds ?? nextJunc.eta_seconds ?? 0;
    nextEtaEl.innerText = `${nextEtaSec}s to ${nextJunc.junction_name}`;
  }

  const signalCountEl = document.getElementById('corr-signal-count');
  if (signalCountEl && c.junctions) signalCountEl.innerText = `${c.junctions.length} Intersections`;
}

function renderSignalControllersRack(c) {
  const container = document.getElementById('corridor-signals-list');
  if (!container) return;

  if (!c.junctions || c.junctions.length === 0) {
    container.innerHTML = `<div class="p-4 text-center text-gray-500 text-xs font-mono">No downstream signal controllers mapped.</div>`;
    return;
  }

  container.innerHTML = c.junctions.map((j, idx) => {
    const isGreen = j.signal_state === 'PREEMPTED_GREEN';
    const isFlush = j.signal_state === 'QUEUE_FLUSH';
    const isHold = j.signal_state === 'ALL_RED_HOLD';
    const isRecov = j.signal_state === 'TRANSITION_RECOVERY';
    const distM = Math.round(j.distance_to_junction_meters ?? j.distance_meters ?? 0);
    const etaSec = j.estimated_arrival_seconds ?? j.eta_seconds ?? 0;
    const greenWin = j.green_window_duration_seconds ?? j.green_lock_countdown_sec ?? j.time_to_green_lock ?? 45;
    const queuePct = Math.round(j.queue_clearance_pct ?? j.queue_clearance_percent ?? j.queue_cleared_pct ?? 0);

    let stateBadge = '';
    if (isGreen) {
      stateBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-950 text-emerald-300 border border-emerald-500/50 flex items-center space-x-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span><span>PREEMPTED GREEN</span></span>`;
    } else if (isFlush) {
      stateBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-amber-950 text-amber-300 border border-amber-500/50 flex items-center space-x-1"><span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span><span>QUEUE FLUSH</span></span>`;
    } else if (isHold) {
      stateBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-rose-950 text-rose-300 border border-rose-500/50 flex items-center space-x-1"><span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span><span>ALL-RED HOLD</span></span>`;
    } else if (isRecov) {
      stateBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-cyan-950 text-cyan-300 border border-cyan-500/50">TRANSITION RECOVERY</span>`;
    } else {
      stateBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-slate-800 text-gray-300 border border-slate-700">NORMAL CYCLE</span>`;
    }

    const heldStreets = (j.cross_streets_held || []).slice(0, 2).join(', ');

    return `
      <div class="p-3 bg-slate-950/90 rounded-xl border ${isGreen ? 'border-emerald-500/50 shadow-lg shadow-emerald-950/40' : 'border-slate-800'} space-y-2 transition hover:border-slate-700">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <div class="w-6 h-6 rounded-lg ${isGreen ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-gray-400'} flex items-center justify-center text-[10px] font-bold font-mono border border-slate-700">
              #${idx + 1}
            </div>
            <div>
              <div class="text-white font-bold text-xs flex items-center space-x-1.5">
                <span>${j.junction_name}</span>
                ${j.manual_override ? '<span class="px-1.5 py-0.2 bg-purple-950 text-purple-300 text-[9px] rounded border border-purple-500/40">OVERRIDE</span>' : ''}
              </div>
              <div class="text-[10px] text-gray-400 font-mono">${j.junction_id} &bull; ${distM}m downstream</div>
            </div>
          </div>
          <div>${stateBadge}</div>
        </div>

        <!-- Arrival & Queue Telemetry -->
        <div class="grid grid-cols-2 gap-2 text-[11px] font-mono bg-slate-900/60 p-2 rounded-lg border border-slate-800/80">
          <div>
            <span class="text-gray-400">ETA Countdown:</span>
            <span class="font-bold ${etaSec <= 30 ? 'text-amber-400' : 'text-cyan-300'} ml-1">${etaSec}s</span>
          </div>
          <div>
            <span class="text-gray-400">Green Window:</span>
            <span class="font-bold text-emerald-400 ml-1">${greenWin}s</span>
          </div>
          <div class="col-span-2 flex items-center justify-between text-[10px]">
            <span class="text-gray-400">Holding Cross-Streets:</span>
            <span class="text-rose-400 font-medium truncate max-w-[170px]" title="${heldStreets}">${heldStreets || 'None'}</span>
          </div>
        </div>

        <!-- Queue Clearance Progress Bar -->
        <div class="space-y-1">
          <div class="flex justify-between text-[10px] font-mono">
            <span class="text-gray-400">Upstream Queue Flushing</span>
            <span class="text-emerald-400 font-bold">${queuePct}%</span>
          </div>
          <div class="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div class="bg-gradient-to-r from-emerald-500 to-cyan-400 h-1.5 rounded-full transition-all duration-500" style="width: ${queuePct}%"></div>
          </div>
        </div>

        <!-- Action Override Buttons -->
        <div class="flex items-center space-x-1.5 pt-1">
          <button onclick="overrideSignal('${j.junction_id}', 'FORCE_GREEN')" class="flex-1 py-1 bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/40 rounded text-[10px] font-bold transition flex items-center justify-center space-x-1">
            <i class="fa-solid fa-traffic-light text-[9px]"></i>
            <span>Force Green</span>
          </button>
          <button onclick="overrideSignal('${j.junction_id}', 'ADD_BUFFER_30S')" class="flex-1 py-1 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 rounded text-[10px] font-bold transition flex items-center justify-center space-x-1">
            <i class="fa-solid fa-plus text-[9px]"></i>
            <span>+30s Buffer</span>
          </button>
          <button onclick="overrideSignal('${j.junction_id}', 'RELEASE_HOLD')" class="py-1 px-2 bg-slate-900 hover:bg-slate-800 text-gray-400 hover:text-white border border-slate-700 rounded text-[10px] transition" title="Release to Normal Cycle">
            <i class="fa-solid fa-rotate-left"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderCorridorOnMap(c) {
  const routeCoordinates = c.route_coordinates || c.gis_polyline || [];
  if (!corridorMap || routeCoordinates.length === 0) return;

  corridorMarkers.forEach(m => corridorMap.removeLayer(m));
  corridorMarkers = [];

  if (corridorPolyline) {
    corridorMap.removeLayer(corridorPolyline);
    corridorPolyline = null;
  }
  if (corridorVehicleMarker) {
    corridorMap.removeLayer(corridorVehicleMarker);
    corridorVehicleMarker = null;
  }

  // Draw Glowing Emerald Polyline
  corridorPolyline = L.polyline(routeCoordinates, {
    color: '#10b981',
    weight: 6,
    opacity: 0.9,
    lineCap: 'round',
    lineJoin: 'round'
  }).addTo(corridorMap);

  // Add Junction Pins along route
  (c.junctions || []).forEach((j, i) => {
    const isGreen = j.signal_state === 'PREEMPTED_GREEN';
    const pinColor = isGreen ? '#10b981' : (j.signal_state === 'QUEUE_FLUSH' ? '#f59e0b' : '#64748b');

    const pinHtml = `
      <div style="background-color: ${pinColor}; width: 26px; height: 26px; border-radius: 50%; border: 2px solid #ffffff; box-shadow: 0 0 12px ${pinColor}; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #fff; font-weight: bold;">
        ${i + 1}
      </div>
    `;

    const icon = L.divIcon({
      className: 'custom-corridor-pin',
      html: pinHtml,
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });

    const distM = Math.round(j.distance_to_junction_meters ?? j.distance_meters ?? 0);
    const etaSec = j.estimated_arrival_seconds ?? j.eta_seconds ?? 0;
    const marker = L.marker([j.lat, j.lng], { icon: icon }).addTo(corridorMap);
    marker.bindPopup(`
      <div class="p-2 space-y-1 text-xs">
        <div class="font-bold text-white">${j.junction_name}</div>
        <div class="font-mono text-cyan-300 text-[11px]">${j.junction_id}</div>
        <div class="text-[11px] font-mono text-emerald-400">State: ${j.signal_state}</div>
        <div class="text-[10px] text-gray-300">ETA: ${etaSec}s | Dist: ${distM}m</div>
      </div>
    `, { className: 'custom-leaflet-popup' });
    corridorMarkers.push(marker);
  });

  // Emergency Vehicle Marker
  const v = c.vehicle || {};
  const vLat = v.current_lat || (v.current_coords ? v.current_coords[0] : routeCoordinates[0][0]);
  const vLng = v.current_lng || (v.current_coords ? v.current_coords[1] : routeCoordinates[0][1]);

  const vehicleHtml = `
    <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
      <div style="position: absolute; inset: -4px; border-radius: 50%; background: rgba(16, 185, 129, 0.4); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
      <div style="width: 32px; height: 32px; border-radius: 50%; background: #020617; border: 2px solid #10b981; box-shadow: 0 0 15px rgba(16, 185, 129, 0.8); display: flex; align-items: center; justify-content: center; color: #10b981; font-size: 14px; position: relative; z-index: 10;">
        <i class="fa-solid fa-truck-medical"></i>
      </div>
    </div>
  `;

  const vIcon = L.divIcon({
    className: 'custom-amb-pin',
    html: vehicleHtml,
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });

  corridorVehicleMarker = L.marker([vLat, vLng], { icon: vIcon, zIndexOffset: 1000 }).addTo(corridorMap);
  corridorVehicleMarker.bindPopup(`
    <div class="p-2 space-y-1 text-xs">
      <div class="font-bold text-white">${v.callsign || 'Emergency Vehicle'}</div>
      <div class="font-mono text-cyan-300 text-[11px]">${v.plate_number || v.license_plate || ''}</div>
      <div class="text-[11px] text-emerald-400 font-bold">Speed: ${v.current_speed_kmh || 60} km/h</div>
      <div class="text-[10px] text-rose-400 font-bold">${v.priority_level || 'CODE_RED'} - ${v.incident_type || ''}</div>
    </div>
  `, { className: 'custom-leaflet-popup' });

  // Destination Hospital Pin
  const destCoords = routeCoordinates[routeCoordinates.length - 1];
  const destHtml = `
    <div style="width: 30px; height: 30px; border-radius: 8px; background: #e11d48; border: 2px solid #ffffff; box-shadow: 0 0 15px rgba(225, 29, 72, 0.8); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 14px;">
      <i class="fa-solid fa-hospital"></i>
    </div>
  `;
  const destIcon = L.divIcon({
    className: 'custom-dest-pin',
    html: destHtml,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
  const destMarker = L.marker(destCoords, { icon: destIcon }).addTo(corridorMap);
  destMarker.bindPopup(`
    <div class="p-2 space-y-1 text-xs">
      <div class="font-bold text-white">${c.destination_name}</div>
      <div class="text-[11px] text-gray-300">Emergency Trauma Destination</div>
    </div>
  `, { className: 'custom-leaflet-popup' });
  corridorMarkers.push(destMarker);

  corridorMap.fitBounds(corridorPolyline.getBounds(), { padding: [40, 40] });
}

// Preset Scenarios
window.dispatchCorridorScenario = async function (presetKey) {
  const presets = {
    'trauma_cardiac': {
      vehicle_id: 'VEH-EMG-01',
      callsign: 'AMB-911 (Cardiac Unit)',
      plate_number: 'KA-01-EA-9911',
      vehicle_type: 'AMBULANCE',
      priority_level: 'CODE_RED',
      incident_type: 'Severe STEMI Cardiac Arrest & Respiratory Distress',
      origin_name: 'Indiranagar 100ft Sector Inflow',
      destination_name: 'Victoria Emergency Trauma Hospital',
      speed_kmh: 68.0
    },
    'fire_4alarm': {
      vehicle_id: 'VEH-EMG-02',
      callsign: 'FIRE-04 (Heavy Aerial Platform Engine)',
      plate_number: 'KA-04-FE-101',
      vehicle_type: 'FIRE_ENGINE',
      priority_level: 'CODE_RED',
      incident_type: '4-Alarm Commercial Structure Fire',
      origin_name: 'West River Fire HQ',
      destination_name: 'Koramangala Financial Tech Park',
      speed_kmh: 62.0
    },
    'organ_transport': {
      vehicle_id: 'VEH-EMG-03',
      callsign: 'LIFE-01 (Rapid Organ Transport)',
      plate_number: 'KA-05-OR-5500',
      vehicle_type: 'ORGAN_TRANSPORT',
      priority_level: 'CODE_RED',
      incident_type: 'Zero-Delay Pediatric Donor Heart Transit',
      origin_name: 'Silk Board Transit Hub',
      destination_name: 'Trinity Super-Specialty Heart Institute',
      speed_kmh: 74.0
    }
  };

  const payload = presets[presetKey];
  if (!payload) return;

  ['cardiac', 'fire', 'organ'].forEach(k => {
    const b = document.getElementById(`btn-scene-${k}`);
    if (b) {
      b.classList.remove('bg-emerald-600/30', 'border-emerald-500/40', 'bg-amber-950/50', 'bg-purple-950/50');
      b.classList.add('bg-slate-900', 'border-slate-700');
    }
  });

  const activeBtn = document.getElementById(`btn-scene-${presetKey.includes('cardiac') ? 'cardiac' : (presetKey.includes('fire') ? 'fire' : 'organ')}`);
  if (activeBtn) {
    activeBtn.classList.remove('bg-slate-900', 'border-slate-700');
    activeBtn.classList.add('bg-emerald-600/30', 'border-emerald-500/40');
  }

  try {
    const res = await fetch('/api/v1/corridors/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const data = await res.json();
      activeCorridorId = data.corridor_id;
      loadCorridorData();
      showCorridorToast(`🚨 Corridor Dispatched: ${data.vehicle.callsign} en route with dynamic preemption`);
    }
  } catch (err) {
    console.error("Dispatch scenario failed:", err);
  }
};

window.activateCurrentCorridor = async function () {
  if (!activeCorridorId) return;
  try {
    const res = await fetch(`/api/v1/corridors/${activeCorridorId}/activate`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      currentCorridorData = data;
      renderCorridorTelematics(data);
      renderSignalControllersRack(data);
      renderCorridorOnMap(data);
      showCorridorToast("⚡ Dynamic Green Wave Preemption ACTIVATED across all downstream controllers!");
    }
  } catch (e) {
    console.error("Failed activate corridor:", e);
  }
};

window.simulateCorridorProgress = async function () {
  if (!activeCorridorId) return;
  try {
    const res = await fetch(`/api/v1/corridors/${activeCorridorId}/simulate-step`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      currentCorridorData = data;
      renderCorridorTelematics(data);
      renderSignalControllersRack(data);
      renderCorridorOnMap(data);

      const coords3D = data.route_3d_coordinates || data.waypoints_3d;
      if (window.show3DGreenCorridor && coords3D && coords3D.length > 0) {
        const vCoords3D = data.current_step_index !== undefined && coords3D[data.current_step_index] 
          ? coords3D[data.current_step_index] 
          : coords3D[0];
        window.show3DGreenCorridor(coords3D, vCoords3D);
      }
      showCorridorToast(`🚗 Advanced vehicle along corridor. Signals synchronized.`);
    }
  } catch (e) {
    console.error("Failed simulate step:", e);
  }
};

window.deactivateCurrentCorridor = async function () {
  if (!activeCorridorId) return;
  try {
    const res = await fetch(`/api/v1/corridors/${activeCorridorId}/deactivate`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      currentCorridorData = data;
      renderCorridorTelematics(data);
      renderSignalControllersRack(data);
      renderCorridorOnMap(data);
      if (window.clear3DGreenCorridor) window.clear3DGreenCorridor();
      showCorridorToast("🛑 Corridor Deactivated. Downstream signals entering smooth transition recovery.");
    }
  } catch (e) {
    console.error("Failed deactivate corridor:", e);
  }
};

window.overrideSignal = async function (junctionId, action) {
  if (!activeCorridorId) return;
  try {
    const res = await fetch(`/api/v1/corridors/${activeCorridorId}/signal-override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ junction_id: junctionId, override_action: action, override_duration_seconds: 30 })
    });
    if (res.ok) {
      const data = await res.json();
      currentCorridorData = data;
      renderSignalControllersRack(data);
      renderCorridorOnMap(data);
      showCorridorToast(`Signal ${junctionId} override applied: ${action}`);
    }
  } catch (e) {
    console.error("Override signal error:", e);
  }
};

window.viewCorridorIn3DTwin = function () {
  window.switchTab('3dtwin');
  if (currentCorridorData && window.show3DGreenCorridor) {
    setTimeout(() => {
      const coords3D = currentCorridorData.route_3d_coordinates || currentCorridorData.waypoints_3d;
      if (coords3D && coords3D.length > 0) {
        const vCoords3D = currentCorridorData.current_step_index !== undefined && coords3D[currentCorridorData.current_step_index] 
          ? coords3D[currentCorridorData.current_step_index] 
          : coords3D[0];
        window.show3DGreenCorridor(coords3D, vCoords3D);
      }
    }, 150);
  }
};

window.openCustomDispatchModal = function () {
  const m = document.getElementById('custom-dispatch-modal');
  if (m) m.classList.remove('hidden');
};

window.closeCustomDispatchModal = function () {
  const m = document.getElementById('custom-dispatch-modal');
  if (m) m.classList.add('hidden');
};

window.submitCustomDispatch = async function () {
  const callsign = document.getElementById('disp-callsign').value;
  const plate = document.getElementById('disp-plate').value;
  const vtype = document.getElementById('disp-type').value;
  const incident = document.getElementById('disp-incident').value;
  const origin = document.getElementById('disp-origin').value;
  const dest = document.getElementById('disp-destination').value;
  const speed = parseFloat(document.getElementById('disp-speed').value) || 65.0;

  const payload = {
    vehicle_id: `VEH-CUSTOM-${Math.floor(Math.random() * 900 + 100)}`,
    callsign: callsign || 'EMG-UNIT-ALPHA',
    plate_number: plate || 'KA-01-XX-0001',
    license_plate: plate || 'KA-01-XX-0001',
    vehicle_type: vtype,
    priority_level: 'CODE_RED',
    incident_type: incident || 'Emergency Intervention',
    origin_name: origin,
    destination_name: dest,
    speed_kmh: speed
  };

  try {
    const res = await fetch('/api/v1/corridors/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const data = await res.json();
      activeCorridorId = data.corridor_id;
      window.closeCustomDispatchModal();
      loadCorridorData();
      showCorridorToast(`Custom Corridor Dispatched: ${data.vehicle.callsign}`);
    }
  } catch (err) {
    console.error("Submit custom dispatch error:", err);
  }
};

function showCorridorToast(msg) {
  let toast = document.getElementById('corridor-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'corridor-toast';
    toast.className = 'fixed bottom-8 right-8 z-[9999] px-4 py-3 bg-emerald-950/95 border border-emerald-500 rounded-xl text-emerald-300 font-bold text-xs shadow-2xl flex items-center space-x-2 animate-bounce';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<i class="fa-solid fa-truck-medical text-emerald-400"></i><span>${msg}</span>`;
  setTimeout(() => { if (toast) toast.remove(); }, 4000);
}

