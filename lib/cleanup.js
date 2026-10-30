import { EventEmitter } from 'events';
import fs from 'fs/promises';
import Scanner from './scanner.js';

const DAY_MS = 1000 * 60 * 60 * 24;

class Cleanup extends EventEmitter {
  async findOldFiles(directory, threshold) {
    this.emit('search-start', { directory, threshold });

    const scanner = new Scanner();
    scanner.on('file-error', (data) => this.emit('file-error', data));
    const files = await scanner.getFiles(directory);

    const now = Date.now();
    const oldFiles = [];

    for (const file of files) {
      const fileAge = now - file.mtime.getTime();
      const daysOld = fileAge / DAY_MS;

      if (daysOld > threshold) {
        const oldFile = { ...file, daysOld: Math.floor(daysOld) };
        oldFiles.push(oldFile);
        this.emit('file-found', oldFile);
      }
    }

    oldFiles.sort((a, b) => b.daysOld - a.daysOld);
    return oldFiles;
  }

  async deleteFiles(files) {
    let deletedCount = 0;
    let freedSize = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        await fs.unlink(file.path);
        deletedCount += 1;
        freedSize += file.size;
        this.emit('file-deleted', { ...file, current: i + 1, total: files.length });
      } catch (error) {
        this.emit('file-error', { path: file.path, error, current: i + 1, total: files.length });
      }
    }

    const result = { deletedCount, freedSize };
    this.emit('cleanup-complete', result);
    return result;
  }
}

export default Cleanup;