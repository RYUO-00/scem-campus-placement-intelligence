import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/config/db.js';
import { createConfiguredAccount } from './dev-accounts.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
await pool.query(await readFile(path.join(here,'seed.sql'),'utf8'));

try{
 await createConfiguredAccount(pool,{email:process.env.DEV_OFFICER_EMAIL,password:process.env.DEV_OFFICER_PASSWORD,name:'Development Placement Officer',role:'placement_officer'});
 await createConfiguredAccount(pool,{email:process.env.DEV_RECRUITER_EMAIL,password:process.env.DEV_RECRUITER_PASSWORD,name:'Development Recruiter',role:'recruiter',companyName:'Northstar Systems'});
 console.log('Synthetic development data is ready. Configure DEV_* credentials to create portal accounts.');
}finally{await pool.end();}
