'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { buildEagleItemPayload } = require('../src/eagle');

test('Eagle登録データへ安全な初期メタデータを設定する', () => {
  const filePath = path.resolve('Music', 'sample.m4a');
  const payload = buildEagleItemPayload(filePath);

  assert.equal(payload.path, filePath);
  assert.equal(payload.name, 'sample');
  assert.deepEqual(payload.tags, ['Coffee Youtube DL', 'Music', 'M4A']);
  assert.match(payload.annotation, /OpusからM4A/);
});

test('Eagle登録データは指定した名前とタグを優先する', () => {
  const payload = buildEagleItemPayload(path.resolve('sample.m4a'), {
    name: '任意の名前',
    tags: ['音楽'],
    website: 'https://www.youtube.com/watch?v=abc',
  });

  assert.equal(payload.name, '任意の名前');
  assert.deepEqual(payload.tags, ['音楽']);
  assert.match(payload.website, /youtube/);
});