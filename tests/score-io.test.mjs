import test from 'node:test';
import assert from 'node:assert/strict';
import {midiToScore,scoreToMusicXML} from '../public/mobile/score-io.js';
const vlq=n=>n<128?[n]:[(n>>7)|128,n&127];
const file=events=>Uint8Array.from([...Buffer.from('MThd'),0,0,0,6,0,0,0,1,1,224,...Buffer.from('MTrk'),0,0,0,events.length,...events]);
test('MIDI provides actual note-on/off pitches, rhythm and tempo without invented notes',()=>{
 const midi=file([0,255,81,3,7,161,32,0,144,60,90,...vlq(480),128,60,0,0,144,64,90,...vlq(480),128,64,0,0,255,47,0]);
 const score=midiToScore(midi,{title:'Đàn & hát'});
 assert.equal(score.verified,false);assert.equal(score.origin,'midi');assert.equal(score.bpm,120);
 assert.deepEqual(score.notes,[{midi:60,beats:1},{midi:64,beats:1}]);
 const xml=scoreToMusicXML(score);assert.match(xml,/<step>C<\/step>/);assert.match(xml,/<step>E<\/step>/);assert.match(xml,/Đàn &amp; hát/);
});
test('unsupported MIDI meter and files without melody are rejected rather than fabricated',()=>{
 assert.throws(()=>midiToScore(new Uint8Array(18)),/MIDI/);
 assert.throws(()=>midiToScore(file([0,255,88,4,3,2,24,8,0,255,47,0])),/4\/4/);
 assert.throws(()=>midiToScore(file([0,255,47,0])),/đơn âm/);
 assert.throws(()=>scoreToMusicXML({notes:[]}),/Chưa có/);
});
test('MusicXML exports rests, one whole bar, and escapes untrusted titles',()=>{
 const xml=scoreToMusicXML({title:'<b>Nhạc</b>',notes:[{midi:60,beats:1},{midi:null,beats:1},{midi:64,beats:2}],bpm:80});
 assert.match(xml,/<rest\/>/);assert.match(xml,/<duration>4<\/duration>/);assert.match(xml,/&lt;b&gt;Nhạc&lt;\/b&gt;/);assert.ok(!xml.includes('<b>'));
});
