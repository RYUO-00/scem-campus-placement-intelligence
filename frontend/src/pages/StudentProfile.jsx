import { useEffect, useState } from 'react';
import api, { messageFor } from '../services/api.js';
import { ErrorBanner, Loading, PageHeading, SuccessBanner } from '../components/Feedback.jsx';

const resumeAccept = '.txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export default function StudentProfile() {
  const [student, setStudent] = useState(null);
  const [academics, setAcademics] = useState([]);
  const [phone, setPhone] = useState('');
  const [resume, setResume] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    Promise.all([api.get('/students/me'), api.get('/students/me/academics')])
      .then(([profileResponse, academicsResponse]) => {
        const profile = profileResponse.data.student;
        setStudent(profile);
        setPhone(profile.phone || '');
        setResume(profile.resumeText || '');
        setAcademics(academicsResponse.data.records);
      })
      .catch((requestError) => setError(messageFor(requestError)))
      .finally(() => setLoading(false));
  }, []);

  async function save(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const { data } = await api.put('/students/me', { phone, resumeText: resume });
      setPhone(data.profile.phone || '');
      setResume(data.profile.resumeText || '');
      setSuccess('Profile details and resume text saved.');
    } catch (saveError) {
      setError(messageFor(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function uploadResume(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError('');
    setSuccess('');
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const { data } = await api.post('/students/me/resume', body);
      setResume(data.resumeText);
      setSuccess(`Resume text extracted and saved (${data.characterCount.toLocaleString()} characters). Review it below; save again after editing.`);
    } catch (uploadError) {
      setError(messageFor(uploadError));
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  const heading = <PageHeading eyebrow="STUDENT PORTAL · PROFILE" title="My profile" description="Review your imported academic details and update personal contact information." />;

  if (loading) return <>{heading}<Loading label="Loading your profile…" /></>;
  if (!student) return <>{heading}<ErrorBanner>{error || 'Your student profile could not be loaded.'}</ErrorBanner></>;

  return <>
    {heading}
    <ErrorBanner>{error}</ErrorBanner>
    <SuccessBanner>{success}</SuccessBanner>

    <div className="profile-layout">
      <section className="panel">
        <div className="panel-heading">
          <div><div className="eyebrow">ACADEMIC RECORD</div><h2>Verified roster details</h2></div>
          <span className={`status-pill ${student.branch_is_active ? 'green' : 'amber'}`}>
            {student.branch_is_active ? 'Active branch' : 'Branch inactive'}
          </span>
        </div>
        <div className="profile-data-grid">
          <div><small>Full name</small><strong>{student.full_name}</strong></div>
          <div><small>Registration number</small><strong>{student.registration_number}</strong></div>
          <div><small>Branch</small><strong>{student.branch_name} <i>({student.branch_code})</i></strong></div>
          <div><small>Graduation year</small><strong>{student.graduation_year || 'Not recorded'}</strong></div>
          <div><small>CGPA</small><strong>{student.cgpa ?? 'Not recorded'}{student.cgpa != null && <i> / 10</i>}</strong></div>
          <div><small>Active backlogs</small><strong>{student.active_backlogs}</strong></div>
        </div>

        <div className="academic-heading">
          <div><div className="eyebrow">ACADEMIC HISTORY</div><h3>Semester records</h3></div>
        </div>
        {academics.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Semester</th><th>SGPA</th><th>Backlogs</th><th>Record</th></tr></thead>
              <tbody>{academics.map((record) => (
                <tr key={record.record_id}>
                  <td>Semester {record.semester}</td>
                  <td><strong>{record.sgpa} / 10</strong></td>
                  <td>{record.backlogs}</td>
                  <td><span className="status-pill green">Verified</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : (
          <div className="inline-empty">No semester-wise records are available yet. Your CGPA and backlog figures remain controlled by the Placement Cell.</div>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div><div className="eyebrow">PERSONAL DETAILS</div><h2>Keep your profile current</h2></div>
        </div>
        <form className="form-stack" onSubmit={save} aria-busy={saving || uploading}>
          <label>Contact phone
            <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Add a phone number" maxLength="30" disabled={uploading || saving} />
          </label>

          <label>Resume text
            <span className="field-help">Upload a document to extract its text, then review or edit the text here before using it for resume matching.</span>
            <textarea
              rows="13"
              value={resume}
              maxLength="30000"
              onChange={(event) => setResume(event.target.value)}
              placeholder="Summary, education, projects, skills, experience…"
              disabled={uploading || saving}
            />
            <small className="char-count">{resume.length.toLocaleString()} / 30,000 characters</small>
          </label>

          <label className="resume-upload">Upload a resume
            <input type="file" accept={resumeAccept} onChange={uploadResume} disabled={uploading || saving} />
            <small>{uploading ? 'Extracting and saving…' : 'TXT, text-based PDF, or DOCX · 2 MB maximum. Scanned PDFs need OCR, which is not supported.'}</small>
          </label>

          <button className="button button-primary" type="submit" disabled={saving || uploading}>
            {saving ? 'Saving…' : 'Save profile'} <span aria-hidden="true">→</span>
          </button>
        </form>

        <div className="privacy-note">
          <strong>How this is used</strong>
          <p>Your academic results are read-only. The extracted resume text is stored with your profile and sent to the local matcher only when you request a match for a placement drive.</p>
        </div>
      </section>
    </div>
  </>;
}
