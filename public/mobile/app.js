import {transpose,songUrl,validSong,offlineLibrary,catalogItems,readerSong,libraryBytes,bpmValue,videoId,videoList,videoEmbed} from './logic.js';
const $=id=>document.getElementById(id),pending=new Map();let seq=0;
const native=!!(window.GocAndroid||window.webkit?.messageHandlers?.goc);
const SITES_HOME='https://goc-hop-am.onwardcrust.chatgpt.site';let searchRequested=false;
function openSiteSearch(q=''){return call('siteOpen',{q:String(q||'').slice(0,120)})}
window.GocNativeReply=(id,ok,data)=>{const p=pending.get(id);if(!p)return;clearTimeout(p.timer);pending.delete(id);ok?p.resolve(data):p.reject(new Error(String(data||'Chưa thực hiện được.')))};
let metroTimer,metroAudio,metroBeat=0;
function stopWebMetro(){clearInterval(metroTimer);metroTimer=null;metroAudio?.close();metroAudio=null}
function webMetro(bpm,beats){stopWebMetro();metroAudio=new (window.AudioContext||window.webkitAudioContext)();metroBeat=0;const tick=()=>{const oscillator=metroAudio.createOscillator(),gain=metroAudio.createGain();oscillator.frequency.value=metroBeat===0?1100:740;gain.gain.setValueAtTime(.22,metroAudio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,metroAudio.currentTime+.055);oscillator.connect(gain).connect(metroAudio.destination);oscillator.start();oscillator.stop(metroAudio.currentTime+.06);window.GocNativeBeat(metroBeat);metroBeat=(metroBeat+1)%beats};tick();metroTimer=setInterval(tick,60000/bpm)}
function call(action,args={}){
 if(!native){
  if(action==='api')return fetch(args.path,{credentials:'omit',headers:{Accept:'application/json'}}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error||'Kho bài chưa phản hồi.');return data});
  if(action==='settingsLoad')return Promise.resolve(localStorage.getItem('goc-follow-v2')||'{}');
  if(action==='settingsSave'){localStorage.setItem('goc-follow-v2',args.value);return Promise.resolve(true)}
  if(action==='speechStop')return Promise.resolve(true);
  if(action==='load')return Promise.resolve(localStorage.getItem('goc-mobile-offline')||'{}');
  if(action==='save'){try{localStorage.setItem('goc-mobile-offline',args.value);return Promise.resolve(true)}catch{return Promise.reject(new Error('Thiết bị không còn đủ chỗ lưu.'))}}
  if(action==='metronome'){try{args.running?webMetro(args.bpm,args.beats):stopWebMetro();return Promise.resolve(true)}catch{return Promise.reject(new Error('Chưa phát được nhịp. Hãy kiểm tra âm lượng.'))}}
  if(action==='siteOpen'){window.open(SITES_HOME+'/?q='+encodeURIComponent(String(args.q||'')),'_blank','noopener');return Promise.resolve(true)}
  if(action==='help'){window.open(SITES_HOME+'/huong-dan','_blank','noopener');return Promise.resolve(true)}
  if(action==='share')return navigator.share?navigator.share({title:args.title,text:args.text,url:args.url}):Promise.reject(new Error('Thiết bị chưa hỗ trợ chia sẻ.'));
  return Promise.resolve(true);
 }
 return new Promise((resolve,reject)=>{const id=String(++seq),timer=setTimeout(()=>{pending.delete(id);reject(new Error('Yêu cầu quá lâu. Hãy kiểm tra mạng rồi thử lại.'))},(['recordPermission','recordScreenStart','recordStart','speechStart','readText','readAudio','saveText','printSheet'].includes(action)?180000:25000));pending.set(id,{resolve,reject,timer});const message={id,action,args};try{window.GocAndroid?window.GocAndroid.postMessage(JSON.stringify(message)):window.webkit.messageHandlers.goc.postMessage(message)}catch(error){clearTimeout(timer);pending.delete(id);reject(error)}});
}
let offline=Object.create(null),current=null,shift=0,font=20,request=0,opening=0,page=0,hasMore=false,mode='home',tab='library',scrollFrame=0,scrollTime=0,scrollCarry=0,metroRunning=false;
let currentVideo=null,videoRequest=0;
function videoChoices(){const select=$('video-choices');select.replaceChildren();for(const entry of videoList(current||{})){const option=document.createElement('option');option.value=entry.id;option.textContent=entry.label;select.append(option)}select.hidden=!select.options.length;}
function clearVideoUI(){currentVideo=null;$('video-mount').replaceChildren();$('video-mount').hidden=true;$('video-close').hidden=true;$('video-external').hidden=true;$('video-status').textContent='';}
function closeVideo(){++videoRequest;clearVideoUI();if(native)call('videoClose').catch(()=>{});}
window.GocVideoClosed=clearVideoUI;
async function playVideo(value){const id=videoId(value);if(!id){$('video-status').textContent='Hãy nhập liên kết YouTube hợp lệ.';return}const token=++videoRequest;currentVideo=id;if(metroRunning){metroRunning=false;updateMetro()}$('video-tools').hidden=false;$('video-status').textContent='Đang mở YouTube…';try{
 if(native){await call('video',{id});if(token!==videoRequest)return;$('video-status').textContent='YouTube · cần mạng';}
 else{const frame=document.createElement('iframe');frame.title='YouTube · '+(current?.title||'Góc Hợp Âm');frame.src='player.html?id='+encodeURIComponent(id);frame.allow='autoplay; encrypted-media; picture-in-picture';frame.referrerPolicy='strict-origin-when-cross-origin';$('video-mount').replaceChildren(frame);$('video-mount').hidden=false;$('video-status').textContent='YouTube · cần mạng';}
 $('video-close').hidden=false;$('video-external').hidden=false;follow.videoReady();
 }catch(error){if(token===videoRequest)$('video-status').textContent='Chưa mở được video. '+error.message;}}
async function listen(){if(!current)return;const token=opening,videoToken=++videoRequest;$('video-tools').hidden=false;let videos=videoList(current);if(!videos.length){$('video-status').textContent='Đang tìm bản thu của bài…';try{const data=await call('api',{path:'/api/reader?'+new URLSearchParams({url:current.sourceUrl})});if(token!==opening||videoToken!==videoRequest||!current)return;current={...current,videos:videoList(data.song||{})};videos=videoList(current);}catch{if(token!==opening||videoToken!==videoRequest)return;}}
 if(token!==opening||videoToken!==videoRequest||!current)return;videoChoices();if(videos.length)playVideo(videos[0].id);else $('video-status').textContent='Chưa có bản thu gợi ý. Bạn có thể dán liên kết YouTube bên dưới.';}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,3500)}
