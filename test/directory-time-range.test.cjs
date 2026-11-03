const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),js=fs.readFileSync(path.join(root,'route-directory.js'),'utf8');
const c=vm.createContext({});vm.runInContext(js.slice(js.indexOf('function matchesDirectoryTime('),js.indexOf('function filterDirectory(')),c);
test('directory time range includes endpoints, open ranges and overnight windows and excludes invalid source times',()=>{
 const matches=(time,start,end,extras)=>c.matchesDirectoryTime({'到達時間':time,_extras:extras},start,end);
 assert.equal(matches('16:30','16:30','18:30'),true);assert.equal(matches('18:30','16:30','18:30'),true);assert.equal(matches('18:31','16:30','18:30'),false);assert.equal(matches('16:29','16:30',''),false);assert.equal(matches('16:29','','18:30'),true);assert.equal(matches('00:15','23:00','01:00'),true);assert.equal(matches('12:00','23:00','01:00'),false);assert.equal(matches('unknown','16:30','18:30'),false);assert.equal(matches('17:00','16:30','18:30',{'刪除線':true}),false);assert.equal(matches('unknown','',''),true);
});
test('real 30-vehicle source filters routes without removing stations from complete route data',()=>{
 const rows=['day','night'].flatMap(shift=>JSON.parse(fs.readFileSync(path.join(root,`data-official-${shift}-20261030.source.json`),'utf8'))),groups=new Map();for(const row of rows){const key=row['車次'];if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row)}assert.equal(groups.size,30);const filtered=[...groups].filter(([,rr])=>rr.some(r=>c.matchesDirectoryTime(r,'16:30','18:30')));assert.ok(filtered.length>0);for(const [,rr] of filtered)assert.ok(rr.some(r=>c.matchesDirectoryTime(r,'16:30','18:30')));assert.equal(rows.length,1786);assert.match(js,/for\(let i=0;i<g.rows.length;i\+=3\)/);
});
test('list, search and time inputs are within full-route entry and controls remain outside the hidden list',()=>{
 for(const name of ['index.html','route-directory.html']){const html=fs.readFileSync(path.join(root,name),'utf8'),start=html.indexOf('<div class="controls">'),directory=html.indexOf('<section id="directory"');assert.ok(start<directory);const controls=html.slice(start,directory);for(const id of ['search','directoryStartTime','directoryEndTime'])assert.match(controls,new RegExp(`id="${id}"`));assert.match(html,/route-directory\.js\?v=12/)}
 assert.match(js,/\$\('search'\)\.oninput=filterDirectory/);assert.match(js,/\$\('directoryStartTime'\)\.onchange=filterDirectory/);assert.match(js,/\$\('directoryEndTime'\)\.onchange=filterDirectory/);
});
