import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';

const DAY_MS = 1000 * 60 * 60 * 24;

class Scanner extends EventEmitter {
  async getFiles(directory) {
    const entries = await fs.readdir(directory, { recursive: true });
    const files = [];

    for (const entry of entries) {
      const fullPath = path.join(directory, entry);
      try {
        const stats = await fs.stat(fullPath);
        if (stats.isFile()) {
          files.push({
            path: fullPath,
            name: path.basename(fullPath),
            size: stats.size,
            mtime: stats.mtime,
          });
        }
      } catch (error) {
        this.emit('file-error', { path: fullPath, error });
      }
    }

    return files;
  }

  async scan(directory) {
    this.emit('scan-start', { directory });

    const files = await this.getFiles(directory);
    const now = Date.now();

    const statistics = {
      totalFiles: files.length,
      totalSize: 0,
      byType: new Map(),
      age: { last7: 0, last30: 0, olderThan90: 0 },
      largest: [],
      oldest: null,
    };

    files.forEach((file, index) => {
      statistics.totalSize += file.size;

      const ext = path.extname(file.name).toLowerCase() || '(no ext)';
      const typeStats = statistics.byType.get(ext) || { count: 0, totalSize: 0 };
      typeStats.count += 1;
      typeStats.totalSize += file.size;
      statistics.byType.set(ext, typeStats);

      const daysOld = (now - file.mtime.getTime()) / DAY_MS;
      if (daysOld <= 7) statistics.age.last7 += 1;
      if (daysOld <= 30) statistics.age.last30 += 1;
      if (daysOld > 90) statistics.age.olderThan90 += 1;

      if (!statistics.oldest || file.mtime < statistics.oldest.mtime) {
        statistics.oldest = { ...file, daysOld: Math.floor(daysOld) };
      }

      this.emit('file-found', { ...file, current: index + 1, total: files.length });
    });

    statistics.largest = [...files].sort((a, b) => b.size - a.size).slice(0, 3);

    this.emit('scan-complete', statistics);
    return statistics;
  }
}

export default Scanner;