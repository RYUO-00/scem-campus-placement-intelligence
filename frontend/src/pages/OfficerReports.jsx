import { useEffect,useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS,CategoryScale,LinearScale,BarElement,Tooltip,Legend } from 'chart.js';
import api,{messageFor} from '../services/api.js';
import {ErrorBanner,Loading,PageHeading} from '../components/Feedback.jsx';
import StatCard from '../components/StatCard.jsx';
ChartJS.register(CategoryScale,LinearScale,BarElement,Tooltip,Legend);

const chartFont={family:'DM Sans',size:12};
const baseOptions={responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false},tooltip:{backgroundColor:'#193242',titleFont:chartFont,bodyFont:chartFont,padding:11,displayColors:true,callbacks:{label:(context)=>`${context.dataset.label}: ${context.formattedValue}`}}},scales:{x:{grid:{display:false},ticks:{color:'#53666d',font:chartFont}},y:{beginAtZero:true,grid:{color:'#e8ece9'},ticks:{precision:0,color:'#53666d',font:chartFont}}}};
const legendOptions={display:true,position:'bottom',labels:{usePointStyle:true,boxWidth:9,padding:16,color:'#53666d',font:chartFont}};

export default function OfficerReports(){
 const [data,setData]=useState(null),[error,setError]=useState('');
 useEffect(()=>{api.get('/officer/reports/summary').then(r=>setData(r.data)).catch(e=>setError(messageFor(e)));},[]);
 async function exportCsv(kind){try{const r=await api.get('/officer/reports/export',{params:{kind},responseType:'blob'});const url=URL.createObjectURL(r.data);const a=document.createElement('a');a.href=url;a.download=`scem-${kind}.csv`;a.click();URL.revokeObjectURL(url);}catch(e){setError(messageFor(e));}}
 if(!data)return <><PageHeading eyebrow="PLACEMENT CELL · ANALYTICS" title="Placement analytics" description="Every metric comes from this project's current database records."/><ErrorBanner>{error}</ErrorBanner><Loading/></>;

 const m=data.metrics;
 const branchRows=[...data.byBranch].sort((a,b)=>b.applications-a.applications||a.branch_code.localeCompare(b.branch_code));
 const monthlyRows=data.applicationsByMonth;
 const companyRows=data.byCompany.slice(0,8);
 const branches={labels:branchRows.map(b=>b.branch_code),datasets:[{label:'Applications',data:branchRows.map(b=>b.applications),backgroundColor:'#64869a',borderRadius:5,barPercentage:.72,categoryPercentage:.68},{label:'Accepted offers',data:branchRows.map(b=>b.accepted_offers),backgroundColor:'#c96d4b',borderRadius:5,barPercentage:.72,categoryPercentage:.68}]};
 const monthly={labels:monthlyRows.map(row=>row.month),datasets:[{label:'Applications',data:monthlyRows.map(row=>row.count),backgroundColor:'#c96d4b',borderRadius:5,borderSkipped:false,maxBarThickness:28}]};
 const companies={labels:companyRows.map(company=>company.company_name),datasets:[{label:'Applications',data:companyRows.map(company=>company.applications),backgroundColor:'#64869a',borderRadius:5,barPercentage:.72,categoryPercentage:.68}]};
 const branchOptions={...baseOptions,indexAxis:'y',plugins:{...baseOptions.plugins,legend:legendOptions},scales:{x:{beginAtZero:true,grid:{color:'#e8ece9'},ticks:{precision:0,color:'#53666d',font:chartFont}},y:{grid:{display:false},ticks:{color:'#53666d',font:chartFont,autoSkip:false}}}};
 const monthlyOptions={...baseOptions,scales:{x:{grid:{display:false},ticks:{color:'#53666d',font:{...chartFont,size:10},autoSkip:false,maxRotation:0,minRotation:0,callback:function(value,index){const step=this.chart.width<370?3:2;return index===0||index===11||(index<10&&index%step===0)?this.getLabelForValue(value):'';}}},y:{beginAtZero:true,grid:{color:'#e8ece9'},ticks:{precision:0,color:'#53666d',font:chartFont}}}};
 const companyOptions={...baseOptions,indexAxis:'y',scales:{x:{beginAtZero:true,grid:{color:'#e8ece9'},ticks:{precision:0,color:'#53666d',font:chartFont}},y:{grid:{display:false},ticks:{color:'#53666d',font:chartFont}}}};
 const branchChartHeight=Math.max(250,branchRows.length*34+58);
 const hasMonthlyActivity=monthlyRows.some(row=>row.count>0);

 return <><PageHeading eyebrow="PLACEMENT CELL · REPORTING" title="Placement analytics" description="A live view of roster and application outcomes. No institutional placement statistics are mixed into these figures." action={<div className="export-actions"><button className="button button-secondary" onClick={()=>exportCsv('applications')}>Export applications ↓</button><button className="button button-secondary" onClick={()=>exportCsv('offers')}>Export offers ↓</button></div>}/><ErrorBanner>{error}</ErrorBanner><div className="stat-grid"><StatCard label="Roster records" value={m.total_students} detail="Imported students" icon="♙" tone="accent"/><StatCard label="Students with accepted offers" value={m.students_with_accepted_offers} detail="Accepted only" icon="✳" tone="green"/><StatCard label="Accepted offer rate" value={`${m.accepted_offer_rate_pct??0}%`} detail="Accepted students ÷ roster records" icon="◷" tone="blue"/><StatCard label="Average accepted package" value={m.accepted_average_lpa?`${m.accepted_average_lpa} LPA`:'—'} detail="Pending offers excluded" icon="₹" tone="amber"/></div><div className="analytics-grid">
  <section className="panel analytics-panel" aria-label="Applications and accepted offers by branch"><div className="panel-heading"><div><div className="eyebrow">STUDENT OUTCOMES</div><h2>Branch activity</h2></div></div>{branchRows.length?<><div className="chart-area branch-chart-area" style={{height:branchChartHeight}}><Bar data={branches} options={branchOptions}/></div><div className="table-wrap"><table aria-label="Department counts from database records"><thead><tr><th>Branch</th><th>Students</th><th>Registrations</th><th>Accounts</th><th>Applications</th><th>Offers</th><th>Intake 24</th><th>Intake 25</th></tr></thead><tbody>{branchRows.map(row=><tr key={row.branch_code}><td><strong>{row.branch_code}</strong></td><td>{row.students}</td><td>{row.registration_records}</td><td>{row.registered_accounts}</td><td>{row.applications}</td><td>{row.offers}</td><td>{row.intake_2024_registrations}</td><td>{row.intake_2025_registrations}</td></tr>)}</tbody></table></div></>:<div className="chart-empty">No branch activity is available yet.</div>}</section>
  <section className="panel analytics-panel"><div className="panel-heading"><div><div className="eyebrow">APPLICATION VOLUME</div><h2>Applications by month</h2><p>Last 12 calendar months</p></div></div>{hasMonthlyActivity?<div className="chart-area monthly-chart-area"><Bar data={monthly} options={monthlyOptions}/></div>:<div className="chart-empty">No application activity recorded for this period.</div>}</section>
  <section className="panel analytics-panel company-analytics"><div className="panel-heading"><div><div className="eyebrow">EMPLOYER ACTIVITY</div><h2>Applications by company</h2></div></div>{companyRows.length?<div className="chart-area company-chart-area"><Bar data={companies} options={companyOptions}/></div>:<div className="chart-empty">No company application activity is available yet.</div>}</section>
  <section className="panel analytics-panel definitions"><div className="eyebrow">MEASUREMENT NOTES</div><h2>How to read these figures</h2><p>{data.definition}</p><p>Registration codes awaiting a confirmed branch mapping: {data.registrationPolicy?.departments.filter(department=>department.mappingStatus==='unresolved').map(department=>department.registrationCode).join(', ')||'none'}.</p><a href={`${import.meta.env.VITE_API_URL||'http://localhost:4000/api'}/health`} target="_blank" rel="noreferrer" className="text-link">API health →</a></section>
 </div></>;
}
