import { useEffect,useRef } from 'react';

export default function AppDialog({open,title,description,children,onClose,busy=false,tone='default'}){
 const dialogRef=useRef(null),closeRef=useRef(onClose),busyRef=useRef(busy);
 closeRef.current=onClose;busyRef.current=busy;
 useEffect(()=>{
  if(!open)return undefined;
  const dialog=dialogRef.current;
  const previousFocus=document.activeElement;
  const focusInitial=()=>{
   const initial=dialog?.querySelector('[data-dialog-initial-focus]');
   (initial||dialog)?.focus?.({preventScroll:true});
  };
  const frame=requestAnimationFrame(focusInitial);
  function handleKeyDown(event){
   if(event.key==='Escape'){
    event.preventDefault();
    if(!busyRef.current)closeRef.current?.();
    return;
   }
   if(event.key!=='Tab'||!dialog)return;
   const focusable=[...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')].filter(element=>element.getClientRects().length>0);
   if(!focusable.length){event.preventDefault();dialog.focus();return;}
   const first=focusable[0],last=focusable.at(-1);
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
  document.addEventListener('keydown',handleKeyDown);
  return ()=>{cancelAnimationFrame(frame);document.removeEventListener('keydown',handleKeyDown);if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});};
 },[open]);
 if(!open)return null;
 const titleId=`dialog-title-${title.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`;
 return <div className="dialog-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}>
  <section ref={dialogRef} className={`app-dialog${tone==='danger'?' app-dialog-danger':''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description?`${titleId}-description`:undefined} tabIndex={-1}>
   <div className="app-dialog-heading"><div>{tone==='danger'&&<span className="dialog-warning-mark" aria-hidden="true">!</span>}<h2 id={titleId}>{title}</h2>{description&&<p id={`${titleId}-description`}>{description}</p>}</div><button type="button" className="dialog-close" aria-label="Close dialog" onClick={onClose} disabled={busy}>×</button></div>
   {children}
  </section>
 </div>;
}
