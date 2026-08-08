'use strict';

const form = document.querySelector('#downloadForm');
const formError = document.querySelector('#formError');
const jobsElement = document.querySelector('#jobs');
const toolStatus = document.querySelector('#toolStatus');
const toolDetail = document.querySelector('#toolDetail');
const videoOptions = document.querySelector('#videoOptions');
const audioOptions = document.querySelector('#audioOptions');
const audioFormat = document.querySelector('#audioFormat');
const formatHint = document.querySelector('#formatHint');
const conversionFile = document.querySelector('#conversionFile');
const conversionDrop = document.querySelector('#conversionDrop');
const conversionSelection = document.querySelector('#conversionSelection');
const conversionError = document.querySelector('#conversionError');
const chooseOpus = document.querySelector('#chooseOpus');
const convertOpus = document.querySelector('#convertOpus');
const addToEagle = document.querySelector('#addToEagle');
const conversionParallelism = document.querySelector('#conversionParallelism');
let selectedConversions = [];

const labels = {
  queued: '待機中', checking: 'ツール確認中', running: '保存中', completed: '完了',
  failed: '失敗', cancelled: 'キャンセル済み',
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

function selectedMode() {
  return form.elements.mode.value;
}

function syncMode() {
  const audio = selectedMode() === 'audio';
  videoOptions.classList.toggle('hidden', audio);
  audioOptions.classList.toggle('hidden', !audio);
}

function syncAudioHint() {
  const hints = {
    original: 'YouTubeのOpusまたはM4Aを再圧縮せず保存します。Eagle内再生は保証されません。',
    m4a: 'Eagleやスマホとの互換性を優先。必要な場合はFFmpegで変換します。',
    mp3: '幅広い機器で再生可能。FFmpegで再圧縮するため元音質より少し劣化します。',
  };
  formatHint.textContent = hints[audioFormat.value];
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return value.toFixed(unit === 0 ? 0 : 1) + ' ' + units[unit];
}

function selectConversionFiles(fileList) {
  conversionError.textContent = '';
  selectedConversions = [];
  convertOpus.disabled = true;
  convertOpus.textContent = 'M4Aへ変換';

  const files = Array.from(fileList || []);
  const opusFiles = files.filter((file) => file.name.toLowerCase().endsWith('.opus'));
  const ignoredCount = files.length - opusFiles.length;

  if (!opusFiles.length) {
    conversionSelection.textContent = 'ファイルが選択されていません。';
    conversionError.textContent = '.opusファイルを選択してください。';
    return;
  }
  if (opusFiles.length > 100) {
    conversionSelection.textContent = opusFiles.length + '件選択されました。';
    conversionError.textContent = '一度に選択できるのは100件までです。';
    return;
  }

  if (!window.coffeeDesktop?.getPathForFile) {
    conversionSelection.textContent = opusFiles.length + '件選択されました。';
    conversionError.textContent = 'ローカル変換はWindowsアプリ版で利用できます。';
    return;
  }

  try {
    const uniquePaths = new Set();
    for (const file of opusFiles) {
      const sourcePath = window.coffeeDesktop.getPathForFile(file);
      if (!sourcePath) throw new Error(file.name + 'の場所を取得できませんでした。');
      const key = sourcePath.toLowerCase();
      if (uniquePaths.has(key)) continue;
      uniquePaths.add(key);
      selectedConversions.push({ sourcePath, name: file.name, size: file.size || 0 });
    }

    const totalSize = selectedConversions.reduce((total, file) => total + file.size, 0);
    const sizeLabel = formatFileSize(totalSize);
    conversionSelection.textContent = selectedConversions.length + '件選択中'
      + (sizeLabel ? '・合計 ' + sizeLabel : '');
    if (ignoredCount) {
      conversionError.textContent = '.opus以外の' + ignoredCount + '件は除外しました。';
    }
    convertOpus.textContent = selectedConversions.length + '件をM4Aへ変換';
    convertOpus.disabled = selectedConversions.length === 0;
  } catch (error) {
    selectedConversions = [];
    conversionSelection.textContent = 'ファイルを選択し直してください。';
    conversionError.textContent = error.message;
  }
}
function jobDescription(job) {
  return job.type === 'conversion' ? job.request.sourceName : job.request.url;
}

function jobStatusLabel(job) {
  if (job.type === 'conversion' && job.phase === 'importing') return 'Eagle登録中';
  if (job.type === 'conversion' && job.status === 'running') return '変換中';
  return labels[job.status] || job.status;
}

function eagleResult(job) {
  if (!job.eagle) return '';
  if (job.eagle.status === 'importing') {
    return '<p class="eagle-result">Eagleへ登録しています…</p>';
  }
  if (job.eagle.status === 'completed') {
    return '<p class="eagle-result completed">Eagleへの登録が完了しました。</p>';
  }
  return '<p class="eagle-result failed">M4Aは保存済みですが、Eagle登録に失敗しました: '
    + escapeHtml(job.eagle.error || '不明なエラー') + '</p>';
}

async function api(path, options) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '処理に失敗しました。');
  return data;
}

