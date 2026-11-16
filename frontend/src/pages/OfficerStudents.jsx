import { useEffect, useMemo, useState } from 'react';
import api, { messageFor } from '../services/api.js';
import { EmptyState, ErrorBanner, Loading, PageHeading } from '../components/Feedback.jsx';
import StatCard from '../components/StatCard.jsx';

const PAGE_SIZE = 10000;
const EMPTY_TOTALS = {
  students: 0,
  active_students: 0,
  intake_2024: 0,
  intake_2025: 0,
  registered_accounts: 0,
  not_registered: 0,
  students_with_active_backlogs: 0,
  applications: 0,
  accepted_offers: 0,
};

function cohortList(department, students) {
  const cohorts = [
    { key: '2024', label: '2024 intake', count: department.intake_2024, students: [] },
    { key: '2025', label: '2025 intake', count: department.intake_2025, students: [] },
  ];
  const otherStudents = [];
  for (const student of students) {
    const cohort = cohorts.find((item) => item.key === student.intake_year);
    if (cohort) cohort.students.push(student);
    else otherStudents.push(student);
  }
  if (department.students - department.intake_2024 - department.intake_2025 > 0 || otherStudents.length) {
    cohorts.push({
      key: 'other',
      label: 'Legacy / unclassified IDs',
      count: department.students - department.intake_2024 - department.intake_2025,
      students: otherStudents,
    });
  }
  return cohorts;
}

function StudentRow({ student }) {
  return (
    <article className="cohort-student">
      <div className="cohort-student-identity">
        <strong>{student.full_name}</strong>
        <span className="student-registration">{student.registration_number}</span>
        {student.contact_email && <a href={`mailto:${student.contact_email}`}>{student.contact_email}</a>}
      </div>
      <div className="cohort-student-details">
        <span><b>{student.cgpa ?? '—'}</b> CGPA</span>
        <span className={Number(student.active_backlogs) > 0 ? 'backlog-alert' : ''}>
          <b>{student.active_backlogs}</b> active backlogs
        </span>
        <span><b>{student.graduation_year || '—'}</b> graduation</span>
        <span className={`status-pill ${student.account_linked ? 'green' : 'muted'}`}>
          {student.account_linked ? 'Portal registered' : 'Not registered'}
        </span>
      </div>
    </article>
  );
}

