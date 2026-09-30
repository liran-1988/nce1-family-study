const fs=require('fs'),path=require('path');
const root=__dirname,file=path.join(root,'index.html');
const backup=path.join(root,'../.agent_cache/nce-android-delivery/backup-ui');
fs.mkdirSync(backup,{recursive:true});
const old=fs.readFileSync(file,'utf8');
const b=path.join(backup,'index-before-android.html');if(!fs.existsSync(b))fs.writeFileSync(b,old);
const runtime=fs.readFileSync(path.join(root,'app-runtime.js'),'utf8');
new(require('vm').Script)(runtime);
let html=old;
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
const app=scripts.find(s=>s[1].includes('const state =')||s[1].includes('const state='));
if(!app)throw new Error('未找到当前应用runtime，拒绝覆盖');
html=html.replace(app[0],'<script>\n/*__RUNTIME__*/\n'+runtime+'\n/*__END_RUNTIME__*/\n</script>');
html=html.replace(/<script>\/\*__VIDEOS__\*\/[\s\S]*?\/\*__END_VIDEOS__\*\/<\/script>/,'');
if(!html.includes('/*__SOURCES__*/'))html=html.replace('<script>\n/*__RUNTIME__*/','<script>/*__SOURCES__*/const COURSE_SOURCES={};/*__END_SOURCES__*/</script>\n<script>\n/*__RUNTIME__*/');
const css=`
/*__CHILD_CSS__*/
html{scroll-padding-top:130px}body{font-size:17px}button,a,input,select{touch-action:manipulation}
.topbar{padding-top:max(8px,env(safe-area-inset-top));padding-left:max(10px,env(safe-area-inset-left));padding-right:max(10px,env(safe-area-inset-right))}
#view{padding-bottom:max(80px,calc(20px + env(safe-area-inset-bottom)))}
.btn,.btn.tiny,.w-btn,.icon-btn,.topbar-btn{min-height:44px}.w-btn{min-width:44px;opacity:1;filter:none}.btn.tiny{font-size:14px;padding:8px 12px}
.word-card{height:128px}.w-front b{padding-top:18px}.w-actions{top:2px}.w-front .ipa{font-size:14px}.w-front .flip-hint{font-size:12px}
.p-en,.tl-en{align-items:center}.tl-en span{min-width:0;flex:1}.tl-en .w-btn{flex:none}.speaker{color:var(--brand)}
.source-note,.q-hint{font-size:14px;text-align:left;color:var(--muted)}.native-note{font-size:14px;margin-top:12px;color:var(--muted)}
.quiz-card{max-height:calc(100dvh - 36px);overflow-y:auto}.q-head{gap:8px;align-items:center;flex-wrap:wrap}.q-word{font-size:21px;overflow-wrap:anywhere}.q-opt{min-height:48px}.q-opt:disabled{cursor:default;opacity:1}.q-opt.bad{animation:none}.q-opt.good{animation:none}
.practice-hint{margin-top:16px;padding:12px;background:var(--bg);border-radius:10px}.practice-hint summary{min-height:44px;cursor:pointer}.q-why{font-size:16px;line-height:1.8}.q-why p{margin:8px 0}
.spell-row{flex-wrap:wrap}.spell-input{min-width:0;width:100%;flex:1 1 160px;min-height:48px}.t-ex{flex-wrap:wrap;min-height:48px}.t-ex .e-en{flex-basis:100%}.t-ex .e-cn{text-align:left;font-size:15px}
.rep-row{padding:10px 0;display:flex;gap:14px;justify-content:space-between;border-bottom:1px solid var(--line)}.mist-item{flex-wrap:wrap;overflow-wrap:anywhere}.mist-item .m-main{min-width:170px}.mist-item .m-main i{font-size:13px}
select{max-width:100%;min-height:44px;font-size:16px;padding:8px;background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:8px}.hero p{line-height:1.8}
@media(max-width:600px){.topbar{flex-wrap:wrap}#search{flex-basis:100%;order:10;min-height:44px}.brand{font-size:15px}.sec-head h2{flex-basis:100%}.l-foot{justify-content:flex-start}.l-foot .btn{font-size:15px}.t-chat{font-size:17px;line-height:1.85}.word-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
/*__END_CHILD_CSS__*/
`;
const re=/\/\*__CHILD_CSS__\*\/[\s\S]*?\/\*__END_CHILD_CSS__\*\//;
html=re.test(html)?html.replace(re,css):html.replace('</style>',css+'</style>');
html=html.replace('<title>新概念英语1 · 144课学习手册</title>','<title>新概念英语 · 家庭离线学习</title>');
fs.writeFileSync(file,html);
console.log('应用runtime/儿童触控样式已内联；旧页面已保存在独立备份目录。');