async function refreshTools() {
  try {
    const data = await api('/api/status');
    const { ytDlp, ffmpeg, ffprobe, jsRuntime, deno, node } = data.tools;
    const eagle = data.eagle;
    const ready = ytDlp.available && ffmpeg.available && ffprobe.available && jsRuntime;
    toolStatus.className = `status-pill ${ready ? 'ready' : 'missing'}`;
    toolStatus.innerHTML = `<span></span>${ready ? '準備完了' : 'ツール不足'}`;
    const item = (name, tool) => `<li><strong>${name}</strong><span class="${tool?.available ? 'ok' : 'ng'}">${tool?.available ? escapeHtml(tool.version || '検出済み') : '未検出'}</span></li>`;
    toolDetail.innerHTML = `
      <ul>${item('yt-dlp', ytDlp)}${item('FFmpeg', ffmpeg)}${item('FFprobe', ffprobe)}${item('Deno', deno)}${item('Node.js', node)}${item('Eagle', eagle)}</ul>
      <p>JavaScriptランタイム: ${jsRuntime ? `${escapeHtml(jsRuntime.name)} (${escapeHtml(jsRuntime.path)})` : 'Deno 2.3以上またはNode.js 22以上が必要です'}</p>
      <p>保存先: <code>${escapeHtml(data.downloadRoot)}</code></p>`;
  } catch (error) {
    toolStatus.className = 'status-pill missing';
    toolStatus.textContent = '確認失敗';
    toolDetail.textContent = error.message;
  }
}

function jobTitle(job) {
  if (job.type === 'conversion') return '変換・Opus → M4A';
  const request = job.request;
  if (request.mode === 'audio') {
    return `音楽・${{ original: '元音質', m4a: 'M4A', mp3: 'MP3' }[request.audioFormat]}`;
  }
  return `動画・${request.videoFormat === 'mp4' ? 'MP4' : '容量優先MKV'}・${request.videoQuality === 'best' ? '制限なし' : `${request.videoQuality}p`}`;
}

function renderJobs(jobs) {
  if (!jobs.length) {
    jobsElement.innerHTML = '<div class="empty">まだジョブはありません。</div>';
    return;
  }
  jobsElement.innerHTML = jobs.map((job) => {
    const running = ['queued', 'checking', 'running'].includes(job.status) && job.phase !== 'importing';
    const progress = job.progress || (job.status === 'completed' ? '100%' : '0%');
    const width = Math.min(100, Math.max(0, Number.parseFloat(progress) || 0));
    return `<article class="job ${escapeHtml(job.status)}">
      <div class="job-top">
        <div><span class="job-type">${escapeHtml(jobTitle(job))}</span><h3>${escapeHtml(jobDescription(job))}</h3></div>
        <span class="job-state">${escapeHtml(jobStatusLabel(job))}</span>
      </div>
      <div class="progress-track"><span style="width:${width}%"></span></div>
      <div class="job-meta">
        <span>${escapeHtml(progress)}${job.speed ? ` · ${escapeHtml(job.speed)}` : ''}${job.eta ? ` · 残り ${escapeHtml(job.eta)}` : ''}</span>
        ${running ? `<button class="cancel" data-cancel="${job.id}">キャンセル</button>` : ''}
      </div>
      ${job.output ? `<p class="output">保存先: ${escapeHtml(job.output)}</p>` : ''}
      ${eagleResult(job)}
      ${job.error ? `<p class="error">${escapeHtml(job.error)}</p>` : ''}
    </article>`;
  }).join('');
}