function cards(container,items,saved=false){container.replaceChildren();items.forEach((s,index)=>{const button=document.createElement('button');button.className='song';const number=document.createElement('span');number.className='number';number.textContent=saved?'♡':String(index+1+page*20).padStart(2,'0');const meta=document.createElement('span');meta.className='meta';const title=document.createElement('strong');title.textContent=s.title;const author=document.createElement('small');author.textContent=s.author||s.singer||'Lời & hợp âm';meta.append(title,author);const arrow=document.createElement('span');arrow.className='arrow';arrow.textContent='›';button.append(number,meta,arrow);button.addEventListener('click',()=>openSong(s.sourceUrl||s.url));container.append(button)})}
function refreshSaved(){const items=Object.values(offline).sort((a,b)=>b.savedAt-a.savedAt);cards($('saved-songs'),items,true);$('saved-empty').hidden=items.length>0;$('storage-info').textContent=`${items.length}/100 bài · ${(libraryBytes(offline)/1024).toFixed(0)} KB trên thiết bị này.`}
async function loadCatalog(){const id=++request;$('songs').replaceChildren();$('status').textContent='Đang tìm giai điệu…';$('previous').hidden=true;$('more').hidden=true;const q=$('query').value.trim(),params=new URLSearchParams({mode,page:String(page),type:$('type').value});if(q)params.set('q',q);else if($('genre').value)params.set('genre',$('genre').value);$('list-title').textContent=q?'Kết quả tìm kiếm':mode==='latest'?'Mới cập nhật':'Khám phá hôm nay';try{const data=await call('api',{path:'/api/catalog?'+params});if(id!==request)return;const items=catalogItems(data);cards($('songs'),items);hasMore=!!(data.hasMore??data.data?.hasMore);$('status').textContent=items.length?(data.stale?'Đang hiển thị bản lưu gần nhất.':''):'Chưa tìm thấy bài. Hãy thử tên ngắn hơn hoặc đổi cách tìm.';$('previous').hidden=page===0;$('more').hidden=!hasMore}catch(error){if(id!==request)return;$('songs').replaceChildren();$('status').textContent='Không truy xuất được dữ liệu từ Sites: '+error.message+'. Bấm Mở kho bài Góc Hợp Âm để tìm trực tiếp.';if(searchRequested)openSiteSearch(q).catch(e=>toast(e.message))}}
let melodyPlaying=false,melodyPlayTimeouts=[];
function stopMelodyPlayback(){melodyPlaying=false;melodyPlayTimeouts.forEach(t=>clearTimeout(t));melodyPlayTimeouts=[];if($('sheet-play-btn'))$('sheet-play-btn').textContent='▶ Nghe nốt & Hòa âm';document.querySelectorAll('.sheet-note-chip').forEach(el=>el.classList.remove('playing'));document.querySelectorAll('.staff-note-group').forEach(el=>el.classList.remove('playing'));const cursor=$('staff-cursor-line');if(cursor)cursor.style.display='none'}
function playNoteTone(midi,durSec=0.5){if(!midi||midi<48||midi>84)return;try{const actx=new(window.AudioContext||window.webkitAudioContext)();const osc=actx.createOscillator(),gain=actx.createGain();const freq=440*2**((midi-69)/12);osc.type='triangle';osc.frequency.value=freq;gain.gain.setValueAtTime(0,actx.currentTime);gain.gain.linearRampToValueAtTime(0.15,actx.currentTime+0.02);gain.gain.exponentialRampToValueAtTime(0.001,actx.currentTime+durSec);osc.connect(gain).connect(actx.destination);osc.start();osc.stop(actx.currentTime+durSec+0.03)}catch{}}
function playChordHarmonics(tones,durSec=1.0){if(!tones||!tones.length)return;try{const actx=new(window.AudioContext||window.webkitAudioContext)();const now=actx.currentTime;tones.forEach((pitch,i)=>{const osc=actx.createOscillator(),gain=actx.createGain();const freq=440*2**((pitch-69)/12);osc.type=i===0?'sine':'triangle';osc.frequency.value=freq;const startGain=i===0?0.08:0.04;gain.gain.setValueAtTime(0,now+i*0.03);gain.gain.linearRampToValueAtTime(startGain,now+i*0.03+0.03);gain.gain.exponentialRampToValueAtTime(0.001,now+durSec);osc.connect(gain).connect(actx.destination);osc.start(now+i*0.03);osc.stop(now+durSec+0.05)})}catch{}}
function playMelodyNotes(notes,bpm=80){stopMelodyPlayback();if(!notes||!notes.length)return;melodyPlaying=true;if($('sheet-play-btn'))$('sheet-play-btn').textContent='■ Dừng nghe';const beatSec=60/Math.max(40,Math.min(240,bpm));let currentDelay=0;const cursor=$('staff-cursor-line');if(cursor)cursor.style.display='block';notes.forEach((n,idx)=>{const durSec=(n.beats||1)*beatSec;const t=setTimeout(()=>{if(!melodyPlaying)return;document.querySelectorAll('.sheet-note-chip').forEach((el,i)=>el.classList.toggle('playing',i===idx));const noteGroup=document.querySelector(`.staff-note-group[data-note-index="${idx}"]`);document.querySelectorAll('.staff-note-group').forEach(el=>el.classList.remove('playing'));if(noteGroup){noteGroup.classList.add('playing');const xPos=noteGroup.dataset.x;if(cursor&&xPos){cursor.setAttribute('x1',xPos);cursor.setAttribute('x2',xPos)}}if(n.midi){playNoteTone(n.midi,durSec*0.9);if(window.GocTriggerNoteOn){window.GocTriggerNoteOn(n.midi);setTimeout(()=>window.GocTriggerNoteOff?.(n.midi),durSec*800)}}if(n.chordNotes&&n.chordNotes.length){playChordHarmonics(n.chordNotes,durSec*1.2)}},currentDelay*1000);melodyPlayTimeouts.push(t);currentDelay+=durSec});const endT=setTimeout(()=>stopMelodyPlayback(),currentDelay*1000+300);melodyPlayTimeouts.push(endT)}
function renderStaffSVG(notes,bpm=80){const svg=$('sheet-staff-svg');if(!svg)return;svg.replaceChildren();const totalBeats=notes.reduce((sum,n)=>sum+(n.beats||1),0);const startX=70,pixelsPerBeat=36;const totalWidth=Math.max(760,startX+totalBeats*pixelsPerBeat+40);svg.setAttribute('viewBox',`0 0 ${totalWidth} 130`);for(let i=0;i<5;i++){const y=35+i*12,line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('x1','10');line.setAttribute('y1',String(y));line.setAttribute('x2',String(totalWidth-10));line.setAttribute('y2',String(y));line.setAttribute('class','staff-stave-line');svg.append(line)}const clef=document.createElementNS('http://www.w3.org/2000/svg','text');clef.setAttribute('x','15');clef.setAttribute('y','77');clef.setAttribute('class','staff-clef-symbol');clef.textContent='𝄞';svg.append(clef);const top4=document.createElementNS('http://www.w3.org/2000/svg','text');top4.setAttribute('x','45');top4.setAttribute('y','54');top4.setAttribute('class','staff-meter-text');top4.textContent='4';const bot4=document.createElementNS('http://www.w3.org/2000/svg','text');bot4.setAttribute('x','45');bot4.setAttribute('y','78');bot4.setAttribute('class','staff-meter-text');bot4.textContent='4';svg.append(top4,bot4);const diatonicY={60:95,61:95,62:89,63:89,64:83,65:77,66:77,67:71,68:71,69:65,70:65,71:59,72:53,73:53,74:47,75:47,76:41,77:35,78:35,79:29,80:29,81:23,82:23,83:17,84:11};const isSharp=midi=>[61,63,66,68,70,73,75,78,80,82].includes(midi);let curBeat=0;notes.forEach((n,idx)=>{const x=startX+curBeat*pixelsPerBeat;const group=document.createElementNS('http://www.w3.org/2000/svg','g');group.setAttribute('class','staff-note-group');group.dataset.noteIndex=String(idx);group.dataset.x=String(x);if(n.chord){const chordText=document.createElementNS('http://www.w3.org/2000/svg','text');chordText.setAttribute('x',String(x));chordText.setAttribute('y','20');chordText.setAttribute('class','staff-chord-label');chordText.textContent=n.chord;group.append(chordText)}if(n.midi){const y=diatonicY[n.midi]||71;if(y>=95||y<=23){const ledger=document.createElementNS('http://www.w3.org/2000/svg','line');ledger.setAttribute('x1',String(x-9));ledger.setAttribute('y1',String(y>=95?95:23));ledger.setAttribute('x2',String(x+9));ledger.setAttribute('y2',String(y>=95?95:23));ledger.setAttribute('class','staff-stave-line');group.append(ledger)}if(isSharp(n.midi)){const sharp=document.createElementNS('http://www.w3.org/2000/svg','text');sharp.setAttribute('x',String(x-11));sharp.setAttribute('y',String(y+4));sharp.setAttribute('font-size','13');sharp.setAttribute('fill','#e5bd79');sharp.textContent='♯';group.append(sharp)}const isHollow=(n.beats||1)>=2;const head=document.createElementNS('http://www.w3.org/2000/svg','ellipse');head.setAttribute('cx',String(x));head.setAttribute('cy',String(y));head.setAttribute('rx','6.5');head.setAttribute('ry','4.5');head.setAttribute('transform',`rotate(-25 ${x} ${y})`);head.setAttribute('class','staff-note-head');head.setAttribute('fill',isHollow?'#15101d':'#e5bd79');head.setAttribute('stroke','#e5bd79');head.setAttribute('stroke-width','2');group.append(head);if((n.beats||1)<4){const stem=document.createElementNS('http://www.w3.org/2000/svg','line');const stemUp=y>=59;const stemX=stemUp?x+5.5:x-5.5;const stemY2=stemUp?y-28:y+28;stem.setAttribute('x1',String(stemX));stem.setAttribute('y1',String(y));stem.setAttribute('x2',String(stemX));stem.setAttribute('y2',String(stemY2));stem.setAttribute('class','staff-note-stem');group.append(stem);if(n.beats===0.5){const flag=document.createElementNS('http://www.w3.org/2000/svg','path');const flagD=stemUp?`M ${stemX} ${stemY2} Q ${stemX+8} ${stemY2+8} ${stemX+6} ${stemY2+16}`:`M ${stemX} ${stemY2} Q ${stemX+8} ${stemY2-8} ${stemX+6} ${stemY2-16}`;flag.setAttribute('d',flagD);flag.setAttribute('stroke','#e5bd79');flag.setAttribute('stroke-width','2');flag.setAttribute('fill','none');group.append(flag)}}}else{const rest=document.createElementNS('http://www.w3.org/2000/svg','text');rest.setAttribute('x',String(x-4));rest.setAttribute('y','65');rest.setAttribute('font-size','18');rest.setAttribute('fill','#bcb1c7');rest.textContent='𝄽';group.append(rest)}svg.append(group);curBeat+=n.beats||1;if(Math.round(curBeat)%4===0&&idx<notes.length-1){const barX=startX+curBeat*pixelsPerBeat+8;const bar=document.createElementNS('http://www.w3.org/2000/svg','line');bar.setAttribute('x1',String(barX));bar.setAttribute('y1','35');bar.setAttribute('x2',String(barX));bar.setAttribute('y2','83');bar.setAttribute('class','staff-bar-line');svg.append(bar)}});const endX=startX+curBeat*pixelsPerBeat+12;const endBar=document.createElementNS('http://www.w3.org/2000/svg','line');endBar.setAttribute('x1',String(endX));endBar.setAttribute('y1','35');endBar.setAttribute('x2',String(endX));endBar.setAttribute('y2','83');endBar.setAttribute('stroke','#e5bd79');endBar.setAttribute('stroke-width','3');svg.append(endBar);const cursor=document.createElementNS('http://www.w3.org/2000/svg','line');cursor.setAttribute('id','staff-cursor-line');cursor.setAttribute('x1','0');cursor.setAttribute('y1','12');cursor.setAttribute('x2','0');cursor.setAttribute('y2','106');cursor.setAttribute('class','staff-cursor');cursor.style.display='none';svg.append(cursor)}
function renderSheetUI(){const panel=$('sheet-panel');if(!panel||!current)return;stopMelodyPlayback();const melody=current.sheets?.melody;const status=melody?.status||'missing';const badge=$('sheet-badge'),title=$('sheet-title'),meta=$('sheet-meta'),preview=$('sheet-notes-preview'),statusText=$('sheet-status');const playBtn=$('sheet-play-btn'),practiceBtn=$('sheet-practice-btn'),downloadBtn=$('sheet-download-btn'),generateBtn=$('sheet-generate-btn');panel.hidden=false;badge.className='sheet-badge '+(status==='verified'?'verified':status==='ai_draft'?'ai-draft':'missing');badge.textContent=status==='verified'?`✔ ĐÃ XÁC THỰC (${Math.round((melody.confidence||0.98)*100)}%)`:status==='ai_draft'?`✨ AI NHÁP (${Math.round((melody.confidence||0.88)*100)}%)`:'⚡ CHƯA CÓ SHEET';title.textContent=`${current.title} · Giai điệu & Hợp âm`;meta.textContent=status==='missing'?'Chưa có sheet nốt. Bấm "AI tạo sheet" hoặc "Thu âm tạo sheet" để Gemini phân tích và ký âm ngay!':`${melody.notes?.length||16} nốt · Nhịp 4/4 · ${melody.bpm||80} BPM · MusicXML 4.0`;statusText.textContent='';preview.replaceChildren();const noteNames=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];const notes=melody?.notes||[];if(notes.length){renderStaffSVG(notes,melody?.bpm||80);notes.forEach((n,idx)=>{const chip=document.createElement('div');chip.className='sheet-note-chip';chip.title=`Nốt #${idx+1}: ${n.midi?noteNames[n.midi%12]+(Math.floor(n.midi/12)-1):'Lặng'} (${n.beats} phách)`;if(n.chord){const chordEl=document.createElement('span');chordEl.className='chord-tag';chordEl.textContent='['+n.chord+']';chip.append(chordEl)}const pitchEl=document.createElement('strong');pitchEl.className='pitch-name';pitchEl.textContent=n.midi?noteNames[n.midi%12]+(Math.floor(n.midi/12)-1):'𝄽';chip.append(pitchEl);const durEl=document.createElement('small');durEl.className='duration';durEl.textContent=n.beats===0.5?'⅛':n.beats===1?'¼':n.beats===2?'½':'1';chip.append(durEl);chip.addEventListener('click',()=>{if(n.midi)playNoteTone(n.midi,0.6)});preview.append(chip)})}else{const staffSvg=$('sheet-staff-svg');if(staffSvg)staffSvg.replaceChildren()}playBtn.hidden=!notes.length;practiceBtn.hidden=!notes.length;downloadBtn.hidden=!melody?.musicxml&&status==='missing';generateBtn.textContent=status==='missing'?'⚡ AI Tạo Sheet Nhạc':'⚡ AI Tạo Lại'}

