import { decodeCSV, fetchDriveCSV, readData, regionAttributes } from './data.js?v=palette-2';
import { renderMap } from './viewer.js?v=palette-2';
import { createPNG } from './png.js?v=palette-2';

const $ = id => document.getElementById(id);
const state = { data: null, name: '', gu: null, dong: null, names: null, map: null };
const escapeJSON = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

async function init() {
  try {
    const [gu, dong, names] = await Promise.all([
      fetch('./data/seoul-gu.geojson').then(checkedJSON),
      fetch('./data/seoul-dong.geojson').then(checkedJSON),
      fetch('./data/statistics.json').then(checkedJSON)
    ]);
    Object.assign(state, { gu, dong, names });
    const select = $('gu-filter');
    gu.features.forEach(f => { const option = new Option(f.properties.name, f.properties.code); select.add(option); });
    updateMap();
  } catch (error) { showError(`경계 데이터를 불러오지 못했습니다: ${error.message}`); }
}

function checkedJSON(response) { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }
function showError(message) { $('status').textContent = message; $('status').className = 'issue error'; }
function setBusy(busy) { $('load-drive').disabled = busy; $('sample').disabled = busy; $('load-drive').textContent = busy ? '불러오는 중…' : '불러오기'; }

function useText(text, name) {
  if (!state.gu || !state.dong) throw new Error('경계 데이터가 아직 준비되지 않았습니다.');
  const codes = new Set([...state.gu.features, ...state.dong.features].map(f => f.properties.code));
  const guNames = Object.fromEntries(state.gu.features.map(f => [f.properties.name, f.properties.code]));
  const parsed = readData(text, codes, guNames);
  if (parsed.invalid.length || parsed.duplicates.length) {
    state.data = null;
    refreshControls();
    showError('CSV에 수정할 행이 있습니다. 아래 세부 내용을 확인하세요.');
    displayIssues(parsed);
    return;
  }
  if (!parsed.records.length) throw new Error('지도에 연결할 수 있는 서울 지역 행이 없습니다.');
  state.data = parsed; state.name = name;
  const hasGu = parsed.records.some(r => r.code.length === 5);
  const hasDong = parsed.records.some(r => r.code.length === 8);
  $('level').value = hasGu ? 'gu' : (hasDong ? 'dong' : 'gu');
  $('gu-filter').value = 'all';
  $('year').replaceChildren(); $('metric').replaceChildren();
  $('source-name').textContent = name;
  $('status').className = '';
  $('status').textContent = `${parsed.records.length.toLocaleString()}개 값을 읽었습니다. ${parsed.format === 'wide' ? `자치구별 다중 지표 형식${parsed.inferredYear ? ` · 연도 ${parsed.inferredYear} 추정` : ' · 연도 미상'}` : (parsed.header ? '제목 있는 4열' : '제목 없는 4열')} 형식으로 해석했습니다.`;
  displaySample(parsed); displayIssues(parsed); refreshControls(); updateMap();
}

function displaySample(parsed) {
  const container = $('preview-table'); container.replaceChildren();
  const table = document.createElement('table');
  const tr = document.createElement('tr');
  parsed.columns.forEach(col => { const th = document.createElement('th'); th.textContent = col; tr.append(th); });
  table.append(tr);
  if (parsed.format === 'wide') {
    tr.replaceChildren();
    ['연도', '지역코드', '지표', '값'].forEach(col => { const th = document.createElement('th'); th.textContent = col; tr.append(th); });
  }
  parsed.records.slice(0, 3).forEach(record => {
    const row = document.createElement('tr');
    [record.year, record.code, record.metric, record.value ?? '결측'].forEach(value => {
      const td = document.createElement('td'); td.textContent = value; row.append(td);
    }); table.append(row);
  }); container.append(table);
}

