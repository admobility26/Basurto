import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGpxParser,parseGpxText} from '../modules/routes/src/gpxParser.js';
import {timeline,pointAt} from '../modules/routes/src/premium/reviewTime.js';
import {assembleReview,validateAssembly} from '../modules/routes/src/premium/reviewAssembly.js';
test('163693 RaceBox samples at 25Hz retain precision through parsing, assembly and playback',()=>{
 const count=163693,start=Date.parse('2026-10-27T14:07:10.720Z'),reader=createGpxParser();reader.write('<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><name>RaceBox</name><trkseg>');
 for(let i=0;i<count;i++)reader.write(`<trkpt lat="${43+i/1e7}" lon="-2.123456789"><time>${new Date(start+i*40).toISOString()}</time></trkpt>`);
 reader.write('</trkseg></trk></gpx>');const track=reader.finish();assert.equal(track.points.length,count);assert.equal(track.points[0].coordinates[0],-2.123456789);assert.equal(track.points[1].time-track.points[0].time,40);
 const review=assembleReview({},[{id:'demo',name:'RaceBox',points:track.points}]);validateAssembly(review);assert.equal(review.points.length,count);assert.equal(pointAt(review.points,.5,timeline(review.points)).time,start+(count-1)*20);
});
test('GPX reader handles namespace prefixes and tag splits without joining disconnected segments',()=>{const p=createGpxParser();for(const chunk of ['<g:gpx xmlns:g="urn:gpx"><g:trk><g:trkseg><g:trk','pt lat="43" lon="-2"><g:time>2026-11-09T00:00:00.040Z</g:time></g:trkpt></g:trkseg><g:trkseg><g:trkpt lat="43.1" lon="-2.1"/></g:trkseg></g:trk></g:gpx>'])p.write(chunk);const {points}=p.finish();assert.equal(points[0].time%1000,40);assert.notEqual(points[0].segment,points[1].segment)});
test('GPX rejects malformed XML, entities and invalid coordinates',()=>{for(const text of ['<gpx><trkpt></gpx>','<!DOCTYPE gpx><gpx/>','<gpx><trkpt lat="100" lon="-2"/></gpx>','<gpx><trkpt lat="" lon="0"/></gpx>'])assert.throws(()=>parseGpxText(text));});
