import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getPool, closePool } from './pool.js';
import { withTransaction } from './transaction.js';
import { hashPassword } from '../security.js';

const DEMO_PASSWORD = 'SparkDemo2026!';

const departments = [
  ['11111111-1111-4111-8111-111111111111', 'ENG', 'Engineering'],
  ['22222222-2222-4222-8222-222222222222', 'OPS', 'Operations'],
  ['33333333-3333-4333-8333-333333333333', 'EXEC', 'Executive'],
  ['44444444-4444-4444-8444-444444444444', 'ADMIN', 'Administration'],
] as const;

const people = [
  ['aaaaaaaa-0001-4000-8000-000000000001', 'aaaaaaaa-1001-4000-8000-000000000001', 'EMP-001', 'Alex', 'Stone', 'Employee', 'alex.stone@c-job.test', departments[0][0]],
  ['aaaaaaaa-0002-4000-8000-000000000002', 'aaaaaaaa-1002-4000-8000-000000000002', 'EMP-002', 'Samuel', 'Park', 'Coordinator', 'samuel.park@c-job.test', departments[0][0]],
  ['aaaaaaaa-0003-4000-8000-000000000003', 'aaaaaaaa-1003-4000-8000-000000000003', 'EMP-003', 'Elena', 'Volkova', 'GPM', 'elena.volkova@c-job.test', departments[0][0]],
  ['aaaaaaaa-0004-4000-8000-000000000004', 'aaaaaaaa-1004-4000-8000-000000000004', 'EMP-004', 'Maya', 'Chen', 'Head', 'maya.chen@c-job.test', departments[0][0]],
  ['aaaaaaaa-0005-4000-8000-000000000005', 'aaaaaaaa-1005-4000-8000-000000000005', 'EMP-005', 'Victor', 'Hale', 'Top Management', 'victor.hale@c-job.test', departments[2][0]],
  ['aaaaaaaa-0006-4000-8000-000000000006', 'aaaaaaaa-1006-4000-8000-000000000006', 'EMP-006', 'Ida', 'Novak', 'Administrator', 'ida.novak@c-job.test', departments[3][0]],
] as const;

