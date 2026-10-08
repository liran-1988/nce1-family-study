'use strict';
const SHELL_CACHE='nce1-family-web-audio-v2';
const AUDIO_CACHE='nce1-audio-web-voice-v1';
const CORE=['./','./index.html','./manifest.webmanifest','./video-config.js','./icons/icon-180.png','./icons/icon-192.png','./icons/icon-512.png'];
const INDEX=new URL('./index.html',self.location.href).href;
self.addEventListener('install',event=>{event.waitUntil(caches.open(SHELL_CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('nce1-family-')&&key!==SHELL_CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
async function cachedAudio(request,cached){
  const range=request.headers.get('Range');
  if(!range)return cached;
  const match=/^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if(!match)return new Response(null,{status:416});
  const data=await cached.arrayBuffer(),total=data.byteLength;
  let start=match[1]?Number(match[1]):0,end=match[2]?Number(match[2]):total-1;
  if(!match[1]&&match[2]){start=Math.max(0,total-Number(match[2]));end=total-1;}
  end=Math.min(end,total-1);
  if(start>end||start>=total)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${total}`}});
  const headers=new Headers(cached.headers);headers.set('Content-Range',`bytes ${start}-${end}/${total}`);headers.set('Content-Length',String(end-start+1));headers.set('Accept-Ranges','bytes');
  return new Response(data.slice(start,end+1),{status:206,headers});
}
async function audioFetch(request,event){
  const cache=await caches.open(AUDIO_CACHE),key=new Request(request.url),cached=await cache.match(key);
  if(cached)return cachedAudio(request,cached);
  try{const response=await fetch(request);if(response.status===200&&/^audio\//i.test(response.headers.get('Content-Type')||''))event.waitUntil(cache.put(key,response.clone()).catch(()=>{}));return response;}
  catch{return new Response('本句声音未缓存，请先联网缓存本课声音。',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});}
}
async function pageFetch(request,event){
  const cache=await caches.open(SHELL_CACHE);
  const network=fetch(request).then(response=>{if(response.ok)event.waitUntil(cache.put(INDEX,response.clone()).catch(()=>{}));return response;});
  try{return await Promise.race([network,new Promise((_,reject)=>setTimeout(()=>reject(new Error('network timeout')),4000))]);}
  catch{const cached=await cache.match(INDEX);if(cached)return cached;return new Response('首次使用需要联网打开页面。',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});}
}
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  if(/\/audio\/voice\/[a-z0-9-]+\.mp3$/i.test(url.pathname)){event.respondWith(audioFetch(event.request,event));return;}
  if(event.request.mode==='navigate'){event.respondWith(pageFetch(event.request,event));return;}
  if(url.pathname.includes('/videos/'))return;
  if(CORE.some(path=>new URL(path,self.location.href).href===url.href)){event.respondWith(caches.open(SHELL_CACHE).then(async cache=>(await cache.match(event.request))||fetch(event.request)));}
});
