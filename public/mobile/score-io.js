// Góc Hợp Âm: offline MIDI -> editable notation and MusicXML export.
// Only accept simple, measurable monophonic MIDI; never invent notes.
const be16=(b,i)=>(b[i]<<8)|b[i+1];
const be32=(b,i)=>(b[i]*16777216+b[i+1]*65536+b[i+2]*256+b[i+3])>>>0;
function vlq(b,p,end){let n=0;for(let i=0;i<4;i++){if(p>=end)throw Error('MIDI bị cắt.');let v=b[p++];n=(n<<7)|(v&127);if(!(v&128))return [n,p]}throw Error('MIDI có thời gian sai.')}
export function midiToScore(source,{title='Bản nhạc MIDI'}={}){
 const b=source instanceof Uint8Array?source:new Uint8Array(source);
 if(b.length<14||b.length>3000000||String.fromCharCode(...b.slice(0,4))!=='MThd')throw Error('Cần tệp MIDI hợp lệ dưới 3 MB.');
 const h=be32(b,4),format=be16(b,8),nt=be16(b,10),division=be16(b,12);
 if(h<6||h>256||format>1||nt<1||nt>64||!division||(division&32768))throw Error('Định dạng MIDI chưa hỗ trợ.');
 let p=8+h,tempo=500000,tempoSeen=false;const tracks=[];
 for(let t=0;t<nt;t++){
  if(p+8>b.length||String.fromCharCode(...b.slice(p,p+4))!=='MTrk')throw Error('Thiếu track MIDI.');
  const end=p+8+be32(b,p+4);if(end>b.length)throw Error('Track MIDI bị cắt.');
  p+=8;let tick=0,running=0;const starts=new Map(),channels=new Map();
  while(p<end){
   let d;[d,p]=vlq(b,p,end);tick+=d;
   let status=b[p];if(status<128){if(!running)throw Error('MIDI thiếu trạng thái.');status=running}else{p++;running=status<240?status:0}
   if(status===255){
    if(p>=end)throw Error('Sự kiện meta lỗi.');const kind=b[p++];let len;[len,p]=vlq(b,p,end);
    if(p+len>end)throw Error('MIDI meta bị cắt.');
    if(kind===81&&len===3){const v=b[p]*65536+b[p+1]*256+b[p+2];if(v>0){if(tempoSeen&&v!==tempo)throw Error('MIDI đổi tempo; chưa hỗ trợ tempo map.');tempo=v;tempoSeen=true}}
    if(kind===88&&len>=2&&(b[p]!==4||b[p+1]!==2))throw Error('Chỉ hỗ trợ MIDI nhịp 4/4; không tự đoán trường độ.');
    p+=len;continue;
   }
   if(status===240||status===247){let len;[len,p]=vlq(b,p,end);p+=len;if(p>end)throw Error('MIDI SysEx bị cắt.');continue}
   if(status<128||status>239)throw Error('Sự kiện MIDI chưa hỗ trợ.');
   const type=status>>4,ch=status&15,number=b[p++],vel=(type===12||type===13)?0:b[p++];
   if(p>end||number>127||vel>127)throw Error('Dữ liệu MIDI không hợp lệ.');
   if(ch===9)continue;
   const key=ch+':'+number;
   if(type===9&&vel>0){const q=starts.get(key)||[];q.push(tick);starts.set(key,q)}
   if(type===8||(type===9&&vel===0)){const q=starts.get(key);if(q?.length){const start=q.shift();if(tick>start){if(!channels.has(ch))channels.set(ch,[]);channels.get(ch).push({start,end:tick,midi:number})}}}
  }
  for(const notes of channels.values())if(notes.length)tracks.push(notes);p=end;
 }
 const candidates=tracks.map(notes=>notes.sort((a,b)=>a.start-b.start||a.midi-b.midi))
  .filter(notes=>notes.length>=2&&notes.every((n,i)=>n.midi>=48&&n.midi<=84&&(!i||n.start>=notes[i-1].end)));
 candidates.sort((a,b)=>b.length-a.length);
 if(!candidates.length)throw Error('Chưa tìm thấy bè MIDI đơn âm C3–C6. Không tự suy đoán nốt của bản phối đa bè.');
 const notes=[],selected=candidates[0];let position=0,maxError=0;
 const quant=t=>{const beat=t/division,q=Math.round(beat*2);maxError=Math.max(maxError,Math.abs(beat-q/2));return q};
 function append(midi,units){while(units>0){if(notes.length>=128)throw Error('Quá 128 nốt; cần chia bài thành đoạn.');const space=8-position%8;const d=[8,4,2,1].find(v=>v<=units&&v<=space);if(!d)throw Error('Trường độ không hỗ trợ.');notes.push({midi,beats:d/2});position+=d;units-=d}}
 for(const n of selected){const start=quant(n.start),end=quant(n.end);if(end<=start||start<position)throw Error('Nhịp MIDI không thể chuyển chính xác sang lưới nửa phách.');if(start>position)append(null,start-position);append(n.midi,end-start)}
 if(maxError>.2)throw Error('Nhịp MIDI quá phức tạp để lượng tử hóa chính xác.');
 const bpm=Math.round(60000000/tempo);
 if(bpm<40||bpm>240)throw Error('Tempo MIDI nằm ngoài dải hỗ trợ 40–240 BPM.');
 return {format:'goc-score-1',title:String(title).slice(0,100),author:'',bpm,notes,origin:'midi',verified:false,quantizationErrorBeats:maxError};
}
const xmlEsc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function scoreToMusicXML(score){
 if(!score||!Array.isArray(score.notes)||!score.notes.length||score.notes.length>128)throw Error('Chưa có nốt để xuất.');
 const name=xmlEsc(score.title||'Góc Hợp Âm'),author=xmlEsc(score.author||'');
 const head='<?xml version="1.0" encoding="utf-8"?>\n<score-partwise version="4.0"><work><work-title>'+name+'</work-title></work><movement-title>'+name+'</movement-title><identification><creator type="composer">'+author+'</creator></identification><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1">';
 const attrs='<attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>';
 let body='<measure number="1">'+attrs,beats=0,bar=1;
 const letters=['C','C','D','D','E','F','F','G','G','A','A','B'];
 for(let i=0;i<score.notes.length;i++){
  const n=score.notes[i];if(![.5,1,2,4].includes(n.beats)||!(n.midi===null||Number.isInteger(n.midi)&&n.midi>=48&&n.midi<=84)||beats%4+n.beats>4)throw Error('Nốt hoặc nhịp không hợp lệ.');
  const pitch=n.midi===null?'<rest/>':'<pitch><step>'+letters[n.midi%12]+'</step>'+([1,3,6,8,10].includes(n.midi%12)?'<alter>1</alter>':'')+'<octave>'+(Math.floor(n.midi/12)-1)+'</octave></pitch>';
  const kind=n.beats===.5?'eighth':n.beats===1?'quarter':n.beats===2?'half':'whole';
  body+='<note>'+pitch+'<duration>'+(n.beats*2)+'</duration><type>'+kind+'</type></note>';beats+=n.beats;
  if(beats%4===0){body+='</measure>';if(i+1<score.notes.length)body+='<measure number="'+(++bar)+'">'}
 }
 if(beats%4!==0)body+='</measure>';
 return head+body+'</part></score-partwise>';
}
