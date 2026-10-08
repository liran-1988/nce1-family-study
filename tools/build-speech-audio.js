'use strict';
// Local-only: node tools/build-speech-audio.js [--inventory | --lesson 23 | --verify]
// Full generation prioritizes L23. No downloads, network TTS, git or publishing.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const audio = path.join(root, 'audio');
const cache = path.join(root, '.agent_cache', 'speech-audio');
const ffmpeg = process.env.NCE_FFMPEG || 'C:/Users/liran/.local/bin/ffmpeg.exe';
const voice = { name: 'Microsoft Zira Desktop', culture: 'en-US', origin: 'local-sapi', sourceRate: 0 };
const version = 'web-voice-v1';
const normalize = text => text.trim().replace(/\s+/g, ' ');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const clipPath = text => `audio/voice/${hash(Buffer.from(text, 'utf8')).slice(0, 16)}.mp3`;
const manifestFile = path.join(audio, 'manifest.json');
const reportFile = path.join(audio, 'generation-record.json');

function inventory() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const marker = html.indexOf('/*__DATA__*/');
  const start = html.indexOf('const LESSONS=', marker) + 'const LESSONS='.length;
  const end = html.indexOf(';/*__END_DATA__*/', start);
  if (marker < 0 || start < 14 || end < start) throw new Error('LESSONS data markers missing.');
  const lessons = JSON.parse(html.slice(start, end)).filter(lesson => lesson.kind === 'text');
  if (lessons.length !== 72) throw new Error(`Expected 72 text lessons; found ${lessons.length}.`);
  const sources = [];
  const add = (lesson, field, text, index = 0) => {
    if (typeof text !== 'string' || !normalize(text)) throw new Error(`Missing English L${lesson.id} ${field}.`);
    sources.push({ lesson: lesson.id, field, index, text: normalize(text) });
  };
  for (const lesson of lessons) {
    add(lesson, 'title', lesson.title);
    for (const field of ['words', 'text', 'patterns']) {
      (lesson[field] || []).forEach((item, index) => add(lesson, field, item.en, index));
    }
    (lesson.teach?.examples || []).forEach((item, index) => add(lesson, 'teach.examples', item.en, index));
  }
  const unique = [...new Set(sources.map(item => item.text))];
  const paths = unique.map(clipPath);
  if (new Set(paths).size !== unique.length) throw new Error('Truncated SHA256 collision.');
  const fields = Object.fromEntries([...new Set(sources.map(item => item.field))].map(field => {
    const values = sources.filter(item => item.field === field).map(item => item.text);
    return [field, { sourceTextTotal: values.length, unique: new Set(values).size }];
  }));
  return { lessons, sources, unique, summary: {
    textLessons: lessons.length, sourceTextTotal: sources.length, unique: unique.length,
    uniqueEnglishWords: unique.join(' ').split(/\s+/).length, fields,
    normalization: "text.trim().replace(/\\s+/g, ' '); case preserved",
    sourceDataSha256: hash(Buffer.from(html.slice(start, end), 'utf8')),
    excluded: ['grammar exercise stems', 'Chinese question text', 'Chinese translations', 'metadata'],
  } };
}

function writeJson(file, value) {
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(temp, file);
}

function loadManifest() {
  if (!fs.existsSync(manifestFile)) return { version, voice, clips: Object.create(null) };
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (manifest.version !== version || JSON.stringify(manifest.voice) !== JSON.stringify(voice) || !manifest.clips) {
    throw new Error('Refusing to overwrite unknown or differently configured manifest.');
  }
  return manifest;
}

function decode(file) {
  const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', file,
    '-map', '0:a:0', '-ac', '1', '-ar', '22050', '-f', 's16le', 'pipe:1'], { maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`Decode failed: ${file}: ${result.error || result.stderr}`);
  const pcm = result.stdout;
  let peak = 0;
  for (let offset = 0; offset + 1 < pcm.length; offset += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(offset)));
  if (!pcm.length || !peak) throw new Error(`Empty or silent clip: ${file}`);
  return { duration: +(pcm.length / 2 / 22050).toFixed(6), decodedSamples: pcm.length / 2, peak };
}

function validateOwned(text, metadata) {
  const expected = clipPath(text);
  if (metadata.path !== expected || metadata.sampleRate !== 22050 || metadata.channels !== 1 || metadata.bitrate !== 48000) {
    throw new Error(`Clip metadata mismatch: ${text}`);
  }
  const file = path.join(root, expected);
  if (!fs.existsSync(file)) return false;
  const data = fs.readFileSync(file);
  if (data.length !== metadata.bytes || hash(data) !== metadata.sha256) throw new Error(`Modified clip, refusing overwrite: ${file}`);
  return true;
}

