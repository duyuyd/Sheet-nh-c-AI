import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMusicText,catalogWorkKey,rankMusicCatalog,groupCatalogByWork,sheetState} from '../lib/catalog-identity.mjs';

test('Vietnamese NFC/NFD, diacritics and đ/Đ normalize without losing the original', () => {
  const original = 'Để Nhớ Một Thời Ta Đã Yêu';
  assert.equal(normalizeMusicText(original), 'de nho mot thoi ta da yeu');
  assert.equal(normalizeMusicText(original.normalize('NFD')), 'de nho mot thoi ta da yeu');
  assert.equal(normalizeMusicText('  NGƯỜI  ƠI! '), 'nguoi oi');
  assert.equal(original, 'Để Nhớ Một Thời Ta Đã Yêu');
});

test('real title matches before artist matches and approximate accents', () => {
  const songs=[
    {title:'Nàng thơ',composer:'Hoàng Dũng'},
    {title:'Mùa thu',artist:'Nàng Thơ'},
    {title:'Nắng Thơ',artist:'Khác'},
  ];
  assert.equal(rankMusicCatalog(songs,'nang tho')[0].song.title,'Nàng thơ');
  assert.equal(rankMusicCatalog(songs,'nang thoo')[0].song.title,'Nàng thơ');
  assert.deepEqual(rankMusicCatalog(songs,'   '), []);
  assert.equal(rankMusicCatalog(songs,'nang tho',{limit:1}).length,1);
});

test('no arbitrary 30-song cap: searches a catalog of 1000 songs', () => {
  const songs=Array.from({length:1000},(_,i)=>({title:'Bài hát số '+i,composer:'NPT Duy'}));
  assert.equal(rankMusicCatalog(songs,'bai hat so',{limit:200}).length,200);
  assert.equal(rankMusicCatalog(songs,'bai hat so 999')[0].song.title,'Bài hát số 999');
});

test('do not conflate songs sharing a title when composers are different or unknown', () => {
  const records=[
    {title:'Trở về',composer:'A',source:'archive',sourceId:'1'},
    {title:'Trở Về',composer:'A',source:'other',sourceId:'2'},
    {title:'Trở về',composer:'B',source:'other',sourceId:'3'},
    {title:'Trở về',source:'one',sourceId:'4'},
    {title:'Trở về',source:'two',sourceId:'5'},
    {title:'Trở về'},
    {title:'Trở về'}
  ];
  const groups=groupCatalogByWork(records);
  assert.equal(groups.length,6);
  assert.equal(groups[0].sources.length,2);
  assert.equal(groups[1].sources.length,1);
  assert.equal(groups[4].key,null);
  assert.equal(groups[5].key,null);
});

test('sheet variants are explicit, never promoted to verified by a fallback', () => {
  const record={sheets:{melody:{status:'ai_draft'},piano:{status:'verified',source:'owned'}}};
  assert.equal(sheetState(record,'melody'),'ai_draft');
  assert.equal(sheetState(record,'piano'),'verified');
  assert.equal(sheetState(record,'organ'),'unknown');
  assert.equal(sheetState({sheets:{organ:{status:'ready'}}},'organ'),'unknown');
  assert.throws(()=>sheetState(record,'guitar'),TypeError);
});
