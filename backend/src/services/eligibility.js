export function evaluateEligibility(student, drive, allowedBranchIds = []) {
  const reasons = [];
  if (student.cgpa == null) reasons.push('Add your CGPA to your profile before checking eligibility.');
  else if (Number(student.cgpa) < Number(drive.minimum_cgpa)) reasons.push(`CGPA must be at least ${drive.minimum_cgpa}.`);
  if (student.active_backlogs == null) reasons.push('Backlog information is missing from your profile.');
  else if (Number(student.active_backlogs) > Number(drive.maximum_backlogs)) reasons.push(`Active backlogs must be ${drive.maximum_backlogs} or fewer.`);
  if (student.branch_is_active === false) reasons.push('Your branch is no longer active for placement applications.');
  if (allowedBranchIds.length && !allowedBranchIds.includes(student.branch_id)) reasons.push('Your branch is not included in this drive.');
  if (drive.status !== 'published') reasons.push('This drive is not open for applications.');
  if (new Date(drive.application_deadline).getTime() <= Date.now()) reasons.push('The application deadline has passed.');
  return { eligible: reasons.length === 0, reasons, criteriaAtApplication: { minimumCgpa: Number(drive.minimum_cgpa), maximumBacklogs: Number(drive.maximum_backlogs), allowedBranchIds: allowedBranchIds.length ? [...allowedBranchIds] : 'all_active_branches', applicationDeadline: drive.application_deadline, driveStatus: drive.status } };
}

export const applicationTransitions = {
  applied: ['under_review','shortlisted','rejected'],
  under_review: ['shortlisted','rejected','interview'],
  shortlisted: ['interview','rejected'],
  interview: ['shortlisted','rejected','offered'],
  rejected: ['under_review'], offered: [], withdrawn: []
};
