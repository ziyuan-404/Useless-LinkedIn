// Run before body paint; an external file also respects the local CSP.
if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
 document.documentElement.classList.add('motion-pending');
 setTimeout(()=>document.documentElement.classList.remove('motion-pending'),3500);
}
