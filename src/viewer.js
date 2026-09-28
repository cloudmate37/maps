export const palette = ['#d8ecf5', '#a5d3e5', '#6bb4d2', '#348eae', '#12627f'];

export function renderMap({ element, legend, geojson, values, title, subtitle, unit = '' }) {
  if (!globalThis.L) throw new Error('지도 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요.');
  const valid = Object.values(values).filter(x => typeof x === 'number' && Number.isFinite(x));
  const min = valid.length ? Math.min(...valid) : 0;
  const max = valid.length ? Math.max(...valid) : 0;
  const span = max - min;
  const color = value => value == null ? '#c9d0d3' : palette[span === 0 ? 2 : Math.min(4, Math.floor((value - min) / span * 5))];
  const number = value => value == null ? '자료 없음' : `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 }).format(value)}${unit}`;
  if (element._map) { element._map.remove(); element._map = null; }
  const map = L.map(element, { scrollWheelZoom: true, zoomControl: true });
  element._map = map;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18, attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  const layer = L.geoJSON(geojson, {
    style: f => ({ color: '#36505b', weight: 0.8, opacity: 0.8, fillColor: color(values[f.properties.code]), fillOpacity: 0.83 }),
    onEachFeature: (f, polygon) => {
      const popup = document.createElement('div');
      const name = document.createElement('strong'); name.textContent = f.properties.name;
      const detail = document.createElement('div'); detail.textContent = number(values[f.properties.code]);
      popup.append(name, detail); polygon.bindPopup(popup);
      polygon.bindTooltip(`${f.properties.name}: ${number(values[f.properties.code])}`);
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
