-- Synthetic demo data only. No real SCEM student or placement records are included.
INSERT INTO companies (company_name, industry, website, description) VALUES
 ('Northstar Systems','Software','https://example.com','Synthetic software company for local demonstrations.'),
 ('Coastal Robotics','Engineering','https://example.org','Synthetic robotics company for local demonstrations.'),
 ('BluePeak Analytics','Data','https://example.net','Synthetic analytics company for local demonstrations.')
ON CONFLICT (company_name) DO NOTHING;

INSERT INTO students (registration_number, full_name, branch_id, cgpa, active_backlogs, graduation_year, phone, contact_email)
SELECT v.reg, v.name, b.branch_id, v.cgpa, v.backlogs, v.grad, v.phone, v.email
FROM (VALUES
 ('DEMO2026CSE001','Aarav Rao','CSE',8.62,0,2026,'+91 90000 00001','aarav.rao@demo.example'),
 ('DEMO2026CSE002','Meera Shetty','CSE',7.84,0,2026,'+91 90000 00002','meera.shetty@demo.example'),
 ('DEMO2026CSE003','Nikhil Bhat','CSE',6.72,1,2026,'+91 90000 00003','nikhil.bhat@demo.example'),
 ('DEMO2026AIML001','Ananya Pai','CSE-AIML',9.10,0,2026,'+91 90000 00004','ananya.pai@demo.example'),
 ('DEMO2026AIML002','Ishaan Rao','CSE-AIML',7.20,0,2026,'+91 90000 00005','ishaan.rao@demo.example'),
 ('DEMO2026ISE001','Diya Kini','ISE',8.04,0,2026,'+91 90000 00006','diya.kini@demo.example'),
 ('DEMO2026ISE002','Rohan Dsouza','ISE',6.45,2,2026,'+91 90000 00007','rohan.dsouza@demo.example'),
 ('DEMO2026ECE001','Sana Ahmed','ECE',8.30,0,2026,'+91 90000 00008','sana.ahmed@demo.example'),
 ('DEMO2026EC001','Kiran Hegde','EC',7.55,0,2026,'+91 90000 00009','kiran.hegde@demo.example'),
 ('DEMO2026MR001','Vikram Shetty','MECH-ROBOTICS',7.02,0,2026,'+91 90000 00010','vikram.shetty@demo.example'),
 ('DEMO2026ECE002','Neha Rao','ECE',6.80,1,2026,'+91 90000 00011','neha.rao@demo.example'),
 ('DEMO2026MR002','Arjun Nayak','MECH-ROBOTICS',8.12,0,2026,'+91 90000 00012','arjun.nayak@demo.example')
) AS v(reg,name,code,cgpa,backlogs,grad,phone,email)
JOIN branches b ON b.branch_code = v.code
ON CONFLICT DO NOTHING;

