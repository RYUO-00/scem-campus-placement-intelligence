import { lazy,Suspense,useLayoutEffect } from 'react';
import { Navigate,Route,Routes,Outlet,useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
const Login=lazy(()=>import('./pages/auth/Login.jsx'));
const Register=lazy(()=>import('./pages/auth/Register.jsx'));
const ForgotPassword=lazy(()=>import('./pages/auth/ForgotPassword.jsx'));
const ResetPassword=lazy(()=>import('./pages/auth/ResetPassword.jsx'));
const Dashboard=lazy(()=>import('./pages/Dashboard.jsx'));
const StudentDrives=lazy(()=>import('./pages/StudentDrives.jsx'));
const StudentApplications=lazy(()=>import('./pages/StudentApplications.jsx'));
const StudentProfile=lazy(()=>import('./pages/StudentProfile.jsx'));
const OfficerStudents=lazy(()=>import('./pages/OfficerStudents.jsx'));
const OfficerImport=lazy(()=>import('./pages/OfficerImport.jsx'));
const OfficerDrives=lazy(()=>import('./pages/OfficerDrives.jsx'));
const OfficerReviews=lazy(()=>import('./pages/OfficerReviews.jsx'));
const OfficerReports=lazy(()=>import('./pages/OfficerReports.jsx'));
const RecruiterDrives=lazy(()=>import('./pages/RecruiterDrives.jsx'));
function LazyPage({children}){return <Suspense fallback={<div className="loading-screen"><span className="spinner"/>Opening workspace…</div>}>{children}</Suspense>;}

function RoleGate({roles}){const {user}=useAuth();return roles.includes(user?.role)?<Outlet/>:<Navigate to="/dashboard" replace/>;}
function IndexRedirect(){const {user,loading}=useAuth();return loading?null:<Navigate to={user?'/dashboard':'/login'} replace/>;}
export default function App(){const location=useLocation();useLayoutEffect(()=>{window.scrollTo(0,0);},[location.pathname]);return <Routes><Route path="/" element={<IndexRedirect/>}/><Route path="/login" element={<LazyPage><Login/></LazyPage>}/><Route path="/register" element={<LazyPage><Register/></LazyPage>}/><Route path="/forgot-password" element={<LazyPage><ForgotPassword/></LazyPage>}/><Route path="/reset-password" element={<LazyPage><ResetPassword/></LazyPage>}/><Route element={<ProtectedRoute/>}>
 <Route path="/dashboard" element={<LazyPage><Dashboard/></LazyPage>}/>
 <Route element={<RoleGate roles={['student']}/> }><Route path="/drives" element={<LazyPage><StudentDrives/></LazyPage>}/><Route path="/applications" element={<LazyPage><StudentApplications/></LazyPage>}/><Route path="/profile" element={<LazyPage><StudentProfile/></LazyPage>}/></Route>
 <Route element={<RoleGate roles={['placement_officer']}/> }><Route path="/students" element={<LazyPage><OfficerStudents/></LazyPage>}/><Route path="/imports" element={<LazyPage><OfficerImport/></LazyPage>}/><Route path="/manage-drives" element={<LazyPage><OfficerDrives/></LazyPage>}/><Route path="/reviews" element={<LazyPage><OfficerReviews/></LazyPage>}/><Route path="/reports" element={<LazyPage><OfficerReports/></LazyPage>}/></Route>
 <Route element={<RoleGate roles={['recruiter']}/> }><Route path="/recruiter-drives" element={<LazyPage><RecruiterDrives/></LazyPage>}/></Route>
 </Route><Route path="*" element={<Navigate to="/" replace/>}/></Routes>;}
