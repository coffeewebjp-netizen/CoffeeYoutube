'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { isSupportedNodeRuntime } = require('../src/tooling');

test('patched Node.js runtime floors are accepted', () => {
  assert.equal(isSupportedNodeRuntime('v22.23.4'), true);
  assert.equal(isSupportedNodeRuntime('v24.22.1'), true);
  assert.equal(isSupportedNodeRuntime('v26.12.1'), true);
});

test('Node.js versions before each security floor are rejected', () => {
  assert.equal(isSupportedNodeRuntime('v22.23.3'), false);
  assert.equal(isSupportedNodeRuntime('v24.22.0'), false);
  assert.equal(isSupportedNodeRuntime('v26.12.0'), false);
});

test('unsupported and unparseable Node.js versions are rejected', () => {
  assert.equal(isSupportedNodeRuntime('v18.20.6'), false);
  assert.equal(isSupportedNodeRuntime('v27.0.0'), false);
  assert.equal(isSupportedNodeRuntime('v24.22.1-rc.1'), false);
  assert.equal(isSupportedNodeRuntime('not-a-version'), false);
});
