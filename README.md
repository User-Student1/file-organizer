# File Organizer CLI

A command-line tool built with Node.js that helps bring order to messy directories such as Downloads. It analyzes a directory, finds duplicate files by content, sorts files into categories and removes old files.

The project uses only built-in Node.js modules: fs, path, crypto, events and stream. No external dependencies are required.

## Features

- scan - recursive directory analysis: total files and size, statistics by file type, file age distribution, top 3 largest files and the oldest file
- duplicates - finds files with identical content using SHA-256 hashes calculated with streams
- organize - copies files into category folders (Documents, Images, Archives, Code, Videos, Other) without touching the originals
- cleanup - finds files older than N days, shows them in dry run mode and deletes them only with the --confirm flag

## Requirements

- Node.js 20.1.0 or higher (fs.readdir with the recursive option is used)
- npm

Check your version:

```bash
node --version
```

## Installation

```bash
git clone https://github.com/User-Student1/file-organizer.git
cd file-organizer
```

No npm install is needed because the project has no dependencies.

## Quick start

```bash
node file-organizer.js --help
node file-organizer.js scan ./Downloads
node file-organizer.js duplicates ./Downloads
node file-organizer.js organize ./Downloads --output ./Organized
node file-organizer.js cleanup ./Downloads --older-than 90
```

## Usage

General syntax:

```bash
node file-organizer.js <command> <directory> [options]
```

Every command can also be run with npm scripts. The double dash -- passes the arguments to the script:

```bash
npm run scan -- <directory>
npm run duplicates -- <directory>
npm run organize -- <source> --output <target>
npm run cleanup -- <directory> --older-than <days> [--confirm]
```

Both relative and absolute paths are supported, for example ./Downloads or C:\Users\Name\Downloads.

### 1. scan

Recursively scans a directory and all its subdirectories and prints detailed statistics.

```bash
node file-organizer.js scan ./test-data
```

Arguments:

- directory (required) - path to the directory to scan

The report includes:

- total number of files and their total size
- number of files and total size for every extension
- how many files were modified in the last 7 days, in the last 30 days and how many are older than 90 days
- top 3 largest files
- the oldest file and its age in days

Example output:

```
📂 Scanning: C:\Users\ITB\Documents\GitHub\file-organizer\test-data
Processing... ████████████████████ 10/10 files

📊 Scan Results:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total files: 10
Total size: 12.6 MB

By File Type:
  .mp4         1 files    12.0 MB
  .png         2 files   600.0 KB
  .pdf         3 files       45 B
  .docx        2 files       23 B
  .js          1 files       18 B
  .xyz         1 files       12 B

File Age:
  Last 7 days:    7 files
  Last 30 days:   8 files
  Older than 90:  2 files

Largest files:
  1. video_lecture.mp4           12.0 MB
  2. image.png                  300.0 KB
  3. image(1).png               300.0 KB

Oldest file: notes.xyz (modified 365 days ago)
```

### 2. duplicates

Finds files with exactly the same content, even if their names are different. A SHA-256 hash is calculated for every file with fs.createReadStream(), so files are read in small chunks and are never loaded into memory completely. fs.readFile() is not used.

```bash
node file-organizer.js duplicates ./test-data
```

Arguments:

- directory (required) - path to the directory to search

For every group the tool shows the hash, the paths of all copies and the wasted space. Wasted space = file size x (number of copies - 1), because one copy is treated as the original. Files with the same name but different content are not duplicates.

Example output:

```
🔍 Searching for duplicates in: C:\Users\ITB\Documents\GitHub\file-organizer\test-data
Calculating hashes... ████████████████████ 10/10 files

Found 2 duplicate groups (300.0 KB wasted):

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Group 1 (2 copies, 300.0 KB each):
  SHA-256: d1259e676891...

  📄 test-data\image.png
  📄 test-data\screenshots\image(1).png

  Wasted space: 300.0 KB

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Group 2 (3 copies, 15 B each):
  SHA-256: 1cbf6d97fc29...

  📄 test-data\lecture(1).pdf
  📄 test-data\lecture.pdf
  📄 test-data\backup\lecture_copy.pdf

  Wasted space: 30 B

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💾 Total wasted space: 300.0 KB
```

### 3. organize

Copies files from the source directory into category folders inside the target directory. The original files are not moved or deleted.

```bash
node file-organizer.js organize ./test-data --output ./organized
```

Arguments:

- source (required) - directory with the files to organize
- --output target (required) - directory where the category folders are created; it is created automatically if it does not exist

Categories:

| Category  | Extensions                           |
|-----------|--------------------------------------|
| Documents | .pdf .docx .doc .txt .md .xlsx .pptx |
| Images    | .png .jpg .jpeg .gif .svg .webp .bmp |
| Archives  | .zip .rar .tar .gz .7z               |
| Code      | .js .py .java .cpp .html .css .json  |
| Videos    | .mp4 .avi .mkv .mov .webm            |
| Other     | any other extension                  |

How copying works:

- files smaller than 10 MB are copied with fs.copyFile()
- files of 10 MB and larger are copied with streams using pipeline(createReadStream, createWriteStream) from stream/promises, which keeps memory usage low and handles backpressure
- existing files are never overwritten; a numeric suffix is added instead: file.pdf, file(1).pdf, file(2).pdf and so on

