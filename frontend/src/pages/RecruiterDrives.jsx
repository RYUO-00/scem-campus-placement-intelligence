import { useEffect,useRef,useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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

export default function RecruiterDrives(){
 const [params,setParams]=useSearchParams();
 const [drives,setDrives]=useState([]),[selected,setSelected]=useState(params.get('drive')||''),[apps,setApps]=useState(null);
 const [error,setError]=useState(''),[success,setSuccess]=useState(''),[statusTarget,setStatusTarget]=useState(null),[statusError,setStatusError]=useState(''),[statusBusy,setStatusBusy]=useState(false),[roundTarget,setRoundTarget]=useState(null);
 const statusSending=useRef(false);

 useEffect(()=>{
  let active=true;
  api.get('/recruiter/drives').then(response=>{
   if(!active)return;
   setDrives(response.data.drives);
   const wanted=params.get('drive');
   if(wanted&&response.data.drives.some(drive=>drive.drive_id===wanted))setSelected(wanted);
   else if(response.data.drives[0])setSelected(response.data.drives[0].drive_id);
  }).catch(requestError=>{if(active)setError(messageFor(requestError));});
  return ()=>{active=false;};
 },[]);

 useEffect(()=>{
  if(!selected){setApps(null);return undefined;}
  setParams({drive:selected},{replace:true});setApps(null);setError('');
  let active=true;
  api.get(`/recruiter/drives/${selected}/applications`).then(response=>{if(active)setApps(response.data.applications);}).catch(requestError=>{if(active)setError(messageFor(requestError));});
  return ()=>{active=false;};
 },[selected]);

 const drive=drives.find(item=>item.drive_id===selected);
 const companyDrive=drive?[drive.company_name,drive.role].filter(Boolean).join(' · '):'Selected company drive';

 function proposeStatus(application,nextStatus){
  if(nextStatus===application.status)return;
  setSuccess('');setStatusError('');
  setStatusTarget({applicationId:application.application_id,applicantName:application.full_name,driveLabel:companyDrive,currentStatus:application.status,nextStatus});
 }

 async function confirmStatusChange(){
  if(!statusTarget||statusBusy||statusSending.current)return;
  statusSending.current=true;setStatusBusy(true);setStatusError('');
  try{
   const {data}=await api.patch(`/recruiter/applications/${statusTarget.applicationId}/status`,{status:statusTarget.nextStatus,...(statusTarget.nextStatus==='rejected'?{confirmed:true}:{})});
   setApps(current=>current?.map(application=>application.application_id===statusTarget.applicationId?{...application,status:data.application.status}:application));
   setSuccess(`${statusTarget.applicantName} is now ${statusLabel(data.application.status)} for ${statusTarget.driveLabel}.`);
   setStatusTarget(null);
  }catch(requestError){setStatusError(messageFor(requestError));}
  finally{statusSending.current=false;setStatusBusy(false);}
 }

 function openRoundDialog(application){
  if(application.status==='rejected')return;
  setSuccess('');
  setRoundTarget({applicationId:application.application_id,applicantName:application.full_name,driveLabel:companyDrive,endpoint:`/recruiter/applications/${application.application_id}/rounds`});
 }

 function roundSaved(round,created){
  const saved=normalizeRound(round);
  setApps(current=>current?.map(application=>{
   if(application.application_id!==saved.application_id&&application.application_id!==round.application_id&&application.application_id!==roundTarget?.applicationId)return application;
   const rounds=application.rounds||[];
   if(rounds.some(existing=>(existing.roundId||existing.round_id)===saved.roundId))return application;
   return {...application,rounds:[...rounds,saved]};
  }));
  setSuccess(created?`${saved.roundName} was saved for ${roundTarget.applicantName} with status Pending.`:`${saved.roundName} was already saved and is shown below.`);
  setRoundTarget(null);
 }

 return <>
  <PageHeading eyebrow="RECRUITER WORKSPACE · CANDIDATES" title="Company drives" description="Review applicants for drives assigned to your company. Candidate data is scoped to your recruiter account."/>
  <ErrorBanner>{error}</ErrorBanner><SuccessBanner>{success}</SuccessBanner>
  {drives.length?<>
   <div className="filter-bar review-filter"><label className="select-control">Assigned drive<select value={selected} onChange={event=>setSelected(event.target.value)}>{drives.map(item=><option key={item.drive_id} value={item.drive_id}>{item.role} · {item.applicants} applicants</option>)}</select></label><span className="result-count">Deadline {drive?new Date(drive.application_deadline).toLocaleDateString():'—'}</span></div>
   {apps===null?<Loading/>:apps.length?<div className="candidate-grid">{apps.map(application=>{
    const choices=statusOptions[application.status]||[];
    const selectableStatuses=[application.status,...choices];
    const roundBlocked=application.status==='rejected';
    const roundHelpId=`round-blocked-${application.application_id}`;
    return <article className="candidate-card" key={application.application_id}>
     <div className="candidate-top"><div className="avatar candidate-avatar">{application.full_name.split(' ').map(part=>part[0]).join('').slice(0,2)}</div><div className="candidate-identity"><h2>{application.full_name}</h2><span>{application.registration_number} · {application.branch_code}</span></div><span className={`status-pill ${application.status==='shortlisted'?'green':application.status==='rejected'?'red':application.status==='interview'?'blue':'amber'}`}>{statusLabel(application.status)}</span></div>
     <div className="candidate-stats"><div><small>CGPA</small><strong>{application.cgpa??'—'} / 10</strong></div><div><small>Backlogs</small><strong>{application.active_backlogs}</strong></div><div><small>Eligibility at application</small><strong>{application.eligibility_snapshot?.eligible?'Eligible':'Review snapshot'}</strong></div></div>
     <div className="snapshot snapshot-pass"><strong>Rule-based result saved</strong><small>Resume matching does not change this decision.</small></div>
     {application.resume_text&&<details className="resume-details"><summary>Authorized resume text</summary><pre>{application.resume_text}</pre></details>}
     <InterviewRoundList rounds={application.rounds||[]}/>
     <div className="candidate-actions"><label>Review status<select value={application.status} disabled={statusBusy||choices.length===0} onChange={event=>proposeStatus(application,event.target.value)}>{selectableStatuses.map(status=><option key={status} value={status}>{statusLabel(status)}</option>)}</select></label><button type="button" className="button button-secondary" aria-label={`Add interview round for ${application.full_name}`} aria-describedby={roundBlocked?roundHelpId:undefined} title={roundBlocked?'Reopen the application to add interview rounds.':undefined} disabled={roundBlocked||statusBusy} onClick={()=>openRoundDialog(application)}>＋ Add round</button>{roundBlocked&&<small id={roundHelpId} className="round-action-note">Reopen this application as Under review to add interview rounds.</small>}</div>
    </article>;
   })}</div>:<EmptyState title="No applications yet" body="Candidates will appear when students apply to this drive."/>}
  </>:<EmptyState title="No company drives assigned" body="Contact the Placement Cell if your company should have an assigned placement drive."/>}

  <AppDialog open={Boolean(statusTarget)} title={statusTarget?.nextStatus==='rejected'?'Confirm applicant rejection':'Confirm status change'} description={statusTarget?.nextStatus==='rejected'?`${statusTarget?.applicantName} will be marked as rejected for this drive. If this was a mistake, you can reopen the application as Under review.`:'Review the applicant and drive details before saving this status change.'} onClose={()=>{setStatusTarget(null);setStatusError('');}} busy={statusBusy} tone={statusTarget?.nextStatus==='rejected'?'danger':'default'}>
   {statusTarget&&<div className="dialog-form"><div className="dialog-context"><span>APPLICANT</span><strong>{statusTarget.applicantName}</strong><span>COMPANY DRIVE</span><strong>{statusTarget.driveLabel}</strong><span>CURRENT STATUS</span><strong>{statusLabel(statusTarget.currentStatus)}</strong><span>PROPOSED STATUS</span><strong className={statusTarget.nextStatus==='rejected'?'dialog-danger-value':''}>{statusLabel(statusTarget.nextStatus)}</strong></div><ErrorBanner>{statusError}</ErrorBanner><div className="dialog-actions"><button type="button" className="button button-secondary" onClick={()=>{setStatusTarget(null);setStatusError('');}} disabled={statusBusy} data-dialog-initial-focus>Cancel</button><button type="button" className={`button ${statusTarget.nextStatus==='rejected'?'button-danger':'button-primary'}`} onClick={confirmStatusChange} disabled={statusBusy}>{statusBusy?'Saving…':statusTarget.nextStatus==='rejected'?'Reject applicant':'Confirm change'}</button></div></div>}
  </AppDialog>
  {roundTarget&&<InterviewRoundDialog key={roundTarget.applicationId} {...roundTarget} onClose={()=>setRoundTarget(null)} onSaved={roundSaved}/>}
 </>;
}
