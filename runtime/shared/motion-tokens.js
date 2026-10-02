// One timing vocabulary for surfaces, controls and language segments.
export const motion = Object.freeze({intro:2500,surface:760,close:560,popover:520,segment:480,paint:310,routeOut:760,routeIn:1080,
 color:'cubic-bezier(.32,0,.2,1)',ease:'cubic-bezier(.22,1,.36,1)'});
// Low-bounce response with a continuous, normalized resting endpoint.
// Geometry may overshoot gently; paint uses a monotonic easing instead.
export function springProgress(t) {
 t=Math.max(0,Math.min(1,t));
 const response=x=>1-Math.exp(-9*x)*(Math.cos(5*x)+9/5*Math.sin(5*x));
 return response(t)/response(1);
}
export function geometryFrames(start,end) {
 return Array.from({length:61},(_,i)=>{
  const p=springProgress(i/60),frame={offset:i/60};
  for(const key of ['left','top','width','height'])frame[key]=`${start[key]+(end[key]-start[key])*p}px`;
  return frame;
 });
}
