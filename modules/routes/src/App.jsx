import PlaceSearch from './PlaceSearch.jsx';
import PremiumTools from './PremiumTools.jsx';
import {loadVideoWatermark,drawVideoWatermark} from './videoWatermark.js';
import {drawVideoCredits} from './mapCredits.js';
import {rasterExportCredit} from './mapTiles.js';
import HomeLogo from './HomeLogo.jsx';
import HelpControls from './HelpControls.jsx';
import { rasterTileUrl, rasterSource, rasterName, rasterAttribution, rasterCache, rasterLabel, offlineAllowed } from './mapTiles.js';
import AutosaveStatus from './AutosaveStatus.jsx';
import { registerAutosave, writeChanged, readSession, validBoardRecovery, SESSION_KEY, BOARD_DRAFT_KEY } from './autosave.js';
import ActionIcon from './ActionIcon.jsx';
import { validBoardDocument } from './boardModel.js';
import { trajectoryBoardDocument, boardTrajectoryProject } from './trajectoryBoard.js';
// SPDX-FileCopyrightText: 2026 Aitor Delgado Martínez · AD Mobility
// SPDX-License-Identifier: LicenseRef-RutasAD-Educational-NonCommercial-1.0
import DidacticBoard from './DidacticBoard.jsx';
import { AccountControls, LegacyImport } from './WebAccess.jsx';
import { recordingContextOptions, drawExplanationPointer } from './mapRecording.js';
import BackupScreen from './BackupScreen.jsx';
import RouteLibrary from './RouteLibrary.jsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addProtocol, Map as MapLibreMap, NavigationControl, AttributionControl, LngLatBounds, setWorkerUrl } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { Marker as MapLibreMarker } from 'maplibre-gl';
setWorkerUrl(maplibreWorkerUrl);
addProtocol('basurto-map',async(params,controller)=>{const r=await fetch(params.url.replace('basurto-map://','https://'),{signal:controller.signal});if(!r.ok)throw Error('Mapa no disponible');return {data:await r.arrayBuffer()}});
const COLORS = ['#e36b4d', '#477bda', '#35a17e', '#a271c5', '#d2a33c', '#e64980', '#0ea5a4', '#7c8c26', '#6b7280', '#f97316'];
const SPEEDS = [0.1, 0.2, 0.3, 0.4, 0.5, 1, 2];
const SIGNAL_CATALOG = [{
  code: 'S-220a',
  name: 'Preseñalización con destinos',
  kind: 'direction'
}, {
  code: 'S-350',
  name: 'Señalización de salida inmediata',
  kind: 'direction'
}, {
  code: 'R-2',
  name: 'Detención obligatoria · STOP',
  kind: 'stop'
}, {
  code: 'R-1',
  name: 'Ceda el paso',
  kind: 'yield'
}, {
  code: 'P-1',
  name: 'Intersección con prioridad de la derecha',
  kind: 'warning'
}, {
  code: 'P-21a',
  name: 'Proximidad de niños o escuela',
  kind: 'warning'
}, {
  code: 'P-22a',
  name: 'Paso para ciclistas',
  kind: 'warning'
}, {
  code: 'S-13',
  name: 'Situación de paso para peatones',
  kind: 'pedestrian'
}, {
  code: 'R-301',
  name: 'Velocidad máxima',
  kind: 'speed'
}, {
  code: 'SEMÁFORO',
  name: 'Semáforo',
  kind: 'traffic-light'
}];
const ARROWS = [{
  value: 'right',
  label: 'Derecha',
  icon: '→'
}, {
  value: 'straight',
  label: 'Recto',
  icon: '↑'
}, {
  value: 'left',
  label: 'Izquierda',
  icon: '←'
}, {
  value: 'up-right',
  label: 'Diagonal derecha',
  icon: '↗'
}, {
  value: 'down-right',
  label: 'Salida derecha',
  icon: '↘'
}];
const START = [-2.9352, 43.2631];
const nextRouteColor = routes => COLORS.find(color => !routes.some(route => route.color.toLowerCase() === color)) || COLORS[0];
const narrationVoiceFor = (voices, language) => {
  const prefix = language === 'eu' ? 'eu' : 'es';
  const matching = voices.filter(voice => voice.lang?.toLowerCase().split(/[-_]/)[0] === prefix);
  if (language === 'eu') return matching.find(voice => voice.lang?.toLowerCase() === 'eu-es') || matching[0] || null;
  return matching.find(voice => voice.lang?.toLowerCase() === 'es-es') || matching[0] || null;
};
const makeInitialRoutes = () => ['A', 'B', 'C', 'D'].map((letter, index) => ({
  id: crypto.randomUUID(),
  name: `Trayectoria ${letter}`,
  color: COLORS[index],
  points: [],
  narration: '',
  narrationLanguage: 'es'
}));
const ensureFourRoutes = routes => {
  const expanded = [...routes];
  while (expanded.length < 4) {
    const index = expanded.length;
    expanded.push({
      id: crypto.randomUUID(),
      name: `Trayectoria ${String.fromCharCode(65 + index)}`,
      color: nextRouteColor(expanded),
      points: [],
      narration: '',
      narrationLanguage: 'es'
    });
  }
  return expanded;
};
const loadLegacyRoutes = () => {
  try {
    const saved = JSON.parse(localStorage.getItem('basurto-routes-routes') || 'null');
    if (Array.isArray(saved) && saved.length && saved.every(route => route.id && route.name && route.color && Array.isArray(route.points))) return ensureFourRoutes(saved);
  } catch {/* Start with an empty project if local data is malformed. */}
  return makeInitialRoutes();
};
const loadProjectState = () => {
  try {
    const saved = JSON.parse(localStorage.getItem('basurto-routes-projects') || 'null');
    if (Array.isArray(saved?.projects) && saved.projects.length && saved.projects.every(project => project.id && project.name)) return saved;
  } catch {/* Create a fresh project if the index is malformed. */}
  const id = crypto.randomUUID();
  return {
    activeProjectId: id,
    projects: [{
      id,
      name: 'Recorrido nuevo',
      legacy: true
    }]
  };
};
const loadProjectRoutes = project => {
  if (!project || project.legacy) return loadLegacyRoutes();
  try {
    const saved = JSON.parse(localStorage.getItem(`basurto-routes-project-${project.id}`) || 'null');
    if (Array.isArray(saved) && saved.length && saved.every(route => route.id && route.name && route.color && Array.isArray(route.points))) return ensureFourRoutes(saved);
  } catch {/* Start this project with blank routes if its local data is malformed. */}
  return makeInitialRoutes();
};
const safeFileName = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'recorrido';
const signalDefinition = code => SIGNAL_CATALOG.find(signal => signal.code === code) || SIGNAL_CATALOG[0];
const defaultMarkerDraft = routeId => ({
  id: '',
  routeId,
  signalCode: 'S-220a',
  coordinates: null,
  title: '',
  description: '',
  distance: '500 m',
  destinations: [{
    text: 'Bilbao',
    arrow: 'right'
  }, {
    text: 'Barakaldo',
    arrow: 'right'
  }, {
    text: 'Santander',
    arrow: 'right'
  }],
  showInVideo: true
});
const loadProjectMarkers = project => {
  try {
    const saved = JSON.parse(localStorage.getItem(`basurto-routes-project-${project?.id}-markers`) || '[]');
    return Array.isArray(saved) ? saved.filter(marker => marker?.id && marker?.routeId && Array.isArray(marker.coordinates) && marker.coordinates.length === 2) : [];
  } catch {
    return [];
  }
};
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[char]);
const markerFaceHtml = marker => {
  const config = signalDefinition(marker.signalCode);
  if (config.kind === 'direction') {
    const destinations = (marker.destinations || []).filter(item => item.text?.trim());
    return `<div class="signal-face signal-face-direction">${marker.signalCode === 'S-220a' && marker.distance ? `<div class="signal-distance">${escapeHtml(marker.distance)}</div>` : ''}<div class="signal-board">${destinations.map(item => `<div class="signal-destination"><span>${escapeHtml(item.text)}</span><b>${ARROWS.find(arrow => arrow.value === item.arrow)?.icon || '→'}</b></div>`).join('') || '<div class="signal-destination"><span>Escribe un destino</span><b>→</b></div>'}</div></div>`;
  }
  if (config.kind === 'stop') return '<div class="signal-face signal-stop"><span>STOP</span></div>';
  if (config.kind === 'yield') return '<div class="signal-face signal-yield"><span>▼</span></div>';
  if (config.kind === 'traffic-light') return '<div class="signal-face signal-traffic-light"><i></i><i></i><i></i></div>';
  if (config.kind === 'speed') return `<div class="signal-face signal-speed"><span>${escapeHtml(marker.speed || '—')}</span></div>`;
  if (config.kind === 'pedestrian') return '<div class="signal-face signal-pedestrian"><svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="26" cy="8" r="3.5" fill="#fff"/><path d="m24 13-6 11 8 4 4 9m-12-13-7 8m13-8 7-6 6 4m-12 6-8 11m8-11 9 10" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>';
  const symbol = marker.signalCode === 'P-21a' ? '<svg viewBox="0 0 48 40" aria-hidden="true"><circle cx="17" cy="8" r="3.5" fill="#111"/><circle cx="31" cy="9" r="3" fill="#111"/><path d="M17 13v11m0-7-6 7m6-7 6 6m-6 1-5 9m5-9 6 9M31 14v10m0-6-5 6m5-5 5 5m-5 0-4 8m4-8 5 8" fill="none" stroke="#111" stroke-width="2.6" stroke-linecap="round"/></svg>' : marker.signalCode === 'P-22a' ? '<svg viewBox="0 0 48 40" aria-hidden="true"><circle cx="12" cy="29" r="6" fill="none" stroke="#111" stroke-width="2.5"/><circle cx="36" cy="29" r="6" fill="none" stroke="#111" stroke-width="2.5"/><circle cx="27" cy="8" r="3.2" fill="#111"/><path d="m26 13-6 8 8 2 6 6m-14-8-7 8m13-6-5-8h9l6 8" fill="none" stroke="#111" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '<svg viewBox="0 0 48 40" aria-hidden="true"><path d="M24 4v30M8 19h32M13 10l22 20m0-20L13 30" stroke="#111" stroke-width="4" stroke-linecap="round"/></svg>';
  return `<div class="signal-face signal-warning"><span>${symbol}</span></div>`;
};
function SignalFace({
  marker,
  compact = false
}) {
  return <div className={`signal-face-wrap ${compact ? 'compact' : ''}`} dangerouslySetInnerHTML={{
    __html: markerFaceHtml(marker)
  }} />;
}
function distanceToMarker(coords, markers, routeId) {
  return markers.filter(marker => marker.routeId === routeId && marker.showInVideo !== false && marker.coordinates).map(marker => ({
    marker,
    distance: distance(coords, marker.coordinates)
  })).filter(item => item.distance < 85).sort((a, b) => a.distance - b.distance)[0]?.marker || null;
}
function drawTeachingCard(context, marker, width) {
  const scale = .82 * Math.max(0.8, Math.min(1.45, width / 1500));
  const cardW = 365 * scale,
    cardH = 186 * scale,
    pad = 17 * scale;
  const x = width - cardW - 22 * scale,
    y = 22 * scale;
  const radius = 13 * scale;
  context.save();
  context.shadowColor = 'rgba(16, 31, 23, .22)';
  context.shadowBlur = 18 * scale;
  context.shadowOffsetY = 5 * scale;
  context.fillStyle = 'rgba(255,255,255,.97)';
  context.beginPath();
  context.roundRect(x, y, cardW, cardH, radius);
  context.fill();
  context.shadowColor = 'transparent';
  context.fillStyle = '#819087';
  context.font = `700 ${9 * scale}px sans-serif`;
  context.fillText(`${marker.signalCode} · ${signalDefinition(marker.signalCode).name.toUpperCase()}`.slice(0, 49), x + pad, y + 21 * scale);
  const boardX = x + pad,
    boardY = y + 32 * scale,
    boardW = cardW - pad * 2,
    boardH = 83 * scale;
  context.fillStyle = '#fff';
  context.strokeStyle = '#1b201c';
  context.lineWidth = 2.2 * scale;
  context.beginPath();
  context.roundRect(boardX, boardY, boardW, boardH, 8 * scale);
  context.fill();
  context.stroke();
  const config = signalDefinition(marker.signalCode);
  if (config.kind === 'direction') {
    const destinations = (marker.destinations || []).filter(item => item.text?.trim()).slice(0, 3);
    context.fillStyle = '#111';
    context.textBaseline = 'middle';
    const fontSize = Math.min(13 * scale, (boardW - 60 * scale) / Math.max(10, ...destinations.map(item => item.text.length)) * 1.55);
    context.font = `700 ${fontSize}px sans-serif`;
    destinations.forEach((destination, index) => {
      const lineY = boardY + (destinations.length === 1 ? boardH / 2 : (index + 0.5) * boardH / destinations.length);
      context.fillText(destination.text, boardX + 12 * scale, lineY, boardW - 57 * scale);
      context.font = `700 ${20 * scale}px sans-serif`;
      context.textAlign = 'center';
      context.fillText(ARROWS.find(arrow => arrow.value === destination.arrow)?.icon || '→', boardX + boardW - 22 * scale, lineY + 1 * scale);
      context.textAlign = 'left';
      context.font = `700 ${fontSize}px sans-serif`;
    });
    if (marker.signalCode === 'S-220a' && marker.distance) {
      context.font = `700 ${10 * scale}px sans-serif`;
      const distanceW = context.measureText(marker.distance).width + 16 * scale;
      context.fillStyle = '#fff';
      context.strokeStyle = '#1b201c';
      context.lineWidth = 1.5 * scale;
      context.beginPath();
      context.roundRect(boardX + boardW - distanceW - 5 * scale, boardY - 8 * scale, distanceW, 18 * scale, 9 * scale);
      context.fill();
      context.stroke();
      context.fillStyle = '#111';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(marker.distance, boardX + boardW - distanceW / 2 - 5 * scale, boardY + 1 * scale);
      context.textAlign = 'left';
    }
  } else {
    const iconX = boardX + 11 * scale,
      iconY = boardY + 7 * scale,
      iconSize = 48 * scale;
    if (config.kind === 'stop') {
      context.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const angle = Math.PI / 8 + i * Math.PI / 4,
          px = iconX + iconSize / 2 + Math.cos(angle) * iconSize / 2,
          py = iconY + iconSize / 2 + Math.sin(angle) * iconSize / 2;
        if (i === 0) context.moveTo(px, py);else context.lineTo(px, py);
      }
      context.closePath();
      context.fillStyle = '#d71920';
      context.fill();
      context.strokeStyle = '#fff';
      context.lineWidth = 2 * scale;
      context.stroke();
      context.fillStyle = '#fff';
      context.font = `700 ${9 * scale}px sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('STOP', iconX + iconSize / 2, iconY + iconSize / 2);
      context.textAlign = 'left';
    } else if (config.kind === 'yield' || config.kind === 'warning') {
      context.beginPath();
      if (config.kind === 'yield') {
        context.moveTo(iconX + 4 * scale, iconY + 2 * scale);
        context.lineTo(iconX + iconSize - 4 * scale, iconY + 2 * scale);
        context.lineTo(iconX + iconSize / 2, iconY + iconSize - 2 * scale);
      } else {
        context.moveTo(iconX + iconSize / 2, iconY + 2 * scale);
        context.lineTo(iconX + iconSize - 2 * scale, iconY + iconSize - 2 * scale);
        context.lineTo(iconX + 2 * scale, iconY + iconSize - 2 * scale);
      }
      context.closePath();
      context.fillStyle = '#fff';
      context.fill();
      context.strokeStyle = '#d71920';
      context.lineWidth = 5 * scale;
      context.stroke();
      context.fillStyle = '#111';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      if (config.kind === 'yield') {
        context.font = `700 ${18 * scale}px sans-serif`;
        context.fillText('▼', iconX + iconSize / 2, iconY + iconSize / 2 + 2 * scale);
      } else if (marker.signalCode === 'P-21a') {
        [iconX + 17 * scale, iconX + 31 * scale].forEach((figureX, index) => {
          const figureY = iconY + (index ? 12 : 11) * scale;
          context.beginPath();
          context.arc(figureX, figureY, 3 * scale, 0, Math.PI * 2);
          context.fill();
          context.strokeStyle = '#111';
          context.lineWidth = 2 * scale;
          context.beginPath();
          context.moveTo(figureX, figureY + 3 * scale);
          context.lineTo(figureX, figureY + 15 * scale);
          context.moveTo(figureX, figureY + 7 * scale);
          context.lineTo(figureX - 6 * scale, figureY + 13 * scale);
          context.moveTo(figureX, figureY + 7 * scale);
          context.lineTo(figureX + 6 * scale, figureY + 12 * scale);
          context.moveTo(figureX, figureY + 15 * scale);
          context.lineTo(figureX - 5 * scale, figureY + 23 * scale);
          context.moveTo(figureX, figureY + 15 * scale);
          context.lineTo(figureX + 5 * scale, figureY + 23 * scale);
          context.stroke();
        });
      } else if (marker.signalCode === 'P-22a') {
        context.strokeStyle = '#111';
        context.lineWidth = 2.5 * scale;
        context.beginPath();
        context.arc(iconX + 12 * scale, iconY + 34 * scale, 7 * scale, 0, Math.PI * 2);
        context.arc(iconX + 36 * scale, iconY + 34 * scale, 7 * scale, 0, Math.PI * 2);
        context.moveTo(iconX + 12 * scale, iconY + 34 * scale);
        context.lineTo(iconX + 22 * scale, iconY + 21 * scale);
        context.lineTo(iconX + 31 * scale, iconY + 34 * scale);
        context.lineTo(iconX + 12 * scale, iconY + 34 * scale);
        context.lineTo(iconX + 27 * scale, iconY + 34 * scale);
        context.lineTo(iconX + 36 * scale, iconY + 34 * scale);
        context.moveTo(iconX + 22 * scale, iconY + 21 * scale);
        context.lineTo(iconX + 33 * scale, iconY + 21 * scale);
        context.lineTo(iconX + 36 * scale, iconY + 34 * scale);
        context.moveTo(iconX + 26 * scale, iconY + 12 * scale);
        context.lineTo(iconX + 22 * scale, iconY + 20 * scale);
        context.stroke();
        context.fillStyle = '#111';
        context.beginPath();
        context.arc(iconX + 28 * scale, iconY + 9 * scale, 3 * scale, 0, Math.PI * 2);
        context.fill();
      } else {
        context.strokeStyle = '#111';
        context.lineWidth = 4 * scale;
        context.beginPath();
        context.moveTo(iconX + iconSize / 2, iconY + 9 * scale);
        context.lineTo(iconX + iconSize / 2, iconY + 39 * scale);
        context.moveTo(iconX + 8 * scale, iconY + iconSize / 2);
        context.lineTo(iconX + 40 * scale, iconY + iconSize / 2);
        context.stroke();
      }
      context.textAlign = 'left';
    } else if (config.kind === 'traffic-light') {
      context.fillStyle = '#262b28';
      context.beginPath();
      context.roundRect(iconX + 8 * scale, iconY, 32 * scale, 63 * scale, 7 * scale);
      context.fill();
      ['#d71920', '#edb600', '#338b52'].forEach((color, index) => {
        context.fillStyle = color;
        context.beginPath();
        context.arc(iconX + 24 * scale, iconY + (12 + index * 20) * scale, 6 * scale, 0, Math.PI * 2);
        context.fill();
      });
    } else {
      context.fillStyle = '#176eb2';
      context.beginPath();
      context.roundRect(iconX, iconY, iconSize, iconSize, 3 * scale);
      context.fill();
      context.fillStyle = '#fff';
      context.font = `700 ${19 * scale}px sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(config.kind === 'speed' ? marker.speed || '—' : 'P', iconX + iconSize / 2, iconY + iconSize / 2);
      context.textAlign = 'left';
    }
    context.fillStyle = '#151815';
    context.font = `700 ${13 * scale}px sans-serif`;
    context.textBaseline = 'middle';
    context.fillText(marker.title || config.name, iconX + iconSize + 14 * scale, boardY + boardH / 2, boardW - iconSize - 40 * scale);
  }
  if (marker.description) {
    context.fillStyle = '#33443a';
    context.font = `500 ${11 * scale}px sans-serif`;
    context.textBaseline = 'top';
    const words = marker.description.split(/\s+/);
    let line = '',
      lineNo = 0;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (context.measureText(test).width > boardW && line) {
        context.fillText(line, boardX, boardY + boardH + 12 * scale + lineNo * 14 * scale);
        line = word;
        lineNo += 1;
        if (lineNo === 2) break;
      } else line = test;
    }
    if (lineNo < 2 && line) context.fillText(line, boardX, boardY + boardH + 12 * scale + lineNo * 14 * scale);
  }
  context.restore();
}
function pointFeatureCollection(routes, activeId, current) {
  const features = [];
  routes.forEach(route => route.points.forEach((coords, index) => features.push({
    type: 'Feature',
    properties: {
      routeId: route.id,
      index,
      color: route.color,
      active: route.id === activeId
    },
    geometry: {
      type: 'Point',
      coordinates: coords
    }
  })));
  if (current) features.push({
    type: 'Feature',
    properties: {
      vehicle: true,
      color: routes.find(r => r.id === activeId)?.color || COLORS[0]
    },
    geometry: {
      type: 'Point',
      coordinates: current
    }
  });
  return {
    type: 'FeatureCollection',
    features
  };
}
function lineFeatureCollection(routes, activeId) {
  return {
    type: 'FeatureCollection',
    features: routes.filter(r => r.points.length > 1).map(route => ({
      type: 'Feature',
      properties: {
        routeId: route.id,
        color: route.color,
        active: route.id === activeId
      },
      geometry: {
        type: 'LineString',
        coordinates: route.points
      }
    }))
  };
}
function distance(a, b) {
  const rad = x => x * Math.PI / 180;
  const dLat = rad(b[1] - a[1]),
    dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function interpolateRoute(points, fraction) {
  const lengths = points.slice(1).map((p, i) => distance(points[i], p));
  const total = lengths.reduce((sum, n) => sum + n, 0);
  if (!total) return {
    coords: points[0],
    bearing: 0
  };
  let target = total * fraction;
  for (let i = 0; i < lengths.length; i += 1) {
    if (lengths[i] <= 0.01) continue;
    if (target <= lengths[i] || i === lengths.length - 1) {
      const t = Math.min(1, target / lengths[i]);
      const a = points[i],
        b = points[i + 1];
      let bearing = Math.atan2(Math.sin((b[0] - a[0]) * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180), Math.cos(a[1] * Math.PI / 180) * Math.sin(b[1] * Math.PI / 180) - Math.sin(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) * Math.cos((b[0] - a[0]) * Math.PI / 180)) * 180 / Math.PI;
      if (bearing < 0) bearing += 360;
      return {
        coords: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
        bearing
      };
    }
    target -= lengths[i];
  }
  return {
    coords: points.at(-1),
    bearing: 0
  };
}
export default function App() {
  const [recovered] = useState(readSession);
  const saveStateRef = useRef(null),
    videoDoneRef = useRef(null);
  const [boardOpen, setBoardOpen] = useState(false);
  const [boardSeed, setBoardSeed] = useState(null);
  const [language, setLanguage] = useState(() => localStorage.getItem('basurto-routes-language') === 'es' ? 'es' : 'eu');
  const t = (eu, es) => language === 'eu' ? eu : es;
  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem('basurto-routes-language', language);
    } catch {}
  }, [language]);
  const mapNode = useRef(null),
    mapRef = useRef(null),
    mapViewRef = useRef(null),
    routesRef = useRef([]),
    activeRef = useRef('');
  const explanationPointer = useRef(null);
  useEffect(() => {
    const move = event => {
      explanationPointer.current = {
        x: event.clientX,
        y: event.clientY
      };
    };
    const clear = () => {
      explanationPointer.current = null;
    };
    document.addEventListener('pointermove', move, {
      passive: true
    });
    document.addEventListener('pointerleave', clear);
    window.addEventListener('blur', clear);
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerleave', clear);
      window.removeEventListener('blur', clear);
    };
  }, []);
  const progressRef = useRef(0),
    rafRef = useRef(0),
    lastFrameRef = useRef(0);
  const recorderRef = useRef(null),
    chunksRef = useRef([]),
    folderRef = useRef(null),
    recordFrameRef = useRef(0),
    audioResourcesRef = useRef(null),
    mediaStreamRef = useRef(null),
    audioInputRef = useRef(null),
    narrationUtteranceRef = useRef(null);
  const [projectState, setProjectState] = useState(loadProjectState);
  const currentProject = projectState.projects.find(project => project.id === projectState.activeProjectId) || projectState.projects[0];
  const [routes, setRoutes] = useState(() => loadProjectRoutes(currentProject));
  const [backupOpen, setBackupOpen] = useState(false);
  useEffect(() => {
    sessionStorage.removeItem('basurto-routes-after-student-delete');
  }, []);
  const [libraryOpen, setLibraryOpen] = useState(false),
    [libraryEntries, setLibraryEntries] = useState([]),
    [libraryError, setLibraryError] = useState(''),
    [libraryBusy, setLibraryBusy] = useState(false);
  const librarySaveTimer = useRef(null);
  const [activeId, setActiveId] = useState(() => routes.some(r => r.id === recovered?.activeId) ? recovered.activeId : routes[0].id);
  const [conflictMarkers, setConflictMarkers] = useState(() => loadProjectMarkers(currentProject));
  const [markerDialog, setMarkerDialog] = useState(() => recovered?.projectId === currentProject.id ? recovered.markerDialog || null : null);
  const [placingMarker, setPlacingMarker] = useState(false);
  const [selectedMarkerId, setSelectedMarkerId] = useState(null);
  const [currentMarkerId, setCurrentMarkerId] = useState(null);
  const [mode, setMode] = useState('select');
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [height, setHeight] = useState(120);
  const [follow, setFollow] = useState(true);
  const [cameraView, setCameraView] = useState('top');
  const [mapProvider, setMapProvider] = useState(() => ['geoEuskadi', 'pnoa', 'osm'].includes(localStorage.getItem('basurto-routes-map-provider')) ? localStorage.getItem('basurto-routes-map-provider') : 'geoEuskadi');
  const [mapSettingsOpen, setMapSettingsOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const [mapRetry, setMapRetry] = useState(0);
  const [progress, setProgress] = useState(0);
  const [recording, setRecording] = useState(false);
  const [audioFile, setAudioFile] = useState(null);
  const [recordMicrophone, setRecordMicrophone] = useState(false);
  const [speechVoices, setSpeechVoices] = useState([]);
  const [narrationMessage, setNarrationMessage] = useState('');
  const [offlineDownloading, setOfflineDownloading] = useState(false);
  const [offlineMessage, setOfflineMessage] = useState('');
  const [folderName, setFolderName] = useState('');
  const [exportMessage, setExportMessage] = useState('');
  const [nameDialog, setNameDialog] = useState(() => recovered?.nameDialog || null);
  const modeRef = useRef(mode);
  const dragRef = useRef(null);
  const relocatePointRef = useRef(null),
    suppressPointClick = useRef(0);
  const [relocatingPoint, setRelocatingPoint] = useState(false);
  const markerPlacementRef = useRef(null);
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return undefined;
    const updateVoices = () => setSpeechVoices(synth.getVoices());
    updateVoices();
    synth.addEventListener?.('voiceschanged', updateVoices);
    return () => {
      synth.removeEventListener?.('voiceschanged', updateVoices);
      synth.cancel();
    };
  }, []);
  const selectMapProvider = provider => {
    if (recording || !['geoEuskadi', 'pnoa', 'osm'].includes(provider)) return;
    localStorage.setItem('basurto-routes-map-provider', provider);
    setMapError('');
    if (provider === mapProvider) setMapRetry(n => n + 1);
    setMapProvider(provider);
  };
  const activeRoute = routes.find(route => route.id === activeId) || routes[0];
  const activeConflictMarkers = conflictMarkers.filter(marker => marker.routeId === activeId);
  const currentConflictMarker = activeConflictMarkers.find(marker => marker.id === currentMarkerId) || null;
  const visibleConflictMarker = (playing || recording) && activeRoute?.points.length > 1 ? distanceToMarker(interpolateRoute(activeRoute.points, progress).coords, conflictMarkers, activeId) : activeConflictMarkers.find(marker => marker.id === selectedMarkerId) || currentConflictMarker;
  const recordingMarkers = useRef({
    markers: conflictMarkers,
    playing,
    selectedMarkerId
  });
  recordingMarkers.current = {
    markers: conflictMarkers,
    playing,
    selectedMarkerId
  };
  const narrationLanguage = activeRoute?.narrationLanguage || 'es';
  const narrationVoice = narrationVoiceFor(speechVoices, narrationLanguage);
  const totalDistance = useMemo(() => activeRoute?.points.slice(1).reduce((sum, p, i) => sum + distance(activeRoute.points[i], p), 0) || 0, [activeRoute]);
  const releaseAudio = async () => {
    const resources = audioResourcesRef.current;
    audioResourcesRef.current = null;
    const stream = mediaStreamRef.current;
    mediaStreamRef.current = null;
    stream?.getTracks().forEach(track => track.stop());
    if (!resources) return;
    resources.audio?.pause();
    if (resources.audio) resources.audio.removeAttribute('src');
    if (resources.url) URL.revokeObjectURL(resources.url);
    resources.microphone?.getTracks().forEach(track => track.stop());
    if (resources.context?.state !== 'closed') await resources.context?.close().catch(() => {});
  };
  const speakNarration = text => {
    const narration = text?.trim();
    if (!narration) return;
    if (!window.speechSynthesis || !('SpeechSynthesisUtterance' in window)) {
      setNarrationMessage('Este navegador no permite generar voz.');
      return;
    }
    const voice = narrationVoiceFor(speechVoices, narrationLanguage);
    if (!voice) {
      setNarrationMessage(narrationLanguage === 'eu' ? 'No hay una voz de euskera disponible en Safari/macOS. Instala una voz compatible con euskera para escuchar esta narración; no usaremos una voz en inglés.' : 'No hay una voz de español disponible en Safari/macOS. Comprueba las voces instaladas y vuelve a cargar la página.');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(narration);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = 1;
    utterance.onstart = () => setNarrationMessage(`Reproduciendo en ${narrationLanguage === 'eu' ? 'euskera' : 'español'} · ${voice.name}.`);
    utterance.onend = () => {
      if (narrationUtteranceRef.current === utterance) {
        narrationUtteranceRef.current = null;
        setNarrationMessage('Narración terminada.');
      }
    };
    utterance.onerror = () => {
      if (narrationUtteranceRef.current === utterance) {
        narrationUtteranceRef.current = null;
        setNarrationMessage('No se pudo reproducir la voz seleccionada.');
      }
    };
    narrationUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };
  const stopNarration = () => {
    window.speechSynthesis?.cancel();
    narrationUtteranceRef.current = null;
    setNarrationMessage('Narración detenida.');
  };
  const downloadOfflineArea = async () => {
    if (!offlineAllowed(mapProvider)) {
      setOfflineMessage('La descarga de zonas está disponible con geoEuskadi y PNOA.');
      return;
    }
    const map = mapRef.current;
    if (!map || offlineDownloading) return;
    if (!('caches' in window)) {
      setOfflineMessage('Este navegador no permite guardar mapas para usarlos sin conexión.');
      return;
    }
    const zoom = map.getZoom();
    const minZoom = Math.max(8, Math.floor(zoom) - 1);
    const maxZoom = Math.min(18, Math.ceil(zoom) + 2);
    const bounds = map.getBounds();
    const tileX = (longitude, level) => Math.floor((longitude + 180) / 360 * 2 ** level);
    const tileY = (latitude, level) => Math.floor((1 - Math.asinh(Math.tan(latitude * Math.PI / 180)) / Math.PI) / 2 * 2 ** level);
    const tiles = [];
    for (let level = minZoom; level <= maxZoom; level += 1) {
      const northWest = bounds.getNorthWest(),
        southEast = bounds.getSouthEast();
      const minX = tileX(northWest.lng, level),
        maxX = tileX(southEast.lng, level);
      const minY = tileY(northWest.lat, level),
        maxY = tileY(southEast.lat, level);
      for (let x = minX; x <= maxX; x += 1) for (let y = minY; y <= maxY; y += 1) {
        tiles.push(rasterTileUrl(mapProvider, level, x, y));
      }
    }
    if (tiles.length > 1800) {
      setOfflineMessage(`La zona incluye ${tiles.length} imágenes. Acércate a un área menor y vuelve a intentarlo (máximo 1.800).`);
      return;
    }
    setOfflineDownloading(true);
    setOfflineMessage(`Preparando ${tiles.length} imágenes aéreas…`);
    try {
      const cache = await caches.open(rasterCache(mapProvider));
      const missing = [];
      for (const url of tiles) if (!(await cache.match(url))) missing.push(url);
      let cursor = 0,
        complete = 0,
        failed = 0;
      await Promise.all(Array.from({
        length: 8
      }, async () => {
        while (cursor < missing.length) {
          const url = missing[cursor++];
          try {
            const response = await fetch(url, {
              mode: 'cors'
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            await cache.put(url, response.clone());
          } catch {
            failed += 1;
          }
          complete += 1;
          if (complete % 10 === 0 || complete === missing.length) setOfflineMessage(`Guardando imágenes aéreas: ${complete}/${missing.length}…`);
        }
      }));
      setOfflineMessage(failed ? `Guardadas ${tiles.length - failed} imágenes; ${failed} no se pudieron descargar.` : `Zona guardada sin conexión: ${tiles.length} imágenes aéreas.`);
    } catch {
      setOfflineMessage('No se pudo guardar la zona. Comprueba el espacio disponible en el navegador.');
    } finally {
      setOfflineDownloading(false);
    }
  };
  const updateSources = useCallback((nextRoutes = routesRef.current, selected = activeRef.current, vehicle = null) => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    map.getSource('route-lines')?.setData(lineFeatureCollection(nextRoutes, selected));
    map.getSource('route-points')?.setData(pointFeatureCollection(nextRoutes, selected, vehicle));
  }, []);
  const commitRoutes = useCallback(nextRoutes => {
    routesRef.current = nextRoutes;
    setRoutes(nextRoutes);
    updateSources(nextRoutes, activeRef.current);
  }, [updateSources]);
  useEffect(() => {
    routesRef.current = routes;
    activeRef.current = activeId;
    modeRef.current = mode;
    try {
      localStorage.setItem(`basurto-routes-project-${currentProject.id}`, JSON.stringify(routes));
    } catch {/* Browser storage may be unavailable. */}
    updateSources(routes, activeId);
  }, [routes, activeId, mode, updateSources, currentProject.id]);
  useEffect(() => {
    try {
      localStorage.setItem(`basurto-routes-project-${currentProject.id}-markers`, JSON.stringify(conflictMarkers));
    } catch {/* Browser storage may be unavailable. */}
  }, [conflictMarkers, currentProject.id]);
  useEffect(() => {
    try {
      localStorage.setItem('basurto-routes-projects', JSON.stringify({
        activeProjectId: projectState.activeProjectId,
        projects: projectState.projects.map(({
          id,
          name
        }) => ({
          id,
          name
        }))
      }));
    } catch {/* Browser storage may be unavailable. */}
  }, [projectState]);
  useEffect(() => {
    if (!mapNode.current) return;
    setMapReady(false);
    setMapError('');
    const initialView = mapViewRef.current || {
      center: START,
      zoom: 10.1,
      pitch: 0,
      bearing: 0
    };
    const MapConstructor = MapLibreMap;
    const baseSource = rasterSource(mapProvider);
    const map = new MapConstructor({
      container: mapNode.current,
      ...{
        style: {
          version: 8,
          sources: {
            'basemap-source': baseSource
          },
          layers: [{
            id: 'basemap-layer',
            type: 'raster',
            source: 'basemap-source'
          }]
        }
      },
      center: initialView.center,
      zoom: initialView.zoom,
      pitch: initialView.pitch,
      bearing: initialView.bearing,
      attributionControl: false,
      cooperativeGestures: true,
      ...recordingContextOptions(false)
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({
      showCompass: true
    }), 'top-right');
    map.addControl(new AttributionControl({
      compact: false
    }), 'bottom-right');
    map.on('load', () => {
      map.setMaxZoom(20);
      map.addSource('route-lines', {
        type: 'geojson',
        data: lineFeatureCollection(routesRef.current, activeRef.current)
      });
      map.addLayer({
        id: 'routes-outline',
        type: 'line',
        source: 'route-lines',
        paint: {
          'line-color': '#101b22',
          'line-width': ['case', ['get', 'active'], 7, 5],
          'line-opacity': 0.68,
          'line-blur': 1.5
        }
      });
      map.addLayer({
        id: 'routes-line',
        type: 'line',
        source: 'route-lines',
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['case', ['get', 'active'], 4, 2.5],
          'line-opacity': ['case', ['get', 'active'], 1, 0.68]
        }
      });
      map.addSource('route-points', {
        type: 'geojson',
        data: pointFeatureCollection(routesRef.current, activeRef.current)
      });
      map.addLayer({
        id: 'route-points-layer',
        type: 'circle',
        source: 'route-points',
        filter: ['!', ['has', 'vehicle']],
        paint: {
          'circle-radius': ['case', ['get', 'active'], 7, 5],
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2
        }
      });
      map.addLayer({
        id: 'vehicle-halo',
        type: 'circle',
        source: 'route-points',
        filter: ['has', 'vehicle'],
        paint: {
          'circle-radius': 12,
          'circle-color': '#fff',
          'circle-opacity': 0.35
        }
      });
      map.addLayer({
        id: 'vehicle-point',
        type: 'circle',
        source: 'route-points',
        filter: ['has', 'vehicle'],
        paint: {
          'circle-radius': 7,
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2
        }
      });
      setMapReady(true);
    });
    map.on('sourcedata', event => {
      if (event.sourceId === 'basemap-source' && event.sourceDataType === 'content') setMapError('');
    });
    map.on('error', event => {
      if (!event.error?.message || event.sourceId !== 'basemap-source') return;
      setMapError(event.error.message);
    });
    map.on('click', event => {
      if (Date.now() < suppressPointClick.current) return;
      if (relocatePointRef.current) {
        const {
          routeId,
          index
        } = relocatePointRef.current;
        commitRoutes(routesRef.current.map(r => r.id === routeId ? {
          ...r,
          points: r.points.map((p, i) => i === index ? [event.lngLat.lng, event.lngLat.lat] : p)
        } : r));
        relocatePointRef.current = null;
        setRelocatingPoint(false);
        return;
      }
      if (markerPlacementRef.current) {
        const draft = markerPlacementRef.current;
        const marker = {
          ...draft,
          id: draft.id || crypto.randomUUID(),
          coordinates: [event.lngLat.lng, event.lngLat.lat]
        };
        setConflictMarkers(previous => draft.id ? previous.map(item => item.id === draft.id ? marker : item) : [...previous, marker]);
        setSelectedMarkerId(marker.id);
        markerPlacementRef.current = null;
        setPlacingMarker(false);
        return;
      }
      const hit = map.queryRenderedFeatures(event.point, {
        layers: ['route-points-layer']
      })[0];
      if (hit) {
        setPlaying(false);
        setMode('select');
        setSelectedPoint({
          routeId: hit.properties.routeId,
          index: Number(hit.properties.index)
        });
        return;
      }
      if (modeRef.current !== 'add') {
        const features = map.queryRenderedFeatures(event.point, {
          layers: ['route-points-layer']
        });
        if (features[0]) setSelectedPoint({
          routeId: features[0].properties.routeId,
          index: Number(features[0].properties.index)
        });else {
          setSelectedPoint(null);
          setSelectedMarkerId(null);
        }
        return;
      }
      const target = routesRef.current.find(r => r.id === activeRef.current);
      if (!target) return;
      const next = routesRef.current.map(route => route.id === target.id ? {
        ...route,
        points: [...route.points, [event.lngLat.lng, event.lngLat.lat]]
      } : route);
      setSelectedPoint({
        routeId: target.id,
        index: target.points.length
      });
      commitRoutes(next);
    });
    map.on('mousedown', 'route-points-layer', event => {
      if (relocatePointRef.current || recorderRef.current?.state === 'recording') return;
      setPlaying(false);
      setMode('select');
      const feature = event.features?.[0];
      if (!feature) return;
      event.preventDefault();
      const selection = {
        routeId: feature.properties.routeId,
        index: Number(feature.properties.index)
      };
      dragRef.current = selection;
      setSelectedPoint(selection);
      map.dragPan.disable();
      map.getCanvas().style.cursor = 'grabbing';
    });
    map.on('mousemove', event => {
      if (!dragRef.current) return;
      suppressPointClick.current = Date.now() + 300;
      const {
        routeId,
        index
      } = dragRef.current;
      const nextRoutes = routesRef.current.map(route => route.id === routeId ? {
        ...route,
        points: route.points.map((point, i) => i === index ? [event.lngLat.lng, event.lngLat.lat] : point)
      } : route);
      commitRoutes(nextRoutes);
    });
    map.on('mouseup', () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      map.dragPan.enable();
      map.getCanvas().style.cursor = modeRef.current === 'add' ? 'crosshair' : '';
    });
    map.on('mouseleave', () => {
      if (dragRef.current) {
        dragRef.current = null;
        map.dragPan.enable();
      }
    });
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (mapRef.current === map) {
        const center = map.getCenter();
        mapViewRef.current = {
          center: [center.lng, center.lat],
          zoom: map.getZoom(),
          pitch: map.getPitch(),
          bearing: map.getBearing()
        };
        map.remove();
        mapRef.current = null;
      }
    };
  }, [mapProvider, mapRetry]);
  useEffect(() => {
    if (mapReady) updateSources(routes, activeId);
  }, [mapReady, routes, activeId, updateSources]);
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return undefined;
    const MarkerConstructor = MapLibreMarker;
    const instances = activeConflictMarkers.map(marker => {
      const element = document.createElement('div');
      const expanded = marker.id === selectedMarkerId || marker.id === currentMarkerId;
      element.className = `map-signal-marker ${expanded ? 'expanded' : ''}`;
      element.setAttribute('role', 'button');
      element.setAttribute('tabindex', '0');
      element.setAttribute('aria-label', `${marker.signalCode}: ${marker.title || signalDefinition(marker.signalCode).name}`);
      element.innerHTML = `<div class="map-signal-pin signal-pin-${signalDefinition(marker.signalCode).kind}"><span>${escapeHtml(marker.signalCode === 'SEMÁFORO' ? '●' : marker.signalCode)}</span></div>`;
      element.addEventListener('click', event => {
        event.stopPropagation();
        setSelectedMarkerId(marker.id);
      });
      element.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setSelectedMarkerId(marker.id);
        }
      });
      element.querySelector('[data-edit-marker]')?.addEventListener('click', event => {
        event.stopPropagation();
        setMarkerDialog({
          editingId: marker.id,
          draft: {
            ...marker,
            destinations: marker.destinations?.length ? marker.destinations.map(item => ({
              ...item
            })) : [{
              text: '',
              arrow: 'right'
            }]
          }
        });
        setSelectedMarkerId(marker.id);
      });
      return new MarkerConstructor({
        element,
        anchor: 'bottom'
      }).setLngLat(marker.coordinates).addTo(map);
    });
    return () => instances.forEach(instance => instance.remove());
  }, [mapReady, mapProvider, activeConflictMarkers, selectedMarkerId, currentMarkerId]);
  useEffect(() => {
    const pointLayer = mapRef.current?.getLayer('route-points-layer');
    if (pointLayer) mapRef.current.setLayoutProperty('route-points-layer', 'visibility', playing || recording ? 'none' : 'visible');
  }, [mapReady, playing, recording]);
  useEffect(() => {
    if (mapReady && mapRef.current) mapRef.current.getCanvas().style.cursor = mode === 'add' || placingMarker || false ? 'crosshair' : '';
  }, [mapReady, mode, placingMarker, false]);

  // Keep map click handlers current without rebuilding the map.
  useEffect(() => {
    routesRef.current = routes;
    activeRef.current = activeId;
  }, [routes, activeId]);
  const addRoute = () => {
    if (routes.length >= 4) return;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    setPlaying(false);
    const letter = String.fromCharCode(65 + routes.length);
    const route = {
      id: crypto.randomUUID(),
      name: `Trayectoria ${letter}`,
      color: nextRouteColor(routes),
      points: []
    };
    commitRoutes([...routes, route]);
    setActiveId(route.id);
    setSelectedPoint(null);
    setMode('add');
    setPlaying(false);
  };
  const setRouteColor = (id, color) => {
    if (routes.some(route => route.id !== id && route.color.toLowerCase() === color)) return;
    commitRoutes(routes.map(route => route.id === id ? {
      ...route,
      color
    } : route));
  };
  const renameRoute = id => {
    const route = routes.find(item => item.id === id);
    if (route) setNameDialog({
      kind: 'route',
      target: id,
      value: route.name
    });
  };
  const deleteRoute = id => {
    if (routes.length === 1) {
      commitRoutes(routes.map(r => r.id === id ? {
        ...r,
        points: []
      } : r));
      setSelectedPoint(null);
      return;
    }
    const rest = routes.filter(route => route.id !== id);
    commitRoutes(rest);
    setConflictMarkers(previous => previous.filter(marker => marker.routeId !== id));
    if (id === activeId) setActiveId(rest[0].id);
    setSelectedMarkerId(null);
    setCurrentMarkerId(null);
    setSelectedPoint(null);
  };
  const reorderPoint = delta => {
    if (!selectedPoint || recording) return;
    relocatePointRef.current = null;
    setRelocatingPoint(false);
    const {
        routeId,
        index
      } = selectedPoint,
      route = routes.find(r => r.id === routeId),
      next = index + delta;
    if (!route || next < 0 || next >= route.points.length) return;
    const points = [...route.points];
    [points[index], points[next]] = [points[next], points[index]];
    commitRoutes(routes.map(r => r.id === routeId ? {
      ...r,
      points
    } : r));
    setSelectedPoint({
      routeId,
      index: next
    });
    setPlaying(false);
  };
  const removeSelectedPoint = () => {
    if (!selectedPoint || recording) return;
    relocatePointRef.current = null;
    setRelocatingPoint(false);
    const {
      routeId,
      index
    } = selectedPoint;
    commitRoutes(routes.map(route => route.id === routeId ? {
      ...route,
      points: route.points.filter((_, i) => i !== index)
    } : route));
    setSelectedPoint(null);
  };
  const openNewMarkerDialog = () => {
    if (!activeRoute || recording && playing) return;
    setMarkerDialog({
      draft: defaultMarkerDraft(activeId)
    });
    setSelectedMarkerId(null);
  };
  const updateMarkerDraft = (key, value) => setMarkerDialog(previous => previous ? {
    ...previous,
    draft: {
      ...previous.draft,
      [key]: value
    }
  } : previous);
  const editMarker = marker => setMarkerDialog({
    editingId: marker.id,
    draft: {
      ...marker,
      destinations: marker.destinations?.length ? marker.destinations.map(item => ({
        ...item
      })) : [{
        text: '',
        arrow: 'right'
      }]
    }
  });
  const saveMarkerChanges = () => {
    if (!markerDialog?.editingId) return;
    const draft = markerDialog.draft;
    const marker = {
      ...draft,
      title: draft.title?.trim() || signalDefinition(draft.signalCode).name,
      description: draft.description?.trim() || '',
      destinations: (draft.destinations || []).filter(item => item.text?.trim()).map(item => ({
        ...item,
        text: item.text.trim()
      }))
    };
    setConflictMarkers(previous => previous.map(item => item.id === markerDialog.editingId ? marker : item));
    setMarkerDialog(null);
  };
  const beginMarkerPlacement = () => {
    if (!markerDialog) return;
    const draft = markerDialog.draft;
    if (recording && !playing) {
      const position = interpolateRoute(activeRoute.points, progressRef.current).coords;
      const marker = {
        ...draft,
        id: markerDialog.editingId || crypto.randomUUID(),
        routeId: activeId,
        coordinates: position,
        title: draft.title?.trim() || signalDefinition(draft.signalCode).name,
        description: draft.description?.trim() || '',
        destinations: (draft.destinations || []).filter(d => d.text?.trim())
      };
      setConflictMarkers(previous => [...previous.filter(m => m.id !== marker.id), marker]);
      setSelectedMarkerId(marker.id);
      setMarkerDialog(null);
      return;
    }
    markerPlacementRef.current = {
      ...draft,
      id: markerDialog.editingId || draft.id || '',
      title: draft.title?.trim() || signalDefinition(draft.signalCode).name,
      description: draft.description?.trim() || '',
      destinations: (draft.destinations || []).filter(item => item.text?.trim()).map(item => ({
        ...item,
        text: item.text.trim()
      }))
    };
    setMarkerDialog(null);
    setMode('select');
    setPlaying(false);
    setPlacingMarker(true);
    setSelectedMarkerId(markerDialog.editingId || null);
  };
  const cancelMarkerPlacement = () => {
    markerPlacementRef.current = null;
    setPlacingMarker(false);
    setSelectedMarkerId(null);
  };
  const deleteMarker = id => {
    setConflictMarkers(previous => previous.filter(marker => marker.id !== id));
    if (selectedMarkerId === id) setSelectedMarkerId(null);
    if (currentMarkerId === id) setCurrentMarkerId(null);
  };
  const focusMarker = marker => {
    setSelectedMarkerId(marker.id);
    mapRef.current?.flyTo({
      center: marker.coordinates,
      zoom: Math.max(16, mapRef.current.getZoom()),
      pitch: 0,
      duration: 700
    });
  };
  const createProject = () => setNameDialog({
    kind: 'project-new',
    value: ''
  });
  const createNamedProject = (name, prepared = null, view = null) => {
    const id = crypto.randomUUID();
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    const newRoutes = prepared?.routes || makeInitialRoutes();
    if (prepared) {
      try {
        localStorage.setItem(`basurto-routes-project-${id}-board`, JSON.stringify({
          document: prepared.board,
          view
        }));
        localStorage.setItem(`basurto-routes-project-${id}`, JSON.stringify(newRoutes));
        localStorage.setItem(`basurto-routes-project-${id}-markers`, JSON.stringify(prepared.markers));
      } catch (error) {
        for (const suffix of ['', '-markers', '-board']) localStorage.removeItem(`basurto-routes-project-${id}${suffix}`);
        throw error;
      }
    }
    try {
      localStorage.setItem(`basurto-routes-project-${id}`, JSON.stringify(newRoutes));
    } catch {/* Browser storage may be unavailable. */}
    try {
      localStorage.setItem(`basurto-routes-project-${id}-markers`, JSON.stringify(prepared?.markers || []));
    } catch {/* Browser storage may be unavailable. */}
    setProjectState(previous => ({
      activeProjectId: id,
      projects: [...previous.projects.map(({
        id: oldId,
        name: oldName
      }) => ({
        id: oldId,
        name: oldName
      })), {
        id,
        name
      }]
    }));
    setRoutes(newRoutes);
    setConflictMarkers(prepared?.markers || []);
    setActiveId(newRoutes[0].id);
    setSelectedPoint(null);
    setSelectedMarkerId(null);
    setCurrentMarkerId(null);
    setPlacingMarker(false);
    markerPlacementRef.current = null;
    setPlaying(false);
    setProgress(0);
    progressRef.current = 0;
    setMode('select');
    if (view) mapRef.current?.jumpTo(view);else mapRef.current?.flyTo({
      center: START,
      zoom: 10.1,
      pitch: 0,
      bearing: 0,
      duration: 700
    });
  };
  const switchProject = id => {
    const project = projectState.projects.find(item => item.id === id);
    if (!project || project.id === currentProject.id) return;
    const nextRoutes = loadProjectRoutes(project);
    const nextMarkers = loadProjectMarkers(project);
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    setProjectState(previous => ({
      ...previous,
      activeProjectId: id
    }));
    setRoutes(nextRoutes);
    setConflictMarkers(nextMarkers);
    setActiveId(nextRoutes[0].id);
    setSelectedPoint(null);
    setSelectedMarkerId(null);
    setCurrentMarkerId(null);
    setPlacingMarker(false);
    markerPlacementRef.current = null;
    setPlaying(false);
    setProgress(0);
    progressRef.current = 0;
    setMode('select');
    mapRef.current?.flyTo({
      center: START,
      zoom: 10.1,
      pitch: 0,
      bearing: 0,
      duration: 700
    });
  };
  const renameProject = () => {
    setNameDialog({
      kind: 'project-rename',
      target: currentProject.id,
      value: currentProject.name
    });
  };
  const saveNameDialog = event => {
    event.preventDefault();
    const dialog = nameDialog;
    const name = dialog?.value.trim();
    if (!dialog || !name) return;
    if (dialog.kind === 'route') commitRoutes(routes.map(route => route.id === dialog.target ? {
      ...route,
      name
    } : route));
    if (dialog.kind === 'project-rename') setProjectState(previous => ({
      ...previous,
      projects: previous.projects.map(project => project.id === dialog.target ? {
        ...project,
        name
      } : project)
    }));
    if (dialog.kind === 'project-new') createNamedProject(name);
    setNameDialog(null);
  };
  const chooseOutputFolder = async () => {
    if (recording) return;
    setExportMessage('');
    if (window.elorrietaDesktop) {
      folderRef.current = {
        desktop: true
      };
      setFolderName('Vídeos MP4 de Traza');
      setExportMessage('Los vídeos se guardarán en Documentos/Basurto Recorridos/Vídeos MP4.');
      return;
    }
    if (!window.showDirectoryPicker) {
      folderRef.current = null;
      setFolderName('Descargas del navegador');
      setExportMessage('Este navegador no permite elegir carpeta. El vídeo se descargará en Descargas.');
      return;
    }
    try {
      const directory = await window.showDirectoryPicker({
        mode: 'readwrite'
      });
      folderRef.current = directory;
      setFolderName(directory.name);
      setExportMessage('');
    } catch (error) {
      if (error.name !== 'AbortError') setExportMessage('No se pudo acceder a esa carpeta. Elige otra.');
    }
  };
  const exportVideo = async () => {
    if(!window.basurtoCanCreateVideos)return;
    if (recording) {
      setPlaying(false);
      stopNarration();
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      return;
    }
    const videoRoute = activeRoute;
    if (!videoRoute || videoRoute.points.length < 2 || !mapRef.current || !folderName) return;
    const canvas = mapRef.current.getCanvas();
    if (!canvas.captureStream || !window.MediaRecorder) {
      setExportMessage('Este navegador no admite grabar el mapa. Prueba con Google Chrome actualizado.');
      return;
    }
    try {
      const watermark=await loadVideoWatermark();
      const videoCanvas = document.createElement('canvas');
      videoCanvas.width = canvas.width;
      videoCanvas.height = canvas.height;
      const context = videoCanvas.getContext('2d');
      if (!context || !videoCanvas.captureStream) throw new Error('Canvas recording is unavailable');
      const attribution = rasterExportCredit(mapProvider)+' · Anotaciones didácticas';
      const composeFrame = () => {
        context.drawImage(canvas, 0, 0, videoCanvas.width, videoCanvas.height);
        drawVideoCredits(context,attribution,videoCanvas.width,videoCanvas.height);
        const framePosition = interpolateRoute(videoRoute.points, progressRef.current).coords;
        {
          const state = recordingMarkers.current;
          const teachingMarker = distanceToMarker(framePosition, state.markers, videoRoute.id);
          if (teachingMarker) drawTeachingCard(context, teachingMarker, videoCanvas.width);
        }
        // Hit-test every frame: a dialog/control may cover a stationary pointer.
        if (!recordingMarkers.current.playing) {
          drawExplanationPointer(context, canvas, explanationPointer.current);
        }
        drawVideoWatermark(context,watermark,videoCanvas.width,videoCanvas.height);
        recordFrameRef.current = requestAnimationFrame(composeFrame);
      };
      composeFrame();
      if (mapRef.current.getLayer('route-points-layer')) mapRef.current.setLayoutProperty('route-points-layer', 'visibility', 'none');
      const stream = videoCanvas.captureStream(30);
      mediaStreamRef.current = stream;
      let audioElement = null;
      let audioContext = null;
      let microphone = null;
      let audioUrl = null;
      if (audioFile || recordMicrophone) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) throw new Error('Audio recording is not supported in this browser');
        audioContext = new AudioContextClass();
        audioResourcesRef.current = {
          audio: null,
          context: audioContext,
          microphone: null,
          url: null
        };
        const destination = audioContext.createMediaStreamDestination();
        if (audioFile) {
          audioUrl = URL.createObjectURL(audioFile);
          audioElement = new Audio(audioUrl);
          audioElement.preload = 'auto';
          audioContext.createMediaElementSource(audioElement).connect(destination);
          audioResourcesRef.current = {
            ...audioResourcesRef.current,
            audio: audioElement,
            url: audioUrl
          };
        }
        if (recordMicrophone) {
          if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access is unavailable');
          setExportMessage('Esperando permiso para usar el micrófono…');
          microphone = await navigator.mediaDevices.getUserMedia({
            audio: true
          });
          audioResourcesRef.current = {
            ...audioResourcesRef.current,
            microphone
          };
          audioContext.createMediaStreamSource(microphone).connect(destination);
        }
        await audioContext.resume();
        destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
      }
      const mimeType = ['video/mp4;codecs="avc1.42E01E,mp4a.40.2"', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs="avc1.42E01E"', 'video/mp4;codecs=avc1', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) {
        cancelAnimationFrame(recordFrameRef.current);
        await releaseAudio();
        if (mapRef.current.getLayer('route-points-layer')) mapRef.current.setLayoutProperty('route-points-layer', 'visibility', 'visible');
        setExportMessage('Este navegador no puede grabar en MP4. Usa Safari actualizado para exportar el vídeo.');
        return;
      }
      const recorder = new MediaRecorder(stream, {
        mimeType
      });
      chunksRef.current = [];
      let resolveSaved, rejectSaved;
      const saved = new Promise((resolve, reject) => {
        resolveSaved = resolve;
        rejectSaved = reject;
      });
      saved.catch(() => {});
      videoDoneRef.current = {
        promise: saved,
        pending: true,
        resolve: resolveSaved,
        reject: rejectSaved
      };
      recorderRef.current = recorder;
      recorder.ondataavailable = event => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        cancelAnimationFrame(recordFrameRef.current);
        window.speechSynthesis?.cancel();
        narrationUtteranceRef.current = null;
        setExportMessage('La grabación falló. Inténtalo de nuevo.');
        setRecording(false);
        setPlaying(false);
      };
      recorder.onstop = async () => {
        cancelAnimationFrame(recordFrameRef.current);
        window.speechSynthesis?.cancel();
        narrationUtteranceRef.current = null;
        await releaseAudio();
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'video/mp4'
        });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const fileName = `${safeFileName(currentProject.name)}-${safeFileName(videoRoute.name)}-${stamp}.mp4`;
        videoDoneRef.current.blob = blob;
        videoDoneRef.current.name = fileName;
        try {
          if (folderRef.current?.desktop && window.elorrietaDesktop) {
            await window.elorrietaDesktop.saveVideo(fileName, await blob.arrayBuffer());
            setExportMessage(`Vídeo guardado en Documentos/Basurto Recorridos/Vídeos MP4: ${fileName}`);
          } else if (folderRef.current) {
            const file = await folderRef.current.getFileHandle(fileName, {
              create: true
            });
            const writable = await file.createWritable();
            await writable.write(blob);
            await writable.close();
            setExportMessage(`Vídeo guardado en «${folderName}»: ${fileName}`);
          } else {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            link.click();
            URL.revokeObjectURL(url);
            setExportMessage(`Vídeo descargado: ${fileName}`);
          }
        } catch {
          const error = Error('No se pudo guardar el vídeo en esa carpeta. Vuelve a seleccionarla e inténtalo otra vez.');
          videoDoneRef.current.error = error;
          videoDoneRef.current.reject(error);
          setExportMessage(error.message);
        }
        videoDoneRef.current.pending = false;
        if (!videoDoneRef.current.error) videoDoneRef.current.resolve();
        setRecording(false);
        recorderRef.current = null;
      };
      progressRef.current = 0;
      setProgress(0);
      const start = interpolateRoute(videoRoute.points, 0);
      const vehicleView = cameraView === 'vehicle';
      mapRef.current.jumpTo({
        center: start.coords,
        offset: vehicleView ? [0, mapRef.current.getContainer().clientHeight * 0.14] : [0, 0],
        bearing: vehicleView ? start.bearing : 0,
        pitch: vehicleView ? 60 : 0,
        zoom: vehicleView ? Math.max(18.8, Math.min(19.7, 20.3 - Math.log2(height / 100))) : Math.max(15.5, Math.min(19.2, 18.2 - Math.log2(height / 100)))
      });
      if (audioElement) {
        audioElement.currentTime = 0;
        await audioElement.play();
      }
      recorder.start(1000);
      if (activeRoute.narration?.trim()) speakNarration(activeRoute.narration);
      setRecording(true);
      setPlaying(true);
      setExportMessage('Grabando el recorrido. Puedes pausar la imagen para explicar; el audio sigue grabándose. Reanuda para continuar.');
    } catch {
      cancelAnimationFrame(recordFrameRef.current);
      await releaseAudio();
      setRecording(false);
      setPlaying(false);
      if (mapRef.current?.getLayer('route-points-layer')) mapRef.current.setLayoutProperty('route-points-layer', 'visibility', 'visible');
      setExportMessage('No se pudo iniciar la grabación MP4. Comprueba que Safari esté actualizado e inténtalo de nuevo.');
    }
  };
  const focusRoute = route => {
    if (!route?.points.length || !mapRef.current) return;
    const bounds = route.points.reduce((b, coord) => b.extend(coord), new LngLatBounds(route.points[0], route.points[0]));
    mapRef.current.fitBounds(bounds.toArray(), {
      padding: 100,
      maxZoom: 16,
      duration: 800
    });
  };
  const setActive = id => {
    relocatePointRef.current = null;
    setRelocatingPoint(false);
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    stopNarration();
    setPlaying(false);
    setProgress(0);
    progressRef.current = 0;
    setActiveId(id);
    setSelectedPoint(null);
    setSelectedMarkerId(null);
    setCurrentMarkerId(null);
  };
  const animate = useCallback(now => {
    const route = routesRef.current.find(r => r.id === activeRef.current);
    const map = mapRef.current;
    if (!route || route.points.length < 2 || !map) {
      setPlaying(false);
      return;
    }
    if (!lastFrameRef.current) lastFrameRef.current = now;
    const dt = Math.min(60, now - lastFrameRef.current);
    lastFrameRef.current = now;
    const duration = Math.max(5000, distance(route.points[0], route.points.at(-1)) / 16 * 1000) / speed;
    progressRef.current += dt / duration;
    if (progressRef.current >= 1) {
      if (recorderRef.current?.state === 'recording') {
        progressRef.current = 1;
        setProgress(1);
        setPlaying(false);
        recorderRef.current.stop();
        return;
      }
      progressRef.current = 0;
    }
    const position = interpolateRoute(route.points, progressRef.current);
    setProgress(progressRef.current);
    const nearbyMarker = distanceToMarker(position.coords, recordingMarkers.current.markers, route.id);
    setCurrentMarkerId(previous => previous === nearbyMarker?.id ? previous : nearbyMarker?.id || null);
    updateSources(routesRef.current, activeRef.current, position.coords);
    if (follow) {
      const vehicleView = cameraView === 'vehicle';
      const zoom = vehicleView ? Math.max(18.8, Math.min(19.7, 20.3 - Math.log2(height / 100))) : Math.max(15.5, Math.min(19.2, 18.2 - Math.log2(height / 100)));
      map.easeTo({
        center: position.coords,
        offset: vehicleView ? [0, map.getContainer().clientHeight * 0.14] : [0, 0],
        bearing: vehicleView ? position.bearing : 0,
        pitch: vehicleView ? 60 : 0,
        zoom,
        duration: 0,
        essential: true
      });
    }
    rafRef.current = requestAnimationFrame(animate);
  }, [speed, height, follow, cameraView, conflictMarkers, updateSources]);
  useEffect(() => {
    if (playing && "routes" === 'routes') {
      lastFrameRef.current = 0;
      rafRef.current = requestAnimationFrame(animate);
    } else {
      cancelAnimationFrame(rafRef.current);
      if (!recording) {
        setCurrentMarkerId(null);
        updateSources(routes, activeId);
      }
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, animate, routes, activeId, updateSources, "routes", recording]);
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (recording || !synth || !narrationUtteranceRef.current) return;
    if (playing && synth.paused) synth.resume();else if (!playing && synth.speaking && !synth.paused) synth.pause();
  }, [playing, recording]);
  const togglePlayback = () => {
    if (!activeRoute || activeRoute.points.length < 2) return;
    if (recording) {
      mapRef.current?.stop();
      setPlaying(!playing);
      return;
    }
    if (progressRef.current >= 1) progressRef.current = 0;
    const nextPlaying = !playing;
    const audio = audioResourcesRef.current?.audio;
    if (nextPlaying) {
      audio?.play().catch(() => {});
      if (narrationUtteranceRef.current && window.speechSynthesis?.paused) window.speechSynthesis.resume();else if (activeRoute.narration?.trim()) speakNarration(activeRoute.narration);
    } else {
      audio?.pause();
      window.speechSynthesis?.pause();
    }
    setPlaying(nextPlaying);
  };
  const openBackupScreen = () => {
    if (recording) return;
    setPlaying(false);
    stopNarration();
    mapRef.current?.stop();
    clearTimeout(librarySaveTimer.current);
    setLibraryOpen(false);
    setBackupOpen(true);
  };
  const flushBackup = async () => {
    localStorage.setItem('basurto-routes-project-' + currentProject.id, JSON.stringify(routes));
    localStorage.setItem('basurto-routes-project-' + currentProject.id + '-markers', JSON.stringify(conflictMarkers));
  };
  saveStateRef.current = {
    projectState,
    currentProject,
    routes,
    conflictMarkers,
    workspaceMode: "routes",
    activeId,
    markerDialog,
    nameDialog,
    boardOpen
  };
  const checkpointApp = () => {
    const s = saveStateRef.current;
    if (!s) return;
    writeChanged('basurto-routes-projects', {
      activeProjectId: s.projectState.activeProjectId,
      projects: s.projectState.projects.map(({
        id,
        name
      }) => ({
        id,
        name
      }))
    });
    writeChanged('basurto-routes-project-' + s.currentProject.id, s.routes);
    writeChanged('basurto-routes-project-' + s.currentProject.id + '-markers', s.conflictMarkers);
    const map = mapRef.current,
      c = map?.getCenter();
    writeChanged(SESSION_KEY, {
      version: 1,
      projectId: s.currentProject.id,
      workspaceMode: 'routes',
      activeId: s.activeId,
      markerDialog: s.markerDialog,
      nameDialog: s.nameDialog,
      boardOpen: s.boardOpen,
      ...(c ? {
        view: {
          center: [c.lng, c.lat],
          zoom: map.getZoom(),
          bearing: map.getBearing(),
          pitch: map.getPitch()
        }
      } : {})
    });
  };
  const appSaveRef = useRef(null);
  appSaveRef.current = checkpointApp;
  useEffect(() => registerAutosave('app', {
    checkpoint: () => appSaveRef.current(),
    busy: () => !!recorderRef.current || !!videoDoneRef.current?.pending,
    finish: async () => {
      const r = recorderRef.current;
      if (r && r.state !== 'inactive') r.stop();
      const task = videoDoneRef.current;
      if (task?.error && task.blob && window.elorrietaDesktop) {
        await window.elorrietaDesktop.saveVideo(task.name, await task.blob.arrayBuffer());
        task.error = null;
        return;
      }
      if (task) await task.promise;
    }
  }), []);
  useEffect(() => {
    if (recovered?.view?.center?.length === 2 && recovered.view.center.every(Number.isFinite)) mapRef.current?.jumpTo(recovered.view);
    try {
      const draft = JSON.parse(localStorage.getItem(BOARD_DRAFT_KEY));
      if (validBoardRecovery(draft)) {
        setBoardSeed({
          ...draft,
          autosave: draft
        });
        setBoardOpen(true);
      }
    } catch {}
  }, []);
  const showLibrary = async () => {
    if (recording) return;
    setPlaying(false);
    stopNarration();
    mapRef.current?.stop();
    setLibraryError('');
    let opened = {};
    try {
      opened = JSON.parse(localStorage.getItem('basurto-routes-library-opened') || '{}');
    } catch {}
    const entries = [];
    for (const project of projectState.projects) {
      const source = project.id === currentProject.id ? routes : loadProjectRoutes(project),
        markers = project.id === currentProject.id ? conflictMarkers : loadProjectMarkers(project);
      for (const route of source) {
        if (!route.points.length) continue;
        const key = 'route:' + project.id + ':' + route.id;
        entries.push({
          key,
          kind: 'routes',
          name: route.name,
          projectId: project.id,
          projectName: project.name,
          routeId: route.id,
          coordinates: route.points,
          color: route.color,
          criticalCoordinates: markers.filter(m => m.routeId === route.id).map(m => m.coordinates),
          incidents: markers.filter(m => m.routeId === route.id).length,
          openedAt: opened[key] || 0
        });
      }
    }
    setLibraryEntries(entries);
    setLibraryOpen(true);
  };
  const removeLibraryEntry = async entry => {
    if (libraryBusy || recording || false) return;
    if (!window.confirm(t(`«${entry.name}» ezabatu? Gordetako ibilbidea eta bere gorabeherak ezabatuko dira. Jatorrizko fitxategiak mantenduko dira.`, `¿Eliminar «${entry.name}»? Se borrará el recorrido guardado y sus incidencias. Los vídeos originales se conservarán.`))) return;
    setLibraryBusy(true);
    setLibraryError('');
    try {
      {
        const project = projectState.projects.find(p => p.id === entry.projectId);
        if (!project) throw Error('Proyecto no encontrado');
        const isCurrent = project.id === currentProject.id,
          source = isCurrent ? routes : loadProjectRoutes(project),
          markers = isCurrent ? conflictMarkers : loadProjectMarkers(project);
        let next = source.filter(r => r.id !== entry.routeId);
        if (!next.length) next = makeInitialRoutes();
        const nextMarkers = markers.filter(m => m.routeId !== entry.routeId);
        localStorage.setItem(`basurto-routes-project-${project.id}`, JSON.stringify(next));
        localStorage.setItem(`basurto-routes-project-${project.id}-markers`, JSON.stringify(nextMarkers));
        if (project.legacy) localStorage.setItem('basurto-routes-routes', JSON.stringify(next));
        if (isCurrent) {
          if (activeId === entry.routeId) {
            setActiveId(next[0].id);
            activeRef.current = next[0].id;
            setProgress(0);
            progressRef.current = 0;
          }
          commitRoutes(next);
          setConflictMarkers(nextMarkers);
          setSelectedPoint(null);
          setSelectedMarkerId(null);
          setCurrentMarkerId(null);
        }
      }
      setLibraryEntries(previous => previous.filter(e => e.key !== entry.key));
      try {
        const opened = JSON.parse(localStorage.getItem('basurto-routes-library-opened') || '{}');
        delete opened[entry.key];
        localStorage.setItem('basurto-routes-library-opened', JSON.stringify(opened));
      } catch {}
    } catch (error) {
      setLibraryError(t('Ezin izan da ezabatu: ', 'No se pudo eliminar: ') + error.message);
    } finally {
      setLibraryBusy(false);
    }
  };
  const openLibraryEntry = entry => {
    const project = projectState.projects.find(p => p.id === entry.projectId);
    if (!project) return;
    switchProject(project.id);
    setPlaying(false);
    setMode('select');
    setSelectedPoint(null);
    setSelectedMarkerId(null);
    setCurrentMarkerId(null);
    markerPlacementRef.current = null;
    setPlacingMarker(false);
    relocatePointRef.current = null;
    setRelocatingPoint(false);
    setActiveId(entry.routeId);
    activeRef.current = entry.routeId;
    setProgress(0);
    progressRef.current = 0;
    if (entry.coordinates.length) {
      const bounds = entry.coordinates.reduce((b, c) => b.extend(c), new LngLatBounds(entry.coordinates[0], entry.coordinates[0]));
      mapRef.current?.fitBounds(bounds.toArray(), {
        padding: 70,
        maxZoom: 17,
        duration: 0
      });
    }
    try {
      const opened = JSON.parse(localStorage.getItem('basurto-routes-library-opened') || '{}');
      opened[entry.key] = Date.now();
      localStorage.setItem('basurto-routes-library-opened', JSON.stringify(opened));
    } catch {}
    setLibraryOpen(false);
  };
  const createBoardMap = node => {
    const original = mapRef.current,
      center = original.getCenter();
    const baseSource = rasterSource(mapProvider);
    const map = new MapLibreMap({
      container: node,
      ...{
        canvasContextAttributes: {
          preserveDrawingBuffer: true
        }
      },
      style: {
        version: 8,
        sources: {
          'basemap-source': baseSource
        },
        layers: [{
          id: 'basemap-layer',
          type: 'raster',
          source: 'basemap-source'
        }]
      },
      center: [center.lng, center.lat],
      zoom: original.getZoom(),
      bearing: original.getBearing(),
      pitch: original.getPitch(),
      attributionControl: false,
      cooperativeGestures: false,
      maxZoom: 20
    });
    map.addControl(new NavigationControl(), 'top-right');
    map.addControl(new AttributionControl({
      compact: false
    }), 'bottom-right');
    return map;
  };
  return <main className="app-shell">
    {boardOpen && <DidacticBoard onSaveTrajectory={(name, document, view) => {
      if (!validBoardDocument(document)) throw Error("La explicación no tiene un formato válido.");
      createNamedProject(name, boardTrajectoryProject(document, name), view);
    }} seed={boardSeed} createMap={createBoardMap} Marker={MapLibreMarker} catalog={SIGNAL_CATALOG} signalDefinition={signalDefinition} signalHtml={markerFaceHtml} SignalFace={SignalFace} arrows={ARROWS} defaultDraft={defaultMarkerDraft('')} language={language} onClose={() => {
      setBoardOpen(false);
      setBoardSeed(null);
    }} />}
    <LegacyImport /><header className="topbar">
      <div className="brand"><HomeLogo className="institution-logo" language={language}/><div><div className="brand-name">Basurto Recorridos</div><div className="brand-subtitle">Trayectorias y pizarra didáctica</div></div></div>
      <div className="topbar-right"><AutosaveStatus language={language} /><HelpControls language={language}/><AccountControls language={language} disabled={recording || false} /><button className="library-launch" disabled={recording || false} onClick={showLibrary}>▤ {t("Liburutegia", "Biblioteca")}</button><span className="map-status"><i className={mapReady && !mapError ? 'status-dot ready' : 'status-dot'} />{rasterLabel(mapProvider)}</span><button className="icon-button" title="Centrar en Bizkaia" onClick={() => mapRef.current?.flyTo({
          center: START,
          zoom: 10.1,
          pitch: 0,
          bearing: 0,
          duration: 900
        })}><span className="crosshair">⌖</span></button></div>
    </header>
    {libraryOpen && <RouteLibrary mapProvider={mapProvider} entries={libraryEntries} language={language} onLanguage={setLanguage} error={libraryError} onClose={() => setLibraryOpen(false)} onOpen={openLibraryEntry} onDelete={removeLibraryEntry} onBackups={openBackupScreen} busy={libraryBusy} onNew={next => {
      setLibraryOpen(false);
      createProject();
    }} onBoard={entry => {
      setBoardSeed({
        document: entry.document,
        autosave: {
          caseId: entry.id,
          caseName: entry.name,
          view: entry.view
        }
      });
      setLibraryOpen(false);
      setBoardOpen(true);
    }} />}
    {false}
    {backupOpen && <BackupScreen language={language} onClose={() => {
      setBackupOpen(false);
      showLibrary();
    }} onBeforeExport={flushBackup} onBeforeRestore={() => clearTimeout(librarySaveTimer.current)} />}
    <section className="workspace">
      <aside className="sidebar">
        <label className="app-language">Hizkuntza / Idioma<select aria-label="Hizkuntza / Idioma" value={language} onChange={e => setLanguage(e.target.value)}><option value="eu">Euskara</option><option value="es">Castellano</option></select></label><div className="panel-heading"><div><p className="eyebrow">{t("PROIEKTUA", "PROYECTO")}</p><h1 title={currentProject.name}>{currentProject.name}</h1></div><div className="project-actions"><button className="add-route" title="Crear proyecto" onClick={createProject}>+</button><button className="more-button" title="Cambiar nombre" onClick={renameProject}>···</button></div></div>
        {projectState.projects.length > 1 && <div className="project-switcher"><span className="eyebrow">{t("PROIEKTUA ALDATU", "CAMBIAR PROYECTO")}</span><select aria-label="Seleccionar proyecto" value={currentProject.id} onChange={event => switchProject(event.target.value)}>{projectState.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div>}
        <div className="location-chip"><span className="pin-icon">⌖</span><div><strong>Bizkaia, Euskadi</strong><small>Vista inicial · mapa real</small></div><span className="chip-live">LIVE</span></div>{<>
        {localStorage.getItem(`basurto-routes-project-${currentProject.id}-board`) && <button className="pizarra-project-reopen" disabled={!mapReady || recording || false} onClick={() => {
            try {
              const saved = JSON.parse(localStorage.getItem(`basurto-routes-project-${currentProject.id}-board`));
              if (!validBoardDocument(saved.document)) throw Error('La explicación guardada no es válida.');
              setPlaying(false);
              stopNarration();
              mapRef.current?.stop();
              if (saved.view?.center?.length === 2 && saved.view.center.every(Number.isFinite) && Number.isFinite(saved.view.zoom)) mapRef.current?.jumpTo({
                center: saved.view.center,
                zoom: Math.max(0, Math.min(22, saved.view.zoom)),
                bearing: Number(saved.view.bearing) || 0,
                pitch: Math.max(0, Math.min(60, Number(saved.view.pitch) || 0))
              });
              setBoardSeed({
                document: saved.document
              });
              setBoardOpen(true);
            } catch (e) {
              setExportMessage(e.message);
            }
          }}>▶ {t('Klaseko azalpena berriro ireki', 'Reabrir explicación de clase')}</button>}
        <button className="pizarra-copy-launch" title={t('Uneko trazatuak eta seinaleak arbelean ireki', 'Abrir las trazadas y señales actuales en la pizarra')} disabled={!mapReady || recording || false || !routes.some(r => r.points.length)} onClick={() => {
            setPlaying(false);
            stopNarration();
            mapRef.current?.stop();
            setBoardSeed({
              document: trajectoryBoardDocument(routes, conflictMarkers, currentProject.name)
            });
            setBoardOpen(true);
          }}><ActionIcon name="send" />{t('Ibilbideak arbelera', 'Trazadas a pizarra')}</button>
        <button className="pizarra-launch" disabled={!mapReady || recording || false} onClick={() => {
            setPlaying(false);
            stopNarration();
            mapRef.current?.stop();
            setBoardOpen(true);
          }}><ActionIcon name="board" />{t('Arbel didaktikoa', 'Pizarra didáctica')}</button>
        <div className="section-title"><div><span className="eyebrow">CAPAS DE RECORRIDO</span><span className="count-badge">{routes.length}/4</span></div><button className="add-route" onClick={addRoute} disabled={routes.length >= 4} aria-label="Crear trayectoria" title={routes.length >= 4 ? 'Ya tienes las cuatro trayectorias' : 'Crear trayectoria'}>+</button></div>
        <div className="route-list">
          {routes.map((route, index) => <article key={route.id} className={`route-card ${activeId === route.id ? 'selected' : ''}`}>
            <button className="route-main" onClick={() => setActive(route.id)}><span className="route-swatch" style={{
                  '--route-color': route.color
                }}><span /></span><span className="route-info"><strong>{route.name}</strong><small>{route.points.length} {route.points.length === 1 ? 'punto' : 'puntos'}{route.points.length > 1 ? ` · ${Math.round(route.points.slice(1).reduce((sum, p, i) => sum + distance(route.points[i], p), 0))} m` : ''}</small></span><span className="route-key">{String.fromCharCode(65 + index)}</span></button>
            {activeId === route.id && <><div className="route-actions"><button onClick={() => renameRoute(route.id)}>{t("Izena aldatu", "Renombrar")}</button><button onClick={() => focusRoute(route)}>Enfocar</button><button className="danger-text" onClick={() => deleteRoute(route.id)}>{routes.length === 1 ? 'Vaciar' : 'Eliminar'}</button></div><div className="route-color-picker" aria-label={`Color de ${route.name}`}>{COLORS.map(color => {
                    const usedByAnother = routes.some(other => other.id !== route.id && other.color.toLowerCase() === color);
                    return <button key={color} type="button" className={`route-color-choice ${route.color.toLowerCase() === color ? 'chosen' : ''}`} style={{
                      '--choice-color': color
                    }} aria-label={`Elegir color ${color}`} aria-pressed={route.color.toLowerCase() === color} title={usedByAnother ? 'Este color ya está usado por otra trayectoria' : `Cambiar a ${color}`} disabled={usedByAnother} onClick={() => setRouteColor(route.id, color)} />;
                  })}</div></>}
          </article>)}
        </div>
        <div className="section-title conflict-section-title"><div><span className="eyebrow">PUNTOS CONFLICTIVOS</span><span className="count-badge">{activeConflictMarkers.length}</span></div><button className="add-route" onClick={openNewMarkerDialog} disabled={recording && playing} aria-label="Añadir señal o punto conflictivo" title="Añadir señal o punto conflictivo">+</button></div>
        <div className="conflict-list">
          {activeConflictMarkers.map(marker => <article key={marker.id} className={`conflict-card ${selectedMarkerId === marker.id ? 'selected' : ''}`}>
            <button className="conflict-card-main" onClick={() => focusMarker(marker)}><span className={`conflict-card-icon signal-pin-${signalDefinition(marker.signalCode).kind}`}><span>{marker.signalCode === 'SEMÁFORO' ? '●' : marker.signalCode}</span></span><span className="conflict-card-copy"><strong>{marker.title || signalDefinition(marker.signalCode).name}</strong><small>{marker.signalCode}{signalDefinition(marker.signalCode).kind === 'direction' ? ` · ${(marker.destinations || []).map(item => item.text).filter(Boolean).join(' · ')}` : ''}</small></span></button>
            <div className="conflict-card-actions"><button onClick={() => editMarker(marker)} disabled={recording && playing}>Editar</button><button onClick={() => deleteMarker(marker.id)} disabled={recording}>{t("Ezabatu", "Eliminar")}</button><span className="conflict-video-state">{marker.showInVideo === false ? 'Solo mapa' : 'Vídeo'}</span></div>
          </article>)}
          {!activeConflictMarkers.length && <div className="conflict-empty">Añade señales o situaciones de riesgo asociadas a esta trayectoria.</div>}
        </div>
        <div className="drawing-card">
          <div className="drawing-heading"><span className="draw-icon">✳</span><div><strong>Edición de trazado</strong><small>{mode === 'add' ? 'Haz clic en el mapa para añadir puntos' : 'Selecciona una ruta para editarla'}</small></div></div>
          <button className={`draw-toggle ${mode === 'add' ? 'active' : ''}`} onClick={() => {
              setMode(mode === 'add' ? 'select' : 'add');
              setPlaying(false);
            }}>{mode === 'add' ? t('✓ Amaitu', '✓ Finalizar') : t('+ Puntuak gehitu', '+ Añadir puntos')}</button>
          <fieldset className="trajectory-point-editor" disabled={recording}>
          <label>{t('Ibilbideko puntua', 'Punto del itinerario')}<select aria-label={t('Ibilbideko puntua', 'Punto del itinerario')} value={selectedPoint?.routeId === activeId ? selectedPoint.index : ''} onChange={e => {
                  relocatePointRef.current = null;
                  setRelocatingPoint(false);
                  setMode('select');
                  setPlaying(false);
                  setSelectedPoint(e.target.value === '' ? null : {
                    routeId: activeId,
                    index: Number(e.target.value)
                  });
                }}><option value="">{t('Hautatu puntu bat', 'Selecciona un punto')}</option>{activeRoute?.points.map((p, i) => <option key={i} value={i}>{i + 1} · {p[1].toFixed(5)}, {p[0].toFixed(5)}</option>)}</select></label>
          <p>{t('Hautatu edo arrastatu mapako puntu bat.', 'Selecciona un punto o arrástralo en el mapa.')}</p>
          <div className="lesson-actions"><button aria-label={t('↑ Aurreratu', '↑ Adelantar')} title={t('Puntua aurreratu', 'Adelantar punto')} disabled={!selectedPoint || selectedPoint.index === 0} onClick={() => reorderPoint(-1)}><ActionIcon name="up" />{t('Lehenago', 'Antes')}</button><button aria-label={t('↓ Atzeratu', '↓ Retrasar')} title={t('Puntua atzeratu', 'Retrasar punto')} disabled={!selectedPoint || selectedPoint.index >= (routes.find(r => r.id === selectedPoint?.routeId)?.points.length || 0) - 1} onClick={() => reorderPoint(1)}><ActionIcon name="down" />{t('Geroago', 'Después')}</button><button aria-label={t('Lekuz aldatu', 'Recolocar punto')} disabled={!selectedPoint} onClick={() => {
                  relocatePointRef.current = selectedPoint;
                  setRelocatingPoint(true);
                  setMode('select');
                  setPlaying(false);
                }}><ActionIcon name="move" />{t('Mugitu', 'Mover')}</button><button className="point-delete" aria-label={t('Puntua ezabatu', 'Eliminar punto')} disabled={!selectedPoint} onClick={removeSelectedPoint}><ActionIcon name="trash" />{t('Ezabatu', 'Eliminar')}</button></div>
          {relocatingPoint && <p role="status">{t('Egin klik mapan kokapen berrian.', 'Haz clic en el mapa en la nueva posición.')} <button onClick={() => {
                  relocatePointRef.current = null;
                  setRelocatingPoint(false);
                }}>{t('Utzi', 'Cancelar')}</button></p>}
          </fieldset>
        </div>
        <div className="divider" />
        <div className="section-title playback-title"><div><span className="eyebrow">VUELO DE CÁMARA</span></div><span className="preview-label">PREVISUALIZACIÓN</span></div>
        <div className="play-card">
          <button className={`play-button ${playing ? 'is-playing' : ''}`} onClick={togglePlayback} disabled={!activeRoute || activeRoute.points.length < 2} aria-label={recording ? playing ? 'Pausar vista previa' : 'Reanudar vista previa' : playing ? 'Pausar' : 'Reproducir'}>{playing ? 'Ⅱ' : '▶'}</button>
          <div className="play-copy"><strong>{recording ? playing ? 'Grabando recorrido y audio' : 'Imagen pausada · audio grabándose' : playing ? 'Simulación en curso' : 'Vista previa del recorrido'}</strong><small>{activeRoute?.points.length < 2 ? 'Añade al menos dos puntos' : `Sigue ${activeRoute?.name}`}</small></div>
          <button className="restart-button" title="Volver al inicio" onClick={() => {
              progressRef.current = 0;
              setProgress(0);
              if (activeRoute?.points[0]) {
                const vehicleView = cameraView === 'vehicle';
                mapRef.current?.flyTo({
                  center: activeRoute.points[0],
                  zoom: vehicleView ? Math.max(18.8, Math.min(19.7, 20.3 - Math.log2(height / 100))) : Math.max(15.5, Math.min(19.2, 18.2 - Math.log2(height / 100))),
                  pitch: vehicleView ? 60 : 0,
                  bearing: vehicleView ? interpolateRoute(activeRoute.points, 0).bearing : 0,
                  duration: 700
                });
              }
            }}>↺</button>
        </div>
        <div className="video-card">
          <div className="video-card-heading"><strong>Vídeo · {activeRoute?.name}</strong><span>MP4</span></div>
          <div className="video-actions"><button className="folder-button" onClick={chooseOutputFolder}>▰ {folderName || 'Elegir carpeta…'}</button><button className="export-button" disabled={!recording && (!folderName || !activeRoute || activeRoute.points.length < 2)} onClick={exportVideo}>{recording ? '■ Finalizar y guardar' : '● Grabar vídeo'}</button></div>
          <div className="recording-pause-controls"><button aria-label="Pausar imagen" disabled={!recording || !playing} onClick={togglePlayback}>Ⅱ {t('Irudia pausatu', 'Pausar imagen')}</button><button aria-label="Reanudar recorrido" disabled={!recording || playing} onClick={togglePlayback}>▶ {t('Ibilbidea jarraitu', 'Reanudar recorrido')}</button></div>
          <button className="recording-add-incident" disabled={!recording || playing} onClick={openNewMarkerDialog}>＋ {t('Gatazka-puntua gehitu', 'Añadir punto conflictivo en pausa')}</button>
          <p className="recording-pause-status" role="status">{recording ? playing ? t('Ibilbidea grabatzen. Irudia pausa dezakezu; audioak jarraitzen du.', 'Grabando recorrido. Puedes pausar la imagen; el audio continúa.') : t('Irudia pausatuta. Audioak jarraitzen du. Maparen gaineko erakuslea bideoan agertzen da.', 'Imagen pausada. El audio sigue grabándose. Señala sobre el mapa: el puntero aparece en el vídeo.') : t('Grabazioa hasi ondoren aktibatuko dira.', 'Se activan al iniciar la grabación.')}</p>
          <small>{exportMessage || (folderName ? `Se guardará en «${folderName}».` : 'Selecciona una trayectoria y elige dónde guardar su vídeo MP4.')}</small>
        </div>
        <div className="audio-card">
          <strong>Audio del vídeo</strong>
          <label className="narration-label" htmlFor="route-narration">Narración de la trayectoria</label>
          <textarea id="route-narration" className="narration-input" maxLength={3000} rows={3} value={activeRoute?.narration || ''} disabled={!activeRoute || recording} placeholder="Escribe aquí lo que quieres narrar…" onChange={event => {
              const narration = event.target.value;
              commitRoutes(routes.map(route => route.id === activeId ? {
                ...route,
                narration
              } : route));
            }} />
          <label className="narration-label" htmlFor="narration-language">Idioma de la voz</label>
          <select id="narration-language" className="narration-language" value={narrationLanguage} disabled={!activeRoute || recording || playing} onChange={event => {
              const narrationLanguage = event.target.value;
              commitRoutes(routes.map(route => route.id === activeId ? {
                ...route,
                narrationLanguage
              } : route));
              setNarrationMessage('');
            }}>
            <option value="es">Español</option><option value="eu">Euskera</option>
          </select>
          <div className="narration-actions"><button className="audio-file-button" disabled={!activeRoute?.narration?.trim() || !narrationVoice || recording} onClick={() => speakNarration(activeRoute?.narration)}>▶ Escuchar narración</button><button className="audio-clear-button" disabled={!narrationUtteranceRef.current} onClick={stopNarration} title="Detener narración">■</button></div>
          <small className="narration-status" role="status">{narrationMessage || (narrationVoice ? `Voz disponible: ${narrationVoice.name} · ${narrationLanguage === 'eu' ? 'euskera' : 'español'}.` : narrationLanguage === 'eu' ? 'No se ha encontrado una voz de euskera en este dispositivo. La disponibilidad depende de las voces instaladas en macOS.' : 'Buscando una voz de español en Safari/macOS…')}</small>
          <input ref={audioInputRef} className="audio-file-input" type="file" accept="audio/*,.mp3,.m4a,.wav" onChange={event => setAudioFile(event.target.files?.[0] || null)} />
          <div className="audio-file-row"><button className="audio-file-button" disabled={recording} onClick={() => audioInputRef.current?.click()}>{audioFile ? `♪ ${audioFile.name}` : '♪ Añadir pista de audio'}</button>{audioFile && <button className="audio-clear-button" disabled={recording} title="Quitar pista" onClick={() => {
                setAudioFile(null);
                if (audioInputRef.current) audioInputRef.current.value = '';
              }}>×</button>}</div>
          <label className="microphone-option"><input type="checkbox" checked={recordMicrophone} disabled={recording} onChange={event => setRecordMicrophone(event.target.checked)} /> Grabar voz con el micrófono</label>
          <small>La pista y el micrófono se incluyen en el MP4. La voz del sistema se reproduce sincronizada durante la grabación, pero Safari no permite incluirla directamente en el archivo.</small>
        </div>
        <div className="control-group"><div className="control-label"><span>Perspectiva de cámara</span><strong>{cameraView === 'top' ? 'Vertical' : 'A ras de suelo'}</strong></div><div className="segmented view-segmented"><button className={cameraView === 'top' ? 'on' : ''} onClick={() => setCameraView('top')}>⊙ Vertical</button><button className={cameraView === 'vehicle' ? 'on' : ''} onClick={() => setCameraView('vehicle')}>▰ A bordo</button></div><small className="view-note">Sin puntos de paso · vista baja simulada, no grabación interior real.</small></div>
        <div className="timeline"><div className="timeline-track"><div className="timeline-fill" style={{
                width: `${progress * 100}%`
              }} /><span className="timeline-knob" style={{
                left: `${progress * 100}%`
              }} /></div><div className="timeline-labels"><span>00:00</span><span>{Math.max(0, Math.round(totalDistance / 16 / speed))} s aprox.</span></div></div>
        <div className="control-group"><div className="control-label"><span>Velocidad</span><strong>{speed.toLocaleString('es-ES', {
                  minimumFractionDigits: speed < 1 ? 1 : 0,
                  maximumFractionDigits: 1
                })}×</strong></div><div className="segmented speed-segmented">{SPEEDS.map(value => <button key={value} className={speed === value ? 'on' : ''} onClick={() => setSpeed(value)}>{value.toLocaleString('es-ES', {
                  minimumFractionDigits: value < 1 ? 1 : 0,
                  maximumFractionDigits: 1
                })}×</button>)}</div></div>
        <div className="control-group"><div className="control-label"><span>Altura de cámara</span><strong>{height} m</strong></div><input type="range" min="50" max="500" step="10" value={height} onChange={event => setHeight(Number(event.target.value))} /></div>
        <div className="control-group orientation-row"><div><strong>Orientación dinámica</strong><small>La cámara gira con la trayectoria</small></div><button className={`switch ${follow ? 'on' : ''}`} onClick={() => setFollow(!follow)} aria-label="Alternar orientación"><span /></button></div>
        <div className="future-card"><span>✦</span><p><strong>Señales del catálogo</strong><br />Personaliza el tipo, destinos y explicación.</p><span className="soon-tag">EN PRUEBA</span></div>
        </>}
        <section className="backup-launch-card"><span>▣</span><div><strong>{t('Segurtasun-kopiak', 'Copias de seguridad')}</strong><p>{t('Gorde edo berreskuratu zure liburutegia.', 'Guarda o recupera tu biblioteca.')}</p><button disabled={recording} onClick={openBackupScreen}>{t('Kopiak kudeatu', 'Gestionar copias')}</button></div></section><div className="sidebar-footer"><span>BASURTO</span>{window.elorrietaDesktop ? <span title={window.elorrietaDesktop.dataDirectory}>DATOS EN ESTE MAC</span> : <span>GUARDADO EN ESTE NAVEGADOR</span>}</div>
      </aside>
      <section className="map-panel">
        {false}

        <div ref={mapNode} className="map-canvas" />
        {visibleConflictMarker && <aside className="trajectory-conflict-popup" aria-label="Punto conflictivo"><small>{visibleConflictMarker.signalCode} · {signalDefinition(visibleConflictMarker.signalCode).name}</small><SignalFace marker={visibleConflictMarker} /><strong>{visibleConflictMarker.title || signalDefinition(visibleConflictMarker.signalCode).name}</strong>{visibleConflictMarker.description && <p>{visibleConflictMarker.description}</p>}<button disabled={recording && playing} onClick={() => editMarker(visibleConflictMarker)}>Editar señal</button></aside>}
        {false}
        {mapError && <div className="map-overlay"><div className="map-error"><strong>{'No se ha podido cargar el mapa'}</strong><p>{mapError}</p><small>{`Comprueba la conexión a ${rasterName(mapProvider)} y vuelve a intentarlo.`}</small><button className="map-retry" disabled={recording || false} onClick={() => setMapRetry(n => n + 1)}>{t('Berriz saiatu', 'Reintentar mapa')}</button>{mapProvider !== 'pnoa' && <button className="map-retry" disabled={recording || false} onClick={() => selectMapProvider('pnoa')}>{t('PNOA erabili · doakoa', 'Usar PNOA · gratuito')}</button>}{mapProvider !== 'osm' && <button className="map-retry" disabled={recording || false} onClick={() => selectMapProvider('osm')}>{t('OpenStreetMap erabili · doakoa', 'Usar OpenStreetMap · gratuito')}</button>}</div></div>}
        <div className="map-top-tools">{ <PlaceSearch language={language} disabled={!mapReady || recording} onSelect={({coordinates,zoom})=>{setPlaying(false);setMode('select');cancelMarkerPlacement();mapRef.current?.flyTo({center:coordinates,zoom,duration:900});}} /> }<button className="map-pill map-source-button" onClick={() => setMapSettingsOpen(!mapSettingsOpen)} aria-expanded={mapSettingsOpen}><span className="satellite-icon">▧</span><span>MAPA: {mapProvider === 'osm' ? 'OPENSTREETMAP' : mapProvider === 'pnoa' ? 'PNOA · IGN' : 'GEOEUSKADI'}</span><span className="pill-divider" /><span>⚙</span></button>{<button className={`map-tool ${mode === 'add' ? 'active' : ''}`} onClick={() => {
            setMode(mode === 'add' ? 'select' : 'add');
            setPlaying(false);
          }}><span>＋</span> Añadir punto</button>}<button className="map-tool offline-map-button" onClick={downloadOfflineArea} disabled={offlineDownloading || !offlineAllowed(mapProvider)} title={!offlineAllowed(mapProvider) ? 'La descarga offline está disponible con geoEuskadi y PNOA' : ''}><span>⇩</span> {offlineDownloading ? 'Guardando zona…' : 'Guardar zona offline'}</button></div>
        {""}{mapSettingsOpen && <div className="map-settings-card"><div className="map-settings-heading"><strong>Fuente del mapa</strong><button aria-label="Cerrar configuración del mapa" onClick={() => setMapSettingsOpen(false)}>×</button></div><div className="map-provider-options"><button className={mapProvider === 'geoEuskadi' ? 'selected' : ''} onClick={() => selectMapProvider('geoEuskadi')}>GeoEuskadi <small>Ortofoto de Euskadi · sin token</small></button><button className={mapProvider === 'pnoa' ? 'selected' : ''} onClick={() => selectMapProvider('pnoa')}>PNOA · IGN <small>{t('Ortoargazkia · doakoa · gakorik gabe', 'Ortofoto · gratuito · sin clave')}</small></button><button className={mapProvider === 'osm' ? 'selected' : ''} onClick={() => selectMapProvider('osm')}>OpenStreetMap <small>{t('Kale-mapa · doakoa · gakorik gabe', 'Calles · gratuito · sin clave')}</small></button></div><small className="map-provider-help">{t('Doako mapak: geoEuskadi, PNOA eta OpenStreetMap.', 'Mapas gratuitos: geoEuskadi, PNOA y OpenStreetMap.')}</small>{mapProvider === 'osm' && <p className="map-provider-help">{t('Kale-mapa, ortoargazkirik gabe. Zonak deskargatzea ez dago baimenduta.', 'Mapa de calles. Sin descarga de zonas offline. Las grabaciones mantienen la atribución del mapa.')} <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener">{t('Mapa-akats baten berri eman', 'Comunicar un error del mapa')}</a></p>}{false}{false}</div>}
        {offlineMessage && <div className="offline-map-status" role="status">{offlineMessage}</div>}
        <div className="map-bottom-left"><span className="north">N</span><span className="scale-line" /><span>{rasterLabel(mapProvider)}</span></div>
        {mapReady && <div className="map-hint">{placingMarker ? <><b>＋</b> Haz clic en el mapa para colocar la señal <button onClick={cancelMarkerPlacement}>{t("Utzi", "Cancelar")}</button></> : mode === 'add' ? <><b>＋</b> Haz clic en el mapa para marcar el siguiente punto</> : <><b>⌘</b> Desplaza y acerca el mapa · Selecciona una ruta</>}</div>}
        {playing && <div className="flight-badge"><span className="pulse-dot" /> {'VUELO EN DIRECTO'} <span>·</span> {activeRoute?.name}</div>}
      </section>
    </section>

    {markerDialog && <div className="modal-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget) setMarkerDialog(null);
    }}><form className="marker-dialog" onSubmit={event => {
        event.preventDefault();
        markerDialog.editingId ? saveMarkerChanges() : beginMarkerPlacement();
      }}>
      <div className="marker-dialog-heading"><div><p className="eyebrow">NUEVO MARCADOR · {activeRoute?.name}</p><h2>{markerDialog.editingId ? 'Editar punto conflictivo' : 'Añadir punto conflictivo'}</h2></div><button type="button" className="marker-dialog-close" onClick={() => setMarkerDialog(null)} aria-label="Cerrar">×</button></div>
      <label htmlFor="marker-signal-type">Señal del catálogo</label>
      <select id="marker-signal-type" className="marker-dialog-input" value={markerDialog.draft.signalCode} onChange={event => {
          const signalCode = event.target.value;
          const selectedSignal = signalDefinition(signalCode);
          setMarkerDialog(previous => ({
            ...previous,
            draft: {
              ...previous.draft,
              signalCode,
              title: selectedSignal.name,
              destinations: selectedSignal.kind === 'direction' ? previous.draft.destinations?.length ? previous.draft.destinations : defaultMarkerDraft(activeId).destinations : previous.draft.destinations
            }
          }));
        }}>
        <optgroup label="Señales de dirección">{SIGNAL_CATALOG.filter(signal => signal.kind === 'direction').map(signal => <option key={signal.code} value={signal.code}>{signal.code} · {signal.name}</option>)}</optgroup>
        <optgroup label="Regulación, peligro e indicación">{SIGNAL_CATALOG.filter(signal => signal.kind !== 'direction').map(signal => <option key={signal.code} value={signal.code}>{signal.code} · {signal.name}</option>)}</optgroup>
      </select>
      <div className="marker-preview"><div className="marker-preview-copy"><span>VISTA PREVIA</span><strong>{markerDialog.draft.signalCode} · {signalDefinition(markerDialog.draft.signalCode).name}</strong></div><SignalFace marker={markerDialog.draft} /></div>
      {signalDefinition(markerDialog.draft.signalCode).kind === 'direction' && <>
        <div className="marker-form-section-title"><strong>Texto de la señal</strong><small>El formato se adapta al modelo seleccionado.</small></div>
        {markerDialog.draft.signalCode === 'S-220a' && <label className="marker-field-label">Distancia <input className="marker-dialog-input" maxLength={20} value={markerDialog.draft.distance || ''} onChange={event => updateMarkerDraft('distance', event.target.value)} placeholder="500 m" /></label>}
        <div className="marker-destination-fields">{(markerDialog.draft.destinations || []).map((destination, index) => <div className="marker-destination-field" key={index}><input className="marker-dialog-input" maxLength={32} value={destination.text} onChange={event => {
                const destinations = markerDialog.draft.destinations.map((item, itemIndex) => itemIndex === index ? {
                  ...item,
                  text: event.target.value
                } : item);
                updateMarkerDraft('destinations', destinations);
              }} placeholder={`Destino ${index + 1}`} aria-label={`Texto del destino ${index + 1}`} /><select className="marker-dialog-input marker-arrow-select" value={destination.arrow} onChange={event => {
                const destinations = markerDialog.draft.destinations.map((item, itemIndex) => itemIndex === index ? {
                  ...item,
                  arrow: event.target.value
                } : item);
                updateMarkerDraft('destinations', destinations);
              }} aria-label={`Dirección del destino ${index + 1}`}>{ARROWS.map(arrow => <option key={arrow.value} value={arrow.value}>{arrow.icon} {arrow.label}</option>)}</select><button type="button" onClick={() => updateMarkerDraft('destinations', markerDialog.draft.destinations.filter((_, itemIndex) => itemIndex !== index))} disabled={markerDialog.draft.destinations.length <= 1} aria-label={`Quitar destino ${index + 1}`}>×</button></div>)}</div>
        <button type="button" className="add-destination-button" onClick={() => updateMarkerDraft('destinations', [...(markerDialog.draft.destinations || []), {
            text: '',
            arrow: 'right'
          }])}>＋ Añadir destino</button>
      </>}
      {signalDefinition(markerDialog.draft.signalCode).kind === 'speed' && <label className="marker-field-label">Velocidad máxima <input className="marker-dialog-input" type="number" min="10" max="120" step="10" required placeholder="km/h" value={markerDialog.draft.speed || ''} onChange={event => updateMarkerDraft('speed', event.target.value)} /></label>}
      <label className="marker-field-label">Nombre para identificar el marcador <input className="marker-dialog-input" maxLength={50} value={markerDialog.draft.title || ''} onChange={event => updateMarkerDraft('title', event.target.value)} placeholder={signalDefinition(markerDialog.draft.signalCode).name} /></label>
      <label className="marker-field-label">Explicación para el alumnado <textarea className="marker-dialog-input marker-description-input" maxLength={180} rows={3} value={markerDialog.draft.description || ''} onChange={event => updateMarkerDraft('description', event.target.value)} placeholder="¿Qué deben observar los alumnos en este punto?" /></label>
      <label className="marker-field-label">Asociar a trayectoria <select className="marker-dialog-input" value={markerDialog.draft.routeId} onChange={event => updateMarkerDraft('routeId', event.target.value)}>{routes.map(route => <option key={route.id} value={route.id}>{route.name}</option>)}</select></label>
      <label className="marker-video-toggle"><input type="checkbox" checked={markerDialog.draft.showInVideo !== false} onChange={event => updateMarkerDraft('showInVideo', event.target.checked)} /><span><strong>Mostrar durante el vídeo</strong><small>La señal y la explicación aparecen al llegar a este punto.</small></span></label>
      <div className="marker-dialog-actions"><button type="button" onClick={() => setMarkerDialog(null)}>{t("Utzi", "Cancelar")}</button>{markerDialog.editingId && <button type="button" className="marker-reposition-button" onClick={beginMarkerPlacement}>Reubicar</button>}<button type="submit" className="marker-primary-button">{markerDialog.editingId ? 'Guardar cambios' : recording && !playing ? 'Añadir en este punto' : 'Colocar en el mapa'}</button></div>
    </form></div>}
    {nameDialog && <div className="modal-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget) setNameDialog(null);
    }}><form className="name-dialog" onSubmit={saveNameDialog}>
      <p className="eyebrow">{nameDialog.kind === 'route' ? 'TRAYECTORIA' : 'PROYECTO'}</p>
      <h2>{nameDialog.kind === 'project-new' ? 'Crear proyecto' : 'Cambiar nombre'}</h2>
      <label htmlFor="name-dialog-input">Nombre</label>
      <input id="name-dialog-input" autoFocus maxLength={60} value={nameDialog.value} onChange={event => setNameDialog(previous => ({
          ...previous,
          value: event.target.value
        }))} placeholder="Escribe un nombre" />
      <div className="dialog-actions"><button type="button" onClick={() => setNameDialog(null)}>{t("Utzi", "Cancelar")}</button><button type="submit" disabled={!nameDialog.value.trim()}>Guardar</button></div>
    </form></div>}
  </main>;
}
