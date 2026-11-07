export function lyricWords(text){return String(text||'').replace(/\[[^\]\n]*\]/g,' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/[^a-z0-9\s]/g,' ').trim().split(/\s+/).filter(Boolean)}
export function matchLyric(lines,spoken,from=0){
 const words=lyricWords(spoken).slice(-14);if(words.length<3)return null;
 let best=null;for(let i=Math.max(0,from-1);i<Math.min(lines.length,from+15);i++){
  const target=lyricWords(lines[i]).slice(0,120);if(target.length<3)continue;
  const row=Array(target.length+1).fill(0);for(const word of words){let prior=0;for(let j=1;j<=target.length;j++){const old=row[j];row[j]=word===target[j-1]?prior+1:Math.max(row[j],row[j-1]);prior=old;}}
  const common=row[target.length],score=common/Math.min(target.length,words.length);if(common>=3&&score>=.6&&(!best||score>best.score))best={index:i,score};
 }return best;
}
export function cleanTimeline(value,lineCount=2000){
 if(!Array.isArray(value))return [];
 return value.filter(v=>v&&Number.isFinite(v.time)&&v.time>=0&&v.time<86400&&Number.isInteger(v.line)&&v.line>=0&&v.line<lineCount).slice(0,2000).map(v=>({time:Math.round(v.time*100)/100,line:v.line})).sort((a,b)=>a.time-b.time);
}
export function timedLine(timeline,time){if(!Number.isFinite(time)||time<0)return null;let found=null;for(const cue of timeline){if(cue.time>time)break;found=cue.line}return found}
function subtitleText(text){return String(text).replace(/<[^>]*>/g,'').replace(/&(?:amp|lt|gt|quot|apos|#39|#x27|nbsp);/g,v=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'",'&#x27;':"'",'&nbsp;':' '})[v]).replace(/&#(\d+);/g,(_,n)=>Number(n)>0&&Number(n)<0x110000?String.fromCodePoint(Number(n)):'').replace(/\s+/g,' ').trim().slice(0,1000)}
function subtitleTime(text){const parts=text.replace(',','.').split(':').map(Number);if(parts.length<2||parts.length>3||parts.some(v=>!Number.isFinite(v)||v<0)||parts.at(-1)>=60||parts.length===3&&parts[1]>=60)return NaN;return parts.reduce((n,v)=>n*60+v,0)}
export function parseSubtitleCues(value){
 const text=String(value||'').replace(/^\uFEFF/,'').replace(/\r/g,'');if(text.length>1800000)throw new Error('Tệp phụ đề quá lớn.');const cues=[];
 const add=(start,duration,phrase)=>{const clean=subtitleText(phrase);if(Number.isFinite(start)&&start>=0&&start<86400&&clean)cues.push({start:Math.round(start*1000)/1000,duration:Math.max(0,Math.min(120,Number(duration)||0)),text:clean})};
 if(/<(?:transcript|timedtext)[\s>]/i.test(text)){
  for(const match of text.matchAll(/<(text|p)\b([^>]*)>([\s\S]*?)<\/\1>/g)){const attrs=Object.fromEntries([...match[2].matchAll(/([a-z]+)=["']([^"']*)["']/g)].map(m=>[m[1],m[2]]));const scale=match[1]==='p'?1000:1;add(Number(attrs.start??attrs.t)/scale,Number(attrs.dur??attrs.d)/scale,match[3])}
 }else if(text.includes('-->')){
  for(const block of text.split(/\n\s*\n/)){if(/^\s*(NOTE|STYLE|REGION)\b/.test(block))continue;const rows=block.split('\n'),i=rows.findIndex(row=>row.includes('-->'));if(i<0)continue;const times=rows[i].trim().match(/^(\d{1,3}:\d{2}(?::\d{2})?[.,]\d{1,3})\s*-->\s*(\d{1,3}:\d{2}(?::\d{2})?[.,]\d{1,3})/);if(!times)continue;const start=subtitleTime(times[1]),end=subtitleTime(times[2]);if(end>start)add(start,end-start,rows.slice(i+1).join(' '))}
 }else{
  const offset=Number(text.match(/\[offset:([+-]?\d+)\]/i)?.[1]||0)/1000;
  for(const row of text.split('\n')){const phrase=row.replace(/\[[^\]]*\]/g,'').trim();if(!phrase)continue;for(const match of row.matchAll(/\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]/g)){if(Number(match[2])<60)add(Number(match[1])*60+Number(match[2])+offset,0,phrase)}}
 }
 return cues.sort((a,b)=>a.start-b.start).slice(0,6000);
}
export function parseLrc(text,lines){return captionTimeline(lines,parseSubtitleCues(text))}
export function readMusicText({native=false,call}={}){
 if(native)return call('readText');
 return new Promise((resolve,reject)=>{const input=document.createElement('input');input.type='file';input.accept='.lrc,.srt,.vtt,.xml,.json,.txt,text/*,application/json';input.hidden=true;document.body.append(input);input.oncancel=()=>{input.remove();resolve('')};input.onchange=async()=>{try{const file=input.files?.[0];if(!file){resolve('');return}if(file.size>250000)throw new Error('Chọn tệp văn bản dưới 250 KB.');resolve(await file.text())}catch(error){reject(error)}finally{input.remove()}};input.click()});
}
export function captionTimeline(lines,cues){
 const targets=lines.slice(0,1200).map(text=>lyricWords(text));let from=0,last=-1;const result=[],recent=[];
 for(const cue of (Array.isArray(cues)?cues:[]).slice(0,3000)){
  if(!cue||!Number.isFinite(cue.start)||cue.start<0||typeof cue.text!=='string')continue;
  recent.push(cue);if(recent.length>3)recent.shift();
  const options=[{words:lyricWords(cue.text),start:cue.start},{words:lyricWords(recent.map(c=>c.text).join(' ')),start:recent[0].start}];let best=null;
  for(const option of options){const words=option.words.slice(-40),heard=new Set(words);if(words.length<3)continue;
   const find=(start,end)=>{for(let i=start;i<end;i++){const target=targets[i];if(target.length<3)continue;let common=0;const unique=new Set(target);for(const word of unique)if(heard.has(word))common++;
    const score=common/Math.max(3,Math.min(unique.size,heard.size));if(common>=3&&score>=.68){const rank=score+(i>=from&&i<from+5?.04:0)-Math.abs(i-from)*.0001;if(!best||rank>best.rank)best={line:i,time:option.start,rank};}}};
   find(Math.max(0,from-1),Math.min(targets.length,from+16));if(!best)find(0,targets.length);
  }
  if(best){from=best.line;if(last!==best.line){result.push({time:best.time,line:best.line});last=best.line;recent.length=0;}}
 }
 return cleanTimeline(result,lines.length);
}
export function createFollow({call,native,toast,getSong,getVideo,onHighlight,stopRegular}){
 const e=id=>document.getElementById(id);let mode='off',line=0,clock=null,settings={},lines=[],saveTimer,generation=0,picking=false;
 const loaded=call('settingsLoad').then(value=>{try{const object=JSON.parse(value);if(object&&typeof object==='object'&&!Array.isArray(object))settings=object}catch{}}).catch(()=>{});
 const key=()=>{const song=getSong(),video=getVideo();return song&&video?song.sourceUrl+'|'+video:null};
 const offset=()=>Math.max(-120,Math.min(120,Number(settings['offset:'+key()])||0));
 function status(text){e('follow-status').textContent=text;e('follow-live').hidden=!text;e('mark-line').hidden=mode!=='mark';e('follow-mode').value=mode}
 function highlight(index){line=Math.max(0,Math.min(lines.length-1,index));onHighlight(line)}
 function save(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>call('settingsSave',{value:JSON.stringify(settings)}).catch(error=>toast(error.message)),150)}
 function stop(){++generation;mode='off';call('speechStop').catch(()=>{});status('')}
 async function videoReady({reload=false}={}){
  const ticket=++generation;await loaded;if(ticket!==generation)return;const k=key(),id=getVideo();if(!k||!lines.length){toast('Mở video YouTube trước khi theo lời.');return}
  stopRegular();mode='time';
  if(!reload&&cleanTimeline(settings[k],lines.length).length){status('Lời đang theo thời gian YouTube · mốc đã lưu trên máy');return}
  status('Đang khớp lời với phụ đề của video YouTube…');
  try{const data=await call('api',{path:'/api/video-captions?'+new URLSearchParams({id})});if(ticket!==generation||id!==getVideo())return;
   const timeline=captionTimeline(lines,data.cues);
   if(!data.available||timeline.length<2){mode='off';status(data.reason||'Đã đọc phụ đề nhưng chưa khớp với lời bài hát. Thử bản thu khác hoặc nhập LRC/SRT/VTT.');return}
   settings[k]=timeline;save();status('Đang theo lời YouTube · '+timeline.length+' mốc khớp từ phụ đề');
  }catch{if(ticket===generation){mode='off';status('Chưa kết nối được phụ đề. Thử lại hoặc nhập LRC/SRT/VTT.')}}
 }
 function apply(){const selected=e('follow-mode').value;call('speechStop').catch(()=>{});stopRegular();if(selected==='time'){videoReady();e('follow-dialog').close();return}++generation;mode=selected==='mark'?'mark':'off';if(mode==='mark'&&!key()){mode='off';toast('Mở bản thu YouTube trước khi đánh dấu câu.');return}status(mode==='mark'?'Chọn dòng lời, đánh dấu khi câu trong video bắt đầu.':'');e('follow-dialog').close()}
 async function importText(text){await loaded;const k=key();if(!k)throw new Error('Mở bản thu YouTube trước.');const cues=parseLrc(text,lines);if(!cues.length)throw new Error('Đọc được tệp nhưng chưa khớp câu hát nào. Kiểm tra đúng bài và đúng bản thu.');++generation;settings[k]=cues;save();stopRegular();mode='time';status('Đang theo YouTube · '+cues.length+' mốc từ tệp của bạn');toast('Đã nhập '+cues.length+' mốc lời.');e('follow-dialog').close()}
 e('follow-open').addEventListener('click',async()=>{await loaded;e('follow-mode').value=mode==='off'?'time':mode;e('follow-offset').value=offset();e('follow-dialog').showModal()});e('follow-close').addEventListener('click',()=>e('follow-dialog').close());e('follow-apply').addEventListener('click',apply);
 e('follow-retry').addEventListener('click',()=>{videoReady({reload:true});e('follow-dialog').close()});
 e('follow-offset').addEventListener('change',async()=>{await loaded;if(!key())return;settings['offset:'+key()]=Math.max(-120,Math.min(120,Number(e('follow-offset').value)||0));e('follow-offset').value=offset();save();toast('Đã lưu độ dịch mốc cho bản thu này.')});
 e('follow-next').addEventListener('click',()=>highlight(line+1));
 e('mark-line').addEventListener('click',()=>{const k=key();if(!k||!clock||!Number.isFinite(clock.time)){toast('Chưa nhận được thời gian thật của video.');return}const cues=cleanTimeline(settings[k],lines.length).filter(c=>c.line!==line);cues.push({time:Math.max(0,clock.time-offset()),line});settings[k]=cleanTimeline(cues,lines.length);save();status('Đã ghi mốc '+clock.time.toFixed(1)+' giây · câu '+(line+1));highlight(line+1)});
 e('lrc-import').addEventListener('click',()=>importText(e('lrc-input').value).catch(error=>toast(error.message)));
 e('subtitle-file').addEventListener('click',async()=>{picking=true;try{const text=await readMusicText({native,call});if(text)await importText(text)}catch(error){toast(error.message)}finally{picking=false}});
 return {stop,videoReady,onSong(song){stop();lines=String(song?.content||'').split('\n');line=0;clock=null},select(index){highlight(index)},onTick(event){clock=event;if(mode==='time'&&event.id===getVideo()){const next=timedLine(cleanTimeline(settings[key()],lines.length),event.time-offset());if(next!==null&&next!==line)highlight(next)}},get permissionPending(){return picking},get mode(){return mode}};
}
