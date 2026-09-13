import assert from 'node:assert/strict';

// 542 retira DML de auditoría explícitamente; las demás preservan escritores
// existentes. Sus nuevas RPC y helpers tienen verificadores de EXECUTE propios.
export const readMigrationVersions = new Set([537, 538, 539, 540, 541, 543, 544, 545, 546, 547, 548, 549, 550, 551, 552]);

// Las lecturas del backend pueden añadirse. Toda otra ACL, incluidas columnas
// y SELECT de anon/authenticated, debe permanecer exactamente como estaba.
// PROD tiene concesiones heredadas que no existen en PostgreSQL limpio.
export const preservedPrivilegesSql = `
SELECT coalesce(json_agg(t ORDER BY schema_name,relation_name,column_name,grantee,privilege_type,is_grantable),'[]')::text
FROM (
  SELECT n.nspname AS schema_name,c.relname AS relation_name,'' AS column_name,
    coalesce(r.rolname,'PUBLIC') AS grantee,a.privilege_type,a.is_grantable
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) a
  LEFT JOIN pg_roles r ON r.oid=a.grantee
  WHERE n.nspname IN ('public','app','auth','storage')
    AND c.relkind IN ('r','p','v','m','S','f')
    AND NOT (coalesce(r.rolname,'PUBLIC')='service_role' AND a.privilege_type='SELECT')
  UNION ALL
  SELECT n.nspname,c.relname,att.attname,coalesce(r.rolname,'PUBLIC'),a.privilege_type,a.is_grantable
  FROM pg_attribute att JOIN pg_class c ON c.oid=att.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  CROSS JOIN LATERAL aclexplode(att.attacl) a LEFT JOIN pg_roles r ON r.oid=a.grantee
  WHERE n.nspname IN ('public','app','auth','storage')
    AND NOT (coalesce(r.rolname,'PUBLIC')='service_role' AND a.privilege_type='SELECT')
) t;`;

export function assertReadPrivilegesPreserved(before, after, version) {
  assert.ok(after === before, `La migración de lectura ${version} alteró permisos distintos de SELECT service_role`);
}