function lyrics(){const pre=$('lyrics');pre.replaceChildren();if(!current)return;current.content.split('\n').forEach((text,index)=>{const row=document.createElement('span');row.className='lyric-line';row.dataset.line=index;row.tabIndex=0;const matcher=/\[([A-G](?:#|b)?[^\]\n]{0,24})\]/g;let start=0,match;while((match=matcher.exec(text))){row.append(document.createTextNode(text.slice(start,match.index)));const span=document.createElement('span');span.className='chord';span.textContent='['+transpose(match[1],shift)+']';row.append(span);start=matcher.lastIndex}row.append(document.createTextNode(text.slice(start)||' '));row.addEventListener('click',()=>follow.select(index));pre.append(row)});$('key').textContent=transpose(current.key||'C',shift);$('lyrics').style.setProperty('--font',font+'px');$('font-size').textContent=font+'px'}
function saveLabel(){const saved=current&&offline[songUrl(current.sourceUrl)];$('save-song').textContent=saved?'Đã lưu · Bỏ lưu':'Lưu ngoại tuyến';$('save-song').disabled=!current}
async function openSong(value){const url=songUrl(value);if(!url)return;const id=++opening;closeVideo();stopMelodyPlayback();$('video-tools').hidden=true;current=null;shift=0;stopScroll();$('reader-title').textContent='Đang mở bài…';$('reader-author').textContent='';$('lyrics').replaceChildren();$('credit').textContent='';$('reader-status').textContent='';saveLabel();if(!$('reader').open)$('reader').showModal();$('reader-body').scrollTop=0;try{let song=offline[url];if(!song){const data=await call('api',{path:'/api/reader?'+new URLSearchParams(url.startsWith('site:')?{id:url.slice(5)}:{url})});song=readerSong(data)}if(id!==opening||!$('reader').open)return;if(!validSong(song))throw new Error('Bài hát chưa có nội dung hợp lệ.');current=song;follow.onSong(song);document.body.classList.add('reader-open');videoChoices();$('reader-title').textContent=song.title;$('reader-author').textContent=song.author||'Lời & hợp âm';$('reader-status').textContent=offline[url]?'Bản ngoại tuyến trên thiết bị.':'';$('credit').textContent='Sáng tác: '+(song.author||'Chưa có thông tin')+'. Hợp âm dùng để tham khảo và luyện tập.';lyrics();renderSheetUI();saveLabel();call('awake',{enabled:true}).catch(()=>{})}catch(error){if(id!==opening)return;$('reader-title').textContent='Chưa mở được bài';$('reader-status').textContent=error.message+' · Bài này có thể mở trong kho Sites.';openSiteSearch($('query').value).catch(()=>{})}}
async function toggleSaved(){if(!current)return;const url=songUrl(current.sourceUrl),draft={...offline};if(draft[url])delete draft[url];else{if(Object.keys(draft).length>=100){toast('Đã đủ 100 bài. Bỏ lưu một bài để thêm bài mới.');return}draft[url]={...current,savedAt:Date.now()}}const sanitized=offlineLibrary(draft);if(libraryBytes(sanitized)>2000000){toast('Thư viện đã đầy. Hãy bỏ lưu một số bài.');return}$('save-song').disabled=true;try{await call('save',{value:JSON.stringify(sanitized)});offline=sanitized;refreshSaved();saveLabel();toast(offline[url]?'Đã lưu. Bài này mở được khi mất mạng.':'Đã bỏ lưu bài trên thiết bị.')}catch(error){toast(error.message);saveLabel()}}
function stopScroll(){cancelAnimationFrame(scrollFrame);scrollFrame=0;scrollTime=0;scrollCarry=0;$('scroll').setAttribute('aria-pressed','false');$('scroll').textContent='▶ Cuộn đều'}
function scrollStep(time){if(!scrollFrame)return;if(scrollTime){scrollCarry+=(time-scrollTime)/1000*Number($('scroll-speed').value);const pixels=Math.floor(scrollCarry);if(pixels){$('reader-body').scrollTop+=pixels;scrollCarry-=pixels}}scrollTime=time;if($('reader-body').scrollTop+$('reader-body').clientHeight>=$('reader-body').scrollHeight-1){stopScroll();return}scrollFrame=requestAnimationFrame(scrollStep)}
function closeReader(){++opening;follow.stop();stopMelodyPlayback();document.body.classList.remove('reader-open');$('reader-options').open=false;closeVideo();stopScroll();call('awake',{enabled:metroRunning}).catch(()=>{});if($('reader').open)$('reader').close()}
window.GocBack=()=>{if($('reader').open){closeReader();return true}if(tab!=='library'){showTab('library');return true}return false};
function showTab(id){tab=id;document.querySelectorAll('.screen').forEach(el=>el.hidden=el.id!==id);document.querySelectorAll('[data-tab]').forEach(el=>{el.dataset.tab===id?el.setAttribute('aria-current','page'):el.removeAttribute('aria-current')});window.scrollTo(0,0);if(id==='saved'||id==='about')refreshSaved()}
function beatLights(){const wrap=$('beat-lights');wrap.replaceChildren();for(let i=0;i<Number($('beats').value);i++)wrap.append(document.createElement('span'))}
window.GocNativeBeat=beat=>{[...$('beat-lights').children].forEach((el,index)=>el.classList.toggle('on',index===beat))};
function metroLabel(){ $('metro-toggle').textContent=metroRunning?'■ Dừng nhịp':'▶ Bắt đầu';$('metro-toggle').setAttribute('aria-pressed',String(metroRunning));if(!metroRunning)beatLights()}
async function updateMetro(){const bpm=bpmValue($('bpm').value);$('bpm').value=bpm;$('bpm-output').textContent=bpm;try{await call('metronome',{running:metroRunning,bpm,beats:Number($('beats').value)});call('awake',{enabled:metroRunning||$('reader').open}).catch(()=>{});metroLabel()}catch(error){metroRunning=false;metroLabel();toast(error.message)}}
document.querySelectorAll('[data-tab]').forEach(el=>el.addEventListener('click',()=>showTab(el.dataset.tab)));
$('search').addEventListener('submit',e=>{e.preventDefault();searchRequested=true;page=0;mode='hot';$('query').blur();loadCatalog()});
$('site-search').addEventListener('click',()=>openSiteSearch($('query').value).catch(e=>toast(e.message)));
$('genre').addEventListener('change',()=>{$('query').value='';page=0;mode='hot';loadCatalog()});$('type').addEventListener('change',()=>{if($('query').value.trim()){page=0;loadCatalog()}});
$('latest').addEventListener('click',()=>{$('query').value='';$('genre').value='';mode='latest';page=0;loadCatalog()});
$('more').addEventListener('click',()=>{if(hasMore){page++;loadCatalog()}});$('previous').addEventListener('click',()=>{if(page){page--;loadCatalog()}});
$('close-reader').addEventListener('click',closeReader);$('reader').addEventListener('cancel',e=>{e.preventDefault();closeReader()});$('save-song').addEventListener('click',toggleSaved);
$('listen').addEventListener('click',listen);$('video-close').addEventListener('click',closeVideo);$('video-choices').addEventListener('change',()=>playVideo($('video-choices').value));$('video-form').addEventListener('submit',e=>{e.preventDefault();$('video-link').blur();playVideo($('video-link').value)});$('video-external').addEventListener('click',()=>{if(!currentVideo)return;if(native)call('videoExternal',{id:currentVideo}).catch(error=>toast(error.message));else window.open('https://www.youtube.com/watch?v='+currentVideo,'_blank','noopener')});
$('tone-down').addEventListener('click',()=>{if(current){shift--;lyrics()}});$('tone-up').addEventListener('click',()=>{if(current){shift++;lyrics()}});$('tone-reset').addEventListener('click',()=>{shift=0;lyrics()});
$('font-down').addEventListener('click',()=>{font=Math.max(14,font-2);lyrics()});$('font-up').addEventListener('click',()=>{font=Math.min(36,font+2);lyrics()});
$('scroll').addEventListener('click',()=>{if(scrollFrame)stopScroll();else if(current){$('scroll').setAttribute('aria-pressed','true');$('scroll').textContent='Ⅱ Dừng cuộn';scrollFrame=requestAnimationFrame(scrollStep)}});
$('share').addEventListener('click',()=>{if(current)call('share',{title:current.title,text:current.title+(current.author?' — '+current.author:'')+' · Góc Hợp Âm',url:SITES_HOME+'/?song='+encodeURIComponent(current.sourceUrl)}).catch(error=>toast(error.message))});
$('bpm').addEventListener('input',updateMetro);$('beats').addEventListener('change',()=>{beatLights();updateMetro()});$('bpm-down').addEventListener('click',()=>{$('bpm').value=bpmValue(Number($('bpm').value)-5);updateMetro()});$('bpm-up').addEventListener('click',()=>{$('bpm').value=bpmValue(Number($('bpm').value)+5);updateMetro()});$('metro-toggle').addEventListener('click',()=>{metroRunning=!metroRunning;updateMetro()});
let taps=[];$('tap-tempo').addEventListener('click',()=>{const now=Date.now();if(taps.length&&now-taps.at(-1)>2000)taps=[];taps.push(now);taps=taps.slice(-6);if(taps.length>1){$('bpm').value=bpmValue(60000*(taps.length-1)/(now-taps[0]));updateMetro()}});
$('help').addEventListener('click',()=>call('help').catch(error=>toast(error.message)));
$('clear-saved').addEventListener('click',()=>$('clear-confirm').hidden=false);$('cancel-clear').addEventListener('click',()=>$('clear-confirm').hidden=true);$('confirm-clear').addEventListener('click',async()=>{try{await call('save',{value:'{}'});offline=Object.create(null);refreshSaved();saveLabel();$('clear-confirm').hidden=true;toast('Đã xóa bài ngoại tuyến trên thiết bị.')}catch(error){toast(error.message)}});
function pause(){if(studio.permissionPending||follow.permissionPending||musicTools.permissionPending)return;follow.stop();studio.onHide();closeVideo();stopScroll();metroRunning=false;stopWebMetro();call('metronome',{running:false,bpm:80,beats:4}).catch(()=>{});call('awake',{enabled:false}).catch(()=>{});metroLabel()}
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});window.addEventListener('nativePause',pause);window.addEventListener('pagehide',pause);
beatLights();call('load').then(value=>{try{offline=offlineLibrary(JSON.parse(value))}catch{toast('Chưa đọc được thư viện ngoại tuyến.')}refreshSaved()}).catch(error=>toast(error.message));loadCatalog();

const follow=createFollow({call,native,toast,getSong:()=>current,getVideo:()=>currentVideo,stopRegular:stopScroll,onHighlight(index){document.querySelectorAll('.lyric-line').forEach(el=>el.classList.toggle('active',Number(el.dataset.line)===index));const el=document.querySelector('.lyric-line[data-line="'+index+'"]'),body=$('reader-body');if(el)body.scrollTo({top:Math.max(0,el.getBoundingClientRect().top-body.getBoundingClientRect().top+body.scrollTop-body.clientHeight*.35),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}});
window.GocVideoTick=event=>{if(event&&event.id===currentVideo&&Number.isFinite(event.time)){follow.onTick(event);if(event.error)$('video-status').textContent=event.error+' · thử Mở YouTube'}};
window.addEventListener('message',event=>{const frame=$('video-mount').querySelector('iframe');if(event.origin===location.origin&&frame&&event.source===frame.contentWindow&&event.data?.type==='goc:tick')window.GocVideoTick(event.data)});
const studio=createStudio({call,native,toast,beforeRecord(){stopWebMetro();metroRunning=false;metroLabel()}});
$('reader-options-close').addEventListener('click',()=>$('reader-options').open=false);

$('github').addEventListener('click',()=>native?call('github'):window.open('https://github.com/duyuyd/goc-hop-am','_blank','noopener'));

$('share-app').addEventListener('click',()=>call('share',{title:'Góc Hợp Âm',text:'Cùng tìm hợp âm và tập hát trên Góc Hợp Âm · NPT Duy',url:SITES_HOME+'/'}).catch(error=>toast(error.message)));

const musicTools=createMusicTools({native,call,toast,getSong:()=>current});
$('music-open').addEventListener('click',()=>musicTools.open());$('reader-sheet').addEventListener('click',()=>musicTools.printLyrics());

if(!native&&'serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('/service-worker.js').catch(()=>{});

function videoSize(){const size=Math.max(200,Math.min(420,Number($('video-size-mobile').value)||200));if(native)call('videoLayout',{size}).catch(error=>toast(error.message));else{$('video-mount').style.height=size+'px';$('video-mount').style.aspectRatio='auto'}}
if ($('sheet-open')) $('sheet-open').addEventListener('click', () => {
  const panel = $('sheet-panel');
  if (panel) {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) panel.scrollIntoView({ behavior: 'smooth' });
  }
});
if ($('sheet-play-btn')) $('sheet-play-btn').addEventListener('click', () => {
  if (melodyPlaying) {
    stopMelodyPlayback();
  } else if (current?.sheets?.melody?.notes) {
    playMelodyNotes(current.sheets.melody.notes, current.sheets.melody.bpm || 80);
  }
});
if ($('sheet-practice-btn')) $('sheet-practice-btn').addEventListener('click', () => {
  if (!current?.sheets?.melody?.notes) return;
  const notes = current.sheets.melody.notes;
  stopMelodyPlayback();
  closeReader();
  showTab('practice');
  if (window.GocFeedPracticeNotes) {
    window.GocFeedPracticeNotes(notes);
  }
  toast(`Đã nạp ${notes.length} nốt của "${current.title}" vào Piano Roll`);
});
if ($('sheet-download-btn')) $('sheet-download-btn').addEventListener('click', () => {
  if (!current) return;
  const id = current.id || (current.sourceUrl || '').replace('site:', '');
  const url = '/api/auto-sheet/download/' + encodeURIComponent(id);
  window.open(url, '_blank');
});
if ($('sheet-generate-btn')) $('sheet-generate-btn').addEventListener('click', async () => {
  if (!current) return;
  const statusEl = $('sheet-status');
  if (statusEl) statusEl.textContent = '⚡ Gemini AI đang phân tích giai điệu và hợp âm...';
  $('sheet-generate-btn').disabled = true;
  try {
    const res = await fetch('/api/auto-sheet/generate-for-song', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ songId: current.id || current.sourceUrl })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi từ máy chủ tạo sheet.');
    if (data.sheet) {
      if (!current.sheets) current.sheets = {};
      current.sheets.melody = data.sheet;
      renderSheetUI();
      toast('Đã tạo xong sheet MusicXML bằng AI cho ' + current.title);
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Chưa tạo được sheet: ' + err.message;
  } finally {
    $('sheet-generate-btn').disabled = false;
  }
});

// --- Bảng tính tự động logic âm nhạc (Music Logic Spreadsheet) ---
let currentLogicSheet = null;

async function fetchOrCalculateLogicSheet() {
  if (!current) return null;
  const sheet = current.sheets?.melody;
  if (sheet && sheet.logicSheet) {
    currentLogicSheet = sheet.logicSheet;
    return currentLogicSheet;
  }
  const notes = sheet?.notes || [];
  if (!notes.length) return null;
  const bpm = sheet?.bpm || 80;
  const key = current.key || 'C';

  try {
    const res = await fetch('/api/gemini/calculate-logic-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes, bpm, songKey: key })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.logicSheet) {
        currentLogicSheet = data.logicSheet;
        if (sheet) sheet.logicSheet = currentLogicSheet;
        return currentLogicSheet;
      }
    }
  } catch {}
  return null;
}

function renderLogicSheetUI(logicSheet) {
  const panel = $('sheet-logic-panel');
  const tbody = $('sheet-logic-tbody');
  const summaryEl = $('sheet-logic-summary');
  if (!panel || !tbody) return;

  if (!logicSheet || !Array.isArray(logicSheet.rows) || !logicSheet.rows.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:18px;">Chưa có dữ liệu nốt để lập bảng tính logic.</td></tr>';
    return;
  }

  if (summaryEl && logicSheet.metadata) {
    const m = logicSheet.metadata;
    summaryEl.textContent = `${m.alignedMeasuresRatio} · Tổng ${m.totalDurationSec}s · Tông ${m.songKey} · Dải tần ${m.pitchRange}`;
  }

  let html = '';
  let prevMeasure = 0;
  for (const r of logicSheet.rows) {
    const isNewMeasure = r.measure !== prevMeasure;
    prevMeasure = r.measure;
    const rowClass = isNewMeasure ? 'measure-start' : '';
    const freqDisplay = r.frequencyHz ? `<span class="freq-tag">${r.frequencyHz} Hz</span>` : '—';
    const chordDisplay = r.chord && r.chord !== '—' ? `<span class="chord-tag">${r.chord}</span>` : '—';

    html += `<tr class="${rowClass}">
      <td>${r.rowId}</td>
      <td><strong>${r.measure}</strong></td>
      <td>${r.beatInMeasure}</td>
      <td>${r.timestampSec}s</td>
      <td><strong>${r.pitchName}</strong></td>
      <td>${freqDisplay}</td>
      <td>${r.durationBeats} (${r.durationName})</td>
      <td>${chordDisplay}</td>
      <td>${r.harmonicDegree}</td>
      <td><span class="tag-ok">✓ Chuẩn</span></td>
    </tr>`;
  }
  tbody.innerHTML = html;
}

if ($('sheet-logic-btn')) $('sheet-logic-btn').addEventListener('click', async () => {
  const panel = $('sheet-logic-panel');
  if (!panel) return;
  const isHidden = panel.hidden;
  if (isHidden) {
    panel.hidden = false;
    const sheetData = await fetchOrCalculateLogicSheet();
    renderLogicSheetUI(sheetData);
  } else {
    panel.hidden = true;
  }
});

if ($('sheet-logic-close')) $('sheet-logic-close').addEventListener('click', () => {
  const panel = $('sheet-logic-panel');
  if (panel) panel.hidden = true;
});

if ($('sheet-export-csv-btn')) $('sheet-export-csv-btn').addEventListener('click', async () => {
  if (!currentLogicSheet) {
    await fetchOrCalculateLogicSheet();
  }
  if (!currentLogicSheet) {
    toast('Chưa có bảng tính để xuất CSV');
    return;
  }
  try {
    const safeTitle = (current?.title || 'goc-hop-am').toLowerCase().replace(/\s+/g, '-');
    const filename = `bang-tinh-logic-${safeTitle}.csv`;
    const res = await fetch('/api/gemini/export-logic-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logicSheet: currentLogicSheet, filename })
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('Đã tải xuống bảng tính logic CSV');
    }
  } catch (err) {
    toast('Không xuất được tệp CSV');
  }
});

// --- Tải lên tệp Audio hoặc MIDI chuyển đổi sang MusicXML phía máy chủ ---
if ($('sheet-upload-btn') && $('sheet-file-input')) {
  $('sheet-upload-btn').addEventListener('click', () => {
    $('sheet-file-input').click();
  });

  $('sheet-file-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const statusEl = $('sheet-status');
    const uploadBtn = $('sheet-upload-btn');
    if (statusEl) statusEl.textContent = `⚡ Đang tải và phân tích tệp "${file.name}"...`;
    if (uploadBtn) {
      uploadBtn.disabled = true;
      uploadBtn.textContent = '⚡ Đang xử lý...';
    }

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const rawBuffer = reader.result;
          const base64 = btoa(new Uint8Array(rawBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
          const ext = file.name.split('.').pop().toLowerCase();
          const isMidi = ext === 'mid' || ext === 'midi';

          const res = await fetch('/api/gemini/upload-stream', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-title': encodeURIComponent(file.name.replace(/\.[^/.]+$/, '')),
              'x-key': current ? (current.key || 'C') : 'C',
              'x-bpm': String(current?.bpm || 80)
            },
            body: JSON.stringify({
              fileBase64: base64,
              format: isMidi ? 'midi' : file.type || 'audio/webm'
            })
          });

          const data = await res.json();
          if (!res.ok || !data.ok) {
            throw new Error(data.error || 'Lỗi xử lý tệp trên máy chủ.');
          }

          if (data.notes && data.notes.length) {
            if (!current) current = { title: file.name.replace(/\.[^/.]+$/, ''), sheets: {} };
            if (!current.sheets) current.sheets = {};
            current.sheets.melody = {
              status: 'ai_draft',
              source: data.engine || 'server_pipeline',
              confidence: data.confidence || 0.9,
              bpm: data.score?.bpm || 80,
              notesCount: data.notes.length,
              notes: data.notes,
              musicxml: data.musicxml,
              logicSheet: data.logicSheet,
              generatedAt: new Date().toISOString()
            };
            renderSheetUI();
            if (data.logicSheet) currentLogicSheet = data.logicSheet;
            toast(`Đã chuyển đổi thành công tệp ${file.name} sang MusicXML!`);
            if (statusEl) statusEl.textContent = `Đã tạo MusicXML từ ${file.name} (${data.notes.length} nốt, ${data.format === 'midi' ? 'tệp MIDI' : 'luồng âm thanh'})`;
          } else {
            if (statusEl) statusEl.textContent = 'Không trích xuất được nốt nhạc từ tệp tải lên.';
          }
        } catch (err) {
          if (statusEl) statusEl.textContent = 'Lỗi chuyển đổi: ' + err.message;
        } finally {
          if (uploadBtn) {
            uploadBtn.disabled = false;
            uploadBtn.textContent = '📁 Tải Audio / MIDI';
          }
          $('sheet-file-input').value = '';
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      if (statusEl) statusEl.textContent = 'Không đọc được tệp: ' + err.message;
      if (uploadBtn) {
        uploadBtn.disabled = false;
        uploadBtn.textContent = '📁 Tải Audio / MIDI';
      }
    }
  });
}

// --- Gemini AI Configuration & Diagnostics ---
async function openGeminiConfig() {
  const dialog = $('gemini-dialog');
  if (!dialog) return;
  try {
    const res = await fetch('/api/gemini/config');
    if (res.ok) {
      const data = await res.json();
      if (data.config) {
        if ($('gemini-model-name')) $('gemini-model-name').textContent = data.config.model || 'gemini-3.8-flash';
        if ($('gemini-mode-select')) $('gemini-mode-select').value = data.config.mode || 'melody_and_chords';
        if ($('gemini-grid-select')) $('gemini-grid-select').value = String(data.config.quantizationGrid || 0.5);
        if ($('gemini-polyphonic-check')) $('gemini-polyphonic-check').checked = !!data.config.polyphonicAccompaniment;
      }
    }
  } catch {}
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
}

if ($('gemini-badge-btn')) $('gemini-badge-btn').addEventListener('click', openGeminiConfig);
if ($('sheet-config-btn')) $('sheet-config-btn').addEventListener('click', openGeminiConfig);
if ($('gemini-dialog-close')) $('gemini-dialog-close').addEventListener('click', () => $('gemini-dialog')?.close());

if ($('gemini-ping-btn')) $('gemini-ping-btn').addEventListener('click', async () => {
  const valEl = $('gemini-latency-val');
  if (valEl) valEl.textContent = 'Đang đo...';
  try {
    const t0 = performance.now();
    const res = await fetch('/api/gemini/ping');
    const data = await res.json();
    const roundTrip = Math.round(performance.now() - t0);
    if (data.ok) {
      if (valEl) valEl.textContent = `${data.latencyMs}ms (RTT: ${roundTrip}ms)`;
      toast(`Kết nối Gemini OK: ${data.latencyMs}ms`);
    } else {
      if (valEl) valEl.textContent = `Lỗi: ${data.error || 'Thử lại'}`;
    }
  } catch (err) {
    if (valEl) valEl.textContent = 'Lỗi mạng';
  }
});

if ($('gemini-save-config-btn')) $('gemini-save-config-btn').addEventListener('click', async () => {
  const mode = $('gemini-mode-select')?.value;
  const quantizationGrid = parseFloat($('gemini-grid-select')?.value || '0.5');
  const polyphonicAccompaniment = $('gemini-polyphonic-check')?.checked ?? true;
  try {
    const res = await fetch('/api/gemini/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, quantizationGrid, polyphonicAccompaniment })
    });
    if (res.ok) {
      toast('Đã lưu cấu hình AI Gemini');
      $('gemini-dialog')?.close();
    }
  } catch (err) {
    toast('Không thể lưu cấu hình');
  }
});

// --- Hum / Voice Recording to Sheet Music ---
let humRecorder = null;
let humChunks = [];
let isHumming = false;

if ($('sheet-hum-btn')) $('sheet-hum-btn').addEventListener('click', async () => {
  const btn = $('sheet-hum-btn');
  const statusEl = $('sheet-status');
  if (!isHumming) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      humChunks = [];
      humRecorder = new MediaRecorder(stream);
      humRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) humChunks.push(e.data);
      };
      humRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(humChunks, { type: humRecorder.mimeType || 'audio/webm' });
        if (statusEl) statusEl.textContent = '⚡ Đang gửi âm thanh tới Gemini AI chuyển thành sheet...';
        btn.textContent = '⚡ Đang phân tích...';
        btn.disabled = true;

        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = reader.result ? reader.result.split(',')[1] : null;
          if (!base64Audio) {
            if (statusEl) statusEl.textContent = 'Không trích xuất được âm thanh';
            btn.textContent = '🎙️ Thu âm tạo sheet';
            btn.disabled = false;
            return;
          }
          try {
            const res = await fetch('/api/gemini/transcribe-sheet', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioBase64: base64Audio,
                mimeType: blob.type || 'audio/webm',
                title: current ? current.title : 'Bản thu ngẫu hứng',
                key: current ? current.key : 'C'
              })
            });
            const data = await res.json();
            if (data.ok && data.sheet) {
              if (!current) current = { title: 'Bản thu ngẫu hứng', sheets: {} };
              if (!current.sheets) current.sheets = {};
              current.sheets.melody = data.sheet;
              renderSheetUI();
              toast('Đã phiên âm giai điệu bằng Gemini AI thành công!');
              if (statusEl) statusEl.textContent = 'Đã tạo xong sheet từ bản thu âm!';
            } else {
              if (statusEl) statusEl.textContent = 'Chưa nhận diện được nốt: ' + (data.error || 'Thử lại');
            }
          } catch (err) {
            if (statusEl) statusEl.textContent = 'Lỗi kết nối: ' + err.message;
          } finally {
            btn.textContent = '🎙️ Thu âm tạo sheet';
            btn.disabled = false;
          }
        };
        reader.readAsDataURL(blob);
      };

      humRecorder.start();
      isHumming = true;
      btn.textContent = '⏹ Dừng thu âm';
      btn.classList.add('danger');
      if (statusEl) statusEl.textContent = '🎙️ Đang thu âm... Hãy ngân nga hoặc huýt sáo giai điệu bài hát!';
    } catch (err) {
      toast('Không truy cập được micro: ' + err.message);
    }
  } else {
    if (humRecorder && humRecorder.state !== 'inactive') {
      humRecorder.stop();
    }
    isHumming = false;
    btn.classList.remove('danger');
  }
});

