import { EventEmitter } from 'events';
import fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import path from 'path';
import Scanner from './scanner.js';

const LARGE_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const categories = {
  Documents: ['.pdf', '.docx', '.doc', '.txt', '.md', '.xlsx', '.pptx'],
  Images: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp'],
  Archives: ['.zip', '.rar', '.tar', '.gz', '.7z'],
  Code: ['.js', '.py', '.java', '.cpp', '.html', '.css', '.json'],
  Videos: ['.mp4', '.avi', '.mkv', '.mov', '.webm'],
  Other: [],
};

function getCategory(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  for (const [category, extensions] of Object.entries(categories)) {
    if (extensions.includes(ext)) return category;
  }
  return 'Other';
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// file.pdf -> file(1).pdf -> file(2).pdf ...
async function getUniquePath(targetPath) {
  if (!(await fileExists(targetPath))) return targetPath;

  const dir = path.dirname(targetPath);
  const ext = path.extname(targetPath);
  const base = path.basename(targetPath, ext);

  let counter = 1;
  let candidate;
  do {
    candidate = path.join(dir, `${base}(${counter})${ext}`);
    counter += 1;
  } while (await fileExists(candidate));

  return candidate;
}

class Organizer extends EventEmitter {
  async organize(sourceDir, targetDir) {
    const source = path.resolve(sourceDir);
    const target = path.resolve(targetDir);

    this.emit('organize-start', { source, target });

    for (const category of Object.keys(categories)) {
      await fs.mkdir(path.join(target, category), { recursive: true });
      this.emit('folder-created', { category });
    }

    const scanner = new Scanner();
    scanner.on('file-error', (data) => this.emit('copy-error', data));
    // do not copy the target folder into itself if it is inside source
    const files = (await scanner.getFiles(source)).filter(
      (file) => !file.path.startsWith(target + path.sep)
    );

    const summary = {};
    Object.keys(categories).forEach((c) => (summary[c] = 0));
    let totalCopied = 0;
    let totalSize = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const category = getCategory(file.path);
      const progress = { current: i + 1, total: files.length };

      this.emit('copy-start', { path: file.path, category, ...progress });

      try {
        const targetPath = await getUniquePath(path.join(target, category, file.name));

        if (file.size >= LARGE_FILE_SIZE) {
          await pipeline(createReadStream(file.path), createWriteStream(targetPath));
        } else {
          await fs.copyFile(file.path, targetPath);
        }

        summary[category] += 1;
        totalCopied += 1;
        totalSize += file.size;
        this.emit('copy-complete', {
          path: file.path,
          targetPath,
          category,
          usedStream: file.size >= LARGE_FILE_SIZE,
          ...progress,
        });
      } catch (error) {
        this.emit('copy-error', { path: file.path, error, ...progress });
      }
    }

    const result = { target, summary, totalCopied, totalSize };
    this.emit('organize-complete', result);
    return result;
  }
}

export default Organizer;