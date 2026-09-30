// merge.js —— 合并 6 批课文数据，校验后生成 data.js 并内联进 index.html（单文件交付）
// 用法：node merge.js
const fs = require("fs");
const path = require("path");
const dir = __dirname;

const batches = [1, 2, 3, 4, 5, 6].map(i =>
  JSON.parse(fs.readFileSync(path.join(dir, `data-b${i}.json`), "utf8")));

// ---- 校验 ----
const errs = [];
const seen = new Set();
const text = [];
for (const b of batches) for (const l of b) {
  if (seen.has(l.id)) errs.push(`重复课号: ${l.id}`);
  seen.add(l.id);
  if (l.id % 2 === 0) errs.push(`正文课课号应为奇数: ${l.id}`);
  if (!l.title || !l.titleCn) errs.push(`缺标题: Lesson ${l.id}`);
  if (!Array.isArray(l.words) || l.words.length < 5 || l.words.length > 10)
    errs.push(`词汇数异常(${(l.words || []).length}): Lesson ${l.id}`);
  if (!Array.isArray(l.patterns) || l.patterns.length < 2)
    errs.push(`句型不足(${(l.patterns || []).length}): Lesson ${l.id}`);
  if (!l.grammar) errs.push(`缺语法要点: Lesson ${l.id}`);
  if (!l.tip) errs.push(`缺记忆贴士: Lesson ${l.id}`);
  (l.words || []).forEach(w => {
    if (!w.en || !w.cn) errs.push(`词条缺字段: Lesson ${l.id} ${JSON.stringify(w)}`);
    if (!/^[a-zA-Z].*/.test(w.en)) errs.push(`词条 en 异常: Lesson ${l.id} ${w.en}`);
  });
  (l.patterns || []).forEach(p => { if (!p.en || !p.cn) errs.push(`句型缺字段: Lesson ${l.id}`); });
  text.push(l);
}
const missing = [];
for (let i = 1; i <= 143; i += 2) if (!seen.has(i)) missing.push(i);
if (missing.length) errs.push(`缺正文课: Lesson ${missing.join(", ")}`);

// ---- 课文原文（text-b1~4.json，id → 逐句中英对照）----
const textMap = Object.assign({}, ...[1, 2, 3, 4].map(i =>
  JSON.parse(fs.readFileSync(path.join(dir, `text-b${i}.json`), "utf8"))));
let textLines = 0;
for (const l of text) {
  const t = textMap[l.id];
  if (!Array.isArray(t) || t.length < 3 || t.some(x => !x.en || !x.cn)) {
    errs.push(`课文缺失/不完整: Lesson ${l.id}`);
  } else { l.text = t; textLines += t.length; }
}

// ---- 老师讲语法（grammar-b1~4.json，id → 教学块）----
const teachMap = Object.assign({}, ...[1, 2, 3, 4].map(i =>
  JSON.parse(fs.readFileSync(path.join(dir, `grammar-b${i}.json`), "utf8"))));
for (const l of text) {
  const g = teachMap[l.id];
  if (!g || !g.chat || !g.formula || !Array.isArray(g.examples) || g.examples.length < 1 || !g.watch) {
    errs.push(`语法讲解缺失/不完整: Lesson ${l.id}`);
  } else { l.teach = g; }
}

// ---- 随堂练（quiz-b1~3.json，id → {g:[语法练], c:[课文理解]}）----
const quizMap = Object.assign({}, ...[1, 2, 3].map(i =>
  JSON.parse(fs.readFileSync(path.join(dir, `quiz-b${i}.json`), "utf8"))));
let exTotal = 0;
for (const l of text) {
  const ex = quizMap[l.id];
  if (!ex || !Array.isArray(ex.g) || !Array.isArray(ex.c) || (ex.g.length + ex.c.length) < 3) {
    errs.push(`随堂练缺失/不足: Lesson ${l.id}`);
    continue;
  }
  const norm = arr => arr.map(it => {
    if (!it.q || !Array.isArray(it.opts) || it.opts.length !== 4 || !Number.isInteger(it.a) || it.a < 0 || it.a > 3) {
      errs.push(`题目异常: Lesson ${l.id} ${(it.q || '').slice(0, 20)}`);
      return null;
    }
    exTotal++;
    return { ...it, q: it.q, opts: it.opts, a: it.opts[it.a], why: it.why || '', hint: it.hint || '' };
  }).filter(Boolean);
  l.ex = { g: norm(ex.g), c: norm(ex.c) };
}