// --- Real-time Visual Piano Roll & Virtual Keyboard for Practice Screen ---
(()=>{
  const pKeyboard = $('practice-keyboard');
  const canvas = $('piano-roll-canvas');
  if (!pKeyboard || !canvas) return;

  const ctx = canvas.getContext('2d');
  const noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const chordPatterns = [
    { name: '', type: 'trưởng', intervals: [0, 4, 7] },
    { name: 'm', type: 'thứ', intervals: [0, 3, 7] },
    { name: '7', type: 'bảy', intervals: [0, 4, 7, 10] },
    { name: 'maj7', type: 'trưởng 7', intervals: [0, 4, 7, 11] },
    { name: 'm7', type: 'thứ 7', intervals: [0, 3, 7, 10] },
    { name: 'dim', type: 'giảm', intervals: [0, 3, 6] },
    { name: 'aug', type: 'tăng', intervals: [0, 4, 8] },
    { name: 'sus4', type: 'treo 4', intervals: [0, 5, 7] },
    { name: 'sus2', type: 'treo 2', intervals: [0, 2, 7] }
  ];

  let pAudioCtx = null;
  let activeNotes = new Set();
  let fallingNotes = []; // { midi, y, height, active }
  let practiceMidiAccess = null;

  function getAudioCtx() {
    if (!pAudioCtx) {
      pAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (pAudioCtx.state === 'suspended') pAudioCtx.resume();
    return pAudioCtx;
  }

  function playTone(midi, length = 0.7) {
    try {
      const actx = getAudioCtx();
      const freq = 440 * 2 ** ((midi - 69) / 12);
      const timbre = $('practice-timbre')?.value || 'piano';
      const now = actx.currentTime;

      if (timbre === 'organ') {
        [1, 2, 3].forEach((h, idx) => {
          const osc = actx.createOscillator(), gain = actx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq * h;
          gain.gain.setValueAtTime([0.08, 0.05, 0.03][idx], now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + length);
          osc.connect(gain).connect(actx.destination);
          osc.start(now);
          osc.stop(now + length + 0.03);
        });
      } else if (timbre === 'guitar') {
        const osc = actx.createOscillator(), filter = actx.createBiquadFilter(), gain = actx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(freq * 4, now);
        filter.frequency.exponentialRampToValueAtTime(freq * 0.8, now + length * 0.8);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + length);
        osc.connect(filter).connect(gain).connect(actx.destination);
        osc.start(now);
        osc.stop(now + length + 0.03);
      } else {
        const osc = actx.createOscillator(), gain = actx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + Math.max(0.05, length));
        osc.connect(gain).connect(actx.destination);
        osc.start(now);
        osc.stop(now + length + 0.03);
      }
    } catch {}
  }

  function detectChord(notes) {
    if (notes.size < 2) return null;
    const pitchClasses = Array.from(notes).map(n => n % 12);
    const unique = Array.from(new Set(pitchClasses));

    for (let root = 0; root < 12; root++) {
      for (const pattern of chordPatterns) {
        const expected = pattern.intervals.map(i => (root + i) % 12);
        const match = expected.every(p => unique.includes(p));
        if (match) {
          return `${noteNames[root]}${pattern.name} (${pattern.type})`;
        }
      }
    }
    return unique.map(p => noteNames[p]).join(' + ');
  }

  function updateMonitor() {
    const list = Array.from(activeNotes).sort((a, b) => a - b);
    if (!list.length) {
      if ($('live-note-name')) $('live-note-name').textContent = '—';
      if ($('live-note-midi')) $('live-note-midi').textContent = '—';
      if ($('live-chord-name')) $('live-chord-name').textContent = '—';
      return;
    }

    const last = list[list.length - 1];
    const pitch = last % 12;
    const octave = Math.floor(last / 12) - 1;
    const noteLabel = `${noteNames[pitch]}${octave}`;

    if ($('live-note-name')) $('live-note-name').textContent = noteLabel;
    if ($('live-note-midi')) $('live-note-midi').textContent = String(last);

    const detected = detectChord(activeNotes);
    if ($('live-chord-name')) {
      $('live-chord-name').textContent = detected || (list.length > 1 ? list.map(n => noteNames[n % 12]).join(' ') : noteLabel);
    }
  }

  const keyTimers = new Map();

  function triggerNoteOn(midi) {
    if (midi < 48 || midi > 84) return;
    activeNotes.add(midi);
    playTone(midi, 0.75);

    // Highlight key with glow pulse animation
    const key = pKeyboard.querySelector(`.practice-key[data-midi="${midi}"]`);
    if (key) {
      if (keyTimers.has(midi)) {
        clearTimeout(keyTimers.get(midi));
        keyTimers.delete(midi);
      }
      key.classList.remove('key-hit');
      void key.offsetWidth;
      key.classList.add('active', 'key-hit');
    }

    // Add falling note in piano roll
    const existing = fallingNotes.find(n => n.midi === midi && n.active);
    if (!existing) {
      fallingNotes.push({ midi, y: 0, height: 4, active: true });
    }

    updateMonitor();
  }

  function triggerNoteOff(midi) {
    activeNotes.delete(midi);
    const key = pKeyboard.querySelector(`.practice-key[data-midi="${midi}"]`);
    if (key) {
      const timer = setTimeout(() => {
        if (!activeNotes.has(midi)) {
          key.classList.remove('active');
          setTimeout(() => key.classList.remove('key-hit'), 200);
        }
        keyTimers.delete(midi);
      }, 250);
      keyTimers.set(midi, timer);
    }

    // Stop growing falling note block
    const active = fallingNotes.find(n => n.midi === midi && n.active);
    if (active) active.active = false;

    updateMonitor();
  }

  window.GocTriggerNoteOn = triggerNoteOn;
  window.GocTriggerNoteOff = triggerNoteOff;
  window.GocFeedPracticeNotes = (notes) => {
    fallingNotes = [];
    let yOffset = -15;
    notes.forEach(n => {
      if (n.midi && n.midi >= 60 && n.midi <= 84) {
        const height = Math.max(12, (n.beats || 1) * 22);
        fallingNotes.push({
          midi: n.midi,
          y: yOffset,
          height,
          active: false
        });
        yOffset -= (height + 12);
      }
    });
  };

  // Render Virtual Keyboard (C4 = 60 to C6 = 84, 25 keys)
  pKeyboard.replaceChildren();
  let whiteCount = 0;
  for (let midi = 60; midi <= 84; midi++) {
    const pitch = midi % 12;
    const isBlack = [1, 3, 6, 8, 10].includes(pitch);
    const key = document.createElement('button');
    key.className = 'practice-key ' + (isBlack ? 'is-black' : 'is-white');
    key.dataset.midi = midi;
    key.style.left = ((isBlack ? whiteCount - 0.32 : whiteCount) / 15 * 100) + '%';
    key.style.width = ((isBlack ? 0.64 : 1) / 15 * 100) + '%';
    key.textContent = noteNames[pitch];
    key.setAttribute('aria-label', `${noteNames[pitch]}${Math.floor(midi / 12) - 1}`);

    if (!isBlack) whiteCount++;

    key.addEventListener('pointerdown', e => {
      e.preventDefault();
      triggerNoteOn(midi);
    });
    key.addEventListener('pointerup', e => {
      e.preventDefault();
      triggerNoteOff(midi);
    });
    key.addEventListener('pointerleave', () => {
      if (activeNotes.has(midi)) triggerNoteOff(midi);
    });
    key.addEventListener('pointercancel', () => {
      if (activeNotes.has(midi)) triggerNoteOff(midi);
    });

    pKeyboard.append(key);
  }

  // Web MIDI API connection
  function handleMIDIMessage(event) {
    const [status, note, velocity] = event.data;
    const command = status >> 4;
    if (command === 9 && velocity > 0) {
      triggerNoteOn(note);
    } else if (command === 8 || (command === 9 && velocity === 0)) {
      triggerNoteOff(note);
    }
  }

  async function connectMIDI() {
    const statusEl = $('practice-midi-status');
    if (!navigator.requestMIDIAccess) {
      if (statusEl) statusEl.textContent = 'Trình duyệt này chưa hỗ trợ Web MIDI API.';
      return;
    }
    try {
      if (statusEl) statusEl.textContent = 'Đang tìm kiếm thiết bị MIDI…';
      practiceMidiAccess = await navigator.requestMIDIAccess();
      const inputs = Array.from(practiceMidiAccess.inputs.values());
      if (inputs.length) {
        inputs.forEach(input => {
          input.onmidimessage = handleMIDIMessage;
        });
        const names = inputs.map(i => i.name).join(', ');
        if (statusEl) statusEl.textContent = `🎹 Đã kết nối đàn MIDI: ${names}`;
        toast(`Đã nhận đàn MIDI: ${inputs[0].name}`);
      } else {
        if (statusEl) statusEl.textContent = '🎹 Đã mở cổng MIDI. Hãy cắm đàn MIDI USB vào thiết bị để gõ nốt.';
      }

      practiceMidiAccess.onstatechange = () => {
        const updated = Array.from(practiceMidiAccess.inputs.values());
        updated.forEach(input => {
          input.onmidimessage = handleMIDIMessage;
        });
        if (statusEl) {
          statusEl.textContent = updated.length
            ? `🎹 Đã kết nối đàn MIDI: ${updated.map(i => i.name).join(', ')}`
            : 'Chưa phát hiện đàn MIDI USB.';
        }
      };
    } catch (err) {
      if (statusEl) statusEl.textContent = 'Chưa cấp quyền MIDI hoặc không tìm thấy đàn: ' + err.message;
    }
  }

  if ($('practice-midi-btn')) {
    $('practice-midi-btn').addEventListener('click', connectMIDI);
  }

  if ($('piano-roll-clear')) {
    $('piano-roll-clear').addEventListener('click', () => {
      fallingNotes = [];
    });
  }

  // Piano Roll Waterfall Rendering loop
  function drawPianoRoll() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw track grid (25 columns from 60 to 84)
    const colWidth = canvas.width / 25;
    for (let i = 0; i < 25; i++) {
      const midi = 60 + i;
      const isBlack = [1, 3, 6, 8, 10].includes(midi % 12);
      ctx.fillStyle = isBlack ? '#15101d' : '#1c1626';
      ctx.fillRect(i * colWidth, 0, colWidth - 1, canvas.height);
    }

    // Update and draw note blocks
    const speed = 1.4;
    for (let i = fallingNotes.length - 1; i >= 0; i--) {
      const note = fallingNotes[i];
      if (note.midi < 60 || note.midi > 84) {
        fallingNotes.splice(i, 1);
        continue;
      }

      const colIndex = note.midi - 60;
      const x = colIndex * colWidth + 1;
      const w = colWidth - 3;

      if (note.active) {
        note.height += speed;
      } else {
        note.y += speed;
      }

      const isBlack = [1, 3, 6, 8, 10].includes(note.midi % 12);
      ctx.fillStyle = isBlack ? '#f0932b' : '#e5bd79';
      ctx.shadowColor = '#e5bd7988';
      ctx.shadowBlur = 6;

      ctx.beginPath();
      ctx.roundRect(x, note.y, w, Math.max(3, note.height), 3);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Remove notes that scrolled past canvas
      if (note.y > canvas.height) {
        fallingNotes.splice(i, 1);
      }
    }

    requestAnimationFrame(drawPianoRoll);
  }

  drawPianoRoll();
})();
