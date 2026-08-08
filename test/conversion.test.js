'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  buildDurationProbeArgs,
  buildM4aArgs,
  normalizeConversionParallelism,
  uniqueM4aPath,
  validateConversionSource,
} = require('../src/conversion');

test('Opusファイルだけを変換元として受け付ける', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'coffee-ytdl-test-'));
  try {
    const opusPath = path.join(folder, 'sample.opus');
    const mp3Path = path.join(folder, 'sample.mp3');
    fs.writeFileSync(opusPath, 'opus');
    fs.writeFileSync(mp3Path, 'mp3');

    assert.equal(validateConversionSource(opusPath), fs.realpathSync(opusPath));
    assert.throws(() => validateConversionSource(mp3Path), /.opus/);
    assert.throws(() => validateConversionSource('sample.opus'));
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

test('既存M4Aを上書きしない連番パスを生成する', () => {
  const source = path.resolve('input', 'music.opus');
  const outputRoot = path.resolve('output');
  const occupied = new Set([
    path.join(outputRoot, 'music.m4a'),
    path.join(outputRoot, 'music (2).m4a'),
  ]);

  assert.equal(
    uniqueM4aPath(source, outputRoot, (candidate) => occupied.has(candidate)),
    path.join(outputRoot, 'music (3).m4a')
  );
});

test('M4A変換はAAC 192kbpsで元ファイルを上書きしない', () => {
  const source = path.resolve('input', 'music.opus');
  const output = path.resolve('output', 'music.m4a');
  const args = buildM4aArgs(source, output);
  assert.ok(args.includes('-n'));
  assert.equal(args[args.indexOf('-c:a') + 1], 'aac');
  assert.equal(args[args.indexOf('-b:a') + 1], '192k');
  assert.ok(args.includes('pipe:1'));
});

test('ffprobe用引数はdurationだけを取得する', () => {
  const source = path.resolve('input', 'music.opus');
  const args = buildDurationProbeArgs(source);
  assert.ok(args.includes('format=duration'));
  assert.equal(args.at(-1), source);
});
test('同時変換数は1、2、4だけを受け付ける', () => {
  assert.equal(normalizeConversionParallelism(undefined), 2);
  assert.equal(normalizeConversionParallelism('1'), 1);
  assert.equal(normalizeConversionParallelism(2), 2);
  assert.equal(normalizeConversionParallelism('4'), 4);
  assert.throws(() => normalizeConversionParallelism(3), /1、2、4/);
});