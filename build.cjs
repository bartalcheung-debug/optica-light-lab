const fs=require('node:fs'),path=require('node:path');
let html=fs.readFileSync(path.join(__dirname,'src/page.html'),'utf8');
for(const [token,file] of [['STYLES','style.css'],['ENGINE','optics.js'],['APP','app.js']]){
  html=html.replace('/* '+token+' */',()=>fs.readFileSync(path.join(__dirname,'src',file),'utf8'));
}
fs.writeFileSync(path.join(__dirname,'index.html'),html);
console.log('Built self-contained page: '+Buffer.byteLength(html)+' bytes');
