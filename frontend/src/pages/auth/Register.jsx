import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { ErrorBanner } from '../../components/Feedback.jsx';
import Branding from '../../components/Branding.jsx';
import PasswordInput from '../../components/PasswordInput.jsx';
import { messageFor } from '../../services/api.js';

export default function Register(){
 const {user,register}=useAuth();const nav=useNavigate();const [form,setForm]=useState({name:'',registrationNumber:'',email:'',password:''});const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 if(user)return <Navigate to="/dashboard" replace/>;
 async function submit(e){e.preventDefault();setError('');setBusy(true);try{await register(form);nav('/dashboard',{replace:true});}catch(err){setError(messageFor(err));}finally{setBusy(false);}}
 return <div className="auth-screen"><div className="auth-aside"><Branding/><div className="auth-story"><div className="eyebrow eyebrow-light">STUDENT ACCESS</div><h1>Your placement journey, <em>in view.</em></h1><p>Create your student workspace by matching the contact details already on the imported academic roster.</p><div className="story-rule"/><div className="story-location">Roster data is kept separate<br/>from your login account</div></div><div className="auth-aside-footer">Academic project · Local demonstration environment</div></div>
  <div className="auth-main"><div className="auth-card"><div className="eyebrow">CREATE STUDENT ACCOUNT</div><h2>Set up your access</h2><p className="auth-subtitle">Your name, registration number and email must match the roster record.</p><ErrorBanner>{error}</ErrorBanner><form onSubmit={submit} className="form-stack"><label>Full name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="As listed in the roster"/></label><label>Registration number<input required value={form.registrationNumber} onChange={e=>setForm({...form,registrationNumber:e.target.value})} placeholder="e.g. 4SF24IS001 or DEMO2026CSE001"/></label><label>Imported email address<input type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="you@example.edu"/></label><label>Create password<PasswordInput autoComplete="new-password" minLength="10" required value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="At least 10 characters"/></label><button className="button button-primary button-full" disabled={busy}>{busy?'Creating account…':'Create account'}<span>→</span></button></form><p className="auth-switch">Already registered? <Link to="/login">Sign in</Link></p><div className="prototype-note"><span>i</span><p>Need a development officer or recruiter account? Ask the administrator to configure role credentials before seeding the local database.</p></div></div><div className="auth-legal">Academic Project Prototype · Sahyadri College of Engineering &amp; Management</div></div>
 </div>;
}
