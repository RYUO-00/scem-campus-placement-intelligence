import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRosterTemplateBuffer } from '../src/services/rosterTemplate.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(here, 'templates', 'SCEM_Student_Roster_Import_Template_4SF_Format.xlsx');
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, await createRosterTemplateBuffer());
console.log(`Generated ${path.relative(path.join(here, '..'), output)}`);
