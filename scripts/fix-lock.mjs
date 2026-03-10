import fs from "node:fs";

const lockPath = "package-lock.json";
const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
const packages = lock.packages || {};

const getPackageNameFromPath = (path) => {
  const marker = "node_modules/";
  const index = path.lastIndexOf(marker);
  if (index === -1) return "";
  return path.slice(index + marker.length);
};

const getParentPath = (path) => {
  const marker = "/node_modules/";
  const index = path.lastIndexOf(marker);
  if (index === -1) return "";
  return path.slice(0, index);
};

const getVersionFromMap = (map, packageName) => {
  if (!map || typeof map !== "object") return undefined;
  const version = map[packageName];
  if (typeof version !== "string") return undefined;
  const cleaned = version.trim().replace(/^[~^]/, "");
  return cleaned || undefined;
};

const packageVersionIndex = new Map();
for (const [path, meta] of Object.entries(packages)) {
  if (!path || !meta || typeof meta !== "object" || !("version" in meta)) continue;
  const name = getPackageNameFromPath(path);
  if (!name || packageVersionIndex.has(name)) continue;
  packageVersionIndex.set(name, meta.version);
}

const findVersionFromAllReferences = (packageName) => {
  for (const meta of Object.values(packages)) {
    if (!meta || typeof meta !== "object") continue;

    const fromDeps = getVersionFromMap(meta.dependencies, packageName);
    if (fromDeps) return fromDeps;

    const fromOptional = getVersionFromMap(meta.optionalDependencies, packageName);
    if (fromOptional) return fromOptional;

    const fromPeer = getVersionFromMap(meta.peerDependencies, packageName);
    if (fromPeer) return fromPeer;
  }

  return undefined;
};

let fixedCount = 0;
const unresolved = [];

for (const [path, meta] of Object.entries(packages)) {
  if (!path || !meta || typeof meta !== "object" || "version" in meta) continue;

  const packageName = getPackageNameFromPath(path);
  const parentPath = getParentPath(path);
  const parentMeta = packages[parentPath];

  let resolvedVersion = packageVersionIndex.get(packageName);

  if (!resolvedVersion && parentMeta && typeof parentMeta === "object") {
    resolvedVersion =
      getVersionFromMap(parentMeta.dependencies, packageName) ||
      getVersionFromMap(parentMeta.optionalDependencies, packageName) ||
      getVersionFromMap(parentMeta.peerDependencies, packageName);
  }

  if (!resolvedVersion) {
    resolvedVersion = findVersionFromAllReferences(packageName);
  }

  if (!resolvedVersion) {
    unresolved.push(path);
    continue;
  }

  meta.version = resolvedVersion;
  packageVersionIndex.set(packageName, resolvedVersion);
  fixedCount += 1;
}

fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

console.log(`fixed=${fixedCount}`);
console.log(`unresolved=${unresolved.length}`);
if (unresolved.length) {
  console.log(unresolved.join("\n"));
}
