import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../src/services/csv.js';

test('parses quoted commas, escaped quotes, and CRLF line endings',()=>{
 const rows=parseCsv('name,notes\r\n"Rao, A.","said ""hello"""\r\n');
 assert.deepEqual(rows,[{name:'Rao, A.',notes:'said "hello"'}]);
});
test('accepts an empty CSV without rows',()=>assert.deepEqual(parseCsv(''),[]));
test('rejects unclosed quoted fields',()=>assert.throws(()=>parseCsv('name\n"missing'),/unclosed quoted/));
