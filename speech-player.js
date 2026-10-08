/* Offline lesson clips are same-origin files, never a remote TTS request. */
function createNceSpeechPlayer(options) {
  const win=options.window||window;
  const timers=options.timers||win;
  const normalize=t=>String(t||'').trim().replace(/\s+/g,' ');
  const getManifest=()=>options.getManifest?options.getManifest():win.NCE_AUDIO_MANIFEST;
  let sequence=0,current=null;
  let status={state:'idle',engine:null,code:null,text:'',message:'未播放。'};
  function report(state,engine,text,code,message){status={state,engine,text,code:code||null,message};if(options.onStatus)options.onStatus({...status});}
  function synth(){try{return win.speechSynthesis;}catch{return null;}}
  function voices(){try{const s=synth();return s&&typeof s.getVoices==='function'?s.getVoices()||[]:[];}catch{return [];}}
  function localVoice(){const a=voices().filter(v=>v.localService===true&&/^en([-_]|$)/i.test(v.lang||''));return a.find(v=>/^en[-_]GB/i.test(v.lang))||a.find(v=>v.default)||a[0]||null;}
  function hasApi(){const s=synth();return !!(s&&typeof s.speak==='function'&&typeof win.SpeechSynthesisUtterance==='function');}
  function cleanup(job){if(job.utterance){job.utterance.onstart=null;job.utterance.onend=null;job.utterance.onerror=null;}if(job.engine==='synthesis'){try{synth()?.cancel();}catch{}}if(job.engine==='native'){try{win.AndroidMedia?.stopSpeech?.();}catch{}}for(const handle of job.timers||[])timers.clearTimeout(handle);for(const release of job.listeners||[])release();if(job.audio){try{job.audio.pause();job.audio.removeAttribute('src');job.audio.load();}catch{}}}
  function cancel(){sequence++;const old=current;current=null;if(old){cleanup(old);if(old.engine==='native'){try{win.AndroidMedia?.stopSpeech?.();}catch{}}if(old.engine==='synthesis'){try{synth()?.cancel();}catch{}}}report('idle',null,'',null,'已停止，不会自动续播。');}
  function active(job){return current===job&&job.id===sequence;}
  function schedule(job,fn,ms){const handle=timers.setTimeout(()=>{if(active(job))fn();},ms);job.timers.push(handle);return handle;}
  function finish(job){if(!active(job))return;const callback=job.onEnd;current=null;cleanup(job);report('ended',job.engine,job.text,null,'播放结束；是否确实听到请由使用者确认。');if(callback)callback();}
  function fail(job,code,message){if(!active(job))return;current=null;cleanup(job);report('error',job.engine,job.text,code,message);if(options.onError)options.onError(message,code);if(job.onError)job.onError(code);}
  function listen(job,target,event,fn){target.addEventListener(event,fn);job.listeners.push(()=>target.removeEventListener(event,fn));}
  function safeClip(job){const clip=getManifest()?.clips?.[job.text];if(!clip)return null;const path=clip.path||clip;return typeof path==='string'&&/^audio\/voice\/[a-z0-9-]+\.mp3$/i.test(path)?{...clip,path}:null;}
  function audioError(job,error){if(!active(job))return;const code=error?.name==='NotAllowedError'?'gesture-required':error?.name==='AbortError'?'play-aborted':'clip-unavailable';const message=code==='gesture-required'?'浏览器阻止了播放，请直接点击“再试播放”，并确认媒体音量。':code==='play-aborted'?'播放被中断，请再点一次；不会自动重试。':'本句声音文件没能加载。请检查音频文件是否已随网页发布；离线时请先联网缓存本课声音。';fail(job,code,message);}
  function playClip(job,clip){job.engine='clip';report('loading','clip',job.text,null,'正在加载本句声音；首次需读取音频文件。');let audio;
    try{audio=options.createAudio?options.createAudio():new win.Audio();}catch{fail(job,'audio-unavailable','这个浏览器不能创建音频播放器，请用独立Chrome或Edge打开。');return;}
    job.audio=audio;audio.preload='auto';audio.playbackRate=job.rate;audio.volume=1;audio.muted=false;audio.src=clip.path;
    listen(job,audio,'playing',()=>{if(!active(job))return;job.started=true;report('playing','clip',job.text,null,'正在播放。若没听到，请检查媒体音量或蓝牙输出。');});
    listen(job,audio,'ended',()=>finish(job));
    listen(job,audio,'error',()=>audioError(job));
    schedule(job,()=>{if(!job.started)fail(job,'load-timeout','声音文件迟迟没有开始，请检查网络/离线缓存，再主动点播放。');},10000);
    const duration=Number(clip.duration||clip.durationSeconds)||Math.max(5,job.text.length*.12);
    schedule(job,()=>fail(job,'play-timeout','这次声音播放超时，已停止。可以再点一次，不会偷偷跳到下一句。'),Math.max(20000,duration/job.rate*1000+15000));
    try{const result=audio.play();if(result&&typeof result.catch==='function')result.catch(e=>audioError(job,e));}catch(e){audioError(job,e);}
  }
  function playSynthesis(job,voice){if(!active(job))return;job.engine='synthesis';let utterance;
    try{utterance=new win.SpeechSynthesisUtterance(job.text);utterance.voice=voice;utterance.lang=voice.lang;utterance.rate=job.rate;utterance.volume=1;
      job.utterance=utterance;
      utterance.onstart=()=>{if(active(job)){job.started=true;report('playing','synthesis',job.text,null,'设备离线音色正在朗读；需实际听辨确认。');}};
      utterance.onend=()=>finish(job);
      utterance.onerror=e=>{if(!active(job))return;const code=e.error||'synthesis-error';const messages={'not-allowed':'浏览器阻止朗读，请再直接点一次播放。','voice-unavailable':'设备英语音色不可用，请检查离线英语语音数据。','language-unavailable':'设备没有可用英语语音数据，请家长检查语音设置。','audio-busy':'其他音频正在占用输出，请暂停它后重试。','audio-hardware':'音频输出不可用，请检查媒体音量、蓝牙或耳机。','network':'所选语音引擎仍要求网络；本页不会改用在线TTS。','interrupted':'朗读被其他操作中断，请主动重试。','canceled':'这次朗读被取消。'};fail(job,code,messages[code]||'设备朗读失败，请检查离线英语音色或播放本课已缓存音频。');};
      report('loading','synthesis',job.text,null,'已请求设备朗读，等待音频开始。');
      schedule(job,()=>{if(!job.started)fail(job,'synthesis-start-timeout','设备语音没有开始，请重新点播放；可以使用本页的备用声音文件。');},7000);
      schedule(job,()=>fail(job,'synthesis-timeout','设备朗读超时，已停止，不会自动跳句。'),Math.max(20000,job.text.length/job.rate*250+12000));
      synth().speak(utterance);
    }catch{fail(job,'synthesis-exception','设备语音接口异常，请用备用音频或检查英语音色设置。');}
  }
  function fallback(job){if(!hasApi()){fail(job,'api-unavailable','这个网页环境没有提供设备朗读接口。本句也没有可用的备用声音文件，请确认audio目录已发布；可用独立Chrome/Edge重试。');return;}
    const voice=localVoice();if(voice){playSynthesis(job,voice);return;}
    const existing=voices();if(existing.length){fail(job,'no-local-english','设备没有标记为离线的英语音色，本页不会自动调用在线TTS；请使用备用声音文件或准备离线英语语音数据。');return;}
    report('waiting-voices','synthesis',job.text,null,'英语音色尚在加载，稍候后请再点播放。');
    const ready=()=>{if(!active(job)||!localVoice())return;current=null;cleanup(job);report('ready','synthesis',job.text,'tap-again','英语音色已就绪，请再直接点一次播放。');if(job.onError)job.onError('tap-again');};
    if(typeof synth()?.addEventListener==='function')listen(job,synth(),'voiceschanged',ready);
    schedule(job,()=>{if(localVoice()){ready();return;}fail(job,'voice-load-timeout','没有读到可用离线英语音色。请检查设备语音数据；这与视频有没有声音不是同一问题。');},2500);
    ready();
  }
  function speak(text,settings={}){cancel();const job={id:sequence,text:normalize(text),rate:Math.min(1.3,Math.max(.6,Number(settings.rate)||.85)),onEnd:settings.onEnd,onError:settings.onError,timers:[],listeners:[],engine:null,started:false};if(!job.text){report('idle',null,'','empty','没有可朗读内容。');return;}current=job;
    const bridge=win.AndroidMedia;
    if(bridge&&typeof bridge.speak==='function'){job.engine='native';report('loading','native',job.text,null,'已请求Android离线英语音色。');try{bridge.speak(job.text,job.rate);schedule(job,()=>fail(job,'native-timeout','Android语音未完成，请检查离线英语音色或重新播放。'),Math.max(20000,job.text.length/job.rate*250+12000));return;}catch{job.engine=null;}}
    const clip=safeClip(job);if(clip){playClip(job,clip);return;}
    fallback(job);
  }
  function nativeEnd(){if(current?.engine==='native')finish(current);}
  function nativeError(){if(current?.engine==='native')fail(current,'native-error','Android离线英语朗读不可用，请家长检查本机音色；本页不会下载或调用在线TTS。');}
  function diagnostics(){const clips=getManifest()?.clips||{};const list=voices();return {state:status.state,engine:status.engine,code:status.code,message:status.message,apiSupported:hasApi(),voiceCount:list.length,localEnglishCount:list.filter(v=>v.localService===true&&/^en([-_]|$)/i.test(v.lang||'')).length,bundledClipCount:Object.keys(clips).length,manifestVersion:getManifest()?.version||null,online:win.navigator?.onLine??null,native:!!win.AndroidMedia};}
  return {speak,stop:cancel,nativeEnd,nativeError,diagnostics,getStatus:()=>({...status})};
}
if(typeof module!=='undefined'&&module.exports)module.exports={createNceSpeechPlayer};
