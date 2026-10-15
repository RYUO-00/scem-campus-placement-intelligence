import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import PortalLayout from '../layouts/PortalLayout.jsx';

export default function ProtectedRoute(){
  const {user,loading}=useAuth();if(loading)return <div className="loading-screen"><span className="spinner"/>Checking your session…</div>;if(!user)return <Navigate to="/login" replace/>;
  return <PortalLayout><Outlet/></PortalLayout>;
}
