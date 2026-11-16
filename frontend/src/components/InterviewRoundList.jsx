const resultLabel={pending:'Pending',passed:'Passed',failed:'Failed',no_show:'No show'};

function normalizedRoundName(value=''){
 const normalized=String(value).normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g,' ');
 const numbered=normalized.match(/^(?:round|r)\s*[-#:]?\s*0*(\d+)$/);
 if(numbered)return `round ${Number(numbered[1])}`;
 return normalized.replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}

export default function InterviewRoundList({rounds=[]}){
 if(!rounds.length)return <div className="round-list-empty">No interview rounds saved yet.</div>;
 const counts=new Map();
 for(const round of rounds){const key=normalizedRoundName(round.roundName);if(key)counts.set(key,(counts.get(key)||0)+1);}
 const hasRepeatedNames=[...counts.values()].some(count=>count>1);
 return <section className="round-list" aria-label="Saved interview rounds">
  <div className="round-list-heading"><strong>Interview rounds</strong><span>{rounds.length}</span></div>
  {hasRepeatedNames&&<p className="round-duplicate-note">Saved rounds include names that normalize to the same label. Each record remains separate and is shown with its saved time.</p>}
  <ol>{rounds.map((round,index)=>{
   const key=normalizedRoundName(round.roundName);
   const repeated=Boolean(key&&counts.get(key)>1);
   const status=round.result?resultLabel[round.result]||round.result.replaceAll('_',' '):'Not recorded';
   const tone=round.result==='passed'?'green':round.result==='failed'?'red':round.result==='pending'?'amber':'muted';
   const timing=[round.date?`Scheduled ${new Date(round.date).toLocaleString()}`:'No interview date recorded',round.createdAt?`Saved ${new Date(round.createdAt).toLocaleString()}`:'Saved time not recorded'].join(' · ');
   return <li key={round.roundId||round.round_id||`${round.roundName}-${round.createdAt||index}`}>
    <div className="round-entry-main"><strong>{round.roundName}</strong><span className={`status-pill ${tone}`}>{status}</span></div>
    <small>{timing}{repeated?' · Repeated normalized name':''}</small>
    {round.feedback&&<p>{round.feedback}</p>}
   </li>;
  })}</ol>
 </section>;
}
