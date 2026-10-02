// Shared by dialogs and every select/date/color popup. Keep the original spring
// running and translate only its destination when a scroll moves the anchor.
export function followAnchor(surface,anchor,reference,{progress=()=>1,active=()=>true}={}) {
 let frame=0,stopped=false,lastX=NaN,lastY=NaN;
 const tick=()=>{
  if(stopped||!active())return;
  if(anchor?.isConnected){
   const box=anchor.getBoundingClientRect(),p=progress();
   const x=(box.left-reference.left)*p,y=(box.top-reference.top)*p;
   if(x!==lastX||y!==lastY){surface.style.transform=`translate(${x}px,${y}px)`;lastX=x;lastY=y;}
  }
  frame=requestAnimationFrame(tick);
 };
 frame=requestAnimationFrame(tick);
 return()=>{stopped=true;cancelAnimationFrame(frame);surface.style.transform='none';};
}
