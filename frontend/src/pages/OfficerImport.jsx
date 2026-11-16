import { useEffect, useRef, useState } from 'react';
import api, { messageFor } from '../services/api.js';
import { EmptyState, ErrorBanner, PageHeading, SuccessBanner } from '../components/Feedback.jsx';

export default function OfficerImport() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [history, setHistory] = useState([]);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef(null);

  async function loadHistory() {
    try {
      const { data } = await api.get('/officer/students/imports');
      setHistory(data.imports);
    } catch (requestError) {
      setError(messageFor(requestError));
    }
  }

  useEffect(() => { loadHistory(); }, []);

  async function downloadFile(endpoint, filename, params = {}) {
    try {
      const response = await api.get(endpoint, { params, responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (requestError) {
      setError(messageFor(requestError));
    }
  }

  function downloadTemplate() {
    return downloadFile('/officer/students/template', 'SCEM_Student_Roster_Import_Template_4SF_Format.xlsx');
  }

  function downloadDemoRoster(format) {
    return downloadFile(
      '/officer/students/demo-roster',
      `SCEM_Fictional_Demo_Student_Roster_4SF.${format}`,
      { format },
    );
  }

  async function previewFile(event) {
    event.preventDefault();
    if (!file) {
      setError('Choose a CSV or XLSX file first.');
      return;
    }
    setError('');
    setSuccess('');
    setBusy(true);
    const body = new FormData();
    body.append('file', file);
    try {
      const { data } = await api.post('/officer/students/import/preview', body, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPreview(data);
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!preview) return;
    setError('');
    setSuccess('');
    setBusy(true);
    try {
      const { data } = await api.post('/officer/students/import/confirm', { importId: preview.importId });
      setSuccess(`${data.summary.insertedRows} inserted · ${data.summary.skippedRows} skipped · ${data.summary.failedRows} rows need attention.`);
      setPreview(null);
      setFile(null);
      if (input.current) input.current.value = '';
      await loadHistory();
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function openReport(id) {
    setError('');
    try {
      const [summary, errors] = await Promise.all([
        api.get(`/officer/students/imports/${id}`),
        api.get(`/officer/students/imports/${id}/errors`),
      ]);
      setReport({ summary: summary.data.import, errors: errors.data.errors });
    } catch (requestError) {
      setError(messageFor(requestError));
    }
  }

  function discardPreview() {
    setPreview(null);
    setFile(null);
    if (input.current) input.current.value = '';
  }

  return (
    <>
      <PageHeading
        eyebrow="PLACEMENT CELL · DATA OPERATIONS"
        title="Bulk student import"
        description="Validate a roster before it is committed. Existing student records are never overwritten."
        action={(
          <div className="import-heading-actions">
            <button className="button button-secondary" onClick={downloadTemplate}>↓ Blank template</button>
            <button className="button button-secondary" onClick={() => downloadDemoRoster('xlsx')}>↓ Fictional demo XLSX</button>
            <button className="button button-secondary" onClick={() => downloadDemoRoster('csv')}>↓ Fictional demo CSV</button>
          </div>
        )}
      />
      <ErrorBanner>{error}</ErrorBanner>
      <SuccessBanner>{success}</SuccessBanner>

      <div className="import-layout">
        <section className="panel import-upload">
          <div className="import-step">
            <span>01</span><div><div className="eyebrow">PREPARE YOUR ROSTER</div><h2>Start with the template</h2><p>Use one header row and add each student on its own row. Keep branch codes aligned with the configured options.</p></div>
          </div>
          <button className="template-card" onClick={downloadTemplate}>
            <span className="file-icon">XLSX</span><span><strong>Empty student roster template</strong><small>Exact importer headers · Department Summary is formula-linked to the first sheet</small></span><b>↓</b>
          </button>
          <div className="import-divider" />
          <div className="import-step">
            <span>02</span><div><div className="eyebrow">UPLOAD & VALIDATE</div><h2>Choose your roster file</h2><p>CSV and XLSX files up to 5 MB, with a maximum of 10,000 rows.</p></div>
          </div>
          <form onSubmit={previewFile}>
            <label className="dropzone" htmlFor="import-file">
              <div className="upload-symbol">⇧</div>
              <strong>{file ? file.name : 'Drop a roster here or browse'}</strong>
              <span>{file ? `${(file.size / 1024).toFixed(0)} KB · Ready to preview` : 'Choose .csv or .xlsx · 5 MB maximum'}</span>
              <input ref={input} id="import-file" type="file" accept=".csv,.xlsx" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            </label>
            <button className="button button-primary button-full" type="submit" disabled={!file || busy}>{busy ? 'Validating rows…' : 'Preview validation'} <span>→</span></button>
          </form>
          <div className="import-note">
            <strong>Required headers</strong>
            <p>registration_number, full_name, branch_code, cgpa, active_backlogs, graduation_year, email, phone. Phone values may be blank. Registration IDs use 4SF + year + department + three digits; RE remains blocked pending mapping confirmation.</p>
          </div>
          <div className="import-demo-note">
            The downloadable demo roster contains fictional names and example addresses only. Its first-sheet records are separate from the empty template.
          </div>
        </section>

        <section className="import-main">
          {preview ? (
            <div className="panel preview-panel">
              <div className="panel-heading">
                <div><div className="eyebrow">STEP 03 · CONFIRM DATA</div><h2>Review the import preview</h2><p className="panel-subtitle">{preview.rows.length} rows from {file?.name}. Preview expires {new Date(preview.expiresAt).toLocaleTimeString()}.</p></div>
                <span className="preview-live"><i />PREVIEW READY</span>
              </div>
              <div className="preview-metrics">
                <div><strong>{preview.summary.insertableRows}</strong><small>Ready to insert</small></div>
                <div><strong>{preview.summary.skippedRows}</strong><small>Will be skipped</small></div>
                <div><strong>{preview.summary.failedRows}</strong><small>Need correction</small></div>
              </div>
              <div className="table-wrap preview-table"><table>
                <thead><tr><th>Row</th><th>Student</th><th>Validation</th></tr></thead>
                <tbody>{preview.rows.map((row) => (
                  <tr key={row.rowNumber}><td>{row.rowNumber}</td><td><strong>{row.fullName || '—'}</strong><small className="table-sub">{row.registrationNumber || 'No registration number'}</small></td>
                    <td><span className={`status-pill ${row.action === 'insert' ? 'green' : row.action === 'skip' ? 'amber' : 'red'}`}>{row.action === 'insert' ? 'Ready to insert' : row.action === 'skip' ? 'Skip' : 'Fix row'}</span>{row.errors.map((message, index) => <small className="row-error" key={index}>{message}</small>)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
              <div className="preview-footer">
                <span>Only valid, new rows will be added. No records will be updated.</span>
                <div><button className="button button-secondary" onClick={discardPreview}>Discard preview</button><button className="button button-primary" disabled={busy || preview.summary.insertableRows === 0} onClick={confirm}>{busy ? 'Importing…' : `Confirm ${preview.summary.insertableRows} records`} <span>→</span></button></div>
              </div>
            </div>
          ) : (
            <div className="panel import-guidance">
              <div className="eyebrow">HOW IT WORKS</div><h2>Review first. Commit second.</h2>
              <p>Every upload is checked against active branches and the roster already in the database. A preview belongs to the uploader and expires after 30 minutes.</p>
              <div className="workflow">
                <div className="workflow-step complete"><span>1</span><div><strong>Upload spreadsheet</strong><small>CSV or Excel workbook</small></div></div><div className="workflow-line" />
                <div className="workflow-step"><span>2</span><div><strong>Review row results</strong><small>Check duplicates and field errors</small></div></div><div className="workflow-line" />
                <div className="workflow-step"><span>3</span><div><strong>Confirm the import</strong><small>Insert valid records in one transaction</small></div></div>
              </div>
              <div className="guidance-callout"><strong>Identity stays separate</strong><p>Import adds roster records, not portal accounts. Students register later after their roster name, registration number, and email are verified.</p></div>
            </div>
          )}
        </section>
      </div>

      {report && (
        <section className="panel import-report">
          <div className="panel-heading"><div><div className="eyebrow">IMPORT REPORT · {report.summary.status}</div><h2>{report.summary.original_filename}</h2><p className="panel-subtitle">Completed {report.summary.completed_at ? new Date(report.summary.completed_at).toLocaleString() : 'Preview not confirmed'}</p></div><button className="button button-secondary" onClick={() => setReport(null)}>Close report</button></div>
          <div className="preview-metrics"><div><strong>{report.summary.inserted_rows}</strong><small>Inserted</small></div><div><strong>{report.summary.skipped_rows}</strong><small>Skipped</small></div><div><strong>{report.summary.failed_rows}</strong><small>Failed</small></div></div>
          {report.errors.length ? <div className="table-wrap"><table><thead><tr><th>Row</th><th>Result</th><th>Explanation</th></tr></thead><tbody>{report.errors.map((item, index) => <tr key={index}><td>{item.row_number}</td><td><span className={`status-pill ${item.action === 'skip' ? 'amber' : 'red'}`}>{item.action}</span></td><td>{(item.errors || []).join('; ')}</td></tr>)}</tbody></table></div> : <div className="inline-empty">No rows were skipped or failed in this import.</div>}
        </section>
      )}

      <section className="panel import-history">
        <div className="panel-heading"><div><div className="eyebrow">AUDIT TRAIL</div><h2>Recent import history</h2></div><span className="subtle-count">Last 100 imports</span></div>
        {history.length ? <div className="table-wrap"><table><thead><tr><th>File</th><th>Date</th><th>Rows</th><th>Inserted</th><th>Skipped</th><th>Failed</th><th>Status</th><th /></tr></thead><tbody>{history.map((item) => <tr key={item.import_id}><td><strong>{item.original_filename}</strong></td><td>{new Date(item.created_at).toLocaleString()}</td><td>{item.total_rows}</td><td>{item.inserted_rows}</td><td>{item.skipped_rows}</td><td>{item.failed_rows}</td><td><span className={`status-pill ${item.status === 'completed' ? 'green' : item.status === 'preview' ? 'blue' : 'muted'}`}>{item.status}</span></td><td>{item.status !== 'preview' && <button className="table-action" onClick={() => openReport(item.import_id)}>Report →</button>}</td></tr>)}</tbody></table></div> : <EmptyState title="No imports yet" body="Completed imports and their row counts will be listed here." />}
      </section>
    </>
  );
}
