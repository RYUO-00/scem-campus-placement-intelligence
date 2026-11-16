import axios from 'axios';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api', withCredentials: true, timeout: 15000 });
api.interceptors.response.use((response)=>response,(error)=>{
  if(error.response?.status===401 && !window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/register')) window.dispatchEvent(new Event('scem:session-expired'));
  return Promise.reject(error);
});
export const messageFor=(error)=>{
  if(error?.response?.data?.error)return error.response.data.error;
  if(error?.isAxiosError&&!error.response){
    return error.code==='ECONNABORTED'
      ? 'The placement service took too long to respond. Try again.'
      : 'Unable to reach the placement service. Check your connection and try again.';
  }
  return error?.message || 'Something went wrong. Please try again.';
};
export default api;
