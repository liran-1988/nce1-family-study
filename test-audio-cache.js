const fs=require('fs'),vm=require('vm'),assert=require('assert');
const callbacks={},cacheRows=new Map();let fetchFails=false;
const self={location:{href:'https://example.test/nce1/sw.js',origin:'https://example.test'},addEventListener:(name,fn)=>callbacks[name]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}};
const cache={match:async key=>{const r=cacheRows.get(typeof key==='string'?key:key.url);return r?.clone();},put:async(key,response)=>cacheRows.set(typeof key==='string'?key:key.url,response.clone()),addAll:async()=>{}};
const ctx={self,URL,Request,Response,Headers,Promise,setTimeout,caches:{open:async()=>cache,keys:async()=>[],delete:async()=>true},fetch:async()=>{if(fetchFails)throw Error('offline');return new Response(new Uint8Array(20),{status:200,headers:{'Content-Type':'audio/mpeg'}})}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/sw.js','utf8'),ctx);
(async()=>{
 const url='https://example.test/nce1/audio/voice/abcdef.mp3',bytes=Uint8Array.from({length:20},(_,i)=>i);
 cacheRows.set(url,new Response(bytes,{headers:{'Content-Type':'audio/mpeg'}}));fetchFails=true;
 let events=0;const event={waitUntil:()=>events++};
 let response=await ctx.audioFetch(new Request(url),event);assert.equal(response.status,200);assert.equal((await response.arrayBuffer()).byteLength,20);
 response=await ctx.audioFetch(new Request(url,{headers:{Range:'bytes=2-5'}}),event);assert.equal(response.status,206);assert.equal(response.headers.get('Content-Range'),'bytes 2-5/20');assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[2,3,4,5]);
 response=await ctx.audioFetch(new Request(url,{headers:{Range:'bytes=-4'}}),event);assert.equal(response.status,206);assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[16,17,18,19]);
 response=await ctx.audioFetch(new Request(url,{headers:{Range:'bytes=99-'}}),event);assert.equal(response.status,416);
 response=await ctx.audioFetch(new Request('https://example.test/nce1/audio/voice/missing.mp3'),event);assert.equal(response.status,503);
 cacheRows.set('https://example.test/nce1/index.html',new Response('cached page'));response=await ctx.pageFetch(new Request('https://example.test/nce1/'),event);assert.equal(await response.text(),'cached page');
 let intercepted=false;callbacks.fetch({request:new Request('https://other.test/audio/voice/abcdef.mp3'),respondWith(){intercepted=true;}});assert.equal(intercepted,false);
 callbacks.fetch({request:new Request('https://example.test/nce1/videos/001.mp4'),respondWith(){intercepted=true;}});assert.equal(intercepted,false);
 console.log('8项缓存/Range/缺失离线/跨源边界测试通过；模拟SW不是手机系统通过。');
})().catch(e=>{console.error(e);process.exitCode=1;});
