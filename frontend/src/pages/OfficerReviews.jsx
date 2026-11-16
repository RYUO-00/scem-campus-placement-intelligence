import { useEffect,useRef,useState } from 'react';
import api,{messageFor} from '../services/api.js';
import { EmptyState,ErrorBanner,Loading,PageHeading,SuccessBanner } from '../components/Feedback.jsx';
import AppDialog from '../components/AppDialog.jsx';
import InterviewRoundDialog from '../components/InterviewRoundDialog.jsx';
import InterviewRoundList from '../components/InterviewRoundList.jsx';

const statusOptions={
 applied:['under_review','shortlisted','rejected'],
 under_review:['shortlisted','rejected','interview'],
 shortlisted:['interview','rejected'],
 interview:['shortlisted','rejected'],
 rejected:['under_review'],
 offered:[],
 withdrawn:[]
};
const statusLabel=(status)=>({under_review:'Under review'}[status]||status.replaceAll('_',' ').replace(/\b\w/g,letter=>letter.toUpperCase()));
function normalizeRound(round){return {roundId:round.round_id??round.roundId,roundName:round.round_name??round.roundName,date:round.interview_date??round.date,result:round.result,feedback:round.feedback,createdAt:round.created_at??round.createdAt};}

export default function OfficerReviews(){
 const [drives,setDrives]=useState([]),[selected,setSelected]=useState(''),[applications,setApplications]=useState(null);
 const [error,setError]=useState(''),[success,setSuccess]=useState(''),[statusTarget,setStatusTarget]=useState(null),[statusError,setStatusError]=useState(''),[statusBusy,setStatusBusy]=useState(false),[roundTarget,setRoundTarget]=useState(null),[offerBusy,setOfferBusy]=useState('');
 const statusSending=useRef(false);

 useEffect(()=>{let active=true;api.get('/officer/drives').then(response=>{if(!active)return;setDrives(response.data.drives);if(response.data.drives[0])setSelected(response.data.drives[0].drive_id);}).catch(requestError=>{if(active)setError(messageFor(requestError));});return()=>{active=false;};},[]);
 useEffect(()=>{if(!selected){setApplications(null);return undefined;}setApplications(null);setError('');let active=true;api.get(`/officer/drives/${selected}/applications`).then(response=>{if(active)setApplications(response.data.applications);}).catch(requestError=>{if(active)setError(messageFor(requestError));});return()=>{active=false;};},[selected]);
 const drive=drives.find(item=>item.drive_id===selected);
 const driveLabel=drive?[drive.company_name,drive.role].filter(Boolean).join(' · '):'Selected placement drive';

 function proposeStatus(application,nextStatus){if(nextStatus===application.status)return;setSuccess('');setStatusError('');setStatusTarget({applicationId:application.application_id,applicantName:application.full_name,driveLabel,currentStatus:application.status,nextStatus});}
 async function confirmStatusChange(){if(!statusTarget||statusBusy||statusSending.current)return;statusSending.current=true;setStatusBusy(true);setStatusError('');try{const {data}=await api.patch(`/officer/applications/${statusTarget.applicationId}/status`,{status:statusTarget.nextStatus,...(statusTarget.nextStatus==='rejected'?{confirmed:true}:{})});setApplications(current=>current?.map(application=>application.application_id===statusTarget.applicationId?{...application,status:data.application.status}:application));setSuccess(`${statusTarget.applicantName} is now ${statusLabel(data.application.status)}.`);setStatusTarget(null);}catch(requestError){setStatusError(messageFor(requestError));}finally{statusSending.current=false;setStatusBusy(false);}}
 function openRoundDialog(application){if(application.status==='rejected')return;setSuccess('');setRoundTarget({applicationId:application.application_id,applicantName:application.full_name,driveLabel,endpoint:`/officer/applications/${application.application_id}/rounds`});}
 function roundSaved(round,created){const saved=normalizeRound(round);setApplications(current=>current?.map(application=>{if(application.application_id!==roundTarget?.applicationId)return application;const rounds=application.rounds||[];return rounds.some(existing=>(existing.roundId||existing.round_id)===saved.roundId)?application:{...application,rounds:[...rounds,saved]};}));setSuccess(created?`${saved.roundName} was saved for ${roundTarget.applicantName} with status Pending.`:`${saved.roundName} was already saved and is shown below.`);setRoundTarget(null);}

 async function addOffer(application){
  const raw=window.prompt('Offer package in LPA');
  if(raw===null)return;
  const packageLpa=Number(raw);
  if(!Number.isFinite(packageLpa)||packageLpa<0){setError('Enter a nonnegative package in LPA.');return;}
  setOfferBusy(application.application_id);setError('');
  try{await api.post(`/officer/applications/${application.application_id}/offers`,{packageLpa});setSuccess(`Offer recorded for ${application.full_name}.`);const {data}=await api.get(`/officer/drives/${selected}/applications`);setApplications(data.applications);}
  catch(requestError){setError(messageFor(requestError));}
  finally{setOfferBusy('');}
 }

 return <>
  <PageHeading eyebrow="PLACEMENT CELL · SELECTION" title="Application review" description="Review eligibility snapshots and manage student progress through the selection process."/>
  <ErrorBanner>{error}</ErrorBanner><SuccessBanner>{success}</SuccessBanner>
  <div className="filter-bar review-filter"><label className="select-control">Placement drive<select value={selected} onChange={event=>setSelected(event.target.value)}><option value="">Select a drive</option>{drives.map(item=><option key={item.drive_id} value={item.drive_id}>{item.role} · {item.company_name}</option>)}</select></label><span className="result-count">{applications?.length??'—'} applicants</span></div>
  {!selected?<EmptyState title="No drives available" body="Create and publish a placement drive to begin reviewing applications."/>:applications===null?<Loading/>:applications.length?<div className="candidate-grid">{applications.map(application=>{
   const choices=statusOptions[application.status]||[];
   const selectableStatuses=[application.status,...choices];
   const roundBlocked=application.status==='rejected';
   const roundHelpId=`round-blocked-${application.application_id}`;
   return <article className="candidate-card" key={application.application_id}>
    <div className="candidate-top"><div className="avatar candidate-avatar">{application.full_name.split(' ').map(part=>part[0]).join('').slice(0,2)}</div><div className="candidate-identity"><h2>{application.full_name}</h2><span>{application.registration_number} · {application.branch_code}</span></div><span className={`status-pill ${application.status==='shortlisted'?'green':application.status==='rejected'?'red':application.status==='interview'?'blue':'amber'}`}>{statusLabel(application.status)}</span></div>
    <div className="candidate-stats"><div><small>CGPA</small><strong>{application.cgpa??'—'} / 10</strong></div><div><small>Active backlogs</small><strong>{application.active_backlogs??'—'}</strong></div><div><small>Applied</small><strong>{new Date(application.applied_at).toLocaleDateString()}</strong></div></div>
    <div className={`snapshot ${application.eligibility_snapshot?.eligible?'snapshot-pass':'snapshot-warn'}`}><strong>{application.eligibility_snapshot?.eligible?'Eligible at application':'Eligibility record'}</strong><small>Minimum CGPA {application.eligibility_snapshot?.criteriaAtApplication?.minimumCgpa??'—'} · Maximum backlogs {application.eligibility_snapshot?.criteriaAtApplication?.maximumBacklogs??'—'}</small></div>
    {application.resume_text&&<details className="resume-details"><summary>Review resume text</summary><pre>{application.resume_text}</pre></details>}
    <InterviewRoundList rounds={application.rounds||[]}/>
    <div className="candidate-actions"><label>Status<select value={application.status} disabled={statusBusy||choices.length===0} onChange={event=>proposeStatus(application,event.target.value)}>{selectableStatuses.map(status=><option value={status} key={status}>{statusLabel(status)}</option>)}</select></label><button type="button" className="button button-secondary" aria-label={`Add interview round for ${application.full_name}`} aria-describedby={roundBlocked?roundHelpId:undefined} title={roundBlocked?'Reopen the application to add interview rounds.':undefined} disabled={roundBlocked||offerBusy===application.application_id||statusBusy} onClick={()=>openRoundDialog(application)}>＋ Add interview round</button>{roundBlocked&&<small id={roundHelpId} className="round-action-note">Reopen this application as Under review to add interview rounds.</small>}{['shortlisted','interview'].includes(application.status)&&<button type="button" className="button button-primary" disabled={offerBusy===application.application_id} onClick={()=>addOffer(application)}>Record offer</button>}</div>
   </article>;
  })}</div>:<EmptyState title="No applications for this drive" body="Applications appear here after eligible students apply."/>}

  <AppDialog open={Boolean(statusTarget)} title={statusTarget?.nextStatus==='rejected'?'Confirm applicant rejection':'Confirm status change'} description={statusTarget?.nextStatus==='rejected'?`${statusTarget?.applicantName} will be marked as rejected for this drive. If this was a mistake, you can reopen the application as Under review.`:'Review the applicant and drive details before saving this status change.'} onClose={()=>{setStatusTarget(null);setStatusError('');}} busy={statusBusy} tone={statusTarget?.nextStatus==='rejected'?'danger':'default'}>
   {statusTarget&&<div className="dialog-form"><div className="dialog-context"><span>APPLICANT</span><strong>{statusTarget.applicantName}</strong><span>COMPANY DRIVE</span><strong>{statusTarget.driveLabel}</strong><span>CURRENT STATUS</span><strong>{statusLabel(statusTarget.currentStatus)}</strong><span>PROPOSED STATUS</span><strong className={statusTarget.nextStatus==='rejected'?'dialog-danger-value':''}>{statusLabel(statusTarget.nextStatus)}</strong></div><ErrorBanner>{statusError}</ErrorBanner><div className="dialog-actions"><button type="button" className="button button-secondary" onClick={()=>{setStatusTarget(null);setStatusError('');}} disabled={statusBusy} data-dialog-initial-focus>Cancel</button><button type="button" className={`button ${statusTarget.nextStatus==='rejected'?'button-danger':'button-primary'}`} onClick={confirmStatusChange} disabled={statusBusy}>{statusBusy?'Saving…':statusTarget.nextStatus==='rejected'?'Reject applicant':'Confirm change'}</button></div></div>}
  </AppDialog>
  {roundTarget&&<InterviewRoundDialog key={roundTarget.applicationId} {...roundTarget} onClose={()=>setRoundTarget(null)} onSaved={roundSaved}/>}
 </>;
}