// ---- 生成偶数练习课占位 ----
const drills = [];
for (let i = 2; i <= 144; i += 2)
  drills.push({ id: i, title: "Exercises", titleCn: "配套练习", kind: "drill", refId: i - 1 });
const all = text.concat(drills).sort((a, b) => a.id - b.id);
if (all.length !== 144) errs.push(`总课数异常: ${all.length}`);

// ---- 审核告警（不阻塞构建，提示人工复核；2026-09-30 审核报告 P2/P1 建议）----
const warns = [];
// 1) 坏干扰项：选项去空格后重复（如 "time s" 冒充新选项）
for (const l of text) for (const g of ["g", "c"]) for (const it of (quizMap[l.id] || {})[g] || []) {
  const norm = it.opts.map(o => o.replace(/\s+/g, ""));
  if (new Set(norm).size !== 4)
    warns.push(`坏干扰项(去空格后重复): Lesson ${l.id} 「${(it.q || "").slice(0, 20)}」`);
}
// 2) 句型-课文一致性：未标 drill 的句型，实词应 ≥70% 出现在本课课文；
//    不满足 → 要么是练习课句型（标 "drill":true），要么课文誊录有出入（如 L21 缺 please）
const STOP = ["the", "and", "that", "you", "your", "for", "with", "are", "not"];
for (const l of text) {
  const corpus = (l.text || []).map(s => s.en).join(" ").toLowerCase().replace(/n't/g, " not ").replace(/[^a-z ]/g, " ");
  for (const p of l.patterns) {
    if (p.drill) continue;
    const ws = p.en.toLowerCase().replace(/n't/g, " not ").replace(/[^a-z ]/g, " ").split(/\s+/)
      .filter(w => w.length >= 3 && !STOP.includes(w));
    if (!ws.length) continue;
    const hit = ws.filter(w => corpus.includes(w)).length;
    if (hit / ws.length < 0.7)
      warns.push(`句型疑非课文句(确认后标 drill): Lesson ${l.id} "${p.en}"`);
  }
}
// 3) 长行疑并句：单行 >30 词提示拆分粒度（已知 L103/107/111/113/121/129 待纸书批注后统一拆）
for (const l of text) {
  const n = (l.text || []).filter(s => s.en.split(/\s+/).length > 30).length;
  if (n) warns.push(`长行疑并句(${n}行>30词，待纸书核对后拆分): Lesson ${l.id}`);
}

if (errs.length) {
  console.error("校验失败:\n" + errs.join("\n"));
  process.exit(1);
}

// 本机D盘/MP4清单不进入Android运行页面，媒体由受控本地映射与SAF授权加载。
const sourceMapPath = path.join(dir, 'delivery-android', 'verified-course-map.json');
if (!fs.existsSync(sourceMapPath)) throw new Error('缺少教材来源映射，拒绝生成未标来源页面');
const rawSources = JSON.parse(fs.readFileSync(sourceMapPath, 'utf8'));
const sourceMap = {policy: rawSources.policy, lessons: rawSources.lessons.map(row => ({lesson:row.lesson,studentPdfPage:row.studentPdfPage,studentPrintedPage:row.studentPrintedPage,verified:row.verified,status:row.status,verifiedScope:row.verifiedScope,workbookPages:(row.sourceRefs||[]).filter(r=>r.source==='workbook').map(r=>r.pdfPage),answerPages:(row.sourceRefs||[]).filter(r=>r.source==='answers').map(r=>r.pdfPage),teacherPages:(row.sourceRefs||[]).filter(r=>r.source==='teacher').map(r=>r.pdfPage)}))};

const mediaMapPath = path.join(dir, 'android-app', 'media-map.json');
if (!fs.existsSync(mediaMapPath)) throw new Error('缺少 android-app/media-map.json，拒绝生成无视频映射页面');
const rawMediaMap = JSON.parse(fs.readFileSync(mediaMapPath, 'utf8'));
const videoMap = { version: rawMediaMap.version || 1, videos: rawMediaMap.videos || {} };

// ---- 写 data.js 并内联进 index.html ----
const js = "const LESSONS=" + JSON.stringify(all) + ";";
fs.writeFileSync(path.join(dir, "data.js"), js, "utf8");
const htmlPath = path.join(dir, "index.html");
const html = fs.readFileSync(htmlPath, "utf8");
const re = /\/\*__DATA__\*\/[\s\S]*?\/\*__END_DATA__\*\//;
if (!re.test(html)) { console.error("index.html 缺少 /*__DATA__*/ 占位区"); process.exit(1); }
const reSources = /\/\*__SOURCES__\*\/[\s\S]*?\/\*__END_SOURCES__\*\//;
if (!reSources.test(html)) throw new Error('index.html 缺少教材来源区');
const reVideos = /\/\*__VIDEOS__\*\/[\s\S]*?\/\*__END_VIDEOS__\*\//;
let withVideos = html;
if (!reVideos.test(withVideos)) {
  if (!/\/\*__END_SOURCES__\*\/\s*<\/script>/.test(withVideos)) {
    throw new Error('index.html 缺少 SOURCES 结束 script，无法插入视频映射区');
  }
  withVideos = withVideos.replace(
    /\/\*__END_SOURCES__\*\/\s*<\/script>/,
    '/*__END_SOURCES__*/</script>\n<script>/*__VIDEOS__*/const VIDEO_MAP={};/*__END_VIDEOS__*/</script>'
  );
}
let updated = withVideos
  .replace(re, () => "/*__DATA__*/" + js + "/*__END_DATA__*/")
  .replace(reSources, () => '/*__SOURCES__*/const COURSE_SOURCES=' + JSON.stringify(sourceMap) + ';/*__END_SOURCES__*/')
  .replace(/\/\*__VIDEOS__\*\/[\s\S]*?\/\*__END_VIDEOS__\*\//, () => '/*__VIDEOS__*/const VIDEO_MAP=' + JSON.stringify(videoMap) + ';/*__END_VIDEOS__*/');
const runtimePath = path.join(dir, 'app-runtime.js');
const esbuild = require(path.join(dir, '../.agent_cache/nce-android-delivery/js-tools/node_modules/esbuild'));
const runtimeCompatible = esbuild.transformSync(fs.readFileSync(runtimePath, 'utf8'), {target:'chrome61',minify:false,charset:'utf8'}).code;
const polyfill = 'if(!Object.fromEntries){Object.fromEntries=function(pairs){return pairs.reduce(function(out,pair){out[pair[0]]=pair[1];return out;},{});};}\n';
const reRuntime = /\/\*__RUNTIME__\*\/[\s\S]*?\/\*__END_RUNTIME__\*\//;
if (!reRuntime.test(updated)) throw new Error('index.html 缺少运行程序区');
updated = updated.replace(reRuntime, () => '/*__RUNTIME__*/\n' + polyfill + runtimeCompatible + '\n/*__END_RUNTIME__*/');
fs.writeFileSync(htmlPath, updated, 'utf8');

const wordsTotal = text.reduce((s, l) => s + l.words.length, 0);
const patsTotal = text.reduce((s, l) => s + l.patterns.length, 0);
const videoLessonCount = Object.keys(videoMap.videos || {}).length;
console.log(`OK: 正文课 ${text.length} 课，练习课 ${drills.length} 课，合计 ${all.length} 课`);
console.log(`词汇 ${wordsTotal} 条，句型 ${patsTotal} 句，课文原文 ${textLines} 句，语法讲解 ${text.length} 课，随堂练 ${exTotal} 题`);
console.log(`视频映射 ${videoLessonCount} 课；data.js ${(js.length / 1024).toFixed(1)}KB；index.html 已内联，单文件 ${(fs.statSync(htmlPath).size / 1024).toFixed(1)}KB`);
if (warns.length) console.log(`\n⚠ 审核告警 ${warns.length} 条（不阻塞）:\n` + warns.join("\n"));