function encode(text, wav, manifest) {
  const relative = clipPath(text);
  const file = path.join(root, relative);
  if (fs.existsSync(file)) throw new Error(`Refusing to overwrite unknown clip: ${file}`);
  const temp = path.join(cache, `${path.basename(file)}.${process.pid}.tmp.mp3`);
  const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-i', wav,
    '-af', 'adelay=100:all=1,apad=pad_dur=0.15', '-ac', '1', '-ar', '22050',
    '-c:a', 'libmp3lame', '-b:a', '48k', '-map_metadata', '-1', temp]);
  if (result.error || result.status !== 0) throw new Error(`Encode failed: ${result.error || result.stderr}`);
  const data = fs.readFileSync(temp);
  const metadata = { path: relative, bytes: data.length, ...decode(temp),
    sha256: hash(data), sampleRate: 22050, channels: 1, bitrate: 48000,
    padding: { leadingSeconds: 0.1, trailingSeconds: 0.15 } };
  // Receipt precedes publication so an interrupted publish can be recovered safely.
  writeJson(path.join(cache, `${path.basename(file)}.receipt.json`), { version, voice, text, clip: metadata });
  // Exclusive publication: a newly appearing unknown destination is never replaced.
  fs.linkSync(temp, file);
  fs.unlinkSync(temp);
  manifest.clips[text] = metadata;
  writeJson(manifestFile, manifest);
  fs.unlinkSync(wav);
}

function makeReport(data, manifest, started, generated, verifyOnly) {
  const missing = [];
  let bytes = 0;
  let duration = 0;
  const verified = new Map();
  for (const text of data.unique) {
    const clip = manifest.clips[text];
    if (!clip || !validateOwned(text, clip)) { missing.push(text); continue; }
    const signal = verifyOnly ? decode(path.join(root, clip.path)) : {
      peak: clip.peak, duration: clip.duration, decodedSamples: clip.decodedSamples,
    };
    if (!(signal.peak > 0)) throw new Error(`No nonzero decode verification: ${text}`);
    verified.set(text, signal);
    bytes += clip.bytes;
    duration += signal.duration;
  }
  const coverage = Object.fromEntries(Object.keys(data.summary.fields).map(field => {
    const sources = data.sources.filter(item => item.field === field);
    return [field, { sourceTextTotal: sources.length, covered: sources.filter(item => verified.has(item.text)).length }];
  }));
  const samples = data.sources.filter(item => item.lesson === 23 && item.field === 'text').map(item => ({
    index: item.index, text: item.text, path: clipPath(item.text), exists: verified.has(item.text),
    ...(verified.get(item.text) || {}),
  }));
  const report = { generator: 'build-speech-audio', version, generatedAt: new Date().toISOString(),
    voice, encoding: { volume: 100, channels: 1, sampleRate: 22050, codec: 'mp3', bitrate: 48000,
      leadingPaddingSeconds: 0.1, trailingPaddingSeconds: 0.15 },
    ...data.summary, requestedScope: lessonId ? `lesson-${lessonId}` : 'all',
    generatedThisRun: generated, elapsedSeconds: +((Date.now() - started) / 1000).toFixed(2),
    clips: { expected: data.unique.length, actualPresent: verified.size, missing: missing.length,
      totalBytes: bytes, totalDurationSeconds: +duration.toFixed(3) }, coverage,
    verification: { method: 'ffmpeg decoded mono 22050 Hz PCM; peak > 0',
      verifiedClipCount: verified.size, freshDecodeThisRun: verifyOnly,
      minimumPeak: verified.size ? Math.min(...[...verified.values()].map(item => item.peak)) : null,
      maximumPeak: verified.size ? Math.max(...[...verified.values()].map(item => item.peak)) : null,
      l23Text: samples },
    missingTexts: missing,
    boundaries: { offlineLocalSapiOnly: true, onlineTts: false, published: false,
      humanListeningVerified: false, realDeviceVerified: false,
      accentNote: 'Reference American English (en-US). Existing British IPA may differ; not a British pronunciation model.',
      deployment: 'Static audio/ paths require repository publication by the owner; no website change before publication.' },
  };
  report.runHistory = [];
  if (fs.existsSync(reportFile)) {
    const old = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    if (old.generator !== report.generator) throw new Error('Refusing to overwrite unknown generation record.');
    report.runHistory = old.runHistory || [{ scope: old.requestedScope, generated: old.generatedThisRun,
      elapsedSeconds: old.elapsedSeconds, completedAt: old.generatedAt }];
    report.lastFullDecodeVerification = old.lastFullDecodeVerification ||
      (old.verification?.freshDecodeThisRun && !old.clips.missing ? {
        completedAt: old.generatedAt, clipCount: old.verification.verifiedClipCount,
        minimumPeak: old.verification.minimumPeak, maximumPeak: old.verification.maximumPeak,
        elapsedSeconds: old.elapsedSeconds,
      } : null);
  }
  if (verifyOnly && !missing.length) report.lastFullDecodeVerification = {
    completedAt: report.generatedAt, clipCount: verified.size,
    minimumPeak: report.verification.minimumPeak, maximumPeak: report.verification.maximumPeak,
    elapsedSeconds: report.elapsedSeconds,
  };
  report.runHistory.push({ scope: report.requestedScope, generated,
    mode: verifyOnly ? 'fresh-decode-verification' : 'generation',
    elapsedSeconds: report.elapsedSeconds, completedAt: report.generatedAt });
  const files = fs.readdirSync(path.join(audio, 'voice')).filter(file => file.endsWith('.mp3'));
  report.clips.mp3FilesOnDisk = files.length;
  const expectedPaths = new Set(data.unique.map(text => path.basename(clipPath(text))));
  report.clips.unknownMp3FilesPreserved = files.filter(file => !expectedPaths.has(file));
  writeJson(reportFile, report);
  console.log(JSON.stringify({ ...report.clips, generated, elapsedSeconds: report.elapsedSeconds, coverage, l23: samples }, null, 2));
  return report;
}

