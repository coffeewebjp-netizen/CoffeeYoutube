'use strict';

const path = require('node:path');

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
]);

const AUDIO_FORMATS = new Set(['original', 'm4a', 'mp3']);
const VIDEO_FORMATS = new Set(['mp4', 'efficient']);
const VIDEO_QUALITIES = new Set(['best', '2160', '1440', '1080', '720', '480']);

function validateYoutubeUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('正しいYouTube URLを入力してください。');
  }

  if (parsed.protocol !== 'https:' || !YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error('youtube.com、music.youtube.com、youtu.be のHTTPS URLだけを指定できます。');
  }
  return parsed.toString();
}

function normalizeRequest(input) {
  const url = validateYoutubeUrl(String(input.url || '').trim());
  const mode = input.mode === 'audio' ? 'audio' : input.mode === 'video' ? 'video' : null;
  if (!mode) throw new Error('動画または音楽を選択してください。');

  const playlist = Boolean(input.playlist);
  if (mode === 'audio') {
    const audioFormat = String(input.audioFormat || 'm4a');
    if (!AUDIO_FORMATS.has(audioFormat)) throw new Error('未対応の音声形式です。');
    return { url, mode, playlist, audioFormat };
  }

  const videoFormat = String(input.videoFormat || 'mp4');
  const videoQuality = String(input.videoQuality || '1080');
  if (!VIDEO_FORMATS.has(videoFormat)) throw new Error('未対応の動画形式です。');
  if (!VIDEO_QUALITIES.has(videoQuality)) throw new Error('未対応の動画品質です。');
  return { url, mode, playlist, videoFormat, videoQuality };
}

function outputTemplate(downloadRoot, request) {
  const category = request.mode === 'audio' ? 'Music' : 'Videos';
  const base = path.join(downloadRoot, category);
  const filename = '%(title)s [%(id)s].%(ext)s';
  return request.playlist
    ? path.join(base, '%(playlist_title)s', `%(playlist_index)03d - ${filename}`)
    : path.join(base, filename);
}

function buildFormatArgs(request) {
  if (request.mode === 'audio') {
    if (request.audioFormat === 'original') {
      return ['-f', 'ba/b', '-x', '--audio-format', 'best'];
    }
    if (request.audioFormat === 'm4a') {
      return ['-f', 'ba[ext=m4a]/ba/b', '-x', '--audio-format', 'm4a'];
    }
    return ['-f', 'ba/b', '-x', '--audio-format', 'mp3', '--audio-quality', '0'];
  }

  const args = ['-t', request.videoFormat === 'mp4' ? 'mp4' : 'mkv'];
  if (request.videoQuality !== 'best') {
    const height = request.videoQuality;
    args.push('-f', `bv*[height<=?${height}]+ba/b[height<=?${height}]`);
  }
  return args;
}

function buildYtDlpArgs(request, options) {
  const args = [
    '--ignore-config',
    '--newline',
    '--no-overwrites',
    '--windows-filenames',
    '--trim-filenames',
    '180',
    '--embed-metadata',
    '--progress-template',
    'download:coffee-progress|%(progress.status)s|%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
    '--progress-template',
    'postprocess:coffee-postprocess|%(progress.status)s',
    '--print',
    'after_move:coffee-result|%(filepath)s',
    request.playlist ? '--yes-playlist' : '--no-playlist',
  ];

  if (options.ffmpegPath) args.push('--ffmpeg-location', options.ffmpegPath);
  if (options.jsRuntime) {
    args.push('--js-runtimes', `${options.jsRuntime.name}:${options.jsRuntime.path}`);
  }

  args.push(...buildFormatArgs(request));
  args.push('-o', outputTemplate(options.downloadRoot, request));
  args.push('--', request.url);
  return args;
}

module.exports = {
  buildYtDlpArgs,
  normalizeRequest,
  outputTemplate,
  validateYoutubeUrl,
};
