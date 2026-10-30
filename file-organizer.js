#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import Scanner from './lib/scanner.js';
import DuplicateFinder from './lib/duplicates.js';
import Organizer, { categories } from './lib/organizer.js';
import Cleanup from './lib/cleanup.js';

const LINE = '━'.repeat(34);

// ---------- helpers ----------

function formatSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  } else {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}

function drawProgressBar(current, total, width = 20) {
  const percentage = total === 0 ? 1 : current / total;
  const filled = Math.round(percentage * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  return `${bar} ${current}/${total}`;
}

function updateProgress(label, current, total, suffix = '') {
  process.stdout.write(`\r${label} ${drawProgressBar(current, total)}${suffix}`);
  if (current === total) process.stdout.write('\n');
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function getErrorMessage(error, target) {
  switch (error.code) {
    case 'ENOENT':
      return `File or directory not found: ${target}`;
    case 'EACCES':
    case 'EPERM':
      return `Permission denied: ${target}`;
    case 'ENOTDIR':
      return `Not a directory: ${target}`;
    case 'EISDIR':
      return `Expected a file but found a directory: ${target}`;
    case 'EBUSY':
      return `File is busy or locked by another process: ${target}`;
    case 'ENOSPC':
      return `No space left on device while writing: ${target}`;
    case 'EEXIST':
      return `File already exists: ${target}`;
    default:
      return `Unexpected error (${error.code || 'unknown'}): ${error.message}`;
  }
}

function exitWithError(error, target) {
  console.error(`\n❌ Error: ${getErrorMessage(error, target)}`);
  process.exit(1);
}

function warnFileError({ path: filePath, error }) {
  console.warn(`\n⚠️  Skipped: ${getErrorMessage(error, filePath)}`);
}

async function validateDirectory(directory) {
  if (!directory) {
    console.error('❌ Error: Directory path is required.');
    printHelp();
    process.exit(1);
  }
  try {
    const stats = await fs.stat(directory);
    if (!stats.isDirectory()) {
      const error = new Error('Not a directory');
      error.code = 'ENOTDIR';
      throw error;
    }
  } catch (error) {
    exitWithError(error, directory);
  }
  return path.resolve(directory);
}

function getFlagValue(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

function printHelp() {
  console.log(`
Usage:
  node file-organizer.js scan <directory>
  node file-organizer.js duplicates <directory>
  node file-organizer.js organize <source> --output <target>
  node file-organizer.js cleanup <directory> --older-than <days> [--confirm]
`);
}
// ---------- commands ----------

async function runScan(directory) {
  const scanner = new Scanner();

  scanner.on('scan-start', ({ directory }) => {
    console.log(`📂 Scanning: ${directory}`);
  });
  scanner.on('file-found', ({ current, total }) => {
    updateProgress('Processing...', current, total, ' files');
  });
  scanner.on('file-error', warnFileError);
  scanner.on('scan-complete', (stats) => {
    console.log('\n📊 Scan Results:');
    console.log(LINE);
    console.log(`Total files: ${stats.totalFiles}`);
    console.log(`Total size: ${formatSize(stats.totalSize)}`);

    if (stats.totalFiles === 0) return;

    console.log('\nBy File Type:');
    [...stats.byType.entries()]
      .sort((a, b) => b[1].totalSize - a[1].totalSize)
      .forEach(([ext, { count, totalSize }]) => {
        console.log(
          `  ${ext.padEnd(9)} ${String(count).padStart(4)} files  ${formatSize(totalSize).padStart(9)}`
        );
      });

    console.log('\nFile Age:');
    console.log(`  Last 7 days:    ${stats.age.last7} files`);
    console.log(`  Last 30 days:   ${stats.age.last30} files`);
    console.log(`  Older than 90:  ${stats.age.olderThan90} files`);

    console.log('\nLargest files:');
    stats.largest.forEach((file, i) => {
      console.log(`  ${i + 1}. ${file.name.padEnd(25)} ${formatSize(file.size).padStart(9)}`);
    });

    console.log(
      `\nOldest file: ${stats.oldest.name} (modified ${stats.oldest.daysOld} days ago)`
    );
  });

  try {
    await scanner.scan(directory);
  } catch (error) {
    exitWithError(error, directory);
  }
}

async function runDuplicates(directory) {
  const finder = new DuplicateFinder();
  const baseDir = path.dirname(directory);

  finder.on('search-start', ({ directory }) => {
    console.log(`🔍 Searching for duplicates in: ${directory}`);
  });
  finder.on('file-processed', ({ current, total }) => {
    updateProgress('Calculating hashes...', current, total, ' files');
  });
  finder.on('file-error', warnFileError);
  finder.on('duplicates-found', ({ groups, totalWasted }) => {
    if (groups.length === 0) {
      console.log('\n✅ No duplicates found.');
      return;
    }

    console.log(
      `\nFound ${groups.length} duplicate groups (${formatSize(totalWasted)} wasted):\n`
    );

    groups.forEach((group, i) => {
      console.log(LINE);
      console.log(
        `Group ${i + 1} (${group.files.length} copies, ${formatSize(group.size)} each):`
      );
      console.log(`  SHA-256: ${group.hash.slice(0, 12)}...\n`);
      group.files.forEach((file) => {
        console.log(`  📄 ${path.relative(baseDir, file)}`);
      });
      console.log(`\n  Wasted space: ${formatSize(group.wasted)}\n`);
    });

    console.log(LINE);
    console.log(`💾 Total wasted space: ${formatSize(totalWasted)}`);
  });

  try {
    await finder.find(directory);
  } catch (error) {
    exitWithError(error, directory);
  }
}

async function runOrganize(source, target) {
  if (!target) {
    console.error('❌ Error: --output <target directory> is required for organize.');
    printHelp();
    process.exit(1);
  }

  const organizer = new Organizer();
  const errors = [];

  organizer.on('organize-start', ({ source, target }) => {
    console.log(`📦 Organizing: ${source}`);
    console.log(`Target: ${target}\n`);
    console.log('Creating folders...');
  });
  organizer.on('folder-created', ({ category }) => {
    console.log(`  ✓ ${category}/`);
  });
  organizer.on('copy-start', ({ current }) => {
    if (current === 1) console.log('');
  });
  organizer.on('copy-complete', ({ current, total }) => {
    updateProgress('Copying files...', current, total);
  });
  organizer.on('copy-error', (data) => {
    errors.push(data);
    if (data.current) updateProgress('Copying files...', data.current, data.total);
  });
  organizer.on('organize-complete', ({ target, summary, totalCopied, totalSize }) => {
    errors.forEach(warnFileError);
    console.log('\n✅ Organization complete!\n');
    console.log('Summary:');
    const targetName = path.basename(target);
    Object.keys(categories).forEach((category) => {
      const label = `${category}:`.padEnd(11);
      console.log(
        `  ${label}${String(summary[category]).padStart(4)} files → ${targetName}/${category}/`
      );
    });
    console.log(`\nTotal copied: ${totalCopied} files (${formatSize(totalSize)})`);
  });

  try {
    await organizer.organize(source, target);
  } catch (error) {
    exitWithError(error, target);
  }
}

async function runCleanup(directory, args) {
  const rawDays = getFlagValue(args, '--older-than');
  const threshold = Number(rawDays);
  const confirm = args.includes('--confirm');

  if (rawDays === undefined || Number.isNaN(threshold) || threshold < 0) {
    console.error('❌ Error: --older-than <days> must be a non-negative number.');
    printHelp();
    process.exit(1);
  }

  const cleanup = new Cleanup();

  cleanup.on('search-start', ({ directory, threshold }) => {
    console.log(`🧹 Cleanup: ${directory}`);
    console.log(`Looking for files older than ${threshold} days...\n`);
  });
  cleanup.on('file-error', warnFileError);
  cleanup.on('file-deleted', ({ current, total }) => {
    updateProgress('Deleting...', current, total);
  });
  cleanup.on('cleanup-complete', ({ deletedCount, freedSize }) => {
    console.log('\n✅ Cleanup complete!');
    console.log(`Deleted: ${deletedCount} files (${formatSize(freedSize)} freed)`);
  });

  let oldFiles;
  try {
    oldFiles = await cleanup.findOldFiles(directory, threshold);
  } catch (error) {
    exitWithError(error, directory);
  }

  if (oldFiles.length === 0) {
    console.log('✅ No files older than the threshold were found.');
    return;
  }

  const totalSize = oldFiles.reduce((sum, f) => sum + f.size, 0);
  const SHOW_LIMIT = 10;

  console.log(`Found ${oldFiles.length} files to delete:\n`);
  console.log(LINE);
  oldFiles.slice(0, SHOW_LIMIT).forEach((file) => {
    console.log(path.relative(directory, file.path));
    console.log(`  Size: ${formatSize(file.size)}`);
    console.log(`  Modified: ${file.daysOld} days ago (${formatDate(file.mtime)})\n`);
  });
  if (oldFiles.length > SHOW_LIMIT) {
    console.log(`... (${oldFiles.length - SHOW_LIMIT} more files)`);
  }
  console.log(LINE);
  console.log(`\nTotal: ${oldFiles.length} files (${formatSize(totalSize)})\n`);

  if (!confirm) {
    console.log('⚠️  DRY RUN MODE: No files were deleted.');
    console.log('To actually delete these files, run with --confirm flag.');
    return;
  }

  console.log(
    `⚠️  DELETING ${oldFiles.length} files (${formatSize(totalSize)}). This action cannot be undone!\n`
  );
  await cleanup.deleteFiles(oldFiles);
}

// ---------- entry point ----------

async function main() {
  const [command, targetPath, ...rest] = process.argv.slice(2);

  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  const commands = ['scan', 'duplicates', 'organize', 'cleanup'];
  if (!commands.includes(command)) {
    console.error(`❌ Error: Unknown command "${command}"`);
    printHelp();
    process.exit(1);
  }

  const directory = await validateDirectory(targetPath);

  switch (command) {
    case 'scan':
      await runScan(directory);
      break;
    case 'duplicates':
      await runDuplicates(directory);
      break;
    case 'organize':
      await runOrganize(directory, getFlagValue(rest, '--output'));
      break;
    case 'cleanup':
      await runCleanup(directory, rest);
      break;
  }
}

main().catch((error) => {
  console.error(`❌ Unexpected error: ${error.message}`);
  process.exit(1);
});