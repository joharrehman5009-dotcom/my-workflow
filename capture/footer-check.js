const { chromium } = require('playwright');
const http = require('http'); const fs=require('fs'); const path=require('path');
const OUT = path.join(__dirname,'out'); const PORT=8097;
const MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript','.avif':'image/avif','.png':'image/png','.jpeg':'image/jpeg','.jpg':'image/jpeg','.svg':'image/svg+xml','.webm':'video/webm','.mp4':'video/mp4','.woff2':'font/woff2'};
const srv=http.createServer((q,r)=>{const rel=decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/,'')||'index.html';const f=path.join(OUT,rel);
 if(!f.startsWith(OUT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end();}
 const b=fs.readFileSync(f);const t=MIME[path.extname(f).toLowerCase()]||'application/octet-stream';
 const rg=q.headers.range; if(rg&&/^bytes=/.test(rg)){const[s,e]=rg.replace('bytes=','').split('-');const st=+s||0;const en=e?+e:b.length-1;
  r.writeHead(206,{'Content-Type':t,'Accept-Ranges':'bytes','Content-Range':`bytes ${st}-${en}/${b.length}`,'Content-Length':en-st+1});return r.end(b.slice(st,en+1));}
 r.writeHead(200,{'Content-Type':t,'Accept-Ranges':'bytes','Content-Length':b.length});r.end(b);});
(async()=>{await new Promise(r=>srv.listen(PORT,r));
 const br=await chromium.launch({channel:'chrome'});
 const pg=await br.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
 const logs=[];pg.on('console',m=>logs.push(m.text()));
 await pg.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'load',timeout:60000});
 await pg.waitForTimeout(7000);
 const fl=await pg.$('.footer-logo');
 if(!fl){console.log('FOOTER LOGO NOT FOUND');process.exit(0);}
 await fl.scrollIntoViewIfNeeded(); await pg.waitForTimeout(1500);
 const box=await fl.boundingBox();
 // sweep the mouse across the wordmark to spawn trail images
 for(let i=0;i<14;i++){await pg.mouse.move(box.x+box.width*(0.1+i*0.06), box.y+box.height*(0.4+0.2*Math.sin(i)));await pg.waitForTimeout(90);}
 await pg.waitForTimeout(400);
 const imgs=await pg.evaluate(()=>document.querySelectorAll('#image-trail-group image').length);
 const clip=await pg.evaluate(()=>{const c=document.getElementById('nesh-clip');return c?{kids:c.children.length,first:c.children[0]?.tagName,text:c.textContent.trim()}:null;});
 console.log('trail images spawned :', imgs);
 console.log('clipPath             :', JSON.stringify(clip));
 console.log('trail init log       :', logs.filter(l=>l.includes('Trail')).join(' | ')||'(none)');
 await pg.screenshot({path:path.join(OUT,'shots','footer.png')});
 await br.close(); srv.close();})();
