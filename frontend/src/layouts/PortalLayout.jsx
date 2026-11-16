import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect,useRef,useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../services/api.js';
import Branding from '../components/Branding.jsx';
import AppDialog from '../components/AppDialog.jsx';
import { ErrorBanner } from '../components/Feedback.jsx';

const portalLinks={
 student:[['/dashboard','Overview','⌂'],['/drives','Placement drives','▦'],['/applications','My applications','▤'],['/profile','My profile','◉']],
 placement_officer:[['/dashboard','Overview','⌂'],['/students','Student directory','♙'],['/imports','Bulk import','⇧'],['/manage-drives','Placement drives','▦'],['/reviews','Applications','▤'],['/reports','Placement analytics','◷']],
 recruiter:[['/dashboard','Overview','⌂'],['/recruiter-drives','Company drives','▦']]
};
const roleNames={student:'Student portal',placement_officer:'Placement Cell',recruiter:'Recruiter portal'};
const pageNames={'/dashboard':'Overview','/drives':'Placement drives','/applications':'My applications','/profile':'My profile','/students':'Student directory','/imports':'Bulk student import','/manage-drives':'Placement drives','/reviews':'Applications','/reports':'Placement analytics','/recruiter-drives':'Company drives'};
export default function PortalLayout({children}){
 const {user,logout}=useAuth();const nav=useNavigate();const location=useLocation();const links=portalLinks[user?.role]||[];const [footer,setFooter]=useState('Academic Project Prototype | Sahyadri College of Engineering & Management');
 const [logoutOpen,setLogoutOpen]=useState(false),[logoutBusy,setLogoutBusy]=useState(false),[logoutError,setLogoutError]=useState('');
 const logoutSending=useRef(false);
 useEffect(()=>{api.get('/settings').then(r=>{if(r.data.institution?.footer)setFooter(r.data.institution.footer);}).catch(()=>{});},[]);
 const current=pageNames[location.pathname]||'Placement intelligence';
 async function confirmLogout(){if(logoutBusy||logoutSending.current)return;logoutSending.current=true;setLogoutBusy(true);setLogoutError('');try{await logout();setLogoutOpen(false);nav('/login',{replace:true});}catch{setLogoutError('We could not sign you out. Check your connection and try again.');}finally{logoutSending.current=false;setLogoutBusy(false);}}
 return <div className="portal-shell">
  <aside className="sidebar">
   <Branding variant="brand-lockup" subtitle="Placement Cell" />
   <div className="sidebar-label">WORKSPACE</div>
   <nav className="side-nav">{links.map(([to,label,icon])=><NavLink key={to} to={to} className={({isActive})=>`nav-item ${isActive?'active':''}`}><span className="nav-icon">{icon}</span><span>{label}</span>{to==='/imports'&&<span className="nav-badge">CSV</span>}</NavLink>)}</nav>
   <div className="sidebar-bottom"><div className="sidebar-note"><span className="note-dot"/><div><strong>Academic prototype</strong><small>Local placement workspace</small></div></div><a className="college-link" href="https://www.sahyadri.edu.in/placements" target="_blank" rel="noreferrer">About SCEM ↗</a></div>
  </aside>
  <div className="main-column">
   <header className="topbar"><div className="crumb"><span>SCEM</span><i>/</i><strong>{current}</strong></div><div className="topbar-right"><span className="role-pill">{roleNames[user?.role]||'Portal'}</span><div className="user-chip"><div className="avatar">{user?.name?.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase()}</div><div className="user-label"><strong>{user?.name}</strong><small>{user?.email}</small></div></div><button type="button" className="icon-button logout-button" title="Sign out" onClick={()=>{setLogoutError('');setLogoutOpen(true);}} aria-label="Sign out">↗</button></div></header>
   <main className="page-wrap">{children}</main>
   <footer className="app-footer"><span>Unified Campus Placement and Eligibility Intelligence System</span><span>{footer}</span></footer>
  </div>
  <AppDialog open={logoutOpen} title="Sign out?" description="Do you want to end your placement portal session?" onClose={()=>{setLogoutOpen(false);setLogoutError('');}} busy={logoutBusy}>
   <div className="dialog-form"><ErrorBanner>{logoutError}</ErrorBanner><div className="dialog-actions"><button type="button" className="button button-secondary" data-dialog-initial-focus onClick={()=>{setLogoutOpen(false);setLogoutError('');}} disabled={logoutBusy}>Stay signed in</button><button type="button" className="button button-danger" onClick={confirmLogout} disabled={logoutBusy}>{logoutBusy?'Signing out…':'Sign out'}</button></div></div>
  </AppDialog>
 </div>;
}
