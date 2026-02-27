#!/usr/bin/env node

/**
 * Packages skills into .skill files (ZIP format) compatible with
 * Claude Code plugin/marketplace installation.
 *
 * Format: ZIP archive containing <skill-name>/SKILL.md + bundled resources
 * Excludes: tests/, evals/, __pycache__, node_modules, .DS_Store, *.pyc
 *
 * Usage:
 *   node scripts/package-skills.js                    # Package all skills
 *   node scripts/package-skills.js --skill my-skill   # Package one skill
 *   node scripts/package-skills.js --outdir ./dist    # Custom output dir
 */

import { readdir, readFile, access, mkdir, stat } from "node:fs/promises";
import { resolve, join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, "..", "skills");
const DEFAULT_OUTDIR = resolve(__dirname, "..", "dist");

const { values: args } = parseArgs({
  options: {
    skill: { type: "string", default: "" },
    outdir: { type: "string", default: DEFAULT_OUTDIR },
  },
  strict: true,
});

// Match the canonical package_skill.py exclusions
const EXCLUDE_DIRS = new Set(["__pycache__", "node_modules", ".git"]);
const EXCLUDE_FILES = new Set([".DS_Store", ".gitkeep"]);
const EXCLUDE_EXTENSIONS = new Set([".pyc"]);
// Directories excluded only at skill root level (not nested)
const ROOT_EXCLUDE_DIRS = new Set(["evals", "tests"]);

function shouldExclude(relPath, depth) {
  const parts = relPath.split("/");
  const fileName = parts[parts.length - 1];

  // Check excluded directories anywhere in path
  if (parts.some((p) => EXCLUDE_DIRS.has(p))) return true;

  // Check root-level excluded directories (parts[0] is skill name, parts[1] is first subdir)
  if (parts.length > 1 && ROOT_EXCLUDE_DIRS.has(parts[1])) return true;

  // Check excluded files
  if (EXCLUDE_FILES.has(fileName)) return true;

  // Check excluded extensions
  const ext = fileName.includes(".") ? "." + fileName.split(".").pop() : "";
  if (EXCLUDE_EXTENSIONS.has(ext)) return true;

  return false;
}

async function collectFiles(dir, baseDir = dir) {
  const files = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relPath = relative(baseDir, fullPath);

    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      files.push(...(await collectFiles(fullPath, baseDir)));
    } else if (entry.isFile()) {
      files.push({ fullPath, relPath });
    }
  }

  return files;
}

/**
 * Creates a ZIP file without external dependencies.
 * Uses the ZIP local file header + central directory format.
 *
 * For production use with large skills, consider using archiver or yazl.
 * This implementation handles the common case without npm dependencies.
 */
