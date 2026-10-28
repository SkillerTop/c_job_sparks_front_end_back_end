CREATE TEMP TABLE desired_spark_category_catalog (
  category_id uuid PRIMARY KEY,
  code text NOT NULL,
  spark_type text NOT NULL,
  usage_type text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  amount bigint NOT NULL,
  repeat_period text NOT NULL
) ON COMMIT DROP;

INSERT INTO desired_spark_category_catalog
  (category_id,code,spark_type,usage_type,name,description,amount,repeat_period)
VALUES
  ('88888888-0001-4000-8000-000000000001','knowledge-sharing','White','PeerRecognition','Knowledge Sharing','Shares useful knowledge in a form colleagues can understand and reuse.',1,'Unlimited'),
  ('88888888-0102-4000-8000-000000000102','documentation-hero-peer','White','PeerRecognition','Documentation Hero','Creates or improves clear documentation that makes future work easier and safer.',1,'Unlimited'),
  ('88888888-0103-4000-8000-000000000103','technical-guidance-peer','White','PeerRecognition','Technical Guidance','Provides timely technical direction that helps a colleague or team move forward.',1,'Unlimited'),
  ('88888888-0104-4000-8000-000000000104','quality-guardian-peer','White','PeerRecognition','Quality Guardian','Protects quality by identifying risks, defects or missing checks before delivery.',1,'Unlimited'),
  ('88888888-0105-4000-8000-000000000105','attention-to-detail-peer','White','PeerRecognition','Attention to Detail','Catches an important detail and prevents rework, ambiguity or avoidable risk.',1,'Unlimited'),
  ('88888888-0106-4000-8000-000000000106','engineering-excellence-peer','White','PeerRecognition','Engineering Excellence','Demonstrates exceptionally strong engineering judgment, accuracy and ownership.',1,'Unlimited'),
  ('88888888-0107-4000-8000-000000000107','smart-solution-peer','White','PeerRecognition','Smart Solution','Finds a practical, thoughtful solution that simplifies work or improves the result.',1,'Unlimited'),
  ('88888888-0108-4000-8000-000000000108','delivery-recovery-peer','White','PeerRecognition','Delivery Recovery','Takes concrete action that gets a difficult delivery back on track.',1,'Unlimited'),
  ('88888888-0109-4000-8000-000000000109','coordination-excellence-peer','White','PeerRecognition','Coordination Excellence','Coordinates people and dependencies clearly so shared work succeeds.',1,'Unlimited'),
  ('88888888-0110-4000-8000-000000000110','leadership-support-peer','White','PeerRecognition','Leadership Support','Supports colleagues with calm ownership, initiative and constructive leadership.',1,'Unlimited'),
  ('88888888-0111-4000-8000-000000000111','communication-excellence-peer','White','PeerRecognition','Communication Excellence','Communicates complex or sensitive information clearly and respectfully.',1,'Unlimited'),

  ('88888888-0201-4000-8000-000000000201','knowledge-sharing-award','White','Award','Knowledge Sharing','Shares useful knowledge in a form colleagues can understand and reuse.',1,'Quarterly'),
  ('88888888-0202-4000-8000-000000000202','documentation-hero-award','White','Award','Documentation Hero','Creates or improves clear documentation that makes future work easier and safer.',1,'Quarterly'),
  ('88888888-0203-4000-8000-000000000203','technical-guidance-award','White','Award','Technical Guidance','Provides timely technical direction that helps a colleague or team move forward.',1,'Quarterly'),
  ('88888888-0204-4000-8000-000000000204','quality-guardian-award','White','Award','Quality Guardian','Protects quality by identifying risks, defects or missing checks before delivery.',1,'Quarterly'),
  ('88888888-0205-4000-8000-000000000205','attention-to-detail-award','White','Award','Attention to Detail','Catches an important detail and prevents rework, ambiguity or avoidable risk.',1,'Quarterly'),
  ('88888888-0206-4000-8000-000000000206','engineering-excellence-award','White','Award','Engineering Excellence','Demonstrates exceptionally strong engineering judgment, accuracy and ownership.',1,'Quarterly'),
  ('88888888-0003-4000-8000-000000000003','smart-solution','White','Award','Smart Solution','Finds a practical, thoughtful solution that simplifies work or improves the result.',1,'Quarterly'),
  ('88888888-0208-4000-8000-000000000208','delivery-recovery-award','White','Award','Delivery Recovery','Takes concrete action that gets a difficult delivery back on track.',1,'Quarterly'),
  ('88888888-0209-4000-8000-000000000209','coordination-excellence-award','White','Award','Coordination Excellence','Coordinates people and dependencies clearly so shared work succeeds.',1,'Quarterly'),
  ('88888888-0210-4000-8000-000000000210','leadership-support-award','White','Award','Leadership Support','Supports colleagues with calm ownership, initiative and constructive leadership.',1,'Quarterly'),
  ('88888888-0211-4000-8000-000000000211','communication-excellence-award','White','Award','Communication Excellence','Communicates complex or sensitive information clearly and respectfully.',1,'Quarterly'),

  ('88888888-0002-4000-8000-000000000002','referral','Yellow','Award','Successful employee referral','Referred a colleague who joined C-Job and successfully completed probation.',1,'Quarterly'),
  ('88888888-0302-4000-8000-000000000302','proposal','Yellow','Award','Implemented automation proposal','Proposed a script or automation that was accepted, built and put into real use.',2,'Quarterly'),
  ('88888888-0303-4000-8000-000000000303','team-tool','Yellow','Award','Tool or script for one team (project or client team)','Created and implemented a tool or script for one project team or one client team with proven impact.',4,'Quarterly'),
  ('88888888-0304-4000-8000-000000000304','cross-team','Yellow','Award','Cross-team solution and department training','Designed and implemented a solution used by several teams, improved quality or efficiency, and trained the department.',7,'Quarterly'),
  ('88888888-0305-4000-8000-000000000305','deadline','Yellow','Award','Critical delivery deadline rescue','Closed a critical deadline or made a specific contribution that prevented a delivery failure.',1,'Quarterly'),
  ('88888888-0306-4000-8000-000000000306','quality-save','Yellow','Award','Serious issue caught before delivery','Found a serious error before the work was sent to the client.',1,'Quarterly'),
  ('88888888-0307-4000-8000-000000000307','checklist','Yellow','Award','Reusable self-check list','Prepared a high-quality self-check list that is actively reused by several colleagues. It must be confirmed by relevant self-check lists in the project folder for at least one month.',1,'Quarterly'),
  ('88888888-0308-4000-8000-000000000308','client-feedback','Yellow','Award','Named positive client feedback','Received explicit positive client feedback that names the employee and their contribution.',2,'Quarterly'),
  ('88888888-0309-4000-8000-000000000309','acting-lead','Yellow','Award','First acting coordinator or lead assignment','Successfully acted as coordinator or lead for the first time, without previous coordination experience.',1,'Quarterly'),
  ('88888888-0310-4000-8000-000000000310','training','Yellow','Award','Recorded internal training','Independently prepared, delivered and recorded training for junior specialists or the department.',2,'Quarterly'),

  ('88888888-0004-4000-8000-000000000004','employee-of-year','Blue','Award','Employee of the Year','Annual department distinction, limited to one recipient for every ten active department employees.',1,'Yearly'),
  ('88888888-0402-4000-8000-000000000402','long-term-automation','Blue','Award','Long-term Automation / Tool / Framework','Developed an automation, tool or framework with a long-term positive effect across C-Job.',1,'Yearly'),
  ('88888888-0403-4000-8000-000000000403','cross-department-system','Blue','Award','Cross-department System / Process / Toolkit','Created a system, process or toolkit that improves work or efficiency and is used by multiple departments.',2,'Yearly'),
  ('88888888-0404-4000-8000-000000000404','engineering-standards','Blue','Award','Engineering Standards Contribution','Made a key contribution to C-Job engineering standards.',1,'Yearly'),
  ('88888888-0405-4000-8000-000000000405','international-conference','Blue','Award','International Conference Representation','Successfully spoke at an international conference as a C-Job representative.',1,'Yearly'),
  ('88888888-0406-4000-8000-000000000406','successful-department-project','Blue','Award','Most Successful Department Project','Coordinated the department’s most successful project of the year, considering savings percentage, total hours, quality and client feedback.',1,'Yearly');

