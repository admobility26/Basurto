import assert from 'node:assert/strict';import{trimMovieClip,trimMovieClips}from '../modules/routes/src/premium/movieRange.js';
const clip={name:'Test',startSecond:0,endSecond:269,duration:269,offset:0},copy=structuredClone(clip);
const cropped=trimMovieClip(clip,243.41);assert.equal(cropped.duration,243.41);assert.equal(cropped.endSecond,243.41);assert.deepEqual(clip,copy);
const delayed=trimMovieClip({...clip,startSecond:-10,endSecond:259},243.41);assert.equal(delayed.startSecond,0);assert.equal(delayed.sourceOffset,10);
const sequence=trimMovieClips([clip,{...clip,offset:269,startSecond:-5,endSecond:20}],[243.41,12]);assert.equal(sequence[1].offset,243.41);assert.equal(sequence[1].sourceOffset,274);assert.equal(sequence[1].duration,12);
assert.throws(()=>trimMovieClip({...clip,startSecond:250,endSecond:269},243.41),/tramo común/);assert.throws(()=>trimMovieClip(clip,NaN),/cargue/);
console.log('PASS export overlap: crop to common interval, preserve originals, source timeline and consecutive output offsets, reject no overlap.');
