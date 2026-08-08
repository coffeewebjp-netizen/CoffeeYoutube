'use strict';

const http = require('node:http');
const path = require('node:path');

const EAGLE_HOST = '127.0.0.1';
const EAGLE_PORT = 41595;

function requestEagle(method, pathname, body, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const request = http.request({
      host: EAGLE_HOST,
      port: EAGLE_PORT,
      method,
      path: pathname,
      headers: payload ? {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
      } : undefined,
    }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => {
        let data;
        try {
          data = JSON.parse(text || '{}');
        } catch {
          reject(new Error('Eagleから正しい応答を受け取れませんでした。'));
          return;
        }

        if (response.statusCode < 200 || response.statusCode >= 300 || data.status !== 'success') {
          reject(new Error(data.message || data.error || `Eagle APIエラー (${response.statusCode})`));
          return;
        }
        resolve(data);
      });
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error('Eagle APIがタイムアウトしました。'));
    });
    request.once('error', (error) => {
      if (error.code === 'ECONNREFUSED') {
        reject(new Error('Eagleが起動していません。'));
        return;
      }
      reject(error);
    });
    if (payload) request.write(payload);
    request.end();
  });
}

async function inspectEagle() {
  try {
    const response = await requestEagle('GET', '/api/v2/app/info', null, 1500);
    return {
      available: true,
      version: response.data?.version || null,
      buildVersion: response.data?.buildVersion || null,
    };
  } catch (error) {
    return { available: false, version: null, buildVersion: null, error: error.message };
  }
}

function buildEagleItemPayload(filePath, options = {}) {
  return {
    path: filePath,
    name: options.name || path.basename(filePath, path.extname(filePath)),
    website: options.website || '',
    tags: options.tags || ['Coffee Youtube DL', 'Music', 'M4A'],
    annotation: options.annotation || 'Coffee Youtube DLでOpusからM4Aへ変換',
  };
}

async function addFileToEagle(filePath, options = {}) {
  const response = await requestEagle(
    'POST',
    '/api/item/addFromPath',
    buildEagleItemPayload(filePath, options),
    15000
  );

  return response.data?.id || response.data || null;
}

module.exports = {
  addFileToEagle,
  buildEagleItemPayload,
  inspectEagle,
  requestEagle,
};
