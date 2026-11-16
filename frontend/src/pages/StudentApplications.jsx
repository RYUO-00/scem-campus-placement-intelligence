import { useEffect, useState } from 'react';
import api,{messageFor} from '../services/api.js';
import {EmptyState,ErrorBanner,Loading,PageHeading} from '../components/Feedback.jsx';

const tone=(s)=>({shortlisted:'green',offered:'green',interview:'blue',rejected:'red',applied:'orange',under_review:'blue'}[s]||'muted');

export default function StudentApplications(){
 const [items,setItems]=useState(null),[error,setError]=useState(''),[success,setSuccess]=useState(''),[busy,setBusy]=useState('');
 useEffect(()=>{api.get('/students/me/applications').then(r=>setItems(r.data.applications)).catch(e=>setError(messageFor(e)));},[]);

 async function respondToOffer(applicationId,status){
  setBusy(applicationId);setError('');setSuccess('');
  try{
   const {data}=await api.patch(`/students/me/offers/${applicationId}`,{status});
   setItems(current=>current.map(item=>item.application_id===applicationId?{...item,offer_status:data.offer.status}:item));
   setSuccess(`Offer ${status}.`);
  }catch(e){setError(messageFor(e));}
  finally{setBusy('');}
 }

 return <>
  <PageHeading eyebrow="STUDENT PORTAL · TRACKING" title="My applications" description="Follow each application, interview round, and offer from one place."/>
  <ErrorBanner>{error}</ErrorBanner>
  {success&&<div className="banner banner-success" role="status">{success}</div>}
  {items===null?<Loading/>:items.length?<div className="application-list">{items.map(a=><article className="application-card" key={a.application_id}>
   <div className="application-head"><div className="company-monogram large">{a.company_name.slice(0,1)}</div><div className="application-title"><span>{a.company_name}</span><h2>{a.role}</h2><small>Applied {new Date(a.applied_at).toLocaleDateString()}</small></div><span className={`status-pill ${tone(a.status)}`}>{a.status.replaceAll('_',' ')}</span></div>
   <div className="application-criteria"><div><small>Eligibility when applied</small><strong>{a.eligibility_snapshot?.eligible?'Eligible':'Snapshot saved'}</strong></div><div><small>Application deadline</small><strong>{new Date(a.application_deadline).toLocaleDateString()}</strong></div>{a.offer_status&&<div><small>Offer · {a.offer_status}</small><strong>{a.package_lpa} LPA</strong></div>}</div>
   {a.offer_status==='pending'&&<div className="offer-response" aria-label="Respond to offer"><span>Record your decision</span><button className="button button-secondary" disabled={busy===a.application_id} onClick={()=>respondToOffer(a.application_id,'declined')}>{busy===a.application_id?'Saving…':'Decline offer'}</button><button className="button button-primary" disabled={busy===a.application_id} onClick={()=>respondToOffer(a.application_id,'accepted')}>{busy===a.application_id?'Saving…':'Accept offer'}</button></div>}
   {a.rounds?.length>0?<div className="timeline"><span className="timeline-line"/>{a.rounds.map((r,i)=><div className="timeline-item" key={r.roundId||`${a.application_id}-${i}`}><span className="timeline-dot"/><div><strong>{r.roundName}</strong><small>{r.date?new Date(r.date).toLocaleString():'No interview date recorded'} · {r.result||'Not recorded'}</small>{r.feedback&&<p>{r.feedback}</p>}</div></div>)}</div>:<div className="timeline-placeholder">Interview updates will appear here when a round is scheduled.</div>}
  </article>)}</div>:<EmptyState title="Your application list is ready" body="Once you apply to an eligible drive, its status and interview timeline will appear here."/>}
 </>;
}
