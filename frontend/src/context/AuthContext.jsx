import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const AuthContext=createContext(null);
export function AuthProvider({children}){
  const [user,setUser]=useState(null);const [loading,setLoading]=useState(true);
  useEffect(()=>{api.get('/auth/me').then(r=>setUser(r.data.user)).catch(()=>setUser(null)).finally(()=>setLoading(false));
    const expired=()=>{setUser(null);};window.addEventListener('scem:session-expired',expired);return()=>window.removeEventListener('scem:session-expired',expired);
  },[]);
  const value=useMemo(()=>({user,loading,async login(credentials){const {data}=await api.post('/auth/login',credentials);setUser(data.user);return data.user;},async register(payload){const {data}=await api.post('/auth/register',payload);setUser(data.user);return data.user;},async logout(){try{await api.post('/auth/logout');}finally{setUser(null);}}}),[user,loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth=()=>useContext(AuthContext);