-- BEGIN FICTIONAL 4SF DEMO ROSTER
-- Fictional demonstration data only; these identities are not actual SCEM students.
-- Each confirmed registration department has four 2024 records and two 2025 records.
-- RE stays out until its registration department code is confirmed against a canonical branch.
INSERT INTO students (registration_number, full_name, branch_id, cgpa, active_backlogs, graduation_year, phone, contact_email)
SELECT v.reg, v.name, b.branch_id, v.cgpa, 0, v.grad, v.phone, v.email
FROM (VALUES
 ('4SF24IS001','Aditi Bhandary','ISE',8.21,2028,'+91 90000 01001','aditi.bhandary@demo.example'),
 ('4SF24IS002','Rishabh Prabhu','ISE',7.92,2028,'+91 90000 01002','rishabh.prabhu@demo.example'),
 ('4SF24IS003','Kavya Kulal','ISE',8.44,2028,'+91 90000 01003','kavya.kulal@demo.example'),
 ('4SF24IS004','Adwait Shenoy','ISE',7.76,2028,'+91 90000 01004','adwait.shenoy@demo.example'),
 ('4SF25IS001','Ira Pai','ISE',8.05,2029,'+91 90000 01005','ira.pai@demo.example'),
 ('4SF25IS002','Devendra Rao','ISE',7.69,2029,'+91 90000 01006','devendra.rao@demo.example'),
 ('4SF24CS001','Ananya Hegde','CSE',8.46,2028,'+91 90000 01007','ananya.hegde@demo.example'),
 ('4SF24CS002','Aarav Shetty','CSE',7.88,2028,'+91 90000 01008','aarav.shetty@demo.example'),
 ('4SF24CS003','Nisha Kamat','CSE',8.71,2028,'+91 90000 01009','nisha.kamat@demo.example'),
 ('4SF24CS004','Vihaan Bhat','CSE',7.95,2028,'+91 90000 01010','vihaan.bhat@demo.example'),
 ('4SF25CS001','Myra Dsouza','CSE',8.13,2029,'+91 90000 01011','myra.dsouza@demo.example'),
 ('4SF25CS002','Karthik Acharya','CSE',7.82,2029,'+91 90000 01012','karthik.acharya@demo.example'),
 ('4SF24AI001','Sanvi Nair','CSE-AIML',8.75,2028,'+91 90000 01013','sanvi.nair@demo.example'),
 ('4SF24AI002','Reyansh Rao','CSE-AIML',8.02,2028,'+91 90000 01014','reyansh.rao@demo.example'),
 ('4SF24AI003','Tanya Amin','CSE-AIML',8.66,2028,'+91 90000 01015','tanya.amin@demo.example'),
 ('4SF24AI004','Omkar Kini','CSE-AIML',7.77,2028,'+91 90000 01016','omkar.kini@demo.example'),
 ('4SF25AI001','Aanya Pai','CSE-AIML',8.36,2029,'+91 90000 01017','aanya.pai@demo.example'),
 ('4SF25AI002','Pranav Shetty','CSE-AIML',7.91,2029,'+91 90000 01018','pranav.shetty@demo.example'),
 ('4SF24ME001','Riya Nayak','MECH-ROBOTICS',8.17,2028,'+91 90000 01019','riya.nayak@demo.example'),
 ('4SF24ME002','Kabir Baliga','MECH-ROBOTICS',7.74,2028,'+91 90000 01020','kabir.baliga@demo.example'),
 ('4SF24ME003','Ishan Prabhu','MECH-ROBOTICS',8.57,2028,'+91 90000 01021','ishan.prabhu@demo.example'),
 ('4SF24ME004','Nandini Shenoy','MECH-ROBOTICS',8.00,2028,'+91 90000 01022','nandini.shenoy@demo.example'),
 ('4SF25ME001','Veer Kamat','MECH-ROBOTICS',8.28,2029,'+91 90000 01023','veer.kamat@demo.example'),
 ('4SF25ME002','Diya Hegde','MECH-ROBOTICS',7.83,2029,'+91 90000 01024','diya.hegde@demo.example'),
 ('4SF24EC001','Zoya Fernandes','ECE',8.52,2028,'+91 90000 01025','zoya.fernandes@demo.example'),
 ('4SF24EC002','Arjun Bhandary','ECE',8.06,2028,'+91 90000 01026','arjun.bhandary@demo.example'),
 ('4SF24EC003','Shruti Kamath','ECE',8.67,2028,'+91 90000 01027','shruti.kamath@demo.example'),
 ('4SF24EC004','Neel Ahmed','ECE',7.98,2028,'+91 90000 01028','neel.ahmed@demo.example'),
 ('4SF25EC001','Avni Dsouza','ECE',7.93,2029,'+91 90000 01029','avni.dsouza@demo.example'),
 ('4SF25EC002','Rohan Rao','ECE',8.14,2029,'+91 90000 01030','rohan.rao@demo.example')
) AS v(reg,name,code,cgpa,grad,phone,email)
JOIN branches b ON b.branch_code = v.code
ON CONFLICT DO NOTHING;
-- END FICTIONAL 4SF DEMO ROSTER

