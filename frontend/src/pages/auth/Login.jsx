import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { ErrorBanner } from '../../components/Feedback.jsx';
import { messageFor } from '../../services/api.js';

export default function Login(){
 const {user,login}=useAuth();const nav=useNavigate();const [form,setForm]=useState({email:'',password:''});const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 if(user)return <Navigate to="/dashboard" replace/>;
 async function submit(e){e.preventDefault();setError('');setBusy(true);try{const account=await login(form);nav(account.role==='student'?'/dashboard':'/dashboard',{replace:true});}catch(err){setError(messageFor(err));}finally{setBusy(false);}}
 return <div className="auth-screen"><div className="auth-aside"><div className="auth-brand"><div className="brand-mark brand-mark-large">SCEM</div><div><strong>SAHYADRI</strong><span>Campus · Career · Community</span></div></div><div className="auth-story"><div className="eyebrow eyebrow-light">PLACEMENT INTELLIGENCE</div><h1>Make every next step <em>count.</em></h1><p>A shared workspace for students, recruiters and the Placement Cell to navigate campus opportunities with clarity.</p><div className="story-rule"/><div className="story-location">Sahyadri Campus<br/>Adyar · Mangaluru · Karnataka</div></div><div className="auth-aside-footer">Unified Campus Placement and Eligibility Intelligence System</div></div>
  <div className="auth-main"><div className="auth-card"><div className="eyebrow">WELCOME BACK</div><h2>Sign in to your workspace</h2><p className="auth-subtitle">Use your registered email address to continue.</p><ErrorBanner>{error}</ErrorBanner><form onSubmit={submit} className="form-stack"><label>Email address<input type="email" autoComplete="username" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="you@example.edu"/></label><label>Password<input type="password" autoComplete="current-password" required value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="Enter your password"/></label><button className="button button-primary button-full" disabled={busy}>{busy?'Signing in…':'Sign in'}<span>→</span></button></form><p className="auth-switch">Student without an account? <Link to="/register">Create your account</Link></p><div className="prototype-note"><span>i</span><p>Accounts are managed for this academic prototype. Contact your project administrator if you need Placement Cell or recruiter access.</p></div></div><div className="auth-legal">Academic Project Prototype · Sahyadri College of Engineering &amp; Management</div></div>
 </div>;
}