export default function OfficerStudents() {
  const [q, setQ] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [intakeYear, setIntakeYear] = useState('');
  const [accountStatus, setAccountStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [grouping, setGrouping] = useState(null);
  const [groupingError, setGroupingError] = useState('');
  const [groupingLoading, setGroupingLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const response = await api.get('/officer/students', {
          params: { q, branchCode, intakeYear, accountStatus, limit: PAGE_SIZE, offset },
        });
        if (active) setData(response.data);
      } catch (requestError) {
        if (active) setError(messageFor(requestError));
      } finally {
        if (active) setLoading(false);
      }
    }, q ? 220 : 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [q, branchCode, intakeYear, accountStatus, offset]);

  async function downloadTemplate() {
    try {
      const response = await api.get('/officer/students/template', { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'SCEM_Student_Roster_Import_Template_4SF_Format.xlsx';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (requestError) {
      setError(messageFor(requestError));
    }
  }

  async function generateStudentGroups() {
    setGroupingLoading(true);
    setGroupingError('');
    try {
      const response = await api.post('/officer/student-groups', {});
      setGrouping(response.data);
    } catch (requestError) {
      setGroupingError(messageFor(requestError));
    } finally {
      setGroupingLoading(false);
    }
  }

  function clearFilters() {
    setQ('');
    setBranchCode('');
    setIntakeYear('');
    setAccountStatus('');
    setOffset(0);
  }

  const departments = useMemo(() => {
    if (!data) return [];
    const studentsByBranch = new Map();
    for (const student of data.students) {
      const group = studentsByBranch.get(student.branch_code) || [];
      group.push(student);
      studentsByBranch.set(student.branch_code, group);
    }
    return data.byDepartment.map((department) => ({
      ...department,
      cohorts: cohortList(department, studentsByBranch.get(department.branch_code) || []),
    }));
  }, [data]);

  const totals = data?.overall || EMPTY_TOTALS;
  const matchingCount = data?.total ?? 0;
  const visibleStart = matchingCount ? (data?.offset || 0) + 1 : 0;
  const visibleEnd = Math.min((data?.offset || 0) + (data?.students.length || 0), matchingCount);
  const hasFilters = Boolean(q || branchCode || intakeYear || accountStatus);

  return (
    <>
      <PageHeading
        eyebrow="PLACEMENT CELL · STUDENTS"
        title="Student directory"
        description="Browse the roster in department and intake groups, with counts from current PostgreSQL records."
        action={<button className="button button-primary" onClick={downloadTemplate}>Download template <span>↓</span></button>}
      />
      <ErrorBanner>{error}</ErrorBanner>

      <div className="directory-demo-note" role="note">
        Fictional demonstration roster. These generated names and contact addresses are examples, not an official SCEM student list.
      </div>

      <section className="panel directory-controls" aria-label="Student directory filters">
        <div className="directory-filter-grid">
          <label className="directory-search-control">
            <span>Search name, registration number, or email</span>
            <input
              aria-label="Search name, registration number, or email"
              value={q}
              onChange={(event) => { setQ(event.target.value); setOffset(0); }}
              placeholder="e.g. 4SF24CS001 or student@example.com"
            />
          </label>
          <label>
            <span>Department</span>
            <select aria-label="Filter by department" value={branchCode} onChange={(event) => { setBranchCode(event.target.value); setOffset(0); }}>
              <option value="">All departments</option>
              {(data?.departmentOptions || []).map((department) => (
                <option value={department.branch_code} key={department.branch_code}>
                  {department.branch_name} ({department.branch_code})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Intake year</span>
            <select aria-label="Filter by intake year" value={intakeYear} onChange={(event) => { setIntakeYear(event.target.value); setOffset(0); }}>
              <option value="">All intakes</option>
              <option value="2024">2024</option>
              <option value="2025">2025</option>
            </select>
          </label>
          <label>
            <span>Portal account</span>
            <select aria-label="Filter by portal registration status" value={accountStatus} onChange={(event) => { setAccountStatus(event.target.value); setOffset(0); }}>
              <option value="">All students</option>
              <option value="registered">Registered</option>
              <option value="not_registered">Not yet registered</option>
            </select>
          </label>
        </div>
        <div className="directory-filter-footer">
          <span>{loading ? 'Updating matching records…' : `${matchingCount.toLocaleString()} matching student records`}</span>
          <button className="table-action" type="button" onClick={clearFilters} disabled={!hasFilters}>Clear filters</button>
        </div>
      </section>

      {loading && !data ? <Loading label="Loading department roster…" /> : data && (
        <>
          <section className="directory-summary" aria-label="Overall department statistics">
            <div className="directory-summary-heading">
              <div>
                <div className="eyebrow">CURRENT FILTERS</div>
                <h2>Overall roster totals</h2>
              </div>
              <span>Student totals reconcile with department rows below</span>
            </div>
            <div className="stat-grid directory-overall-grid">
              <StatCard label="Active students" value={totals.active_students} detail="All roster rows; no deactivation field" icon="◎" tone="accent" />
              <StatCard label="2024 intake" value={totals.intake_2024} detail="Validated 4SF IDs and branch mapping" icon="24" tone="blue" />
              <StatCard label="2025 intake" value={totals.intake_2025} detail="Validated 4SF IDs and branch mapping" icon="25" tone="blue" />
              <StatCard label="Portal accounts" value={totals.registered_accounts} detail={`${totals.not_registered} students not registered`} icon="↗" tone="green" />
              <StatCard label="Students with backlogs" value={totals.students_with_active_backlogs} detail="Distinct student records" icon="!" tone="amber" />
              <StatCard label="Applications" value={totals.applications} detail="Application records" icon="▤" tone="blue" />
              <StatCard label="Accepted offers" value={totals.accepted_offers} detail="Accepted offer records" icon="✓" tone="green" />
              <StatCard label="Roster records" value={totals.students} detail="Each student counted once" icon="▦" tone="accent" />
            </div>
            <p className="directory-count-note">
              Application and offer totals count database records; student totals count distinct roster rows. Student deactivation is not implemented, so all roster rows are treated as active.
            </p>
          </section>

          <section className="panel student-clustering" aria-labelledby="student-clustering-title">
            <div className="student-clustering-heading">
              <div>
                <div className="eyebrow">UNSUPERVISED PROFILE ANALYSIS</div>
                <h2 id="student-clustering-title">Student profile groups</h2>
                <p>Run K-Means on current academic records and recognized resume skills. Groups describe profile similarity; they do not change eligibility or predict placement success.</p>
              </div>
              <button className="button button-primary" type="button" onClick={generateStudentGroups} disabled={groupingLoading}>
                {groupingLoading ? 'Grouping profiles…' : grouping ? 'Recompute groups' : 'Generate groups'}
              </button>
            </div>
            {groupingError && <div className="student-clustering-error" role="alert">{groupingError}</div>}
            {groupingLoading && <p className="student-clustering-state" role="status">Preparing profile features and comparing cluster counts…</p>}
            {grouping && !groupingLoading && grouping.status === 'insufficient_data' && (
              <div className="student-clustering-state" role="status">
                <strong>More usable profile data is needed.</strong>
                <span>{grouping.reason}</span>
                <span>{grouping.included_records} included · {grouping.excluded_records} excluded from {grouping.total_records} roster records.</span>
                {grouping.exclusion_summary?.length > 0 && <span>{grouping.exclusion_summary.map((item) => `${item.count} ${item.reason.replaceAll('_', ' ')}`).join(' · ')}</span>}
              </div>
            )}
            {grouping && !groupingLoading && grouping.status === 'ok' && (
              <>
                <div className="student-clustering-stats" aria-label="Clustering run summary">
                  <span><strong>{grouping.included_records}</strong> included</span>
                  <span><strong>{grouping.excluded_records}</strong> excluded of {grouping.total_records}</span>
                  <span><strong>{grouping.selected_cluster_count}</strong> groups</span>
                  <span><strong>{Number(grouping.silhouette_score).toFixed(3)}</strong> silhouette score</span>
                </div>
                {grouping.exclusion_summary?.length > 0 && <p className="student-clustering-exclusions">Exclusions: {grouping.exclusion_summary.map((item) => `${item.count} ${item.reason.replaceAll('_', ' ')}`).join(' · ')}</p>}
                <div className="student-cluster-grid">
                  {grouping.clusters.map((cluster) => (
                    <article className="student-cluster-card" key={cluster.cluster_id}>
                      <header><span>{cluster.cluster_id}</span><strong>{cluster.student_count} {cluster.student_count === 1 ? 'student' : 'students'}</strong></header>
                      <p className="student-cluster-summary">{cluster.profile_summary}</p>
                      <div className="student-cluster-metrics">
                        <span>Average CGPA <b>{cluster.average_cgpa ?? '—'}</b></span>
                        <span>Average backlogs <b>{cluster.average_active_backlogs ?? '—'}</b></span>
                      </div>
                      {cluster.common_skills?.length > 0 && (
                        <div className="student-cluster-skills" aria-label={`${cluster.cluster_id} common skills`}>
                          {cluster.common_skills.map((item) => <span key={item.skill}>{item.skill} · {item.student_count}</span>)}
                        </div>
                      )}
                      <details className="student-cluster-members">
                        <summary>View {cluster.student_count} roster {cluster.student_count === 1 ? 'member' : 'members'}</summary>
                        <ul>
                          {cluster.students.map((student) => (
                            <li key={student.student_id}>
                              <span><strong>{student.full_name}</strong><small>{student.registration_number} · {student.branch_name}</small></span>
                              <small>CGPA {student.cgpa ?? '—'} · {student.active_backlogs} backlogs</small>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </article>
                  ))}
                </div>
                <details className="student-clustering-method">
                  <summary>How these groups are calculated</summary>
                  <p>{grouping.feature_configuration} The cluster count is selected by the highest valid silhouette score across 2–8 groups. {grouping.model_version} · generated {new Date(grouping.generated_at).toLocaleString()}.</p>
                </details>
              </>
            )}
          </section>

          {departments.length > 0 && (
            <section className="panel directory-summary-table-panel" aria-label="Department-wise statistics">
              <div className="panel-heading directory-summary-table-heading">
                <div><div className="eyebrow">DEPARTMENT-WISE STATISTICS</div><h2>Counts by canonical department</h2></div>
                <span className="subtle-count">Counts update with search and filters</span>
              </div>
              <div className="directory-summary-table-scroll">
                <table className="directory-summary-table">
                  <thead><tr>
                    <th>Department</th><th>Active students</th><th>2024</th><th>2025</th>
                    <th>Registered</th><th>Not registered</th><th>Students with backlogs</th>
                    <th>Applications</th><th>Accepted offers</th>
                  </tr></thead>
                  <tbody>
                    {departments.map((department) => (
                      <tr key={department.branch_code}>
                        <th scope="row"><span>{department.branch_name}</span><small>{department.branch_code}</small></th>
                        <td>{department.active_students}</td><td>{department.intake_2024}</td><td>{department.intake_2025}</td>
                        <td>{department.registered_accounts}</td><td>{department.not_registered}</td>
                        <td>{department.students_with_active_backlogs}</td><td>{department.applications}</td><td>{department.accepted_offers}</td>
                      </tr>
                    ))}
                    <tr className="directory-summary-total"><th scope="row">Overall total</th>
                      <td>{totals.active_students}</td><td>{totals.intake_2024}</td><td>{totals.intake_2025}</td>
                      <td>{totals.registered_accounts}</td><td>{totals.not_registered}</td>
                      <td>{totals.students_with_active_backlogs}</td><td>{totals.applications}</td><td>{totals.accepted_offers}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {departments.length > 0 ? (
            <section className="department-groups" aria-label="Students grouped by department and intake">
              {departments.map((department) => (
                <article className="department-section" key={department.branch_code}>
                  <header className="department-section-heading">
                    <div>
                      <div className="eyebrow">DEPARTMENT</div>
                      <h2>{department.branch_name} <span>{department.branch_code}</span></h2>
                    </div>
                    <div className="department-head-count">
                      <strong>{department.active_students}</strong><span>students</span>
                    </div>
                  </header>
                  <div className="department-cohorts">
                    {department.cohorts.map((cohort) => (
                      <section className="cohort-section" key={cohort.key} aria-label={`${department.branch_name}, ${cohort.label}`}>
                        <header className="cohort-section-heading">
                          <h3>{cohort.label}</h3><span>{cohort.count} {cohort.count === 1 ? 'student' : 'students'}</span>
                        </header>
                        {cohort.students.length > 0 ? (
                          <div className="cohort-student-list">{cohort.students.map((student) => <StudentRow key={student.student_id} student={student} />)}</div>
                        ) : (
                          <p className="cohort-empty">{cohort.count ? 'Matching students are on another results page.' : 'No students in this cohort for the current filters.'}</p>
                        )}
                      </section>
                    ))}
                  </div>
                </article>
              ))}
            </section>
          ) : (
            <EmptyState
              title="No matching student records"
              body={hasFilters ? 'Try changing the search or filters to find students in the roster.' : 'Import a student roster to populate the department directory.'}
            />
          )}

          {(data.offset > 0 || data.offset + data.students.length < data.total) && (
            <div className="directory-pagination">
              <span>Showing {visibleStart.toLocaleString()}–{visibleEnd.toLocaleString()} of {data.total.toLocaleString()} matching students. Department totals cover all matches.</span>
              <div>
                <button className="button button-secondary" disabled={!data.offset} onClick={() => setOffset(Math.max(0, offset - data.limit))}>Previous</button>
                <button className="button button-secondary" disabled={data.offset + data.students.length >= data.total} onClick={() => setOffset(offset + data.limit)}>Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
