(() => {
  "use strict";
  const O=window.Optics,$=id=>document.getElementById(id),canvas=$("scene"),ctx=canvas.getContext("2d",{willReadFrequently:true}),spotCanvas=$("spot"),sc=spotCanvas.getContext("2d",{willReadFrequently:true});
  const defaults={source:{x:0,y:0,z:-85},aperture:8,wavelength:550,spectrum:"mono",sensorZ:43,showRays:true,showMesh:true,follow:true,spotScale:2};
  const state={...defaults,source:{...defaults.source}};
  const view={yaw:-1.22,pitch:.22,zoom:1};
  let w=0,h=0,dpr=1,rays=[],shown=[],data=null,drag=null,preset="spherical",focusMode="paraxial",best=null,paraxial=null;
  let basis={right:{x:1,y:0,z:0},up:{x:0,y:1,z:0}},scale=1,centerZ=0;
  const ranges={x:[-25,25],y:[-25,25],z:[-160,-42]},clip=(v,a,b)=>Math.max(a,Math.min(b,v));
  const number=(n,d=2)=>Number.isFinite(n)?n.toFixed(d):"—";
  const wavelengths=()=>state.spectrum==="rgb"?[486.1,550,656.3]:[state.wavelength];
  function color(wl){
    if(wl<510)return "#65aaff";
    if(wl>610)return "#ff756b";
    if(wl>575)return "#f9d273";
    return "#66e7b9";
  }
  function recompute(){
    const ws=wavelengths();
    rays=O.bundle(state.source,state.aperture,ws,state.spectrum==="rgb"?401:801);
    best=O.bestFocus(rays);paraxial=O.paraxialFocus(state.source,state.spectrum==="rgb"?550:state.wavelength);
    shown=[];
    // Twelve representative rays only. Spot sampling is separate from 3D density.
    if(ws.length===1){
      for(const radius of [.25,.65,1])for(let i=0;i<4;i++){
        const a=i*Math.PI/2+.28,ray=O.trace(state.source,{x:state.aperture*radius*Math.cos(a),y:state.aperture*radius*Math.sin(a)},ws[0]);
        if(ray)shown.push(ray);
      }
    }else{
      for(const wl of ws)for(let i=0;i<4;i++){
        const a=i*Math.PI/2+.28+ws.indexOf(wl)*.22,ray=O.trace(state.source,{x:state.aperture*.85*Math.cos(a),y:state.aperture*.85*Math.sin(a)},wl);
        if(ray)shown.push(ray);
      }
    }
    updateSpot();sync();
  }
  function updateSpot(){data=O.spot(rays,state.sensorZ);requestDraw();}
  // Draw on demand even when the preview tab is backgrounded and animation frames are throttled.
  function requestDraw(){draw();}
  function setRange(id,value){
    const el=$(id);el.value=value;
    el.style.setProperty("--fill",((value-Number(el.min))/(Number(el.max)-Number(el.min))*100)+"%");
  }
  function sync(){
    for(const key of ["x","y","z"]){setRange("source-"+key,state.source[key]);$("source-"+key+"-value").textContent=number(state.source[key],1);}
    setRange("aperture",state.aperture);$("aperture-value").textContent="Ø "+number(state.aperture*2,1)+" mm";
    setRange("wavelength",state.wavelength);$("wavelength-value").textContent=number(state.wavelength,0)+" nm";
    setRange("focus-position",state.sensorZ);$("focus-value").textContent=number(state.sensorZ)+" mm";
    const field=Math.atan2(Math.hypot(state.source.x,state.source.y),-state.source.z)*180/Math.PI;
    $("field-value").textContent=number(field,1)+"°";
    $("scene-state").textContent="N-BK7 · 双球面折射 · 视场 "+number(field,1)+"°";
    $("spectrum").value=state.spectrum;$("wavelength-control").hidden=state.spectrum==="rgb";
    $("show-rays").checked=state.showRays;$("show-mesh").checked=state.showMesh;
    $("follow-spot").checked=state.follow;$("spot-scale").value=state.spotScale;
    $("rms-value").textContent=number(data.rms,3)+" mm";
    $("diameter-value").textContent=number(data.diameter,3)+" mm";
    $("spot-z").textContent="z "+number(state.sensorZ)+" mm";
    $("spot-center").textContent="中心 ("+number(data.centroid.x)+", "+number(data.centroid.y)+") mm";
    for(const b of document.querySelectorAll("[data-mode]"))b.setAttribute("aria-pressed",String(b.dataset.mode===preset));
    $("paraxial").setAttribute("aria-pressed",String(focusMode==="paraxial"));
    $("best-focus").setAttribute("aria-pressed",String(focusMode==="best"));
    $("paraxial").disabled=!Number.isFinite(paraxial);$("best-focus").disabled=!Number.isFinite(best);
    $("source-handle").setAttribute("aria-valuetext",Object.entries(state.source).map(([k,v])=>k+" "+number(v,1)).join(", "));
    $("sensor-handle").setAttribute("aria-valuetext",number(state.sensorZ)+" mm");
  }
  function focusAt(kind){
    const z=kind==="best"?best:paraxial;
    if(!Number.isFinite(z))return;
    state.sensorZ=clip(z,8,160);focusMode=kind;updateSpot();sync();
  }
  function moveSource(p){
    for(const k of ["x","y","z"])state.source[k]=clip(p[k],...ranges[k]);
    preset=null;focusMode=null;recompute();
  }
  function moveSensor(z){state.sensorZ=clip(z,8,160);focusMode=null;updateSpot();sync();}
  function camera(){
    const cy=Math.cos(view.yaw),sy=Math.sin(view.yaw),cp=Math.cos(view.pitch),sp=Math.sin(view.pitch);
    basis={right:{x:cy,y:0,z:-sy},up:{x:-sy*sp,y:cp,z:-cy*sp},depth:{x:sy*cp,y:sp,z:cy*cp}};
    // Static fitting range while dragging prevents the camera from following the dragged object.
    if(!drag){centerZ=(state.source.z+Math.max(55,state.sensorZ))/2;scale=Math.min(w*.8/(Math.max(55,state.sensorZ)-state.source.z+25),h*.5/65)*view.zoom;}
  }
  function project(p){
    const q={x:p.x,y:p.y,z:p.z-centerZ};
    return {x:w*.5+scale*O.dot(q,basis.right),y:h*.64-scale*O.dot(q,basis.up),depth:O.dot(q,basis.depth)};
  }
  function line(a,b,color,width=1,alpha=1,dash=[]){
    const p=project(a),q=project(b);ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.globalAlpha=alpha;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();ctx.restore();
  }
  function path(points,fill,stroke,width=1){
    ctx.beginPath();points.forEach((p,i)=>{const q=project(p);if(i===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y);});if(fill){ctx.closePath();ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}
  }
  function text(label,p,color="#8fa9c1"){
    const q=project(p);ctx.fillStyle=color;ctx.font="12px 'Microsoft YaHei',sans-serif";ctx.textAlign="center";ctx.fillText(label,q.x,q.y);
  }
  function drawLens(){
    const cap=(r,a,rear)=>({x:r*Math.cos(a),y:r*Math.sin(a),z:O.surfaceZ(r*Math.cos(a),r*Math.sin(a),rear)});
    // Meridians and aperture rings follow the actual refracting spherical caps.
    for(const rear of [false,true]){
      for(let sector=0;sector<24;sector++){
        const a=sector*Math.PI/12,b=(sector+1)*Math.PI/12;
        const pts=[cap(0,0,rear)];
        for(let j=0;j<=4;j++)pts.push(cap(10,a+(b-a)*j/4,rear));
        path(pts,rear?"rgba(87,181,206,.055)":"rgba(100,213,222,.05)",null);
      }
      for(const radius of state.showMesh?[2.5,5,7.5,10]:[10]){
        path(Array.from({length:65},(_,i)=>cap(radius,i*Math.PI/32,rear)),null,radius===10?"#72a4b6":"#31576a",radius===10?1.2:.75);
      }
      if(state.showMesh)for(let i=0;i<4;i++){
        const a=i*Math.PI/4;path(Array.from({length:41},(_,j)=>cap(-10+j*.5,a,rear)),null,"#3b6c7b",.75);
      }
    }
    for(let i=0;i<12;i++){const a=i*Math.PI/6;line(cap(10,a,false),cap(10,a,true),"#588695",.7,.7);}
    text("双凸透镜",{x:0,y:14,z:0},"#9dc3ce");
  }
  function sensorPoint(x,y){return{x,y,z:state.sensorZ};}
  function drawSensor(){
    path([sensorPoint(-20,-20),sensorPoint(20,-20),sensorPoint(20,20),sensorPoint(-20,20)],"rgba(145,131,231,.045)","#746ca0");
    for(let v=-10;v<=10;v+=10){line(sensorPoint(v,-20),sensorPoint(v,20),"#716b9b",.5,.35);line(sensorPoint(-20,v),sensorPoint(20,v),"#716b9b",.5,.35);}
    const step=Math.max(1,Math.ceil(data.points.length/220));
    for(let i=0;i<data.points.length;i+=step){
      const p=data.points[i];if(Math.abs(p.x)>20||Math.abs(p.y)>20)continue;
      const q=project(p);ctx.fillStyle=color(p.wavelength);ctx.globalAlpha=.5;ctx.fillRect(q.x-1,q.y-1,2,2);
    }
    ctx.globalAlpha=1;
  }
  function drawSource(){
    const q=project(state.source);
    const glow=ctx.createRadialGradient(q.x,q.y,0,q.x,q.y,24);glow.addColorStop(0,"#ffe4ab99");glow.addColorStop(1,"#ffbc4d00");
    ctx.fillStyle=glow;ctx.fillRect(q.x-24,q.y-24,48,48);ctx.beginPath();ctx.arc(q.x,q.y,6,0,Math.PI*2);ctx.fillStyle="#fff0ce";ctx.fill();
    for(const [k,c] of [["x","#fa9b84"],["y","#90dcc9"],["z","#94b4ff"]]){
      const endpoint={...state.source,[k]:state.source[k]+9};line(state.source,endpoint,c,1.3,.7);
      text(k,{...endpoint,y:endpoint.y+2},c);
    }
    placeHandle("source-handle",q);
    placeHandle("sensor-handle",project(sensorPoint(0,-21)));
  }
  function placeHandle(id,p){
    const el=$(id);el.style.left=clip(p.x,46,w-46)+"px";el.style.top=clip(p.y,55,h-88)+"px";
  }
  function draw(){
    if(!data||!w)return;
    camera();ctx.clearRect(0,0,w,h);
    const start=Math.min(-100,state.source.z-10),end=Math.max(70,state.sensorZ+10);
    for(let z=Math.ceil(start/20)*20;z<=end;z+=20)line({x:-20,y:-23,z},{x:20,y:-23,z},"#263d51",.6,.6);
    for(let x=-20;x<=20;x+=10)line({x,y:-23,z:start},{x,y:-23,z:end},"#263d51",.6,.6);
    line({x:0,y:0,z:start},{x:0,y:0,z:end},"#9bb2c7",.8,.5,[5,7]);
    text("z →",{x:0,y:3,z:end},"#8aa6be");
    drawSensor();drawLens();
    if(state.showRays)for(const ray of shown){
      const c=color(ray.wavelength),endZ=Math.max(state.sensorZ,Math.min(160,Number.isFinite(paraxial)?paraxial+9:60));
      const endPoint=O.intercept(ray,endZ);
      line(ray.source,ray.p1,c,1.15,.63);line(ray.p1,ray.p2,c,1.8,.95);if(endPoint)line(ray.p2,endPoint,c,1.35,.8);
      const hit=O.intercept(ray,state.sensorZ),p=project(hit);ctx.beginPath();ctx.arc(p.x,p.y,2.1,0,Math.PI*2);ctx.fillStyle=c;ctx.fill();
    }
    drawSource();drawSpot();
  }
  function drawSpot(){
    const sw=spotCanvas.clientWidth,sh=spotCanvas.clientHeight;
    sc.clearRect(0,0,sw,sh);
    const span=state.spotScale,ppmm=Math.min(sw,sh)/(2*span),cx=sw/2,cy=sh/2;
    const center=state.follow?data.centroid:{x:0,y:0};
    sc.lineWidth=.5;sc.strokeStyle="#244157";
    for(let i=-2;i<=2;i++){
      const px=cx+i*Math.min(sw,sh)/4,py=cy+i*Math.min(sw,sh)/4;
      sc.beginPath();sc.moveTo(px,0);sc.lineTo(px,sh);sc.stroke();sc.beginPath();sc.moveTo(0,py);sc.lineTo(sw,py);sc.stroke();
    }
    let outside=0;
    for(const p of data.points){
      const x=cx+(p.x-center.x)*ppmm,y=cy-(p.y-center.y)*ppmm;
      if(x<0||y<0||x>sw||y>sh){outside++;continue;}
      sc.fillStyle=color(p.wavelength);sc.globalAlpha=state.spectrum==="rgb"?.58:.7;sc.fillRect(x-.7,y-.7,1.4,1.4);
    }
    sc.globalAlpha=1;
    // Cross marks the optical axis, which may move off-screen when following a displaced image.
    const ax=cx-center.x*ppmm,ay=cy+center.y*ppmm;
    if(ax>=0&&ax<=sw&&ay>=0&&ay<=sh){sc.strokeStyle="#dceaff88";sc.beginPath();sc.moveTo(ax-4,ay);sc.lineTo(ax+4,ay);sc.moveTo(ax,ay-4);sc.lineTo(ax,ay+4);sc.stroke();}
    sc.fillStyle="#94abc2";sc.font="12px sans-serif";sc.textAlign="right";sc.fillText("x",sw-6,sh/2-5);sc.fillText("y",sw/2+13,13);
    if(!data.points.length){sc.textAlign="center";sc.fillText("无透射光线",cx,cy);}
    $("spot-clipped").textContent=outside?"窗外 "+Math.round(outside/data.points.length*100)+"%":"";
    spotCanvas.setAttribute("aria-label","二维像面：z "+number(state.sensorZ)+" mm，"+data.points.length+" 个交点，RMS 半径 "+number(data.rms,3)+" mm");
  }
  function resize(){
    const rect=canvas.getBoundingClientRect();w=rect.width;h=rect.height;dpr=Math.min(2,window.devicePixelRatio||1);
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    spotCanvas.width=Math.round(spotCanvas.clientWidth*dpr);spotCanvas.height=Math.round(spotCanvas.clientHeight*dpr);sc.setTransform(dpr,0,0,dpr,0,0);requestDraw();
    requestAnimationFrame(draw);
  }
  function pointer(e){
    const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};
  }
  function startDrag(e,type){
    e.preventDefault();const pos=pointer(e);
    drag={type,start:pos,source:{...state.source},z:state.sensorZ,basis:{...basis},scale,yaw:view.yaw,pitch:view.pitch};
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function dragMove(e){
    if(!drag)return;
    const p=pointer(e),dx=p.x-drag.start.x,dy=p.y-drag.start.y;
    if(drag.type==="source"){
      const delta=O.mul(O.sub(O.mul(drag.basis.right,dx),O.mul(drag.basis.up,dy)),1/drag.scale);
      moveSource(O.add(drag.source,delta));
    }else if(drag.type==="sensor"){
      const vx=drag.basis.right.z*drag.scale,vy=-drag.basis.up.z*drag.scale,den=vx*vx+vy*vy;
      moveSensor(drag.z+(den>.02?(dx*vx+dy*vy)/den:dx/drag.scale));
    }else{
      view.yaw=drag.yaw+dx*.007;view.pitch=clip(drag.pitch+dy*.006,-1.1,1.1);requestDraw();
    }
  }
  function stopDrag(){drag=null;requestDraw();}
  canvas.addEventListener("pointerdown",e=>{
    const p=pointer(e),s=project(state.source);startDrag(e,Math.hypot(p.x-s.x,p.y-s.y)<20?"source":"orbit");
  });
  for(const [id,type] of [["source-handle","source"],["sensor-handle","sensor"]]){
    const el=$(id);el.addEventListener("pointerdown",e=>startDrag(e,type));
    el.addEventListener("keydown",e=>{
      const step=e.shiftKey?2:.5;
      if(type==="source"){
        const map={ArrowLeft:["x",-step],ArrowRight:["x",step],ArrowUp:["y",step],ArrowDown:["y",-step],PageUp:["z",step],PageDown:["z",-step]};
        if(map[e.key]){e.preventDefault();const [k,d]=map[e.key];moveSource({...state.source,[k]:state.source[k]+d});}
      }else if(["ArrowLeft","ArrowRight"].includes(e.key)){e.preventDefault();moveSensor(state.sensorZ+(e.key==="ArrowRight"?step:-step));}
    });
  }
  for(const target of [canvas,$("source-handle"),$("sensor-handle")]){
    target.addEventListener("pointermove",dragMove);
    target.addEventListener("pointerup",stopDrag);target.addEventListener("pointercancel",stopDrag);target.addEventListener("lostpointercapture",stopDrag);
  }
  canvas.addEventListener("wheel",e=>{e.preventDefault();view.zoom=clip(view.zoom*Math.exp(-e.deltaY*.001),.6,2.4);requestDraw();},{passive:false});
  canvas.addEventListener("keydown",e=>{
    if(e.key.startsWith("Arrow")){e.preventDefault();if(e.key==="ArrowLeft")view.yaw-=.1;if(e.key==="ArrowRight")view.yaw+=.1;if(e.key==="ArrowUp")view.pitch=clip(view.pitch-.1,-1.1,1.1);if(e.key==="ArrowDown")view.pitch=clip(view.pitch+.1,-1.1,1.1);requestDraw();}
  });
  for(const k of ["x","y","z"])$("source-"+k).addEventListener("input",e=>moveSource({...state.source,[k]:Number(e.target.value)}));
  for(const id of ["aperture","wavelength"])$(id).addEventListener("input",e=>{state[id]=Number(e.target.value);preset=null;focusMode=null;recompute();});
  $("spectrum").addEventListener("change",e=>{state.spectrum=e.target.value;preset=null;focusMode=null;recompute();});
  $("focus-position").addEventListener("input",e=>moveSensor(Number(e.target.value)));
  $("paraxial").onclick=()=>focusAt("paraxial");$("best-focus").onclick=()=>focusAt("best");
  $("show-rays").onchange=e=>{state.showRays=e.target.checked;requestDraw();};
  $("show-mesh").onchange=e=>{state.showMesh=e.target.checked;requestDraw();};
  $("follow-spot").onchange=e=>{state.follow=e.target.checked;requestDraw();};
  $("spot-scale").onchange=e=>{state.spotScale=Number(e.target.value);requestDraw();};
  function selectPreset(mode){
    state.source={x:mode==="coma"?20:0,y:0,z:-85};state.aperture=mode==="chromatic"?5:8;state.spectrum=mode==="chromatic"?"rgb":"mono";state.wavelength=550;
    preset=mode;state.spotScale=mode==="chromatic"?.25:mode==="spherical"?2:1.5;state.follow=true;recompute();focusAt(mode==="spherical"?"paraxial":"best");
  }
  for(const b of document.querySelectorAll("[data-mode]"))b.onclick=()=>selectPreset(b.dataset.mode);
  $("view-reset").onclick=()=>{Object.assign(view,{yaw:-1.22,pitch:.22,zoom:1});requestDraw();};
  $("reset").onclick=()=>{Object.assign(state,defaults,{source:{...defaults.source}});Object.assign(view,{yaw:-1.22,pitch:.22,zoom:1});selectPreset("spherical");};
  const result=()=>({source:{...state.source},sensorZ:state.sensorZ,fieldDegrees:Math.atan2(Math.hypot(state.source.x,state.source.y),-state.source.z)*180/Math.PI,apertureRadius:state.aperture,spectrum:state.spectrum,wavelength:state.wavelength,spot:{rms:data.rms,diameter:data.diameter,centroid:data.centroid,samples:data.points.length},bestFocus:best,paraxialFocus:paraxial,displayRayCount:shown.length});
  if(document.modelContext?.registerTool){
    const ctl=new AbortController();
    const register=tool=>{try{Promise.resolve(document.modelContext.registerTool(tool,{signal:ctl.signal})).catch(()=>{});}catch{}};
    register({name:"get_aberration_experiment",title:"读取像差实验",description:"读取点光源、真实折射光路与像面光斑读数。",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:result});
    register({name:"configure_aberration_experiment",title:"移动光源与像面",description:"设置点光源的三维坐标或像面位置，同步更新两次折射与二维光斑。",inputSchema:{type:"object",properties:{x:{type:"number",minimum:-25,maximum:25},y:{type:"number",minimum:-25,maximum:25},z:{type:"number",minimum:-160,maximum:-42},sensorZ:{type:"number",minimum:8,maximum:160},aperture:{type:"number",minimum:2,maximum:10},wavelength:{type:"number",minimum:450,maximum:650},spectrum:{enum:["mono","rgb"]}},additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{
      const limits={x:[-25,25],y:[-25,25],z:[-160,-42],sensorZ:[8,160],aperture:[2,10],wavelength:[450,650]};
      if(!input||typeof input!=="object"||Array.isArray(input))throw Error("参数必须是对象");
      for(const [k,v] of Object.entries(input)){if(k==="spectrum"){if(!["mono","rgb"].includes(v))throw Error("无效光谱");}else if(!limits[k]||typeof v!=="number"||!Number.isFinite(v)||v<limits[k][0]||v>limits[k][1])throw Error("参数超出范围");}
      for(const [k,v] of Object.entries(input)){if(["x","y","z"].includes(k))state.source[k]=v;else state[k]=v;}
      preset=null;focusMode=null;recompute();return result();
    }});
    window.addEventListener("pagehide",()=>ctl.abort(),{once:true});
  }
  new ResizeObserver(resize).observe(canvas.parentElement);
  window.addEventListener("pageshow",()=>{resize();setTimeout(draw,150);});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)requestDraw();});
  selectPreset("spherical");resize();
})();