INSERT INTO app.spark_categories (id,code,spark_type,usage_type,is_active)
SELECT category_id,code,spark_type,usage_type,true
  FROM desired_spark_category_catalog
ON CONFLICT (id) DO UPDATE SET is_active=true;

UPDATE app.spark_category_versions AS current_version
   SET status='Retired', effective_to=transaction_timestamp()
  FROM desired_spark_category_catalog AS desired
 WHERE current_version.category_id=desired.category_id
   AND current_version.status='Active'
   AND ROW(current_version.name,COALESCE(current_version.description,''),current_version.amount,current_version.repeat_period)
       IS DISTINCT FROM ROW(desired.name,desired.description,desired.amount,desired.repeat_period);

INSERT INTO app.spark_category_versions
  (id,category_id,version,name,description,amount,repeat_period,status,effective_from,created_by_user_id)
SELECT gen_random_uuid(),desired.category_id,version_number.next_version,desired.name,desired.description,
       desired.amount,desired.repeat_period,'Active',transaction_timestamp(),NULL
  FROM desired_spark_category_catalog AS desired
 CROSS JOIN LATERAL (
   SELECT COALESCE(MAX(existing.version),0)+1 AS next_version
     FROM app.spark_category_versions AS existing
    WHERE existing.category_id=desired.category_id
 ) AS version_number
 WHERE NOT EXISTS (
   SELECT 1 FROM app.spark_category_versions AS active_version
    WHERE active_version.category_id=desired.category_id
      AND active_version.status='Active'
      AND active_version.effective_from<=transaction_timestamp()
      AND (active_version.effective_to IS NULL OR active_version.effective_to>transaction_timestamp())
      AND ROW(active_version.name,COALESCE(active_version.description,''),active_version.amount,active_version.repeat_period)
          IS NOT DISTINCT FROM ROW(desired.name,desired.description,desired.amount,desired.repeat_period)
 );
