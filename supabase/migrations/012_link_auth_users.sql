-- Link Dr. Priya's auth user (was null)
UPDATE org_care_demo.doctors
SET auth_user_id = '92b1c773-5d46-4851-9efb-82fd705961e0'
WHERE id = 'dr-priya-001';

-- Link patient auth users so the patient PWA can authenticate
UPDATE org_care_demo.patients SET auth_user_id = 'ba211425-bdf8-48c3-962c-35480f45e79d' WHERE email = 'meera.kapoor@demo.care';
UPDATE org_care_demo.patients SET auth_user_id = '4f09511c-f3ec-4a56-9b7f-190e195667b0' WHERE email = 'arjun.patel@demo.care';
UPDATE org_care_demo.patients SET auth_user_id = '0b51dd91-7335-4f51-802a-a05e8387ccc3' WHERE email = 'ritika.sharma@demo.care';
UPDATE org_care_demo.patients SET auth_user_id = '74741f6b-d826-4769-868e-e520c4e4283f' WHERE email = 'priti.soni@demo.care';
UPDATE org_care_demo.patients SET auth_user_id = 'e99063e9-4148-49de-b51a-570193b43e59' WHERE email = 'nisha.kumar@demo.care';
UPDATE org_care_demo.patients SET auth_user_id = '695cb39b-e621-4192-8aa2-4549f7638fa1' WHERE email = 'vijay.malhotra@demo.care';
UPDATE org_care_demo.patients SET auth_user_id = 'f6e9b0ad-a8c1-4e7a-882b-42681e61cb80' WHERE email = 'sarah@careai.demo';
UPDATE org_care_demo.patients SET auth_user_id = '0675b12d-44bd-4103-aa23-33ec6ac67390' WHERE email = 'priya@careai.demo';
UPDATE org_care_demo.patients SET auth_user_id = '8df1f67b-c89c-4ed2-8fd2-91002e50fca6' WHERE email = 'marcus@careai.demo';
