import { pool } from '../config/db.js';

export function normalizeInterviewRoundName(value=''){
 const normalized=String(value).normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g,' ');
 const numbered=normalized.match(/^(?:round|r)\s*[-#:]?\s*0*(\d+)$/);
 if(numbered)return `round ${Number(numbered[1])}`;
 return normalized.replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}

function sameInstant(left,right){
 if(left==null||right==null)return left==null&&right==null;
 return new Date(left).getTime()===new Date(right).getTime();
}

export async function saveInterviewRound({applicationId,roundName,interviewDate=null,result='pending',feedback=null,requestId,companyId=null}){
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const companyFilter=companyId?' AND d.company_id=$2':'';
  const scopeValues=companyId?[applicationId,companyId]:[applicationId];
  const application=await client.query(`SELECT a.application_id,a.status
   FROM applications a JOIN job_drives d USING(drive_id)
   WHERE a.application_id=$1${companyFilter}
   FOR UPDATE OF a,d`,scopeValues);
  if(!application.rows[0]){await client.query('ROLLBACK');return null;}
  if(application.rows[0].status==='rejected'){
   await client.query('ROLLBACK');
   return {rejected:true};
  }

  const existing=await client.query(`SELECT r.round_id,r.application_id,r.round_name,r.interview_date,r.result,r.feedback,r.created_at
   FROM interview_rounds r WHERE r.application_id=$1 AND r.request_id=$2`,[applicationId,requestId]);
  if(existing.rows[0]){
   const round=existing.rows[0];
   const sameRequest=normalizeInterviewRoundName(round.round_name)===normalizeInterviewRoundName(roundName)
    &&sameInstant(round.interview_date,interviewDate)&&round.result===result&&round.feedback===feedback;
   await client.query('COMMIT');
   return sameRequest?{round,created:false}:{conflict:true};
  }

  const rounds=await client.query('SELECT round_id,round_name FROM interview_rounds WHERE application_id=$1 ORDER BY created_at,round_id',[applicationId]);
  const normalizedName=normalizeInterviewRoundName(roundName);
  const duplicate=rounds.rows.find(round=>normalizeInterviewRoundName(round.round_name)===normalizedName);
  if(duplicate){
   await client.query('ROLLBACK');
   return {duplicate:true,existingRoundId:duplicate.round_id,existingRoundName:duplicate.round_name};
  }

  const inserted=await client.query(`INSERT INTO interview_rounds(application_id,round_name,interview_date,result,feedback,request_id)
   VALUES($1,$2,$3,$4,$5,$6)
   RETURNING round_id,application_id,round_name,interview_date,result,feedback,created_at`,
  [applicationId,roundName,interviewDate,result,feedback,requestId]);
  await client.query('COMMIT');
  return {round:inserted.rows[0],created:true};
 }catch(error){
  await client.query('ROLLBACK');
  throw error;
 }finally{client.release();}
}
