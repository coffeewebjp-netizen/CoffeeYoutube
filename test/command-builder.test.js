'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { buildYtDlpArgs, normalizeRequest, validateYoutubeUrl } = require('../src/command-builder');

test('YouTubeとYouTube MusicのURLを受け付ける', () => {
  assert.match(validateYoutubeUrl('https://www.youtube.com/watch?v=abc'), /youtube/);
  assert.match(validateYoutubeUrl('https://music.youtube.com/watch?v=abc'), /music/);
  assert.match(validateYoutubeUrl('https://youtu.be/abc'), /youtu\.be/);
});

test('YouTubeに見せかけたホストとHTTPを拒否する', () => {
  assert.throws(() => validateYoutubeUrl('https://youtube.com.example.test/watch?v=abc'));
  assert.throws(() => validateYoutubeUrl('http://youtube.com/watch?v=abc'));
});

test('元音質はbest audioを抽出し再圧縮形式を指定しない', () => {
  const request = normalizeRequest({ url: 'https://youtu.be/abc', mode: 'audio', audioFormat: 'original' });
  const args = buildYtDlpArgs(request, { downloadRoot: 'C:\\media', jsRuntime: { name: 'deno', path: 'deno' } });
  assert.deepEqual(args.slice(args.indexOf('-f'), args.indexOf('-f') + 5), ['-f', 'ba/b', '-x', '--audio-format', 'best']);
  assert.ok(args.includes('deno:deno'));
  assert.equal(args.at(-2), '--');
});

test('音声形式を省略した場合はM4Aを標準にする', () => {
  const request = normalizeRequest({ url: 'https://youtu.be/abc', mode: 'audio' });
  assert.equal(request.audioFormat, 'm4a');
});

test('MP3はFFmpeg用の高品質変換オプションを付ける', () => {
  const request = normalizeRequest({ url: 'https://youtu.be/abc', mode: 'audio', audioFormat: 'mp3' });
  const args = buildYtDlpArgs(request, { downloadRoot: 'C:\\media' });
  assert.ok(args.includes('mp3'));
  assert.equal(args[args.indexOf('--audio-quality') + 1], '0');
});

test('MP4 1080pは互換プリセットと解像度上限を使う', () => {
  const request = normalizeRequest({
    url: 'https://www.youtube.com/watch?v=abc', mode: 'video', videoFormat: 'mp4', videoQuality: '1080',
  });
  const args = buildYtDlpArgs(request, { downloadRoot: 'C:\\media' });
  assert.equal(args[args.indexOf('-t') + 1], 'mp4');
  assert.match(args[args.indexOf('-f') + 1], /1080/);
  assert.ok(args.includes(path.join('C:\\media', 'Videos', '%(title)s [%(id)s].%(ext)s')));
});

test('プレイリストは専用フォルダと連番を使う', () => {
  const request = normalizeRequest({
    url: 'https://www.youtube.com/playlist?list=abc', mode: 'audio', audioFormat: 'm4a', playlist: true,
  });
  const args = buildYtDlpArgs(request, { downloadRoot: 'C:\\media' });
  assert.ok(args.includes('--yes-playlist'));
  assert.match(args[args.indexOf('-o') + 1], /playlist_title/);
  assert.match(args[args.indexOf('-o') + 1], /playlist_index/);
});