async function refreshJobs() {
  try { renderJobs(await api('/api/jobs')); }
  catch { /* 次回のポーリングで再試行 */ }
}

form.addEventListener('change', (event) => {
  if (event.target.name === 'mode') syncMode();
  if (event.target === audioFormat) syncAudioHint();
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  formError.textContent = '';
  const button = form.querySelector('button[type=submit]');
  button.disabled = true;
  try {
    await api('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        url: document.querySelector('#url').value,
        mode: selectedMode(),
        audioFormat: audioFormat.value,
        videoFormat: document.querySelector('#videoFormat').value,
        videoQuality: document.querySelector('#videoQuality').value,
        playlist: document.querySelector('#playlist').checked,
      }),
    });
    document.querySelector('#url').value = '';
    await refreshJobs();
  } catch (error) {
    formError.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

jobsElement.addEventListener('click', async (event) => {
  const id = event.target.dataset.cancel;
  if (!id) return;
  await api(`/api/jobs/${id}/cancel`, { method: 'POST', body: '{}' });
  await refreshJobs();
});

document.querySelectorAll('[data-folder]').forEach((button) => {
  button.addEventListener('click', () => api('/api/open-folder', {
    method: 'POST', body: JSON.stringify({ kind: button.dataset.folder }),
  }));
});

chooseOpus.addEventListener('click', () => conversionFile.click());

conversionFile.addEventListener('change', () => {
  selectConversionFiles(conversionFile.files);
});

for (const eventName of ['dragenter', 'dragover']) {
  conversionDrop.addEventListener(eventName, (event) => {
    event.preventDefault();
    conversionDrop.classList.add('dragging');
  });
}

for (const eventName of ['dragleave', 'drop']) {
  conversionDrop.addEventListener(eventName, (event) => {
    event.preventDefault();
    conversionDrop.classList.remove('dragging');
  });
}

conversionDrop.addEventListener('drop', (event) => {
  selectConversionFiles(event.dataTransfer.files);
});

conversionDrop.addEventListener('keydown', (event) => {
  if (event.target !== conversionDrop) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    conversionFile.click();
  }
});

convertOpus.addEventListener('click', async () => {
  if (!selectedConversions.length) return;
  conversionError.textContent = '';
  convertOpus.disabled = true;

  try {
    const count = selectedConversions.length;
    await api('/api/conversions', {
      method: 'POST',
      body: JSON.stringify({
        sourcePaths: selectedConversions.map((file) => file.sourcePath),
        addToEagle: addToEagle.checked,
        parallelism: Number(conversionParallelism.value),
      }),
    });
    selectedConversions = [];
    conversionFile.value = '';
    conversionSelection.textContent = count + '件を変換キューへ追加しました。';
    convertOpus.textContent = 'M4Aへ変換';
    await refreshJobs();
  } catch (error) {
    conversionError.textContent = error.message;
    convertOpus.disabled = false;
  }
});
if (!window.coffeeDesktop?.getPathForFile) {
  conversionError.textContent = 'ローカル変換はWindowsアプリ版で利用できます。';
  chooseOpus.disabled = true;
  conversionDrop.classList.add('unsupported');
}

syncMode();
syncAudioHint();
refreshTools();
refreshJobs();
setInterval(refreshJobs, 1000);
