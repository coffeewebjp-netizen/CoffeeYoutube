'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function localOrPath(root, localName, commandName) {
  const local = path.join(root, 'tools', localName);
  return fs.existsSync(local) ? local : commandName;
}

function probe(command, args = ['--version']) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, { shell: false, windowsHide: true });
    } catch {
      resolve({ available: false, command, version: null });
      return;
    }
    let output = '';
    const timer = setTimeout(() => child.kill(), 5000);
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.once('error', () => {
      clearTimeout(timer);
      resolve({ available: false, command, version: null });
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      resolve({
        available: code === 0,
        command,
        version: output.trim().split(/\r?\n/, 1)[0] || null,
      });
    });
  });
}

function majorVersion(value) {
  const match = String(value || '').match(/v?(\d+)/);
  return match ? Number(match[1]) : 0;
}

const MINIMUM_NODE_BY_MAJOR = new Map([
  [22, [23, 4]],
  [24, [22, 1]],
  [26, [12, 1]],
]);

function isSupportedNodeRuntime(value) {
  const match = String(value || '').match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return false;

  const [, majorText, minorText, patchText] = match;
  const version = [Number(majorText), Number(minorText), Number(patchText)];
  const minimum = MINIMUM_NODE_BY_MAJOR.get(version[0]);
  if (!minimum) return false;

  return version[1] > minimum[0]
    || (version[1] === minimum[0] && version[2] >= minimum[1]);
}

async function inspectTools(root) {
  const ytDlpPath = localOrPath(root, 'yt-dlp.exe', 'yt-dlp');
  const ffmpegPath = localOrPath(root, 'ffmpeg.exe', 'ffmpeg');
  const ffprobePath = localOrPath(root, 'ffprobe.exe', 'ffprobe');
  const denoPath = localOrPath(root, 'deno.exe', 'deno');
  const nodePath = 'node';

  const [ytDlp, ffmpeg, ffprobe, deno, node] = await Promise.all([
    probe(ytDlpPath),
    probe(ffmpegPath, ['-version']),
    probe(ffprobePath, ['-version']),
    probe(denoPath),
    probe(nodePath),
  ]);

  let jsRuntime = null;
  if (deno.available && majorVersion(deno.version) >= 2) {
    jsRuntime = { name: 'deno', path: denoPath };
  } else if (node.available && isSupportedNodeRuntime(node.version)) {
    jsRuntime = { name: 'node', path: nodePath };
  }

  return {
    ytDlp: { ...ytDlp, path: ytDlpPath },
    ffmpeg: { ...ffmpeg, path: ffmpegPath },
    ffprobe: { ...ffprobe, path: ffprobePath },
    deno,
    node,
    jsRuntime,
  };
}

module.exports = { inspectTools, isSupportedNodeRuntime, majorVersion, probe };
