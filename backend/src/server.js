import 'dotenv/config';
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters. Configure backend/.env before starting the API.');
const { default: app }=await import('./app.js');
const port=Number(process.env.PORT)||4000;
const server=app.listen(port,()=>console.log(`Placement API listening on http://localhost:${port}`));
async function shutdown(){server.close(()=>process.exit(0));}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
