import { rasterTileUrl, rasterName } from './mapTiles.js';
import { readStudents, migrateStudents } from './students.js';
import { studentUsesEntry, assignLibraryEntry, usesEntry } from './libraryStudents.js';
import React, { useEffect, useMemo, useRef, useState } from 'react';
const world = ([lon, lat], z) => {
  const s = 256 * 2 ** z,
    phi = Math.max(-85, Math.min(85, lat)) * Math.PI / 180;
  return [(lon + 180) / 360 * s, (1 - Math.asinh(Math.tan(phi)) / Math.PI) / 2 * s];
};
export function coverGeometry(coordinates, provider = 'geoEuskadi') {
  let valid = coordinates.filter(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite));
  if (!valid.length) return null;
  const step = Math.max(1, Math.ceil(valid.length / 1200));
  valid = valid.filter((_, i) => i % step === 0 || i === valid.length - 1);
  let z = 17;
  for (; z > 2; z--) {
    const p = valid.map(c => world(c, z)),
      xs = p.map(c => c[0]),
      ys = p.map(c => c[1]);
    if (Math.max(...xs) - Math.min(...xs) < 310 && Math.max(...ys) - Math.min(...ys) < 145) break;
  }
  const points = valid.map(c => world(c, z));
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(x, minX);
    maxX = Math.max(x, maxX);
    minY = Math.min(y, minY);
    maxY = Math.max(y, maxY);
  }
  const left = (minX + maxX) / 2 - 180,
    top = (minY + maxY) / 2 - 100,
    tiles = [];
  for (let y = Math.floor(top / 256); y <= Math.floor((top + 200) / 256); y++) for (let x = Math.floor(left / 256); x <= Math.floor((left + 360) / 256); x++) tiles.push({
    x: x * 256 - left,
    y: y * 256 - top,
    url: rasterTileUrl(provider, z, x, y)
  });
  const stride = Math.max(1, Math.ceil(points.length / 1200)),
    sample = points.filter((_, i) => i % stride === 0 || i === points.length - 1);
  return {
    tiles,
    points: sample.map(([x, y]) => [x - left, y - top]),
    project: c => {
      const [x, y] = world(c, z);
      return [x - left, y - top];
    }
  };
}
function Cover({
  entry,
  language,
  provider
}) {
  const g = useMemo(() => coverGeometry(entry.coordinates, provider), [entry.coordinates, provider]);
  return <div className="library-cover"><svg viewBox="0 0 360 200" role="img" aria-label={entry.name} preserveAspectRatio="xMidYMid slice"><rect width="360" height="200" fill="#dce8dd" />{g?.tiles.map(tile => <image onLoad={e => e.currentTarget.dataset.loaded = "true"} key={tile.url} href={tile.url} x={tile.x} y={tile.y} width="256" height="256" />)}{g && <><polyline points={g.points.map(p => p.join(',')).join(' ')} fill="none" stroke="white" strokeWidth="6" strokeLinejoin="round" /><polyline points={g.points.map(p => p.join(',')).join(' ')} fill="none" stroke={entry.color || '#ee8543'} strokeWidth="3" strokeLinejoin="round" />{(entry.criticalCoordinates || []).slice(0, 100).map((c, i) => {
          const p = g.project(c);
          return <circle key={`critical-${i}`} cx={p[0]} cy={p[1]} r="4" fill="#c44236" stroke="white" strokeWidth="1.5" />;
        })}{[g.points[0], g.points.at(-1)].map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="5" fill={i ? '#c44236' : '#2d7851'} stroke="white" strokeWidth="2" />)}</>}</svg><small className="library-map-credit">© {rasterName(provider)}</small>{entry.video && <span className="library-video-badge">▶ {language === 'eu' ? 'GPX + bideoa' : 'GPX + vídeo'}</span>}</div>;
}
export default function RouteLibrary({
  mapProvider = 'geoEuskadi',
  entries,
  language,
  onClose,
  onOpen,
  onDelete,
  onBackups,
  busy,
  onNew,
  onNavigate,
  onLanguage,
  error
}) {
  const [students, setStudents] = useState(() => Object.values(migrateStudents().students)),
    [studentId, setStudentId] = useState(''),
    [assignment, setAssignment] = useState(null),
    [targets, setTargets] = useState({}),
    [assignError, setAssignError] = useState(''),
    [notice, setNotice] = useState('');
  useEffect(() => {
    const refresh = () => setStudents(Object.values(readStudents().students));
    window.addEventListener('basurto-premium:students-changed', refresh);
    return () => window.removeEventListener('basurto-premium:students-changed', refresh);
  }, []);
  const classes = student => Object.entries(student.permits).flatMap(([permit, p]) => p.history.map(c => ({
    studentId: student.id,
    permit,
    classId: c.id,
    date: c.date,
    name: c.route
  }))).sort((a, b) => b.date.localeCompare(a.date));
  const matched = e => !studentId || students.some(s => s.id === studentId && studentUsesEntry(s, e));
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const t = (eu, es) => language === 'eu' ? eu : es;
  const [tab, setTab] = useState('reviews'),
    [query, setQuery] = useState(''),
    [sort, setSort] = useState('recent'),
    [limit, setLimit] = useState(24);
  useEffect(() => setLimit(24), [tab, query, sort, studentId]);
  useEffect(() => {
    const previous = document.activeElement;
    const siblings = [document.querySelector('.workspace'), document.querySelector('.topbar')].filter(Boolean);
    siblings.forEach(e => e.inert = true);
    const key = e => {
      if (e.key === 'Escape' && !busyRef.current) {
        if (assignment) setAssignment(null);else onClose();
      }
      if (e.key === 'Tab') {
        const scope = document.querySelector(assignment ? '.library-assign' : '.route-library');
        const buttons = [...scope.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')].filter(e => e.getClientRects().length);
        const first = buttons[0],
          last = buttons.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    const background = assignment ? [...document.querySelectorAll('.library-main,.library-nav')] : [];
    background.forEach(e => e.inert = true);
    document.querySelector(assignment ? '.library-assign input:not(:disabled)' : '.route-library input')?.focus();
    return () => {
      background.forEach(e => e.inert = false);
      document.removeEventListener('keydown', key);
      siblings.forEach(e => e.inert = false);
      previous?.focus?.();
    };
  }, [!!assignment]);
  const showStudents = () => {
    setTab('students');
    setStudentId('');
    setQuery('');
  };
  const showKind = kind => {
    setTab(kind);
    setStudentId('');
    setQuery('');
  };
  const selectedStudent = students.find(s => s.id === studentId);
  const filtered = entries.filter(e => (tab === 'students' || e.kind === tab) && matched(e) && `${e.name} ${e.projectName || ''} ${students.filter(s => studentUsesEntry(s, e)).map(s => s.name).join(' ')}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : (b.openedAt || b.date || 0) - (a.openedAt || a.date || 0) || a.name.localeCompare(b.name));
  const recent = entries.filter(e => e.kind === 'routes' && matched(e)).sort((a, b) => (b.openedAt || b.date || 0) - (a.openedAt || a.date || 0)).slice(0, 3);
  const card = e => <article className="library-card" key={e.key}><button className="library-cover-open" disabled={busy} onClick={() => onOpen(e)} aria-label={`${t('Ireki', 'Abrir')} ${e.name}`}><Cover entry={e} language={language} provider={['google', 'osm'].includes(mapProvider) ? 'pnoa' : mapProvider} /></button><div className="library-card-footer"><div><h3>{e.name}</h3><p>{e.projectName}{students.some(s => studentUsesEntry(s, e)) ? ` · ${students.filter(s => studentUsesEntry(s, e)).map(s => s.name).join(', ')}` : ''}</p><small>{e.kind === 'routes' ? t('Ibilbidea', 'Trayectoria') : e.video ? t('GPX + bideoa', 'GPX + vídeo') : 'GPX'}{e.minutes ? ` · ${e.minutes} min` : ''} · {e.incidents} {t('gatazka-puntu', 'puntos críticos')}</small></div><div className="library-card-actions"><button className="library-open" disabled={busy} onClick={() => onOpen(e)}>{t('Ireki', 'Abrir')}</button><button className="library-delete" disabled={busy} aria-label={`${t("Ezabatu", "Eliminar")} ${e.name}`} onClick={() => onDelete(e)}>{t("Ezabatu", "Eliminar")}</button></div></div></article>;
  return <section className="route-library" role="dialog" aria-modal="true" aria-label={t('Liburutegia', 'Biblioteca')}><aside className="library-nav"><strong>⌁ Basurto Recorridos</strong><button className={tab === 'reviews' ? 'selected' : ''} onClick={() => showKind('reviews')}>▤ {t('Liburutegia', 'Biblioteca')}</button><button className={tab === 'routes' ? 'selected' : ''} onClick={() => showKind('routes')}>⌁ {t('Ibilbideak', 'Trayectorias')}</button><button disabled={busy} onClick={() => onNavigate('gpx-review')}>▶ GPX + {t('bideoa', 'vídeo')}</button><button disabled={busy} onClick={onBackups}>▣ {t("Segurtasun-kopiak", "Copias de seguridad")}</button><label>Hizkuntza / Idioma<select aria-label="Idioma de la biblioteca" value={language} onChange={e => onLanguage(e.target.value)}><option value="eu">Euskara</option><option value="es">Castellano</option></select></label></aside><div className="library-main"><header><h1>{t('Liburutegia', 'Biblioteca')}</h1><button disabled={busy} onClick={onClose}>{t('Mapara itzuli', 'Volver al mapa')}</button></header><div className="library-heading"><div><h2>{t('Zure ibilbideak, eskura', 'Tus recorridos, a mano')}</h2><p>{t('Ireki gordetako ibilbide edo saio bat.', 'Abre una ruta o continúa una trayectoria guardada.')}</p></div><div className="library-search"><input aria-label={tab === 'students' && !studentId ? t('Ikaslea bilatu', 'Buscar alumno') : t('Izenaren arabera bilatu', 'Buscar por nombre')} placeholder={tab === 'students' && !studentId ? t('Ikaslea bilatu…', 'Buscar alumno…') : t('Izenaren arabera bilatu…', 'Buscar por nombre…')} value={query} onChange={e => setQuery(e.target.value)} /><select aria-label={t('Ordenatu', 'Ordenar')} value={sort} onChange={e => setSort(e.target.value)}><option value="recent">{t('Azkenak', 'Más recientes')}</option><option value="name">{t('Izena', 'Nombre')}</option></select>{tab === 'students' ? null : <button disabled={busy} onClick={() => onNew(tab === 'routes' ? 'routes' : 'gpx-review')}>＋ {t('Berria', 'Nuevo')}</button>}</div></div>{notice && <p role="status">{notice}</p>}<div className="library-tabs" role="tablist"><button role="tab" aria-selected={tab === 'reviews'} onClick={() => showKind('reviews')}>{t('Gordetako ibilbideak', 'Rutas guardadas')} <span>{entries.filter(e => e.kind === 'reviews').length}</span></button><button role="tab" aria-selected={tab === 'routes'} onClick={() => showKind('routes')}>{t('Ibilbideak', 'Trayectorias')} <span>{entries.filter(e => e.kind === 'routes').length}</span></button></div>{busy && <p role="status">{t("Liburutegia eguneratzen…", "Actualizando biblioteca…")}</p>}{error && <p role="status">{error}</p>}{tab === 'students' && !studentId ? <><div className="library-students-heading"><h2>{t('Ikasleak', 'Alumnos')}</h2><p>{t('Hautatu ikaslea bere ibilbideak ikusteko.', 'Selecciona un alumno para ver sus recorridos y trayectorias.')}</p></div><div className="library-students-grid">{students.filter(s => s.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => a.name.localeCompare(b.name)).map(student => {
            const linked = entries.filter(e => studentUsesEntry(student, e));
            return <button className="library-student-card" key={student.id} onClick={() => {
              setStudentId(student.id);
              setQuery('');
            }}><span className="library-student-avatar" aria-hidden="true">{student.name.trim().slice(0, 1).toLocaleUpperCase()}</span><strong>{student.name}</strong><small>{linked.filter(e => e.kind === 'reviews').length} {t('ibilbide', 'recorridos')} · {linked.filter(e => e.kind === 'routes').length} {t('trazadura', 'trayectorias')}</small><span>{t('Ireki', 'Ver recorridos')} →</span></button>;
          })}</div>{!students.length && <p>{t('Oraindik ez dago ikaslerik.', 'Todavía no hay alumnos dados de alta.')}</p>}{students.length > 0 && !students.some(s => s.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())) && <p>{t('Ez da ikaslerik aurkitu.', 'No hay alumnos para esa búsqueda.')}</p>}</> : <>{tab === 'students' && selectedStudent && <div className="library-student-detail"><h2>{selectedStudent.name}</h2></div>}{tab === 'students' ? ['reviews', 'routes'].map(kind => <section className="library-student-routes" key={kind}><h3>{kind === 'reviews' ? t('Esleitutako ibilbideak', 'Recorridos asignados') : t('Esleitutako trazadurak', 'Trayectorias asignadas')}</h3><div className="library-grid">{filtered.slice(0, limit).filter(e => e.kind === kind).map(card)}</div>{!filtered.some(e => e.kind === kind) && <p>{t('Ez dago esleitutako elementurik.', 'No hay elementos asignados.')}</p>}</section>) : <div className="library-grid">{filtered.slice(0, limit).map(card)}</div>}{filtered.length > limit && <button className="library-open library-more" onClick={() => setLimit(limit + 24)}>{t("Gehiago erakutsi", "Mostrar más")}</button>}{!filtered.length && tab !== 'students' && <p className="library-empty">{query ? t('Ez da emaitzarik aurkitu.', 'No hay resultados para esa búsqueda.') : t('Oraindik ez dago gordetako ibilbiderik. Inportatu GPX bat edo marraztu ibilbide bat.', 'Todavía no hay recorridos guardados. Importa un GPX o dibuja una trayectoria.')}</p>}</>}{tab === 'reviews' && !query && !studentId && recent.length > 0 && <section className="library-recent"><h2>{t('Azken ibilbideak', 'Trayectorias recientes')}</h2><div className="library-grid">{recent.map(card)}</div></section>}</div>{assignment && <div className="library-assign-overlay"><form className="library-assign" aria-label={t('Ikasleei esleitu', 'Asignar a alumnos')} onSubmit={e => {
        e.preventDefault();
        try {
          const selected = Object.entries(targets).filter(([, v]) => v).map(([id, value]) => value === 'student' ? {
            studentId: id
          } : classes(students.find(s => s.id === id)).find(c => `${c.permit}:${c.classId}` === value));
          if (!selected.length || selected.some(c => !c)) throw Error(t('Hautatu ikasle bat.', 'Selecciona al menos un alumno.'));
          assignLibraryEntry(assignment, selected);
          setNotice(t('Ibilbidea esleituta, bikoiztu gabe.', 'Recorrido asignado, sin duplicarlo.'));
          setAssignment(null);
        } catch (err) {
          setAssignError(err.message);
        }
      }}><h2>{t('Ikasleei esleitu', 'Asignar a alumnos')}</h2><strong>{assignment.name}</strong><p>{t('Aukeratu ikasleak. Klasea aukerakoa da.', 'Elige los alumnos. Puedes vincular también una clase, si quieres.')}</p><div className="library-assignees">{students.slice().sort((a, b) => a.name.localeCompare(b.name)).map(student => {
            const options = classes(student);
            return <div className="library-assignee" key={student.id}><label><input type="checkbox" checked={!!targets[student.id]} onChange={e => setTargets({
                  ...targets,
                  [student.id]: e.target.checked ? 'student' : ''
                })} />{student.name}</label>{options.length ? <select aria-label={`${t('Klasea', 'Clase de')} ${student.name}`} disabled={!targets[student.id]} value={targets[student.id] || 'student'} onChange={e => setTargets({
                ...targets,
                [student.id]: e.target.value
              })}><option value="student">{t('Ikasleari · klaserik gabe', 'Al alumno · sin clase')}</option>{options.map(c => <option key={`${c.permit}:${c.classId}`} value={`${c.permit}:${c.classId}`}>{c.date} · {c.permit}{c.name ? ` · ${c.name}` : ''}{student.permits[c.permit].history.find(x => x.id === c.classId)?.rutas?.some(r => usesEntry(r, assignment)) ? ` · ✓` : ''}</option>)}</select> : <small>{t('Ikasleari zuzenean esleituko zaio.', 'Se asignará directamente al alumno.')}</small>}</div>;
          })}{!students.length && <p>{t('Sortu ikasleak lehenik.', 'Crea los alumnos primero.')}</p>}</div>{assignError && <p role="alert">{assignError}</p>}<div className="library-assign-actions"><button type="button" onClick={() => setAssignment(null)}>{t('Utzi', 'Cancelar')}</button><button type="submit" disabled={!Object.values(targets).some(Boolean)}>{t('Esleitu', 'Asignar')}</button></div></form></div>}</section>;
}
