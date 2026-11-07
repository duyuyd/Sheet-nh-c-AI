import {parseSubtitleCues} from '../public/mobile/follow.js';
const VIDEO=/^[A-Za-z0-9_-]{11}$/;
const cache=new Map();
function objectAt(text,start){
 if(text[start]!=='{')return null;
 let depth=0,quote=false,escaped=false;
 for(let i=start;i<Math.min(text.length,start+2500000);i++){const c=text[i];if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quote=false;continue}if(c==='"')quote=true;else if(c==='{')depth++;else if(c==='}'&&!--depth){try{return JSON.parse(text.slice(start,i+1))}catch{return null}}}return null;
}
function playerResponses(html){
 const result=[];const pattern=/(?:\bytInitialPlayerResponse\s*=|["']ytInitialPlayerResponse["']\s*\]\s*=|"ytInitialPlayerResponse"\s*:)\s*/g;
 for(const match of html.matchAll(pattern)){const data=objectAt(html,match.index+match[0].length);if(data)result.push(data)}return result;
}
export function captionTracks(html){
 for(const data of playerResponses(html)){const tracks=data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;if(Array.isArray(tracks)&&tracks.length)return tracks}
 for(const match of html.matchAll(/"playerCaptionsTracklistRenderer"\s*:\s*/g)){const data=objectAt(html,match.index+match[0].length);if(Array.isArray(data?.captionTracks)&&data.captionTracks.length)return data.captionTracks}return [];
}
export function parseCaptionCues(data){
 if(typeof data==='string'){const source=data.trim();if(!source)return [];if(!source.startsWith('{'))return parseSubtitleCues(source);try{data=JSON.parse(source)}catch{return []}}
 if(!data||!Array.isArray(data.events))return [];
 return data.events.filter(e=>Number.isFinite(e.tStartMs)&&e.tStartMs>=0&&e.tStartMs<86400000&&Array.isArray(e.segs)).slice(0,6000).map(e=>({start:e.tStartMs/1000,duration:Math.max(0,Math.min(120,Number(e.dDurationMs||0)/1000)),text:e.segs.map(s=>typeof s.utf8==='string'?s.utf8:'').join('').replace(/\s+/g,' ').trim().slice(0,1000)})).filter(e=>e.text&&!/^\[(music|âm nhạc)\]$/i.test(e.text));
}
async function boundedText(response,max=3500000){const reader=response.body.getReader(),parts=[];let count=0;for(;;){const {value,done}=await reader.read();if(done)break;count+=value.length;if(count>max){await reader.cancel();throw new Error('captions_too_large')}parts.push(value)}const all=new Uint8Array(count);let offset=0;for(const part of parts){all.set(part,offset);offset+=part.length}return new TextDecoder().decode(all)}
export function captionFailure(id,code='unavailable'){
 const reasons={blocked:'YouTube chưa cho máy chủ đọc phụ đề của bản thu này. Bạn vẫn xem được video; có thể nhập tệp LRC/SRT/VTT bên dưới.',empty:'Đã tìm thấy phụ đề nhưng YouTube trả về dữ liệu trống. Thử lại hoặc nhập LRC/SRT/VTT.',format:'Đã nhận dữ liệu phụ đề nhưng chưa đọc được định dạng. Có thể nhập LRC/SRT/VTT.',missing:'Không tìm thấy đường phụ đề công khai. Chữ chèn sẵn trong hình video không phải tệp phụ đề; có thể nhập LRC/SRT/VTT hoặc đánh dấu câu.',unavailable:'Chưa kết nối được nguồn phụ đề. Thử lại hoặc nhập LRC/SRT/VTT.'};
 return {videoId:id,available:false,cues:[],code,reason:reasons[code]||reasons.unavailable};
}
export async function videoCaptions(id,fetcher=fetch){
 if(!VIDEO.test(id))throw new Error('invalid_video');const found=cache.get(id);if(found&&found.until>Date.now())return found.data;
 const response=await fetcher('https://www.youtube.com/watch?v='+id+'&hl=vi',{headers:{Accept:'text/html','Accept-Language':'vi,en;q=0.7','User-Agent':'GocHopAm/1.3 (+https://gochopam.pages.dev/)'},redirect:'manual',signal:AbortSignal.timeout(12000)});
 if(!response.ok)return captionFailure(id,[302,303,307,308,401,403,429].includes(response.status)?'blocked':'unavailable');
 const html=await boundedText(response);
 if(/verify you are human|unusual traffic|sign in to confirm you.re not a bot|consent\.youtube\.com/i.test(html)||playerResponses(html).some(p=>['LOGIN_REQUIRED','AGE_CHECK_REQUIRED'].includes(p?.playabilityStatus?.status)))return captionFailure(id,'blocked');
 const tracks=captionTracks(html).filter(t=>t&&typeof t.baseUrl==='string');
 const track=tracks.find(t=>t.languageCode==='vi'&&t.kind!=='asr')||tracks.find(t=>t.languageCode==='vi')||tracks.find(t=>t.kind!=='asr')||tracks[0];
 if(!track)return captionFailure(id,'missing');
 const url=new URL(track.baseUrl);if(url.protocol!=='https:'||url.hostname!=='www.youtube.com'||url.pathname!=='/api/timedtext'||url.username||url.password||url.port||url.searchParams.get('v')!==id)throw new Error('invalid_caption_track');url.searchParams.set('fmt','json3');
 const result=await fetcher(url.href,{headers:{Accept:'application/json, text/xml, text/vtt'},redirect:'manual',signal:AbortSignal.timeout(10000)});
 if(!result.ok)return captionFailure(id,[401,403,429].includes(result.status)?'blocked':'unavailable');
 const text=await boundedText(result,1800000);if(!text.trim())return captionFailure(id,'empty');
 if(/<html|verify you are human|unusual traffic/i.test(text))return captionFailure(id,'blocked');
 const cues=parseCaptionCues(text);if(!cues.length)return captionFailure(id,'format');
 const data={videoId:id,available:true,language:track.languageCode,automatic:track.kind==='asr',cues};
 cache.set(id,{data,until:Date.now()+300000});if(cache.size>40)cache.delete(cache.keys().next().value);return data;
}
