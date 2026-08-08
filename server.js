'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const readline = require('node:readline');
const { randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { buildYtDlpArgs, normalizeRequest } = require('./src/command-builder');
const { inspectTools } = require('./src/tooling');
const {
  buildDurationProbeArgs,
  buildM4aArgs,
  normalizeConversionParallelism,
  uniqueM4aPath,
  validateConversionSource,
} = require('./src/conversion');
const { addFileToEagle, inspectEagle } = require('./src/eagle');

const ROOT = __dirname;
const TOOL_ROOT = process.env.COFFEE_YTDL_TOOLS_ROOT || ROOT;
const DOWNLOAD_ROOT = process.env.COFFEE_YTDL_DOWNLOAD_ROOT || path.join(ROOT, 'downloads');
const PORT = Number(process.env.COFFEE_YTDL_PORT || 4317);
const jobs = [];
const activeJobs = new Set();
let conversionParallelism = 2;
let shuttingDown = false;

for (const folder of ['Music', 'Videos']) {
  fs.mkdirSync(path.join(DOWNLOAD_ROOT, folder), { recursive: true });
}

function sendJson(response, status, data) {
  const body = JSON.stringify(data);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) request.destroy();
    });
    request.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(new Error('リクエストの形式が正しくありません。')); }
    });
    request.on('error', reject);
  });
}

function publicJob(job) {
  const { child, stderr, outputTarget, durationSeconds, ...safe } = job;
  return safe;
}

function pushLog(job, line) {
  if (!line) return;
  job.stderr.push(line);
  if (job.stderr.length > 30) job.stderr.shift();
}

function parseOutput(job, line, isError = false) {
  const text = line.trim();
  if (!text) return;
  if (text.startsWith('coffee-progress|')) {
    const [, status, percent, speed, eta] = text.split('|');
    job.phase = status || 'downloading';
    job.progress = percent ? percent.trim() : null;
    job.speed = speed ? speed.trim() : null;
    job.eta = eta ? eta.trim() : null;
    return;
  }
  if (text.startsWith('coffee-postprocess|')) {
    job.phase = 'processing';
    job.progress = null;
    return;
  }
  if (text.startsWith('coffee-result|')) {
    job.output = text.slice('coffee-result|'.length);
    return;
  }
  if (isError) pushLog(job, text);
}

function attachLines(stream, handler) {
  const lines = readline.createInterface({ input: stream });
  lines.on('line', handler);
}

function probeDuration(command, sourcePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, buildDurationProbeArgs(sourcePath), {
      shell: false,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    child.once('close', (code) => {
      if (settled) return;
      settled = true;
      const duration = Number.parseFloat(stdout.trim());
      if (code !== 0 || !Number.isFinite(duration) || duration <= 0) {
        reject(new Error(stderr.trim() || '音声の再生時間を取得できませんでした。'));
        return;
      }
      resolve(duration);
    });
  });
}

function releaseJob(job) {
  activeJobs.delete(job);
  if (!shuttingDown) setImmediate(scheduleJobs);
}

