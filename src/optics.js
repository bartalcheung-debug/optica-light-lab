/* Millimetres; +z is the propagation direction. N-BK7 Sellmeier dispersion. */
(function(root){
  "use strict";
  const LENS={radius:28,halfThickness:3,aperture:10};
  const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
  const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
  const mul=(a,s)=>({x:a.x*s,y:a.y*s,z:a.z*s});
  const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
  const unit=a=>mul(a,1/Math.hypot(a.x,a.y,a.z));
  function index(wavelength){
    const l2=(wavelength/1000)**2;
    return Math.sqrt(1+1.03961212*l2/(l2-.00600069867)+.231792344*l2/(l2-.0200179144)+1.01046945*l2/(l2-103.560653));
  }
  function surfaceZ(x,y,rear=false){
    const sag=LENS.radius-Math.sqrt(LENS.radius**2-x*x-y*y);
    return rear?LENS.halfThickness-sag:-LENS.halfThickness+sag;
  }
  function sphereHit(o,d,rear){
    const center={x:0,y:0,z:rear?-25:25},oc=sub(o,center);
    const b=dot(oc,d),c=dot(oc,oc)-LENS.radius**2,disc=b*b-c;
    if(disc<0)return null;
    for(const t of [-b-Math.sqrt(disc),-b+Math.sqrt(disc)]){
      if(t<1e-7)continue;
      const p=add(o,mul(d,t));
      if(Math.hypot(p.x,p.y)>LENS.aperture+1e-7)continue;
      if(Math.abs(p.z-surfaceZ(p.x,p.y,rear))<1e-6)return p;
    }
    return null;
  }
  // Normal points back into the incident medium.
  function refract(d,n,n1,n2){
    const eta=n1/n2,cos=-dot(n,d),k=1-eta*eta*(1-cos*cos);
    if(cos<0||k<0)return null;
    return unit(add(mul(d,eta),mul(n,eta*cos-Math.sqrt(k))));
  }
  function trace(source,pupil,wavelength){
    const p1={x:pupil.x,y:pupil.y,z:surfaceZ(pupil.x,pupil.y)};
    const incoming=unit(sub(p1,source)),n=index(wavelength);
    const inside=refract(incoming,unit(sub(p1,{x:0,y:0,z:25})),1,n);
    if(!inside)return null;
    const p2=sphereHit(p1,inside,true);
    if(!p2)return null;
    const outgoing=refract(inside,unit(sub({x:0,y:0,z:-25},p2)),n,1);
    if(!outgoing||outgoing.z<=0)return null;
    return {source:{...source},p1,p2,incoming,inside,outgoing,wavelength};
  }
  function intercept(ray,z){
    if(z<=ray.p2.z)return null;
    return add(ray.p2,mul(ray.outgoing,(z-ray.p2.z)/ray.outgoing.z));
  }
  function pupilSamples(radius,count){
    return Array.from({length:count},(_,i)=>{
      const r=radius*Math.sqrt((i+.5)/count),a=i*Math.PI*(3-Math.sqrt(5));
      return {x:r*Math.cos(a),y:r*Math.sin(a)};
    });
  }
  function bundle(source,radius,wavelengths,count=601){
    const pupil=pupilSamples(radius,count);
    return wavelengths.flatMap(w=>pupil.map(p=>trace(source,p,w)).filter(Boolean));
  }
  function spot(rays,z){
    const points=rays.map(ray=>{const p=intercept(ray,z);return p?{...p,wavelength:ray.wavelength}:null}).filter(Boolean);
    if(!points.length)return {points,centroid:{x:0,y:0},rms:null,diameter:null};
    const centroid={x:0,y:0};
    for(const p of points){centroid.x+=p.x/points.length;centroid.y+=p.y/points.length;}
    let sq=0,max=0;
    for(const p of points){const d=(p.x-centroid.x)**2+(p.y-centroid.y)**2;sq+=d;max=Math.max(max,d);}
    return {points,centroid,rms:Math.sqrt(sq/points.length),diameter:2*Math.sqrt(max)};
  }
  // Minimise variance of x(z)=ax+bx*z and y(z)=ay+by*z about the centroid.
  function bestFocus(rays){
    if(rays.length<2)return null;
    const coeff=rays.map(r=>{
      const bx=r.outgoing.x/r.outgoing.z,by=r.outgoing.y/r.outgoing.z;
      return [r.p2.x-bx*r.p2.z,r.p2.y-by*r.p2.z,bx,by];
    });
    const mean=[0,0,0,0];
    for(const c of coeff)for(let j=0;j<4;j++)mean[j]+=c[j]/coeff.length;
    let cov=0,variance=0;
    for(const c of coeff){const d=c.map((v,j)=>v-mean[j]);cov+=d[0]*d[2]+d[1]*d[3];variance+=d[2]**2+d[3]**2;}
    return variance<1e-15?null:-cov/variance;
  }
  function paraxialFocus(source,wavelength){
    const axial={x:0,y:0,z:source.z},r=trace(axial,{x:.001,y:0},wavelength);
    return r?r.p2.z-r.p2.x*r.outgoing.z/r.outgoing.x:null;
  }
  const api={LENS,index,surfaceZ,sphereHit,refract,trace,intercept,pupilSamples,bundle,spot,bestFocus,paraxialFocus,add,sub,mul,dot,unit};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.Optics=api;
})(typeof window!=="undefined"?window:globalThis);
