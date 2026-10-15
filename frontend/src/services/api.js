import axios from 'axios';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api', withCredentials: true, timeout: 15000 });
api.interceptors.response.use((response)=>response,(error)=>{
  if(error.response?.status===401 && !window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/register')) window.dispatchEvent(new Event('scem:session-expired'));
  return Promise.reject(error);
});
export const messageFor=(error)=>error?.response?.data?.error || error?.message || 'Something went wrong. Please try again.';
export default api;
