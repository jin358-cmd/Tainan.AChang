const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),js=fs.readFileSync(path.join(root,'route-directory.js'),'utf8');
const c=vm.createContext({});vm.runInContext(js.slice(js.indexOf('function matchesDirectoryTime('),js.indexOf('function filterDirectory(')),c);
test('daytime defaults to 06:15–07:50 while nighttime keeps 16:30–18:30',()=>{
 const context=vm.createContext({});vm.runInContext(js.slice(js.indexOf('function defaultDirectoryTimeWindow('),js.indexOf('function matchesDirectoryTime(')),context);
 assert.equal(context.defaultDirectoryTimeWindow('日間').start,'06:15');assert.equal(context.defaultDirectoryTimeWindow('日間').end,'07:50');
 assert.equal(context.defaultDirectoryTimeWindow('夜間').start,'16:30');assert.equal(context.defaultDirectoryTimeWindow('夜間').end,'18:30');
 assert.equal(context.defaultDirectoryTimeWindow('').start,'');assert.equal(context.defaultDirectoryTimeWindow('').end,'');
});
test('directory time range includes endpoints, open ranges and overnight windows and excludes invalid source times',()=>{
 const matches=(time,start,end,extras)=>c.matchesDirectoryTime({'到達時間':time,_extras:extras},start,end);
 assert.equal(matches('16:30','16:30','18:30'),true);assert.equal(matches('18:30','16:30','18:30'),true);assert.equal(matches('18:31','16:30','18:30'),false);assert.equal(matches('16:29','16:30',''),false);assert.equal(matches('16:29','','18:30'),true);assert.equal(matches('00:15','23:00','01:00'),true);assert.equal(matches('12:00','23:00','01:00'),false);assert.equal(matches('unknown','16:30','18:30'),false);assert.equal(matches('17:00','16:30','18:30',{'刪除線':true}),false);assert.equal(matches('unknown','',''),true);
});
test('real 30-vehicle source filters routes without removing stations from complete route data',()=>{
 const rows=['day','night'].flatMap(shift=>JSON.parse(fs.readFileSync(path.join(root,`data-official-${shift}-20261030.source.json`),'utf8'))),groups=new Map();for(const row of rows){const key=row['車次'];if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row)}assert.equal(groups.size,30);const filtered=[...groups].filter(([,rr])=>rr.some(r=>c.matchesDirectoryTime(r,'16:30','18:30')));assert.ok(filtered.length>0);for(const [,rr] of filtered)assert.ok(rr.some(r=>c.matchesDirectoryTime(r,'16:30','18:30')));assert.equal(rows.length,1786);assert.match(js,/function stationCards\(rows,route\)/);
});
test('list, search and time inputs are within full-route entry and controls remain outside the hidden list',()=>{
 for(const name of ['index.html','route-directory.html']){const html=fs.readFileSync(path.join(root,name),'utf8'),start=html.indexOf('<div class="controls">'),directory=html.indexOf('<section id="directory"');assert.ok(start<directory);const controls=html.slice(start,directory);for(const id of ['search','directoryStartTime','directoryEndTime'])assert.match(controls,new RegExp(`id="${id}"`));assert.match(html,/route-directory\.js\?v=34/)}
 assert.match(js,/\$\('search'\)\.oninput=filterDirectory/);assert.match(js,/\$\('directoryStartTime'\)\.onchange=filterDirectory/);assert.match(js,/\$\('directoryEndTime'\)\.onchange=filterDirectory/);
});
