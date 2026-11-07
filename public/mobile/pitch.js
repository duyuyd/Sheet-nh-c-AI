// Monophonic pitch estimation on the user's device. No audio is uploaded.
export function detectMusicPitch(samples,rate){
 let energy=0;for(const x of samples)energy+=x*x;if(Math.sqrt(energy/samples.length)<.012)return null;
 const min=Math.floor(rate/1100),max=Math.min(Math.floor(rate/65),Math.floor(samples.length/2)-1),diff=new Float32Array(max+1);let sum=0,best=1;
 for(let lag=1;lag<=max;lag++){let d=0;for(let i=0;i<samples.length-max;i++){const delta=samples[i]-samples[i+lag];d+=delta*delta}sum+=d;diff[lag]=sum>0?d*lag/sum:1}
 let period=-1;for(let lag=Math.max(2,min);lag<max-1;lag++){if(diff[lag]<.18){while(lag+1<max&&diff[lag+1]<diff[lag])lag++;period=lag;break}if(diff[lag]<best){best=diff[lag];period=lag}}
 if(period<0||diff[period]>.28)return null;const left=diff[period-1],mid=diff[period],right=diff[period+1],denom=2*(2*mid-right-left),shift=Number.isFinite(denom)&&Math.abs(denom)>.00001?(right-left)/denom:0;
 const hz=rate/(period+shift),midi=Math.round(69+12*Math.log2(hz/440));return midi>=48&&midi<=84?midi:null;
}
export function scoreFromPitches(frames,hop,bpm=80){
 bpm=Math.max(40,Math.min(240,Number(bpm)||80));if(!Array.isArray(frames)||!Number.isFinite(hop)||hop<=0)return [];
 const smooth=frames.map((n,i)=>{const a=frames[Math.max(0,i-1)],b=frames[Math.min(frames.length-1,i+1)];return a===b?a:n});const groups=[];
 for(let i=0;i<smooth.length;i++){const midi=smooth[i];if(midi!==null&&(!Number.isInteger(midi)||midi<48||midi>84))continue;const previous=groups.at(-1);if(previous&&previous.midi===midi)previous.count++;else groups.push({midi,count:1})}
 const stable=[];for(const g of groups){if(g.count*hop<.1){const prev=stable.at(-1);if(prev)prev.count+=g.count;continue}const prev=stable.at(-1);if(prev?.midi===g.midi)prev.count+=g.count;else stable.push({...g})}
 while(stable.length&&stable[0].midi===null)stable.shift();while(stable.length&&stable.at(-1).midi===null)stable.pop();const notes=[];let beat=0;
 for(const group of stable){let beats=Math.max(.5,Math.round(group.count*hop*bpm/60*2)/2);while(beats>0&&notes.length<128){const space=4-beat%4,duration=[4,2,1,.5].find(n=>n<=beats&&n<=space);notes.push({midi:group.midi,beats:duration});beats-=duration;beat+=duration}if(notes.length>=128)break}return notes;
}
export async function transcribeMusicAudio(buffer,{bpm=80,start=0,onProgress=()=>{}}={}){
 const offset=Math.max(0,Math.min(buffer.duration,Number(start)||0)),length=Math.min(60,buffer.duration-offset);if(length<.3)throw new Error('Đoạn chọn quá ngắn.');
 const stride=Math.max(1,Math.floor(buffer.sampleRate/11025)),rate=buffer.sampleRate/stride,count=Math.floor(length*rate),mono=new Float32Array(count),channels=Math.min(2,buffer.numberOfChannels),channelData=Array.from({length:channels},(_,i)=>buffer.getChannelData(i)),first=Math.floor(offset*buffer.sampleRate);
 for(let i=0;i<count;i++){let sum=0;for(let c=0;c<channels;c++)for(let s=0;s<stride;s++)sum+=channelData[c][first+i*stride+s]||0;mono[i]=sum/(channels*stride)}
 const hop=256,window=1024,frames=[];for(let i=0;i+window<mono.length;i+=hop){frames.push(detectMusicPitch(mono.subarray(i,i+window),rate));if(frames.length%100===0){onProgress(Math.round(i/count*100));await new Promise(resolve=>setTimeout(resolve,0))}}
 const notes=scoreFromPitches(frames,hop/rate,bpm);if(!notes.some(n=>n.midi!==null))throw new Error('Chưa nhận được giai điệu rõ. Dùng bản hát hoặc nhạc cụ một bè, ít tiếng nền.');onProgress(100);return {notes,seconds:length,limited:buffer.duration-offset>60||notes.length>=128};
}
export function readMusicAudio({native=false,call}={}){
 if(native)return call('readAudio').then(data=>{if(!data?.base64)return null;const value=atob(data.base64),bytes=new Uint8Array(value.length);for(let i=0;i<value.length;i++)bytes[i]=value.charCodeAt(i);return {bytes:bytes.buffer,name:'Giai điệu nhận diện'}});
 return new Promise((resolve,reject)=>{const input=document.createElement('input');input.type='file';input.accept='audio/*,.mid,.midi';input.hidden=true;document.body.append(input);input.oncancel=()=>{input.remove();resolve(null)};input.onchange=async()=>{try{const file=input.files?.[0];if(!file){resolve(null);return}if(file.size>3000000)throw new Error('Chọn tệp âm thanh dưới 3 MB.');resolve({bytes:await file.arrayBuffer(),name:file.name.replace(/\.[^.]*$/,'')})}catch(error){reject(error)}finally{input.remove()}};input.click()});
}