async function startConversionJob(job, tools) {
  job.phase = 'analyzing';

  try {
    job.durationSeconds = await probeDuration(tools.ffprobe.path, job.request.sourcePath);
  } catch (error) {
    job.status = 'failed';
    job.error = 'Opusファイルを解析できませんでした: ' + error.message;
    job.finishedAt = new Date().toISOString();
    releaseJob(job);
    return;
  }

  if (job.status === 'cancelled') {
    releaseJob(job);
    return;
  }

  job.status = 'running';
  job.phase = 'converting';
  const child = spawn(
    tools.ffmpeg.path,
    buildM4aArgs(job.request.sourcePath, job.outputTarget),
    {
      cwd: ROOT,
      shell: false,
      windowsHide: true,
    }
  );
  job.child = child;

  attachLines(child.stdout, (line) => {
    const separator = line.indexOf('=');
    if (separator < 0) return;
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);

    if ((key === 'out_time_us' || key === 'out_time_ms') && job.durationSeconds) {
      const elapsedSeconds = Number(value) / 1000000;
      const percent = Math.min(99.9, Math.max(0, elapsedSeconds / job.durationSeconds * 100));
      if (Number.isFinite(percent)) job.progress = percent.toFixed(1) + '%';
    }
    if (key === 'speed' && value !== 'N/A') job.speed = value;
  });
  attachLines(child.stderr, (line) => pushLog(job, line.trim()));

  child.once('error', (error) => {
    pushLog(job, error.message);
  });
  child.once('close', async (code) => {
    if (job.cancelRequested) {
      job.status = 'cancelled';
      removePartialConversion(job);
    } else if (code === 0) {
      job.progress = '100%';
      job.output = job.outputTarget;
      if (job.request.addToEagle) {
        job.phase = 'importing';
        job.eagle = { status: 'importing', itemId: null, error: null };
        try {
          const itemId = await addFileToEagle(job.outputTarget, {
            name: path.basename(job.outputTarget, path.extname(job.outputTarget)),
          });
          job.eagle = { status: 'completed', itemId, error: null };
        } catch (error) {
          job.eagle = { status: 'failed', itemId: null, error: error.message };
        }
      }
      job.status = 'completed';
      job.phase = 'done';
    } else {
      job.status = 'failed';
      job.error = job.stderr.at(-1) || 'FFmpegが終了コード ' + code + ' で終了しました。';
      removePartialConversion(job);
    }
    job.finishedAt = new Date().toISOString();
    delete job.child;
    releaseJob(job);
  });
}

async function startJob(job) {
  activeJobs.add(job);
  job.status = 'checking';
  job.startedAt = new Date().toISOString();

  let tools;
  try {
    tools = await inspectTools(TOOL_ROOT);
  } catch (error) {
    job.status = 'failed';
    job.error = 'ツール確認に失敗しました: ' + error.message;
    job.finishedAt = new Date().toISOString();
    releaseJob(job);
    return;
  }
  if (job.status === 'cancelled') {
    releaseJob(job);
    return;
  }

  const missing = [];
  if (!tools.ffmpeg.available) missing.push('FFmpeg');
  if (!tools.ffprobe.available) missing.push('FFprobe');
  if (job.type !== 'conversion') {
    if (!tools.ytDlp.available) missing.push('yt-dlp');
    if (!tools.jsRuntime) missing.push('Deno 2.3以上（またはNode.js 22以上）');
  }
  if (missing.length) {
    job.status = 'failed';
    job.error = '必要なツールが見つかりません: ' + missing.join('、');
    job.finishedAt = new Date().toISOString();
    releaseJob(job);
    return;
  }

  if (job.type === 'conversion') {
    await startConversionJob(job, tools);
    return;
  }

  const ffmpegIsLocal = path.isAbsolute(tools.ffmpeg.path) ? tools.ffmpeg.path : null;
  const args = buildYtDlpArgs(job.request, {
    downloadRoot: DOWNLOAD_ROOT,
    ffmpegPath: ffmpegIsLocal,
    jsRuntime: tools.jsRuntime,
  });

  job.status = 'running';
  job.phase = 'starting';
  const child = spawn(tools.ytDlp.path, args, {
    cwd: ROOT,
    shell: false,
    windowsHide: true,
  });
  job.child = child;
  attachLines(child.stdout, (line) => parseOutput(job, line));
  attachLines(child.stderr, (line) => parseOutput(job, line, true));

  child.once('error', (error) => {
    pushLog(job, error.message);
  });
  child.once('close', (code) => {
    if (job.cancelRequested) {
      job.status = 'cancelled';
    } else if (code === 0) {
      job.status = 'completed';
      job.phase = 'done';
      job.progress = '100%';
    } else {
      job.status = 'failed';
      job.error = job.stderr.at(-1) || 'yt-dlpが終了コード ' + code + ' で終了しました。';
    }
    job.finishedAt = new Date().toISOString();
    delete job.child;
    releaseJob(job);
  });
}