INSERT INTO academic_records(student_id, semester, sgpa, backlogs)
SELECT s.student_id, sem, GREATEST(0, LEAST(10, s.cgpa + delta)), CASE WHEN s.active_backlogs > 0 AND sem = 7 THEN 1 ELSE 0 END
FROM students s CROSS JOIN (VALUES (5,0.18),(6,-0.12),(7,0.08),(8,-0.04)) AS x(sem,delta)
WHERE s.registration_number LIKE 'DEMO2026%'
ON CONFLICT (student_id,semester) DO NOTHING;

INSERT INTO job_drives(company_id, role, job_description, minimum_cgpa, maximum_backlogs, application_deadline, package_lpa, location, status)
SELECT c.company_id, v.role, v.description, v.min_cgpa, v.max_backlogs, now() + v.days * interval '1 day', v.package, v.location, 'published'
FROM (VALUES
 ('Northstar Systems','Graduate Software Engineer','Build web services with JavaScript, React, Node.js, PostgreSQL, REST APIs, Git, testing and cloud fundamentals.',7.0,0,21,8.5,'Bengaluru / Hybrid'),
 ('Coastal Robotics','Junior Embedded Engineer','Develop embedded C and C++ applications with microcontrollers, IoT, electronics, Python, debugging and communication protocols.',6.5,1,28,7.2,'Mangaluru'),
 ('BluePeak Analytics','Data Analyst Associate','Use SQL, Python, Excel, statistics, data visualization and communication to analyze business datasets.',7.5,0,35,6.8,'Mangaluru / Hybrid')
) AS v(company,role,description,min_cgpa,max_backlogs,days,package,location)
JOIN companies c ON c.company_name = v.company
WHERE NOT EXISTS (SELECT 1 FROM job_drives d WHERE d.company_id=c.company_id AND d.role=v.role);

INSERT INTO drive_allowed_branches(drive_id, branch_id)
SELECT d.drive_id, b.branch_id FROM job_drives d CROSS JOIN branches b
WHERE d.status='published' AND NOT EXISTS (SELECT 1 FROM drive_allowed_branches x WHERE x.drive_id=d.drive_id);

INSERT INTO applications(student_id,drive_id,status,eligibility_snapshot)
SELECT s.student_id,d.drive_id,
 CASE s.registration_number WHEN 'DEMO2026CSE001' THEN 'shortlisted' WHEN 'DEMO2026AIML001' THEN 'interview' ELSE 'applied' END,
 '{"eligible":true,"reasons":[],"criteriaAtApplication":{"source":"synthetic seed","minimumCgpa":0,"maximumBacklogs":0}}'::jsonb
FROM students s JOIN job_drives d ON d.role='Graduate Software Engineer'
WHERE s.registration_number IN ('DEMO2026CSE001','DEMO2026CSE002','DEMO2026AIML001')
ON CONFLICT (student_id,drive_id) DO NOTHING;

INSERT INTO applications(student_id,drive_id,status,eligibility_snapshot)
SELECT s.student_id,d.drive_id,'under_review','{"eligible":true,"reasons":[],"criteriaAtApplication":{"source":"synthetic seed"}}'::jsonb
FROM students s JOIN job_drives d ON d.role='Data Analyst Associate'
WHERE s.registration_number='DEMO2026ISE001'
ON CONFLICT (student_id,drive_id) DO NOTHING;

INSERT INTO interview_rounds(application_id,round_name,interview_date,result,feedback)
SELECT a.application_id,'Technical interview',now()+interval '4 days','pending','Synthetic demonstration interview record.'
FROM applications a JOIN students s USING(student_id) JOIN job_drives d USING(drive_id)
WHERE s.registration_number='DEMO2026AIML001' AND d.role='Graduate Software Engineer'
AND NOT EXISTS (SELECT 1 FROM interview_rounds r WHERE r.application_id=a.application_id);

INSERT INTO offers(application_id,offer_date,package_lpa,status)
SELECT a.application_id,CURRENT_DATE,8.5,'pending' FROM applications a
JOIN students s USING(student_id) JOIN job_drives d USING(drive_id)
WHERE s.registration_number='DEMO2026CSE001' AND d.role='Graduate Software Engineer'
AND NOT EXISTS (SELECT 1 FROM offers o WHERE o.application_id=a.application_id);
