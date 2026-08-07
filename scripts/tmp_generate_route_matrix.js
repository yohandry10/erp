const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = process.cwd();
const TARGET = path.join(ROOT, "apps/erp-api/src");

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const p = path.join(dir, entry.name);
      if (
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === ".turbo"
      )
        continue;
      walk(p, files);
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

function getDecorators(node) {
  return ts.getDecorators(node) || [];
}

function getCallExpression(decorator) {
  return decorator.expression;
}

function decoratorName(expr) {
  if (ts.isCallExpression(expr)) {
    const callee = expr.expression;
    if (ts.isIdentifier(callee)) return callee.text;
    if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  }
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return "";
}

function isHttpMethod(name) {
  return [
    "Get",
    "Post",
    "Put",
    "Delete",
    "Patch",
    "Options",
    "Head",
    "All",
  ].includes(name);
}

function safeText(node) {
  if (!node) return "";
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return node.text;
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isLiteralExpression(node)) return String(node.text);
  return node.getText();
}

function collectGuardNames(exprs) {
  return exprs.filter(ts.isIdentifier).map((e) => e.text);
}

function hasGuard(exprs, name) {
  return exprs.some((n) => n.text === name);
}

function cleanSegment(value) {
  if (!value) return "";
  return value.replace(/^\/+|\/+$/g, "");
}

function buildRoute(base, methodSegment) {
  const basePart = cleanSegment(base);
  const methodPart = cleanSegment(methodSegment);
  const full = [basePart, methodPart].filter(Boolean).join("/");
  return "/" + full;
}

function extractPermissionText(callExpr) {
  if (!callExpr.arguments || callExpr.arguments.length === 0) return "";
  const args = callExpr.arguments.map((a) => safeText(a)).filter(Boolean);
  return args.join(", ");
}

const controllerFiles = [
  ...walk(path.join(TARGET, "modules")).filter((file) =>
    file.endsWith(".controller.ts"),
  ),
  ...walk(path.join(TARGET, "shared")).filter((file) =>
    file.endsWith(".controller.ts"),
  ),
  path.join(TARGET, "app.controller.ts"),
]
  .filter(Boolean)
  .filter((value, index, self) => self.indexOf(value) === index);

const rows = [];