async function createZip(outputPath, files) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  const allBuffers = [];

  for (const { arcName, data } of files) {
    const nameBuffer = Buffer.from(arcName, "utf-8");
    const crc = crc32(data);

    // Local file header
    const localHeader = Buffer.alloc(30 + nameBuffer.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4); // Version needed (2.0)
    localHeader.writeUInt16LE(0, 6); // General purpose bit flag
    localHeader.writeUInt16LE(0, 8); // Compression method (stored/none)
    localHeader.writeUInt16LE(0, 10); // Last mod file time
    localHeader.writeUInt16LE(0, 12); // Last mod file date
    localHeader.writeUInt32LE(crc, 14); // CRC-32
    localHeader.writeUInt32LE(data.length, 18); // Compressed size
    localHeader.writeUInt32LE(data.length, 22); // Uncompressed size
    localHeader.writeUInt16LE(nameBuffer.length, 26); // File name length
    localHeader.writeUInt16LE(0, 28); // Extra field length
    nameBuffer.copy(localHeader, 30);

    // Central directory header
    const centralHeader = Buffer.alloc(46 + nameBuffer.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Central directory signature
    centralHeader.writeUInt16LE(20, 4); // Version made by
    centralHeader.writeUInt16LE(20, 6); // Version needed
    centralHeader.writeUInt16LE(0, 8); // General purpose bit flag
    centralHeader.writeUInt16LE(0, 10); // Compression method
    centralHeader.writeUInt16LE(0, 12); // Last mod file time
    centralHeader.writeUInt16LE(0, 14); // Last mod file date
    centralHeader.writeUInt32LE(crc, 16); // CRC-32
    centralHeader.writeUInt32LE(data.length, 20); // Compressed size
    centralHeader.writeUInt32LE(data.length, 24); // Uncompressed size
    centralHeader.writeUInt16LE(nameBuffer.length, 28); // File name length
    centralHeader.writeUInt16LE(0, 30); // Extra field length
    centralHeader.writeUInt16LE(0, 32); // File comment length
    centralHeader.writeUInt16LE(0, 34); // Disk number start
    centralHeader.writeUInt16LE(0, 36); // Internal file attributes
    centralHeader.writeUInt32LE(0, 38); // External file attributes
    centralHeader.writeUInt32LE(offset, 42); // Relative offset of local header
    nameBuffer.copy(centralHeader, 46);

    allBuffers.push(localHeader, data);
    centralHeaders.push(centralHeader);

    offset += localHeader.length + data.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const ch of centralHeaders) {
    allBuffers.push(ch);
    centralDirSize += ch.length;
  }

  // End of central directory record
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0); // End of central directory signature
  endRecord.writeUInt16LE(0, 4); // Disk number
  endRecord.writeUInt16LE(0, 6); // Central directory disk number
  endRecord.writeUInt16LE(files.length, 8); // Entries on this disk
  endRecord.writeUInt16LE(files.length, 10); // Total entries
  endRecord.writeUInt32LE(centralDirSize, 12); // Central directory size
  endRecord.writeUInt32LE(centralDirOffset, 16); // Central directory offset
  endRecord.writeUInt16LE(0, 20); // Comment length

  allBuffers.push(endRecord);

  const { writeFile: writeFileBuf } = await import("node:fs/promises");
  await writeFileBuf(outputPath, Buffer.concat(allBuffers));
}

// CRC-32 implementation
function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }

  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function packageSkill(skillName, outDir) {
  const skillDir = join(SKILLS_DIR, skillName);
  const skillMdPath = join(skillDir, "SKILL.md");

  try {
    await access(skillMdPath);
  } catch {
    console.error(`  ❌ ${skillName}: no SKILL.md found`);
    return null;
  }

  // Collect files relative to skills/ parent (so paths start with skill-name/)
  const allFiles = await collectFiles(skillDir);
  const zipEntries = [];

  for (const { fullPath, relPath } of allFiles) {
    // arcName should be skill-name/path/to/file (relative to skills/ dir)
    const arcName = `${skillName}/${relPath}`;

    if (shouldExclude(arcName, 0)) {
      continue;
    }

    const data = await readFile(fullPath);
    zipEntries.push({ arcName, data });
  }

  const outputPath = join(outDir, `${skillName}.skill`);
  await createZip(outputPath, zipEntries);

  const fileSize = (await stat(outputPath)).size;
  const sizeStr =
    fileSize > 1024 * 1024
      ? `${(fileSize / 1024 / 1024).toFixed(1)}MB`
      : `${(fileSize / 1024).toFixed(1)}KB`;

  console.log(
    `  ✅ ${skillName}.skill (${zipEntries.length} files, ${sizeStr})`
  );
  return outputPath;
}

async function main() {
  const outDir = resolve(args.outdir);
  await mkdir(outDir, { recursive: true });

  console.log("📦 Packaging .skill files...\n");

  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  let skillDirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name);

  if (args.skill) {
    skillDirs = skillDirs.filter((s) => s === args.skill);
    if (skillDirs.length === 0) {
      console.error(`Skill not found: ${args.skill}`);
      process.exit(1);
    }
  }

  const results = [];
  for (const name of skillDirs) {
    const result = await packageSkill(name, outDir);
    if (result) results.push(result);
  }

  console.log(`\n${results.length} .skill file(s) written to ${outDir}\n`);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