function displayIssues(parsed) {
  const container = $('issues'); container.replaceChildren();
  const issues = [
    parsed.invalid.length && `형식 오류 ${parsed.invalid.length}건: ${parsed.invalid.slice(0, 6).join(' / ')}`,
    parsed.duplicates.length && `중복 행 ${parsed.duplicates.length}건: ${parsed.duplicates.slice(0, 6).join(' / ')}`,
    parsed.unmatched.length && `경계 미매칭 코드 ${parsed.unmatched.length}개: ${parsed.unmatched.join(', ')}`,
    parsed.excluded && `서울 외 지역·합계 ${parsed.excluded}행 제외`
  ].filter(Boolean);
  issues.forEach((message, i) => {
    const div = document.createElement('div');
    div.className = `issue ${i === 0 && (parsed.invalid.length || parsed.duplicates.length) ? 'error' : ''}`;
    div.textContent = message; container.append(div);
  });
}

function fillSelect(select, options, preferred) {
  select.replaceChildren();
  options.forEach(([value, label]) => select.add(new Option(label, value)));
  if (preferred && options.some(([value]) => value === preferred)) select.value = preferred;
  select.disabled = !options.length;
}

function refreshControls() {
  const records = state.data?.records || [];
  const oldYear = $('year').value, oldMetric = $('metric').value;
  const years = [...new Set(records.map(r => r.year))].sort().reverse();
  fillSelect($('year'), years.map(y => [y, y]), oldYear);
  const metrics = [...new Set(records.filter(r => r.year === $('year').value).map(r => r.metric))];
  fillSelect($('metric'), metrics.map(m => [m, state.names[m] ? `${state.names[m]} (${m})` : m]), oldMetric);
  $('level').disabled = !records.length;
  $('download').disabled = !records.length;
  $('download-png').disabled = !records.length;
  updateFilter();
}

function updateFilter() {
  $('gu-filter').disabled = !$('year').value || $('level').value !== 'dong';
  if ($('level').value !== 'dong') $('gu-filter').value = 'all';
}

function selection() {
  const level = $('level').value;
  const year = $('year').value;
  const metric = $('metric').value;
  const paletteName = $('palette').value;
  const guFilter = $('gu-filter').value;
  const collection = level === 'gu' ? state.gu : state.dong;
  const features = collection.features.filter(f => level === 'gu' || guFilter === 'all' || f.properties.guCode === guFilter);
  const featureCodes = new Set(features.map(f => f.properties.code));
  const rows = state.data?.records.filter(r => r.year === year && r.metric === metric && r.code.length === (level === 'gu' ? 5 : 8)) || [];
  const values = Object.fromEntries(rows.map(r => [r.code, r.value]));
  const attributes = regionAttributes(state.data?.records || [], year, featureCodes, state.names);
  const matched = features.filter(f => Object.hasOwn(values, f.properties.code)).length;
  const title = state.names?.[metric] ? `${state.names[metric]} · ${year}` : (metric ? `${metric} · ${year}` : '서울 통계 지도');
  const subtitle = `${level === 'gu' ? '자치구' : '행정동'} ${features.length}개 · 값이 있는 지역 ${features.filter(f => values[f.properties.code] != null).length}개 · 경계 2025-06-30`;
  return { geojson: { type: 'FeatureCollection', features }, values, attributes, title, subtitle, matched, total: features.length, year, metric, level, paletteName };
}

function updateMap() {
  if (!state.gu) return;
  const selected = selection();
  $('map-title').textContent = selected.title;
  $('map-subtitle').textContent = state.data ? selected.subtitle : 'CSV를 불러오면 지도에 값이 표시됩니다.';
  $('match-count').textContent = state.data ? `${selected.matched} / ${selected.total} 지역 매칭` : '준비됨';
  try { state.map = renderMap({ element: $('map'), legend: $('legend'), ...selected, showMissing: Boolean(state.data) }); }
  catch (error) { showError(error.message); }
  if (state.data && selected.matched === 0) {
    $('status').textContent = '선택한 연도·지표·지역 단위에 해당하는 CSV 값이 없습니다. 표시 단위를 바꿔 보세요.';
  }
  $('download').disabled = !state.data || selected.matched === 0;
  $('download-png').disabled = !state.data || selected.matched === 0;
}

