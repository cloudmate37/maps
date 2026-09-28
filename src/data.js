export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(x => x.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (quoted) throw new Error('CSV의 따옴표가 닫히지 않았습니다.');
  row.push(field);
  if (row.some(x => x.trim() !== '')) rows.push(row);
  return rows;
}

export function decodeCSV(buffer) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, ''); }
  catch { return new TextDecoder('euc-kr', { fatal: true }).decode(buffer).replace(/^\uFEFF/, ''); }
}

const missing = new Set(['', '-', '*', 'x', 'X', 'NA', 'N/A', 'null', '비공개', '결측']);
export function readData(text, knownCodes, guNames = {}) {
  const lines = parseCSV(text);
  if (!lines.length) throw new Error('CSV가 비어 있습니다.');
  const first = lines[0].map(x => x.trim());
  const header = !/^\d{4}$/.test(first[0]);
  const looksLong = first.length === 4 && (/연도|년도|year/i.test(first[0]) || /지역코드|adm.?cd|region.?code/i.test(first[1]));
  if (header && !looksLong) return readWide(lines, guNames);
  const columns = header ? first : ['연도', '지역코드', '지표코드', '값'];
  const records = [], invalid = [], unmatched = new Set(), seen = new Set(), duplicates = [];
  let excluded = 0;
  lines.slice(header ? 1 : 0).forEach((raw, index) => {
    const line = index + (header ? 2 : 1);
    if (raw.length !== 4) { invalid.push(`${line}행: 4열이 아닙니다.`); return; }
    const [year, code, metric, valueText] = raw.map(x => x.trim());
    if (!/^\d{4}$/.test(year) || !/^(?:\d{2}|\d{5}|\d{8})$/.test(code) || !metric) {
      invalid.push(`${line}행: 연도·지역코드·지표코드를 확인하세요.`); return;
    }
    if (!code.startsWith('11') || code === '11' || !knownCodes.has(code)) {
      if (code.startsWith('11') && code !== '11') unmatched.add(code);
      else excluded++;
      return;
    }
    const key = `${year}|${code}|${metric}`;
    if (seen.has(key)) { duplicates.push(`${line}행: ${key}`); return; }
    seen.add(key);
    let value = null;
    if (!missing.has(valueText)) {
      const normalized = valueText.replace(/,/g, '');
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
        invalid.push(`${line}행: 숫자 또는 결측 표시가 아닙니다.`); return;
      }
      value = Number(normalized);
      if (!Number.isFinite(value)) { invalid.push(`${line}행: 유효한 숫자가 아닙니다.`); return; }
    }
    records.push({ year, code, metric, value });
  });
  return { columns, header, records, invalid, unmatched: [...unmatched].sort(), duplicates, excluded, format: 'long' };
}

function readWide(lines, guNames) {
  const columns = lines[0].map(x => x.trim());
  const yearMatch = columns.join(' ').match(/(?:20)?(\d{2})\s*년/);
  const year = yearMatch ? `20${yearMatch[1]}` : '연도 미상';
  const records = [], invalid = [], duplicates = [], unmatched = new Set(), seen = new Set();
  let excluded = 0;
  lines.slice(1).forEach((raw, index) => {
    const line = index + 2;
    if (raw.length !== columns.length) { invalid.push(`${line}행: ${columns.length}열이 아닙니다.`); return; }
    const name = raw[0].trim();
    if (['서울', '서울시', '서울특별시', '합계', '전체'].includes(name)) { excluded++; return; }
    const code = guNames[name];
    if (!code) { unmatched.add(name); return; }
    columns.slice(1).forEach((metric, i) => {
      if (!metric) { invalid.push(`${line}행: 지표 열 제목이 비어 있습니다.`); return; }
      const key = `${year}|${code}|${metric}`;
      if (seen.has(key)) { duplicates.push(`${line}행: ${key}`); return; }
      seen.add(key);
      const valueText = raw[i + 1].trim();
      let value = null;
      if (!missing.has(valueText)) {
        const normalized = valueText.replace(/,/g, '').replace(/%$/, '').trim();
        if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
          invalid.push(`${line}행 ${metric}: 숫자 또는 결측 표시가 아닙니다.`); return;
        }
        value = Number(normalized);
      }
      records.push({ year, code, metric, value });
    });
  });
  return { columns, header: true, records, invalid, unmatched: [...unmatched].sort(), duplicates, excluded, format: 'wide', inferredYear: yearMatch ? year : null };
}

export function driveFile(link) {
  let url;
  try { url = new URL(link); } catch { throw new Error('올바른 Google Drive 공유 링크를 입력하세요.'); }
  if (!['drive.google.com', 'www.drive.google.com'].includes(url.hostname))
    throw new Error('drive.google.com의 CSV 공유 링크를 입력하세요.');
  const id = url.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/)?.[1] || url.searchParams.get('id');
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('공유 링크에서 파일 ID를 찾을 수 없습니다.');
  const resourceKey = url.searchParams.get('resourcekey') || url.searchParams.get('resourceKey');
  if (resourceKey && !/^[A-Za-z0-9_-]+$/.test(resourceKey)) throw new Error('잘못된 resource key입니다.');
  return { id, resourceKey };
}

export async function fetchDriveCSV(link, apiKey) {
  if (!apiKey) throw new Error('운영자가 Drive API 키를 설정해야 링크를 읽을 수 있습니다.');
  const { id, resourceKey } = driveFile(link);
  const headers = resourceKey ? { 'X-Goog-Drive-Resource-Keys': `${id}/${resourceKey}` } : {};
  const base = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`;
  let response;
  try {
    response = await fetch(`${base}?fields=id,name,mimeType,capabilities(canDownload)&key=${encodeURIComponent(apiKey)}`, { headers });
  } catch { throw new Error('Drive에 연결하지 못했습니다. 인터넷 연결과 브라우저의 요청 차단 설정을 확인하세요.'); }
  if (!response.ok) throw driveError(response.status);
  const info = await response.json();
  if (info.mimeType?.startsWith('application/vnd.google-apps.'))
    throw new Error('Google Sheets 문서 대신 Drive에 업로드한 CSV 파일을 사용하세요.');
  if (info.capabilities?.canDownload === false) throw new Error('파일 소유자가 다운로드를 제한했습니다.');
  try { response = await fetch(`${base}?alt=media&key=${encodeURIComponent(apiKey)}`, { headers }); }
  catch { throw new Error('CSV 다운로드 요청이 차단되었습니다.'); }
  if (!response.ok) throw driveError(response.status);
  return { text: decodeCSV(await response.arrayBuffer()), name: info.name || 'Drive CSV' };
}

function driveError(status) {
  if (status === 400) return new Error('Drive API 키 또는 요청 설정을 확인하세요.');
  if (status === 401 || status === 403) return new Error('파일이 공개되지 않았거나 API 키 제한·할당량·다운로드 권한 문제가 있습니다.');
  if (status === 404) return new Error('파일을 찾을 수 없습니다. 공유 링크와 공개 범위를 확인하세요.');
  if (status === 429) return new Error('Drive API 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.');
  return new Error(`Drive 요청에 실패했습니다. (HTTP ${status})`);
}
