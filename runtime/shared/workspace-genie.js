// A projective surface bends toward the selected tab; it does not replace or
// clone page content. Only the visible content viewport participates.
const mix=(a,b,p)=>a+(b-a)*p;
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export function quadMatrix(width,height,crop,quad){
 const [p0,p1,p2,p3]=quad;
 const dx1=p1.x-p2.x,dx2=p3.x-p2.x,dx3=p0.x-p1.x+p2.x-p3.x;
 const dy1=p1.y-p2.y,dy2=p3.y-p2.y,dy3=p0.y-p1.y+p2.y-p3.y;
 const det=dx1*dy2-dx2*dy1;
 const g=(dx3*dy2-dx2*dy3)/det,h=(dx1*dy3-dx3*dy1)/det;
 const a=p1.x-p0.x+g*p1.x,b=p3.x-p0.x+h*p3.x;
 const d=p1.y-p0.y+g*p1.y,e=p3.y-p0.y+h*p3.y;
 return [a/width,d/width,0,g/width,b/height,e/height,0,h/height,0,0,1,0,p0.x-b*crop/height,p0.y-e*crop/height,0,1-h*crop/height];
}
export function genieFrames({width,height,crop=0,target},enter=false){
 return Array.from({length:81},(_,i)=>{
  const t=enter?1-i/80:i/80;
  // First gather the visible page into a small, slightly bent card. The
  // pull overlaps its last frames, so it never pauses between phases.
  const gather=smooth(t/.48),pull=Math.max(0,(t-.4)/.6);
  const scale=mix(1,.48,gather),bend=Math.sin(Math.PI*gather)*.045;
  const near=smooth(pull/.78),far=smooth((t-.52)/.48);
  const topWidth=mix(width*scale*(1-bend),target.width,near);
  const bottomWidth=mix(width*scale*(1+bend),target.width,far);
  const center=target.left+target.width/2;
  const topCenter=mix(width/2,center,near),bottomCenter=mix(width/2,center,far);
  const top=mix(crop+height*(1-scale)/2,target.top,near);
  const bottom=mix(crop+height*(1+scale)/2,target.top+target.height,far);
  const quad=[{x:topCenter-topWidth/2,y:top},{x:topCenter+topWidth/2,y:top},{x:bottomCenter+bottomWidth/2,y:bottom},{x:bottomCenter-bottomWidth/2,y:bottom}];
  const matrix=quadMatrix(width,height,crop,quad);
  const radius=22*smooth(t/.2);
  const dent=width*(.035*Math.sin(Math.PI*gather)+.11*Math.sin(Math.PI*pull)),y=crop+height,r=radius;
  // Curve the sides of the same visible surface into the narrow neck. This
  // small vector mask needs no DOM copies, canvas capture, or per-frame layout.
  const outline=`path("M ${r} ${crop} L ${width-r} ${crop} Q ${width} ${crop} ${width} ${crop+r} C ${width-dent} ${crop+height*.3} ${width-dent} ${crop+height*.7} ${width} ${y-r} Q ${width} ${y} ${width-r} ${y} L ${r} ${y} Q 0 ${y} 0 ${y-r} C ${dent} ${crop+height*.7} ${dent} ${crop+height*.3} 0 ${crop+r} Q 0 ${crop} ${r} ${crop} Z")`;
  return {offset:i/80,transform:`matrix3d(${matrix.join(',')})`,clipPath:outline,opacity:t<.88?1:1-smooth((t-.88)/.12),borderRadius:`${radius}px`};
 });
}