const args = process.argv.slice(2);
const lessonOption = args.indexOf('--lesson');
const lessonId = lessonOption >= 0 ? Number(args[lessonOption + 1]) : null;
async function main() {
  const started = Date.now();
  const data = inventory();
  console.log(JSON.stringify(data.summary, null, 2));
  if (args.includes('--inventory')) return;
  if (lessonOption >= 0 && !data.lessons.some(item => item.id === lessonId)) throw new Error('Invalid text lesson ID.');
  if (!fs.existsSync(ffmpeg)) throw new Error(`Local ffmpeg not found: ${ffmpeg}`);
  fs.mkdirSync(path.join(audio, 'voice'), { recursive: true });
  fs.mkdirSync(cache, { recursive: true });
  const manifest = loadManifest();
  const priority = data.sources.filter(item => item.lesson === 23).map(item => item.text);
  const selected = lessonId ? data.sources.filter(item => item.lesson === lessonId).map(item => item.text) : [...priority, ...data.unique];
  const pending = [];
  for (const text of [...new Set(selected)]) {
    let metadata = manifest.clips[text];
    const receipt = path.join(cache, `${path.basename(clipPath(text))}.receipt.json`);
    if (!metadata && fs.existsSync(receipt)) {
      const owner = JSON.parse(fs.readFileSync(receipt, 'utf8'));
      if (owner.version !== version || owner.text !== text || JSON.stringify(owner.voice) !== JSON.stringify(voice)) {
        throw new Error(`Unknown receipt: ${receipt}`);
      }
      metadata = owner.clip;
    }
    if (metadata && validateOwned(text, metadata)) { manifest.clips[text] = metadata; continue; }
    if (fs.existsSync(path.join(root, clipPath(text)))) throw new Error(`Unknown existing file: ${clipPath(text)}`);
    pending.push(text);
  }
  writeJson(manifestFile, manifest);
  if (args.includes('--verify')) {
    const report = makeReport(data, manifest, started, 0, true);
    if (report.clips.missing && !lessonId) throw new Error('Full verification has missing clips.');
    return;
  }
  let generated = 0;
  // Per-run WAV names keep unknown cache files untouched. WAVs removed only after successful publication.
  const requests = pending.map(text => ({ text, wav: path.join(cache, `${hash(text).slice(0, 16)}.${process.pid}.wav`) }));
  if (requests.length) {
    const requestFile = path.join(cache, `requests-${process.pid}.json`);
    fs.writeFileSync(requestFile, JSON.stringify(requests), { flag: 'wx' });
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      path.join(__dirname, 'build-speech-audio.ps1'), '-Requests', requestFile, '-VoiceName', voice.name],
    { stdio: ['ignore', 'pipe', 'inherit'] });
    let buffer = '';
    await new Promise((resolve, reject) => {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', chunk => {
        buffer += chunk;
        let newline;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;
          try {
            const item = JSON.parse(line);
            if (!requests.some(request => request.text === item.text && request.wav === item.wav)) throw new Error('Unknown worker output.');
            encode(item.text, item.wav, manifest);
            generated++;
            if (generated % 50 === 0 || generated === requests.length) {
              const elapsed = (Date.now() - started) / 1000;
              console.log(`Generated ${generated}/${requests.length}; elapsed ${elapsed.toFixed(1)}s; remaining ~${(elapsed / generated * (requests.length - generated)).toFixed(0)}s`);
            }
          } catch (error) { child.kill(); reject(error); return; }
        }
      });
      child.on('error', reject);
      child.on('close', code => code === 0 ? resolve() : reject(new Error(`SAPI worker exited ${code}.`)));
    });
    fs.unlinkSync(requestFile);
  }
  const report = makeReport(data, manifest, started, generated, false);
  if (report.clips.missing && !lessonId) throw new Error('Generation incomplete. Rerun to resume.');
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
