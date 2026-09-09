/**
 * UrbanTwin AI - Master Frontend Controller
 * Centralized Multi-Camera ANPR, Single-Plate Trajectory Tracking, Macro Traffic & Alert System
 */

let cityMap = null;
let trajectoryMap = null;
let trajPolyline = null;
let trajMarkers = [];
let animVehicleMarker = null;
let currentTab = '3dtwin';
let activeTrackedPlate = '7XYZ912';
let speedChart = null;
let heatmapLayerActive = true;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initLeafletMaps();
  loadInitialDashboardData();
  
  // Hash route detection (e.g. #tracking, #ocr, #alerts)
  const hash = window.location.hash.replace('#', '');
  if (hash && ['3dtwin', 'tracking', 'macro', 'ocr', 'alerts', 'simulation'].includes(hash)) {
    switchTab(hash);
  } else {
    switchTab('3dtwin');
  }

  // Periodic refresh
  setInterval(() => {
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
  } else if (tabId === 'macro') {
    setTimeout(() => {
      if (cityMap) cityMap.invalidateSize();
      loadMacroTraffic();
    }, 100);
  } else if (tabId === 'ocr') {
    runOCRTest();
  } else if (tabId === 'alerts') {
    loadAlerts();
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

// WHAT-IF SIMULATION
window.runSimulation = async function () {
  const closure = document.getElementById('sim-closure-select').value;
  const vol = parseFloat(document.getElementById('sim-volume-slider').value) || 20.0;

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

    document.getElementById('sim-res-congestion').innerText = `${sim.overall_congestion_after}%`;
    document.getElementById('sim-res-congestion-delta').innerText = `${sim.metrics[0].change_pct > 0 ? '+' : ''}${sim.metrics[0].change_pct}% change`;

    document.getElementById('sim-res-speed').innerText = `${sim.avg_speed_after_kmh} km/h`;
    document.getElementById('sim-res-speed-delta').innerText = `${sim.metrics[1].change_pct > 0 ? '+' : ''}${sim.metrics[1].change_pct}% speed`;

    document.getElementById('sim-res-delay').innerText = `${sim.avg_delay_after_min} min`;
    document.getElementById('sim-res-delay-delta').innerText = `${sim.metrics[2].change_pct > 0 ? '+' : ''}${sim.metrics[2].change_pct}% delay`;
  } catch (e) {
    console.error("Simulation error:", e);
  }
};