function scheduleJobs() {
  if (shuttingDown) return;

  const hasActiveDownload = Array.from(activeJobs).some((job) => job.type === 'download');
  if (!hasActiveDownload) {
    const download = jobs.find((job) => job.type === 'download' && job.status === 'queued');
    if (download) void startJob(download);
  }

  let availableSlots = conversionParallelism
    - Array.from(activeJobs).filter((job) => job.type === 'conversion').length;
  while (availableSlots > 0) {
    const conversion = jobs.find((job) =>
      job.type === 'conversion' && job.status === 'queued' && !activeJobs.has(job)
    );
    if (!conversion) break;
    void startJob(conversion);
    availableSlots -= 1;
  }
}
function stopChildProcess(child, wait = false) {
  if (!child || !child.pid) return;

  if (process.platform === 'win32') {
    const args = ['/pid', String(child.pid), '/T', '/F'];
    const options = { windowsHide: true, stdio: 'ignore' };
    if (wait) {
      spawnSync('taskkill.exe', args, options);
    } else {
      spawn('taskkill.exe', args, options).unref();
    }
    return;
  }

  child.kill('SIGTERM');
}

function removePartialConversion(job) {
  if (job.type !== 'conversion' || !job.outputTarget) return;

  const musicRoot = path.resolve(DOWNLOAD_ROOT, 'Music');
  const outputPath = path.resolve(job.outputTarget);
  const rootPrefix = musicRoot + path.sep;
  if (!outputPath.toLowerCase().startsWith(rootPrefix.toLowerCase())) return;

  try {
    fs.rmSync(outputPath, { force: true });
  } catch {
    // 終了処理を妨げない
  }
}

function cancelJob(job, wait = false) {
  if (job.status === 'queued' || job.status === 'checking') {
    job.status = 'cancelled';
    job.finishedAt = new Date().toISOString();
    return;
  }
  if (job.status === 'running' && job.child) {
    job.cancelRequested = true;
    stopChildProcess(job.child, wait);
  }
}

function shutdown() {
  shuttingDown = true;
  for (const job of jobs) {
    if (job.status === 'queued' || job.status === 'checking') {
      cancelJob(job);
    }
  }

  for (const job of activeJobs) {
    if (job.status === 'running' && job.phase !== 'importing') {
      cancelJob(job, true);
      removePartialConversion(job);
    }
  }

  if (server.listening) {
    server.close();
  }
}
function openFolder(kind) {
  const target = path.join(DOWNLOAD_ROOT, kind === 'audio' ? 'Music' : 'Videos');
  if (process.platform === 'win32') {
    spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [target], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [target], { detached: true, stdio: 'ignore' }).unref();
  }
}

