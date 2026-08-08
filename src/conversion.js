'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CONVERSION_PARALLELISM_OPTIONS = [1, 2, 4];

function normalizeConversionParallelism(value, fallback = 2) {
  const parallelism = value === undefined || value === null || value === ''
    ? fallback
    : Number(value);
  if (!CONVERSION_PARALLELISM_OPTIONS.includes(parallelism)) {
    throw new Error('同時変換数は1、2、4から選択してください。');
  }
  return parallelism;
}

function validateConversionSource(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    throw new Error('変換するOpusファイルを選択してください。');
  }

  let sourcePath;
  try {
    sourcePath = fs.realpathSync(value);
  } catch {
    throw new Error('選択したOpusファイルが見つかりません。');
  }

  if (path.extname(sourcePath).toLowerCase() !== '.opus') {
    throw new Error('変換できるのは.opusファイルだけです。');
  }
  if (!fs.statSync(sourcePath).isFile()) {
    throw new Error('変換するOpusファイルを選択してください。');
  }

  return sourcePath;
}

function uniqueM4aPath(sourcePath, outputRoot, exists = fs.existsSync) {
  const baseName = path.basename(sourcePath, path.extname(sourcePath));
  let outputPath = path.join(outputRoot, baseName + '.m4a');
  let suffix = 2;
  while (exists(outputPath)) {
    outputPath = path.join(outputRoot, `${baseName} (${suffix}).m4a`);
    suffix += 1;
  }
  return outputPath;
}

function buildM4aArgs(sourcePath, outputPath) {
  return [
    '-hide_banner',
    '-nostdin',
    '-n',
    '-i', sourcePath,
    '-map', '0:a:0',
    '-vn',
    '-map_metadata', '0',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    '-progress', 'pipe:1',
    '-nostats',
    outputPath,
  ];
}

function buildDurationProbeArgs(sourcePath) {
  return [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    sourcePath,
  ];
}

module.exports = {
  CONVERSION_PARALLELISM_OPTIONS,
  buildDurationProbeArgs,
  buildM4aArgs,
  normalizeConversionParallelism,
  uniqueM4aPath,
  validateConversionSource,
};
