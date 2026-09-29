import { colorScale, palette } from './viewer.js';

const WIDTH = 1800;
const HEIGHT = 1350;

function project([lon, lat]) {
  const latitude = Math.max(-85, Math.min(85, lat)) * Math.PI / 180;
  return [lon * Math.PI / 180, Math.log(Math.tan(Math.PI / 4 + latitude / 2))];
}

function polygons(geometry) {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

function mapTransform(features) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const feature of features) {
    for (const polygon of polygons(feature.geometry)) {
      for (const ring of polygon) {
        for (const coordinate of ring) {
          const [x, y] = project(coordinate);
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
      }
    }
  }
  if (!Number.isFinite(minX)) throw new Error('PNG로 저장할 경계가 없습니다.');
  const left = 70, right = WIDTH - 70, top = 156, bottom = 1110;
  const scale = Math.min((right - left) / (maxX - minX), (bottom - top) / (maxY - minY));
  const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
  return coordinate => {
    const [x, y] = project(coordinate);
    return [WIDTH / 2 + (x - centerX) * scale, (top + bottom) / 2 - (y - centerY) * scale];
  };
}

function drawFeature(ctx, feature, toPixel, fill) {
  for (const polygon of polygons(feature.geometry)) {
    ctx.beginPath();
    for (const ring of polygon) {
      ring.forEach((coordinate, index) => {
        const [x, y] = toPixel(coordinate);
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
    }
    ctx.fillStyle = fill;
    ctx.fill('evenodd');
    ctx.strokeStyle = '#36505b';
    ctx.lineWidth = 1.7;
    ctx.stroke();
  }
}

export async function createPNG({ geojson, values, title, subtitle, source = '입력 CSV', level }) {
  const features = geojson.features;
  const toPixel = mapTransform(features);
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH; canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('브라우저에서 PNG 캔버스를 만들지 못했습니다.');
  const scale = colorScale(values);

  // Leave all pixels outside the boundaries transparent.
  ctx.fillStyle = '#142b38';
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.fillText(title, 70, 66);
  ctx.font = '26px system-ui, sans-serif';
  ctx.fillStyle = '#526570';
  ctx.fillText(subtitle, 70, 110);

  for (const feature of features) {
    drawFeature(ctx, feature, toPixel, scale.color(values[feature.properties.code]));
  }
  if (level === 'gu' || features.length <= 30) {
    ctx.font = 'bold 19px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#183846';
    for (const feature of features) {
      if (!feature.properties.labelPoint) continue;
      const [x, y] = toPixel(feature.properties.labelPoint);
      ctx.strokeText(feature.properties.name, x, y);
      ctx.fillText(feature.properties.name, x, y);
    }
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }

  const legendY = 1160;
  ctx.font = '22px system-ui, sans-serif';
  ctx.fillStyle = '#142b38';
  ctx.fillText('범례', 70, legendY);
  const buckets = scale.valid.length ? (scale.span === 0 ? [2] : [0, 1, 2, 3, 4]) : [];
  const slots = [...buckets, 'missing'];
  const slotWidth = (WIDTH - 140) / slots.length;
  slots.forEach((bucket, index) => {
    const x = 70 + index * slotWidth;
    ctx.fillStyle = bucket === 'missing' ? '#c9d0d3' : palette[bucket];
    ctx.fillRect(x, legendY + 20, 32, 24);
    ctx.fillStyle = '#405b68';
    ctx.font = '19px system-ui, sans-serif';
    const label = bucket === 'missing' ? '자료 없음' : scale.span === 0 ? scale.number(scale.min) :
      `${scale.number(scale.min + scale.span * bucket / 5)}–${scale.number(bucket === 4 ? scale.max : scale.min + scale.span * (bucket + 1) / 5)}`;
    ctx.fillText(label, x + 42, legendY + 40);
  });
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillStyle = '#657985';
  ctx.fillText(`경계: 국가데이터처 SGIS (2025-06-30) · 통계: ${source}`, 70, HEIGHT - 50);

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG 파일을 생성하지 못했습니다.');
  return blob;
}
