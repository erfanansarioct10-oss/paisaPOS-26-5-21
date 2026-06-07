import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceRoots = ["src", "scripts", "tests"];
const codeExtensions = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".vercel",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "playwright-report",
  "test-results",
  ".agents",
  ".codex",
]);

const retiredAliasPrefixes = [
  "@/components",
  "@/lib/server",
];

const retiredAliasModules = [
  "@/lib/importer",
  "@/lib/logger",
  "@/lib/network",
  "@/lib/rate-limiter",
  "@/lib/store/authSlice",
  "@/lib/store/cartSlice",
  "@/lib/store/inventorySlice",
];

const retiredPathPrefixes = [
  path.join(root, "src", "components"),
  path.join(root, "src", "lib", "server"),
];

const retiredPathModules = [
  path.join(root, "src", "lib", "importer"),
  path.join(root, "src", "lib", "logger"),
  path.join(root, "src", "lib", "network"),
  path.join(root, "src", "lib", "rate-limiter"),
  path.join(root, "src", "lib", "store", "authSlice"),
  path.join(root, "src", "lib", "store", "cartSlice"),
  path.join(root, "src", "lib", "store", "inventorySlice"),
];

const importPattern =
  /\bimport\s+(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']|\bexport\s+[^"']*?\s+from\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)|\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;

const serverRuntimePatterns = [
  { pattern: /["']next\/headers["']/, label: "next/headers" },
  { pattern: /["']server-only["']/, label: "server-only" },
  { pattern: /\bSUPABASE_SERVICE_ROLE_KEY\b/, label: "SUPABASE_SERVICE_ROLE_KEY" },
  { pattern: /\bcreateServerClient\b/, label: "createServerClient" },
];

const violations = [];

for (const sourceRoot of sourceRoots) {
  const absoluteRoot = path.join(root, sourceRoot);
  if (fs.existsSync(absoluteRoot)) {
    walk(absoluteRoot, checkFile);
  }
}

checkRetiredComponentsDirectory();

if (violations.length > 0) {
  console.error("\nArchitecture guardrail failed:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  console.error("\nUse src/features, src/shared, or src/server canonical paths instead of retired wrappers.");
  process.exit(1);
}

console.log("Architecture guardrail passed.");

function walk(directory, onFile) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;

    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolutePath, onFile);
      continue;
    }

    if (entry.isFile() && codeExtensions.has(path.extname(entry.name))) {
      onFile(absolutePath);
    }
  }
}

function checkFile(absolutePath) {
  const source = fs.readFileSync(absolutePath, "utf8");
  checkImports(absolutePath, source);
  checkGeneralLibServerApis(absolutePath, source);
}

function checkImports(absolutePath, source) {
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2] ?? match[3] ?? match[4];
    if (!specifier) continue;

    if (isRetiredAlias(specifier) || isRetiredResolvedPath(absolutePath, specifier)) {
      violations.push(`${relative(absolutePath)} imports retired path "${specifier}"`);
    }
  }
}

function checkGeneralLibServerApis(absolutePath, source) {
  const normalizedPath = normalize(absolutePath);
  const libRoot = normalize(path.join(root, "src", "lib"));

  if (!isSameOrChild(normalizedPath, libRoot)) return;
  if (normalizedPath.includes(`${path.sep}__tests__${path.sep}`)) return;

  for (const { pattern, label } of serverRuntimePatterns) {
    if (pattern.test(source)) {
      violations.push(`${relative(absolutePath)} uses server-only runtime API "${label}" inside src/lib`);
    }
  }
}

function checkRetiredComponentsDirectory() {
  const componentsDirectory = path.join(root, "src", "components");
  if (!fs.existsSync(componentsDirectory)) return;

  const files = [];
  walk(componentsDirectory, (file) => files.push(file));

  for (const file of files) {
    violations.push(`${relative(file)} lives in retired src/components`);
  }
}

function isRetiredAlias(specifier) {
  return retiredAliasPrefixes.some((prefix) => specifier === prefix || specifier.startsWith(`${prefix}/`))
    || retiredAliasModules.some((moduleName) => specifier === moduleName || specifier.startsWith(`${moduleName}/`));
}

function isRetiredResolvedPath(fromFile, specifier) {
  const resolved = resolveProjectImport(fromFile, specifier);
  if (!resolved) return false;

  return retiredPathPrefixes.some((prefix) => isSameOrChild(resolved, normalize(prefix)))
    || retiredPathModules.some((moduleBase) => isSameOrModule(resolved, normalize(moduleBase)));
}

function resolveProjectImport(fromFile, specifier) {
  if (specifier.startsWith("@/")) {
    return normalize(path.join(root, "src", specifier.slice(2)));
  }

  if (specifier.startsWith(".")) {
    return normalize(path.resolve(path.dirname(fromFile), specifier));
  }

  return null;
}

function isSameOrChild(candidate, parent) {
  return candidate === parent || candidate.startsWith(`${parent}${path.sep}`);
}

function isSameOrModule(candidate, moduleBase) {
  return candidate === moduleBase
    || candidate.startsWith(`${moduleBase}.`)
    || candidate.startsWith(`${moduleBase}${path.sep}`);
}

function normalize(value) {
  return path.normalize(value);
}

function relative(absolutePath) {
  return path.relative(root, absolutePath).replaceAll(path.sep, "/");
}