for (const file of controllerFiles) {
  const content = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const visit = (node) => {
    if (!ts.isClassDeclaration(node) || !node.name) {
      ts.forEachChild(node, visit);
      return;
    }

    const classDecorators = getDecorators(node).map(getCallExpression);
    const controllerDecorator = classDecorators.find(
      (d) => decoratorName(d) === "Controller",
    );
    const controllerBase =
      controllerDecorator &&
      ts.isCallExpression(controllerDecorator) &&
      controllerDecorator.arguments.length
        ? safeText(controllerDecorator.arguments[0])
        : "";

    const classGuards = classDecorators
      .filter((d) => ts.isCallExpression(d) && decoratorName(d) === "UseGuards")
      .flatMap((d) => d.arguments)
      .filter(ts.isIdentifier);

    const classHasPublic = classDecorators.some(
      (d) => decoratorName(d) === "Public",
    );

    for (const member of node.members) {
      if (!ts.isMethodDeclaration(member) || !member.name) continue;

      const methodName = member.name.getText();
      const methodDecorators = getDecorators(member).map(getCallExpression);
      const httpDecorators = methodDecorators.filter((d) =>
        isHttpMethod(decoratorName(d)),
      );

      if (!httpDecorators.length) continue;

      const methodGuards = methodDecorators
        .filter(
          (d) => ts.isCallExpression(d) && decoratorName(d) === "UseGuards",
        )
        .flatMap((d) => d.arguments)
        .filter(ts.isIdentifier);

      const hasPublic =
        classHasPublic ||
        methodDecorators.some((d) => decoratorName(d) === "Public");
      const hasPermission = methodDecorators.some(
        (d) => decoratorName(d) === "RequirePermission",
      );
      const permDecorator = methodDecorators.find(
        (d) => decoratorName(d) === "RequirePermission",
      );
      const permission = permDecorator
        ? extractPermissionText(permDecorator)
        : "";

      const classHasJwt =
        hasGuard(classGuards, "JwtAuthGuard") ||
        hasGuard(classGuards, "AuthGuard");
      const methodHasJwt =
        hasGuard(methodGuards, "JwtAuthGuard") ||
        hasGuard(methodGuards, "AuthGuard");
      const classHasPermissionGuard = hasGuard(classGuards, "PermissionGuard");
      const methodHasPermissionGuard = hasGuard(
        methodGuards,
        "PermissionGuard",
      );
      const classHasSuperAdmin = hasGuard(classGuards, "SuperAdminGuard");
      const methodHasSuperAdmin = hasGuard(methodGuards, "SuperAdminGuard");
      const hasJwt = classHasJwt || methodHasJwt;
      const hasPermissionGuard =
        classHasPermissionGuard || methodHasPermissionGuard;
      const hasSuperAdmin = classHasSuperAdmin || methodHasSuperAdmin;

      let classification = "AUTHENTICATED";
      if (hasPublic) {
        classification = "PUBLIC";
      } else if (hasPermission) {
        classification = "PERMISSIONED";
      } else if (hasSuperAdmin) {
        classification = "SUPER_ADMIN";
      }

      let status = "OK";
      if (classification === "AUTHENTICATED" && hasPermissionGuard) {
        status = "TODO: RequirePermission faltante";
      } else if (
        !hasJwt &&
        !hasPermissionGuard &&
        !hasSuperAdmin &&
        !hasPublic
      ) {
        status = "TODO: revisar autenticación";
      } else if (classification === "SUPER_ADMIN" && !hasPermission) {
        status = "TODO: permission explícita";
      }

      for (const decorator of httpDecorators) {
        const methodPath =
          ts.isCallExpression(decorator) && decorator.arguments.length
            ? safeText(decorator.arguments[0])
            : "";
        rows.push({
          file,
          controller: node.name.text,
          method: methodName,
          httpMethod: decoratorName(decorator),
          route: buildRoute(controllerBase, methodPath),
          classification,
          permission,
          status,
          guards: [
            classHasJwt ? "JwtAuthGuard" : "",
            hasPermissionGuard ? "PermissionGuard" : "",
            hasSuperAdmin ? "SuperAdminGuard" : "",
          ]
            .filter(Boolean)
            .join(", "),
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sf);
}

rows.sort((a, b) => {
  if (a.file !== b.file) return a.file.localeCompare(b.file);
  if (a.httpMethod !== b.httpMethod)
    return a.httpMethod.localeCompare(b.httpMethod);
  return a.route.localeCompare(b.route);
});

const toModule = (p) => {
  const rel = path.relative(path.join(ROOT, "apps", "erp-api", "src"), p);
  const parts = rel.split(path.sep);
  if (parts[0] === "modules") return `modules/${parts[1]}`;
  if (parts[0] === "shared") return "shared";
  return rel;
};

const md = [
  "# Route Access Matrix",
  "",
  `Generado: ${new Date().toISOString()}`,
  "| Módulo | Archivo | Método HTTP | Ruta | Método | Clasificación | Permiso | Estado |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ...rows.map((r) => {
    const rel = path.relative(ROOT, r.file).replace(/\\/g, "/");
    return `| ${toModule(r.file)} | ${rel} | ${r.httpMethod} | ${r.route} | ${r.controller}.${r.method} | ${r.classification} | ${r.permission || "-"} | ${r.status} |`;
  }),
];

const outputDir = path.join(ROOT, "artifacts/generated");
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  path.join(outputDir, "route-access-matrix.md"),
  md.join("\n"),
  "utf8",
);

const counts = rows.reduce((acc, row) => {
  acc[row.classification] = (acc[row.classification] || 0) + 1;
  return acc;
}, {});

console.log("rows", rows.length);
console.log("counts", JSON.stringify(counts, null, 2));
