export const palette = ['#d8ecf5', '#a5d3e5', '#6bb4d2', '#348eae', '#12627f'];

export function colorScale(values, unit = '') {
  const valid = Object.values(values).filter(x => typeof x === 'number' && Number.isFinite(x));
  const min = valid.length ? Math.min(...valid) : 0;
  const max = valid.length ? Math.max(...valid) : 0;
  const span = max - min;
  return {
    valid, min, max, span,
    color: value => value == null ? '#c9d0d3' : palette[span === 0 ? 2 : Math.min(4, Math.floor((value - min) / span * 5))],
    number: value => value == null ? '자료 없음' : `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 }).format(value)}${unit}`
  };
}

export function renderMap({ element, legend, geojson, values, attributes = {}, title, subtitle, year, metric, level, unit = '' }) {
  if (!globalThis.L) throw new Error('지도 라이브러리를 불러오지 못했습니다. 파일을 다시 열어 주세요.');
  const { valid, min, max, span, color, number } = colorScale(values, unit);
  if (element._map) { element._map.remove(); element._map = null; }
  const map = L.map(element, { scrollWheelZoom: true, zoomControl: true });
  element._map = map;
  const regionInfo = feature => {
    const info = document.createElement('div'); info.className = 'region-info';
    const heading = document.createElement('strong'); heading.textContent = feature.properties.name;
    const context = document.createElement('div'); context.className = 'region-context';
    context.textContent = `${level === 'dong' ? `${feature.properties.guName} · ` : ''}${year === '연도 미상' ? year : `${year}년`} 속성`;
    info.append(heading, context);
    const records = [...(attributes[feature.properties.code] || [])];
    records.sort((a, b) => Number(b.metric === metric) - Number(a.metric === metric));
    if (!records.length) records.push({ metric, label: metric || '선택 지표', value: values[feature.properties.code] ?? null });
    for (const record of records) {
      const row = document.createElement('div');
      row.className = `region-row${record.metric === metric ? ' selected' : ''}`;
      const label = document.createElement('span'); label.textContent = record.label;
      const value = document.createElement('b'); value.textContent = number(record.value);
      row.append(label, value); info.append(row);
    }
    return info;
  };
  const layer = L.geoJSON(geojson, {
    style: f => ({ color: '#36505b', weight: 0.8, opacity: 0.8, fillColor: color(values[f.properties.code]), fillOpacity: 0.83 }),
    onEachFeature: (f, polygon) => {
      polygon.bindPopup(regionInfo(f));
      polygon.bindTooltip(regionInfo(f), { sticky: true, opacity: 1, className: 'region-tooltip' });
      polygon.on('mouseover', () => polygon.setStyle({ weight: 2.2, color: '#083c52' }));
      polygon.on('mouseout', () => layer.resetStyle(polygon));
    }
  }).addTo(map);
  if (layer.getBounds().isValid()) map.fitBounds(layer.getBounds(), { padding: [12, 12] });
  legend.replaceChildren();
  const heading = document.createElement('strong'); heading.textContent = title;
  const sub = document.createElement('span'); sub.textContent = subtitle;
  legend.append(heading, sub);
  const items = document.createElement('div'); items.className = 'legend-items';
  if (valid.length) {
    (span === 0 ? [2] : [0, 1, 2, 3, 4]).forEach(i => {
      const row = document.createElement('div');
      const swatch = document.createElement('i'); swatch.style.background = palette[i];
      const label = document.createElement('span');
      label.textContent = span === 0 ? number(min) : `${number(min + span * i / 5)} ~ ${number(i === 4 ? max : min + span * (i + 1) / 5)}`;
      row.append(swatch, label); items.append(row);
    });
  }
  const empty = document.createElement('div');
  const swatch = document.createElement('i'); swatch.style.background = '#c9d0d3';
  const label = document.createElement('span'); label.textContent = '자료 없음';
  empty.append(swatch, label); items.append(empty); legend.append(items);
  setTimeout(() => map.invalidateSize(), 0);
  return map;
}