Example output:

```
📦 Organizing: C:\Users\ITB\Documents\GitHub\file-organizer\test-data
Target: C:\Users\ITB\Documents\GitHub\file-organizer\organized

Creating folders...
  ✓ Documents/
  ✓ Images/
  ✓ Archives/
  ✓ Code/
  ✓ Videos/
  ✓ Other/

Copying files... ████████████████████ 10/10

✅ Organization complete!

Summary:
  Documents:    5 files → organized/Documents/
  Images:       2 files → organized/Images/
  Archives:     0 files → organized/Archives/
  Code:         1 files → organized/Code/
  Videos:       1 files → organized/Videos/
  Other:        1 files → organized/Other/

Total copied: 10 files (12.6 MB)
```

Result of running organize twice (name conflicts are resolved with suffixes):

```
organized/Documents/lecture.pdf
organized/Documents/lecture(1).pdf
organized/Documents/lecture(2).pdf
organized/Videos/video_lecture.mp4
organized/Videos/video_lecture(1).mp4
```

### 4. cleanup

Finds files whose last modification date (mtime) is older than the given number of days.

Dry run mode - only shows the list, nothing is deleted:

```bash
node file-organizer.js cleanup ./test-data --older-than 90
```

Delete mode - shows the list and deletes the files:

```bash
node file-organizer.js cleanup ./test-data --older-than 90 --confirm
```

Arguments:

- directory (required) - directory to clean
- --older-than days (required) - age threshold in days, must be a non-negative number
- --confirm (optional) - actually delete the files; without this flag the command works in dry run mode

The list shows up to 10 files; the rest are summarized as "... (N more files)".

Example output (dry run):

```
🧹 Cleanup: C:\Users\ITB\Documents\GitHub\file-organizer\test-data
Looking for files older than 90 days...

Found 2 files to delete:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
notes.xyz
  Size: 12 B
  Modified: 365 days ago (2025-10-30)

report.docx
  Size: 6 B
  Modified: 120 days ago (2026-07-02)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total: 2 files (18 B)

⚠️  DRY RUN MODE: No files were deleted.
To actually delete these files, run with --confirm flag.
```

Example output (with --confirm):

```
⚠️  DELETING 2 files (18 B). This action cannot be undone!

Deleting... ████████████████████ 2/2

✅ Cleanup complete!
Deleted: 2 files (18 B freed)
```

## Error handling

All file system operations are wrapped in try...catch. Messages are based on the Node.js error code:

- ENOENT - file or directory not found
- EACCES / EPERM - permission denied
- ENOTDIR - the path is not a directory
- EISDIR - a directory was found where a file was expected
- EBUSY - the file is locked by another process
- ENOSPC - no space left on the device
- EEXIST - the file already exists
- any other code - "Unexpected error" with the original message

If the main directory cannot be read or the arguments are invalid, the program prints an error and exits with code 1. If a single file fails, for example because it is locked, it is skipped with a warning and the remaining files are still processed.

Examples:

```
node file-organizer.js scan ./no-such-folder
❌ Error: File or directory not found: ./no-such-folder

node file-organizer.js scan ./package.json
❌ Error: Not a directory: ./package.json

node file-organizer.js cleanup ./test-data
❌ Error: --older-than <days> must be a non-negative number.

node file-organizer.js organize ./test-data
❌ Error: --output <target directory> is required for organize.
```

## Architecture

Every command is a separate class that extends EventEmitter. The classes contain only the business logic and emit events. The entry point file-organizer.js subscribes to these events and handles all console output: progress bars, statistics and messages. Because of this separation the classes can be reused in other contexts, for example in a GUI or a web server.

| Class           | File              | Events                                                                                  |
|-----------------|-------------------|-----------------------------------------------------------------------------------------|
| Scanner         | lib/scanner.js    | scan-start, file-found, file-error, scan-complete                                       |
| DuplicateFinder | lib/duplicates.js | search-start, file-processed, file-error, duplicates-found                              |
| Organizer       | lib/organizer.js  | organize-start, folder-created, copy-start, copy-complete, copy-error, organize-complete |
| Cleanup         | lib/cleanup.js    | search-start, file-found, file-deleted, file-error, cleanup-complete                    |

## Project structure

```
file-organizer/
├── package.json        # project config, "type": "module" and npm scripts
├── .gitignore          # files excluded from Git
├── README.md           # documentation
├── file-organizer.js   # entry point: argument parsing, console output, progress bars, errors
└── lib/
    ├── scanner.js      # Scanner class - scan command, shared getFiles() method
    ├── duplicates.js   # DuplicateFinder class - duplicates command
    ├── organizer.js    # Organizer class - organize command
    └── cleanup.js      # Cleanup class - cleanup command
```

## Technologies

- Node.js with ES Modules
- fs/promises - readdir (recursive), stat, copyFile, mkdir, access, unlink
- fs streams and pipeline from stream/promises - reading and copying large files
- crypto - SHA-256 hashing
- events - EventEmitter
- path - join, extname, basename, relative, resolve
- process.argv - command line argument parsing