const staticFiles = {
  '/': ['public/index.html', 'text/html; charset=utf-8'],
  '/app.js': ['public/app.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['public/styles.css', 'text/css; charset=utf-8'],
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);
  try {
    if (request.method === 'GET' && staticFiles[url.pathname]) {
      const [relative, type] = staticFiles[url.pathname];
      const content = fs.readFileSync(path.join(ROOT, relative));
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
      response.end(content);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/status') {
      let tools;
      try {
        tools = await inspectTools(TOOL_ROOT);
      } catch (error) {
        sendJson(response, 503, {
          error: 'ツール確認に失敗しました: ' + error.message,
        });
        return;
      }
      const eagle = await inspectEagle();
      sendJson(response, 200, {
        tools: {
          ytDlp: tools.ytDlp,
          ffmpeg: tools.ffmpeg,
          ffprobe: tools.ffprobe,
          deno: tools.deno,
          node: tools.node,
          jsRuntime: tools.jsRuntime,
        },
        eagle,
        conversion: {
          parallelism: conversionParallelism,
          parallelismOptions: [1, 2, 4],
          acceleration: 'cpu',
          codec: 'AAC 192kbps',
        },
        downloadRoot: DOWNLOAD_ROOT,
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/jobs') {
      sendJson(response, 200, jobs.slice().reverse().map(publicJob));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/jobs') {
      const input = await readJson(request);
      const normalized = normalizeRequest(input);
      const job = {
        id: randomUUID(),
        type: 'download',
        request: normalized,
        status: 'queued',
        phase: 'waiting',
        progress: null,
        speed: null,
        eta: null,
        output: null,
        error: null,
        stderr: [],
        createdAt: new Date().toISOString(),
      };
      jobs.push(job);
      while (jobs.length > 100) jobs.shift();
      sendJson(response, 202, publicJob(job));
      setImmediate(scheduleJobs);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/conversions') {
      const input = await readJson(request);
      const requestedPaths = Array.isArray(input.sourcePaths)
        ? input.sourcePaths
        : [input.sourcePath];
      if (!requestedPaths.length || requestedPaths.length > 100) {
        throw new Error('一度に選択できるOpusファイルは1～100件です。');
      }

      const sourcePaths = [];
      const seenSources = new Set();
      for (const value of requestedPaths) {
        const sourcePath = validateConversionSource(value);
        const sourceKey = sourcePath.toLowerCase();
        if (seenSources.has(sourceKey)) continue;
        seenSources.add(sourceKey);
        sourcePaths.push(sourcePath);
      }
      if (!sourcePaths.length) {
        throw new Error('変換するOpusファイルを選択してください。');
      }

      const parallelism = normalizeConversionParallelism(input.parallelism, conversionParallelism);
      const outputRoot = path.join(DOWNLOAD_ROOT, 'Music');
      const reservedOutputs = new Set(
        jobs
          .map((job) => job.outputTarget)
          .filter(Boolean)
          .map((target) => path.resolve(target).toLowerCase())
      );
      const createdJobs = sourcePaths.map((sourcePath) => {
        const outputTarget = uniqueM4aPath(sourcePath, outputRoot, (candidate) =>
          fs.existsSync(candidate) || reservedOutputs.has(path.resolve(candidate).toLowerCase())
        );
        reservedOutputs.add(path.resolve(outputTarget).toLowerCase());
        return {
          id: randomUUID(),
          type: 'conversion',
          request: {
            mode: 'convert',
            sourcePath,
            sourceName: path.basename(sourcePath),
            outputFormat: 'm4a',
            addToEagle: input.addToEagle !== false,
          },
          outputTarget,
          status: 'queued',
          phase: 'waiting',
          progress: null,
          speed: null,
          eta: null,
          output: null,
          error: null,
          stderr: [],
          createdAt: new Date().toISOString(),
        };
      });

      conversionParallelism = parallelism;
      jobs.push(...createdJobs);
      while (jobs.length > 200) {
        const removable = jobs.findIndex((job) =>
          !activeJobs.has(job) && ['completed', 'failed', 'cancelled'].includes(job.status)
        );
        if (removable < 0) break;
        jobs.splice(removable, 1);
      }
      sendJson(response, 202, {
        jobs: createdJobs.map(publicJob),
        parallelism: conversionParallelism,
      });
      setImmediate(scheduleJobs);
      return;
    }

    const cancelMatch = url.pathname.match(/^\/api\/jobs\/([a-f0-9-]+)\/cancel$/);
    if (request.method === 'POST' && cancelMatch) {
      const job = jobs.find((candidate) => candidate.id === cancelMatch[1]);
      if (!job) return sendJson(response, 404, { error: 'ジョブが見つかりません。' });
      cancelJob(job);
      sendJson(response, 200, publicJob(job));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/open-folder') {
      const input = await readJson(request);
      openFolder(input.kind === 'audio' ? 'audio' : 'video');
      sendJson(response, 200, { ok: true });
      return;
    }

    sendJson(response, 404, { error: '見つかりません。' });
  } catch (error) {
    sendJson(response, 400, { error: error.message || '処理に失敗しました。' });
  }
});

function startServer() {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve(server);
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(PORT, '127.0.0.1');
  });
}

if (require.main === module) {
  startServer()
    .then(() => {
      console.log('Coffee Youtube DL: http://127.0.0.1:' + PORT);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = {
  server,
  startServer,
  shutdown,
  port: PORT,
};