const seed = async (db: PoolClient) => {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  for (const [id, code, name] of departments)
    await db.query(
      `INSERT INTO app.departments (id,code,name) VALUES ($1,$2,$3)
       ON CONFLICT (id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,is_active=true`,
      [id, code, name],
    );
  const positionId = '55555555-5555-4555-8555-555555555555';
  await db.query(
    `INSERT INTO app.positions (id,code,title) VALUES ($1,'GENERAL','C-Job specialist')
     ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,is_active=true`,
    [positionId],
  );
  for (const [userId, employeeId, number, firstName, lastName, role, email, departmentId] of people) {
    await db.query(
      `INSERT INTO app.users (id,email,password_hash,account_status,approved_at)
       VALUES ($1,$2,$3,'Approved',clock_timestamp())
       ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email,password_hash=EXCLUDED.password_hash,
         account_status='Approved',disabled_at=NULL`,
      [userId, email, passwordHash],
    );
    await db.query(
      `INSERT INTO app.employees
        (id,user_id,employee_number,first_name,last_name,display_name,contact_email,department_id,position_id,
         provisioned_role_code,is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)
       ON CONFLICT (id) DO UPDATE SET user_id=EXCLUDED.user_id,display_name=EXCLUDED.display_name,
         contact_email=EXCLUDED.contact_email,department_id=EXCLUDED.department_id,
         provisioned_role_code=EXCLUDED.provisioned_role_code,is_active=true`,
      [employeeId, userId, number, firstName, lastName, `${firstName} ${lastName}`, email, departmentId, positionId, role],
    );
    await db.query(
      `INSERT INTO app.role_assignments (user_id,role_id,assigned_by_user_id)
       SELECT $1,id,$1 FROM app.roles WHERE code=$2
       ON CONFLICT DO NOTHING`,
      [userId, role],
    );
    await db.query(`INSERT INTO app.user_preferences (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [userId]);
  }
  await db.query(`UPDATE app.departments SET head_employee_id=$2 WHERE id=$1`, [departments[0][0], people[3][1]]);

  const projectId = '66666666-6666-4666-8666-666666666666';
  const teamId = '66666666-6666-4666-8666-666666666667';
  await db.query(
    `INSERT INTO app.projects (id,code,name,department_id,manager_employee_id,status,is_active)
     VALUES ($1,'SPARKS','C-Job Sparks',$2,$3,'Active',true)
     ON CONFLICT (id) DO UPDATE SET is_active=true,status='Active'`,
    [projectId, departments[0][0], people[2][1]],
  );
  await db.query(
    `INSERT INTO app.project_teams (id,project_id,name,coordinator_employee_id,gpm_employee_id)
     VALUES ($1,$2,'Core team',$3,$4) ON CONFLICT (id) DO UPDATE SET is_active=true`,
    [teamId, projectId, people[1][1], people[2][1]],
  );
  for (const person of people.slice(0, 4))
    await db.query(
      `INSERT INTO app.project_members (project_id,team_id,employee_id,member_role,worked_hours)
       VALUES ($1,$2,$3,$4,160)
       ON CONFLICT (project_id,employee_id) WHERE is_active DO UPDATE SET worked_hours=160,team_id=EXCLUDED.team_id`,
      [projectId, teamId, person[1], person[5] === 'Coordinator' ? 'Coordinator' : 'Member'],
    );

  const ruleId = '77777777-7777-4777-8777-777777777777';
  await db.query(
    `INSERT INTO app.rule_set_versions
      (id,version,name,status,effective_from,white_to_yellow_input,white_to_yellow_output,white_to_yellow_fee,
       yellow_to_blue_input,yellow_to_blue_output,yellow_to_blue_fee,peer_quarterly_limit,
       yellow_quarterly_limit,coordinator_team_multiplier,disenchant_currency,
       white_disenchant_rate,yellow_disenchant_rate,blue_disenchant_rate,created_by_user_id)
     VALUES ($1,1,'MVP rules','Active','2026-01-01',10,1,1,5,1,1,3,10,5,'EUR',1,10,50,$2)
     ON CONFLICT (id) DO NOTHING`,
    [ruleId, people[5][0]],
  );

  const categories = [
    ['88888888-0001-4000-8000-000000000001', '88888888-1001-4000-8000-000000000001', 'knowledge-sharing', 'White', 'PeerRecognition', 'Knowledge Sharing', 1, 'Unlimited'],
    ['88888888-0002-4000-8000-000000000002', '88888888-1002-4000-8000-000000000002', 'referral', 'Yellow', 'Award', 'Successful employee referral', 1, 'Quarterly'],
    ['88888888-0003-4000-8000-000000000003', '88888888-1003-4000-8000-000000000003', 'smart-solution', 'White', 'Award', 'Smart Solution', 1, 'Quarterly'],
    ['88888888-0004-4000-8000-000000000004', '88888888-1004-4000-8000-000000000004', 'employee-of-year', 'Blue', 'Award', 'Employee of the Year', 1, 'Yearly'],
  ] as const;
  for (const [categoryId, versionId, code, type, usage, name, amount, repeat] of categories) {
    await db.query(
      `INSERT INTO app.spark_categories (id,code,spark_type,usage_type) VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET is_active=true`,
      [categoryId, code, type, usage],
    );
    await db.query(
      `INSERT INTO app.spark_category_versions
        (id,category_id,version,name,description,amount,repeat_period,status,effective_from,created_by_user_id)
       VALUES ($1,$2,1,$3,$4,$5,$6,'Active','2026-01-01',$7)
       ON CONFLICT (id) DO NOTHING`,
      [versionId, categoryId, name, `${name} recognition category.`, amount, repeat, people[5][0]],
    );
  }

  for (const person of people.slice(0, 5)) {
    for (const [sparkType, amount] of [['White', 100], ['Yellow', 20], ['Blue', 5]] as const) {
      await db.query(`INSERT INTO app.spark_accounts (employee_id,spark_type) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [person[1], sparkType]);
      const sourceId = randomUUID();
      const operationId = randomUUID();
      const existing = await db.query(`SELECT 1 FROM app.spark_operations WHERE source_type='Seed' AND subject_employee_id=$1 AND metadata->>'sparkType'=$2`, [person[1], sparkType]);
      if (!existing.rowCount) {
        await db.query(
          `INSERT INTO app.spark_operations
            (id,operation_type,status,actor_user_id,subject_employee_id,source_type,source_id,description,metadata,committed_at)
           VALUES ($1,'Grant','Pending',$2,$3,'Seed',$4,'Initial demo balance',jsonb_build_object('sparkType',$5),NULL)`,
          [operationId, people[5][0], person[1], sourceId, sparkType],
        );
        await db.query(
          `INSERT INTO app.spark_ledger_entries
            (operation_id,account_id,entry_kind,amount,balance_after,source_type,source_id,description)
           SELECT $1,id,'Credit',$2,0,'Seed',$3,'Initial demo balance' FROM app.spark_accounts
            WHERE employee_id=$4 AND spark_type=$5`,
          [operationId, amount, sourceId, person[1], sparkType],
        );
        await db.query(`UPDATE app.spark_operations SET status='Committed',committed_at=clock_timestamp() WHERE id=$1`, [operationId]);
      }
    }
  }

  const shopCategory = '99999999-0001-4000-8000-000000000001';
  const productId = '99999999-0002-4000-8000-000000000002';
  const productVersion = '99999999-0003-4000-8000-000000000003';
  await db.query(`INSERT INTO app.shop_categories (id,code,name) VALUES ($1,'customization','Customization') ON CONFLICT (id) DO NOTHING`, [shopCategory]);
  await db.query(`INSERT INTO app.products (id,sku,category_id,created_by_user_id) VALUES ($1,'NEON-THEME',$2,$3) ON CONFLICT (id) DO NOTHING`, [productId, shopCategory, people[5][0]]);
  await db.query(
    `INSERT INTO app.product_versions
      (id,product_id,version,name,description,rarity,price_spark_type,price_amount,effect_code,
       status,is_purchasable,is_featured,is_limited,available_from,created_by_user_id)
     VALUES ($1,$2,1,'Neon theme','Unlocks the neon workspace theme.','Rare','White',15,'theme_unlock',
       'Active',true,true,true,'2026-01-01',$3) ON CONFLICT (id) DO NOTHING`,
    [productVersion, productId, people[5][0]],
  );
  await db.query(`INSERT INTO app.product_stock (product_id) VALUES ($1) ON CONFLICT DO NOTHING`, [productId]);
  const movement = await db.query(`SELECT 1 FROM app.stock_movements WHERE product_id=$1 AND reason='InitialStock'`, [productId]);
  if (!movement.rowCount)
    await db.query(`INSERT INTO app.stock_movements
      (product_id,product_version_id,quantity_delta,balance_after,reason,actor_user_id,note)
      VALUES ($1,$2,50,0,'InitialStock',$3,'Development seed')`, [productId, productVersion, people[5][0]]);
};

const pool = getPool();
try {
  await withTransaction(pool, seed);
  process.stdout.write(`Development data is ready. Demo password: ${DEMO_PASSWORD}\n`);
} finally {
  await closePool();
}
