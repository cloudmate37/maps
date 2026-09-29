import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseCSV, readData, driveFile, regionAttributes } from '../src/data.js';

const gu = JSON.parse(fs.readFileSync(new URL('../data/seoul-gu.geojson', import.meta.url)));
const dong = JSON.parse(fs.readFileSync(new URL('../data/seoul-dong.geojson', import.meta.url)));
const codes = new Set([...gu.features, ...dong.features].map(f => f.properties.code));
const guNames = Object.fromEntries(gu.features.map(f => [f.properties.name, f.properties.code]));

test('source boundaries and source population CSV match', () => {
  assert.equal(gu.features.length, 25);
  assert.equal(dong.features.length, 426);
  const data = readData(fs.readFileSync(new URL('../data/sample-population.csv', import.meta.url), 'utf8'), codes, guNames);
  assert.equal(data.invalid.length, 0);
  assert.equal(data.duplicates.length, 0);
  assert.equal(data.records.filter(r => r.code.length === 5 && r.metric === 'to_in_001').length, 25);
  assert.equal(data.records.filter(r => r.code.length === 8 && r.metric === 'to_in_001').length, 426);
  assert.equal(data.records.filter(r => r.code.length === 5 && r.metric === 'to_in_002').length, 25);
  assert.equal(data.records.find(r => r.code === '11010').value, 144486);
});

test('wide CSV matches district names and does not total rates', () => {
  const data = readData('구분,일반가구(\'22년),지하비율\n서울,100,5\n종로구,10,3.9\n중구,20,-\n', codes, guNames);
  assert.equal(data.format, 'wide');
  assert.equal(data.inferredYear, '2022');
  assert.equal(data.excluded, 1);
  assert.equal(data.records.find(r => r.code === '11010' && r.metric === '지하비율').value, 3.9);
  assert.equal(data.records.find(r => r.code === '11020' && r.metric === '지하비율').value, null);
});

test('duplicate, missing and unmapped input are surfaced', () => {
  const data = readData('2024,11,to_in_001,100\n2024,11010,to_in_001,10\n2024,11010,to_in_001,11\n2024,11999,to_in_001,X\n2024,11020,to_in_001,-', codes, guNames);
  assert.equal(data.excluded, 1);
  assert.equal(data.duplicates.length, 1);
  assert.deepEqual(data.unmatched, ['11999']);
  assert.equal(data.records.find(r => r.code === '11020').value, null);
});

test('CSV quoting and resource keys', () => {
  assert.deepEqual(parseCSV('a,b\n"1,2","a""b"\n')[1], ['1,2', 'a"b']);
  assert.deepEqual(driveFile('https://drive.google.com/file/d/abc_DEF-123/view?resourcekey=0-foo'), { id: 'abc_DEF-123', resourceKey: '0-foo' });
  assert.throws(() => driveFile('https://evil.example/file/d/abc/view'));
});

test('hover attributes include all metrics for the selected year and region', () => {
  const records = [
    { year: '2024', code: '11010', metric: 'to_in_001', value: 144486 },
    { year: '2024', code: '11010', metric: 'to_in_002', value: 44.2 },
    { year: '2023', code: '11010', metric: 'to_in_001', value: 140000 },
    { year: '2024', code: '11020', metric: 'to_in_001', value: 100000 }
  ];
  assert.deepEqual(regionAttributes(records, '2024', new Set(['11010']), { to_in_001: '총인구', to_in_002: '평균나이' }), {
    '11010': [
      { metric: 'to_in_001', label: '총인구', value: 144486 },
      { metric: 'to_in_002', label: '평균나이', value: 44.2 }
    ]
  });
});
