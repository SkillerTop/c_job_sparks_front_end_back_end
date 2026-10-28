INSERT INTO app.roles (code, name, description, permissions, is_system)
VALUES
  (
    'Employee',
    'Employee',
    'Personal Sparks, peer recognition, achievements, shop, purchases, conversion and disenchant.',
    '{"self": true, "peerRecognition": true, "shopPurchase": true, "conversion": true, "disenchant": true}'::jsonb,
    true
  ),
  (
    'Coordinator',
    'Coordinator',
    'Employee capabilities plus shared active project team access and Yellow requests.',
    '{"self": true, "peerRecognition": true, "shopPurchase": true, "conversion": true, "disenchant": true, "teamScope": true, "requestYellow": true}'::jsonb,
    true
  ),
  (
    'GPM',
    'GPM',
    'Managed-team access, peer recognition, White and Yellow award requests and company achievements.',
    '{"peerRecognition": true, "managedTeamScope": true, "requestWhite": true, "requestYellow": true, "companyAchievements": true}'::jsonb,
    true
  ),
  (
    'Head',
    'Head',
    'Department workspace, approvals, Quality Gates and direct White, Yellow and Blue awards.',
    '{"departmentScope": true, "approvals": true, "qualityGates": true, "grantWhite": true, "grantYellow": true, "grantBlue": true}'::jsonb,
    true
  ),
  (
    'Top Management',
    'Top Management',
    'Radiant Award, company achievements and read-only shop access.',
    '{"grantRadiant": true, "companyAchievements": true, "shopRead": true}'::jsonb,
    true
  ),
  (
    'Administrator',
    'Administrator',
    'Administrative functions and company achievements; cannot grant awards.',
    '{"administration": true, "companyAchievements": true}'::jsonb,
    true
  )
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    permissions = EXCLUDED.permissions,
    is_system = EXCLUDED.is_system,
    updated_at = clock_timestamp();
