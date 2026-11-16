import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFictionalDemoRosterBuffer } from '../src/services/rosterTemplate.js';
import { fictionalRosterCsv, readFictionalDemoRoster } from './demo-roster.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(here, 'templates');
const roster = await readFictionalDemoRoster();
await mkdir(output, { recursive: true });
await Promise.all([
  writeFile(path.join(output, 'SCEM_Fictional_Demo_Student_Roster_4SF.csv'), fictionalRosterCsv(roster), 'utf8'),
  writeFile(path.join(output, 'SCEM_Fictional_Demo_Student_Roster_4SF.xlsx'), await createFictionalDemoRosterBuffer(roster)),
]);
console.log(`Generated fictional demo CSV and XLSX for ${roster.length} students.`);
