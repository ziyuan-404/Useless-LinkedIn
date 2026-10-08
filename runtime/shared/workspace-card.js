// Whole mounted pages become cards. No screenshots or second copy of the UI.
const smooth=t=>t*t*(3-2*t);
const response=t=>1-(1+8*t)*Math.exp(-8*t);
const rest=response(1);
// The surface belongs to the visible slice, including a retained scroll offset.
export function cardViewport(box,headerBottom,viewportHeight){
 const top=Math.max(0,headerBottom),crop=Math.max(0,top-box.top);
 const height=Math.max(1,Math.min(viewportHeight-top,box.height-crop));
 return {left:box.left,top:box.top+crop,width:box.width,height,crop,bottom:Math.max(0,box.height-crop-height)};
}
export function cardPose({x=0,y=0,scale=1,radius=0,shadow=0}={}){
 return {transform:`translate3d(${x}px,${y}px,0) scale(${scale})`,borderRadius:`${radius}px`,boxShadow:`0 ${12*shadow}px ${48*shadow}px rgba(23,35,52,${.2*shadow})`};
}
export function cardFrames(phase,{width,direction=1,scale=.86,radius=32}={}){
 return Array.from({length:61},(_,i)=>{
  const t=i/60,p=phase==='expand'?response(t)/rest:smooth(t);
  let pose;
  if(phase==='shrink')pose={scale:1-(1-scale)*p,radius:radius*p,shadow:p};
  else if(phase==='out')pose={x:-direction*width*.98*p,scale:scale-.035*p,radius,shadow:1};
  else if(phase==='in')pose={x:direction*width*.98*(1-p),scale:scale-.035*(1-p),radius,shadow:1};
  else pose={scale:scale+(1-scale)*p,radius:radius*(1-p),shadow:1-p};
  return {offset:t,...cardPose(pose)};
 });
}