async function downloadPNG() {
  const selected = selection();
  if (!selected.matched) return;
  const button = $('download-png');
  button.disabled = true;
  try {
    const blob = await createPNG({ ...selected, source: state.name });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `서울_${selected.level === 'gu' ? '자치구' : '행정동'}_${selected.metric}_${selected.year}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) { showError(`PNG 생성에 실패했습니다: ${error.message}`); }
  finally { button.disabled = false; }
}

async function downloadHTML() {
  const selected = selection();
  if (!selected.matched) return;
  try {
    const [css, viewer, leafletCSS, leafletJS] = await Promise.all([
      fetch('./style.css?v=palette-2').then(r => r.text()),
      fetch('./src/viewer.js?v=palette-2').then(r => r.text()),
      fetch('./vendor/leaflet/leaflet.css').then(r => r.text()),
      fetch('./vendor/leaflet/leaflet.js').then(r => r.text())
    ]);
    const payload = { ...selected, source: state.name };
    const safeTitle = selected.title.replace(/[<>"'&]/g, '');
    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle} | 서울 통계 지도</title><style>${leafletCSS}\n${css}</style></head><body><header class="topbar"><div class="brand"><span class="brand-mark">서울</span><span>통계 지도</span></div><span class="top-note">2025년 6월 행정동 경계</span></header><main><section class="map-panel"><div class="map-heading"><div><span class="eyebrow">SEOUL STATISTICS MAP</span><h2 id="map-title"></h2><p id="map-subtitle"></p></div></div><div id="map"></div><div id="legend" class="legend"></div><div class="map-foot" id="source"></div></section></main><script id="payload" type="application/json">${escapeJSON(payload)}</script><script>${leafletJS}</script><script>${viewer.replace(/^export /gm, '')}\nconst data=JSON.parse(document.getElementById('payload').textContent);document.getElementById('map-title').textContent=data.title;document.getElementById('map-subtitle').textContent=data.subtitle;document.getElementById('source').textContent='경계: 국가데이터처 SGIS, 2025-06-30 · 통계: '+data.source;renderMap({element:document.getElementById('map'),legend:document.getElementById('legend'),...data});<\/script></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `서울_${selected.level === 'gu' ? '자치구' : '행정동'}_${selected.metric}_${selected.year}.html`;
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) { showError(`HTML 생성에 실패했습니다: ${error.message}`); }
}

$('load-drive').addEventListener('click', async () => {
  setBusy(true);
  try {
    const { text, name } = await fetchDriveCSV($('drive-link').value.trim(), window.MAPS_DRIVE_API_KEY || '');
    useText(text, name);
  } catch (error) { showError(error.message); }
  finally { setBusy(false); }
});
$('csv-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try { useText(decodeCSV(await file.arrayBuffer()), file.name); }
  catch (error) { showError(error.message); }
});
$('sample').addEventListener('click', async () => {
  setBusy(true);
  try { const response = await fetch('./data/sample-population.csv?v=palette-2'); if (!response.ok) throw new Error('예시 파일을 읽을 수 없습니다.'); useText(await response.text(), '국가데이터처 SGIS · 2024년 총인구·평균나이 예시'); }
  catch (error) { showError(error.message); }
  finally { setBusy(false); }
});
$('year').addEventListener('change', () => { refreshControls(); updateMap(); });
$('metric').addEventListener('change', updateMap);
$('level').addEventListener('change', () => { updateFilter(); updateMap(); });
$('gu-filter').addEventListener('change', updateMap);
$('palette').addEventListener('change', updateMap);
$('download').addEventListener('click', downloadHTML);
$('download-png').addEventListener('click', downloadPNG);
init();
