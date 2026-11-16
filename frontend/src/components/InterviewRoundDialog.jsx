import { useRef,useState } from 'react';
import api,{messageFor} from '../services/api.js';
import AppDialog from './AppDialog.jsx';
import { ErrorBanner } from './Feedback.jsx';

export default function InterviewRoundDialog({applicationId,applicantName,driveLabel,endpoint,onClose,onSaved}){
 const [roundName,setRoundName]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const requestId=useRef(globalThis.crypto.randomUUID()),sending=useRef(false);
 async function submit(event){
  event.preventDefault();
  if(busy||sending.current)return;
  const trimmed=roundName.trim();
  if(trimmed.length<2){setError('Enter a round name with at least two characters.');return;}
  if(trimmed.length>100){setError('Keep the round name to 100 characters or fewer.');return;}
  setError('');sending.current=true;setBusy(true);
  try{
   const {data}=await api.post(endpoint,{roundName:trimmed,result:'pending',requestId:requestId.current});
   onSaved(data.round,data.created!==false);
  }catch(requestError){setError(messageFor(requestError));}
  finally{sending.current=false;setBusy(false);}
 }
 return <AppDialog open title="Add interview round" description="Save a named interview round for this application." onClose={onClose} busy={busy}>
  <form className="dialog-form" onSubmit={submit} noValidate>
   <div className="dialog-context"><span>APPLICANT</span><strong>{applicantName}</strong><span>COMPANY DRIVE</span><strong>{driveLabel}</strong></div>
   <ErrorBanner>{error}</ErrorBanner>
   <label className="dialog-field">Round name<input autoComplete="off" required minLength={2} maxLength={100} value={roundName} onChange={event=>{setRoundName(event.target.value);if(error)setError('');}} placeholder="e.g. Technical Interview" data-dialog-initial-focus/></label>
   <p className="dialog-help">New rounds are saved as Pending. Interview dates and outcomes can be updated when they are known.</p>
   <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}>{busy?'Saving round…':'Save round'}</button></div>
  </form>
 </AppDialog>;
}
