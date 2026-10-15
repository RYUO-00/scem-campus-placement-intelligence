import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool } from '../src/config/db.js';

const here=path.dirname(fileURLToPath(import.meta.url));
await pool.query(await readFile(path.join(here,'seed.sql'),'utf8'));

async function createConfiguredAccount({email,password,name,role,companyName}){
 if(!email&&!password)return;
 if(!email||!password||password.length<12)throw new Error(`Set both ${role} email and a password of at least 12 characters, or leave both blank.`);
 const hash=await bcrypt.hash(password,12);
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const existing=await client.query('SELECT user_id,role FROM users WHERE email=lower($1) FOR UPDATE',[email]);
  let userId;
  if(existing.rows[0]){
   if(existing.rows[0].role!==role)throw new Error(`Configured email ${email} is already assigned a different role.`);
   userId=existing.rows[0].user_id;
   await client.query('UPDATE users SET name=$1,password_hash=$2,is_active=true,updated_at=now() WHERE user_id=$3',[name,hash,userId]);
  }else{
   const inserted=await client.query('INSERT INTO users(name,email,password_hash,role) VALUES($1,lower($2),$3,$4) RETURNING user_id',[name,email,hash,role]);userId=inserted.rows[0].user_id;
  }
  if(companyName){
   const company=await client.query('SELECT company_id FROM companies WHERE company_name=$1',[companyName]);
   if(!company.rows[0])throw new Error(`Seed company ${companyName} is unavailable.`);
   await client.query('INSERT INTO recruiters(user_id,company_id,designation) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET company_id=EXCLUDED.company_id,designation=EXCLUDED.designation',[userId,company.rows[0].company_id,'Development recruiter']);
  }
  await client.query('COMMIT');console.log(`Configured ${role}: ${email}`);
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

try{
 await createConfiguredAccount({email:process.env.DEV_OFFICER_EMAIL,password:process.env.DEV_OFFICER_PASSWORD,name:'Development Placement Officer',role:'placement_officer'});
 await createConfiguredAccount({email:process.env.DEV_RECRUITER_EMAIL,password:process.env.DEV_RECRUITER_PASSWORD,name:'Development Recruiter',role:'recruiter',companyName:'Northstar Systems'});
 console.log('Synthetic development data is ready. Configure DEV_* credentials to create portal accounts.');
}finally{await pool.end();}
