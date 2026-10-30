import { EventEmitter } from 'events';
import crypto from 'crypto';
import fs from 'fs';
import Scanner from './scanner.js';

function calculateHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

class DuplicateFinder extends EventEmitter {
  async find(directory) {
    this.emit('search-start', { directory });

    const scanner = new Scanner();
    scanner.on('file-error', (data) => this.emit('file-error', data));
    const files = await scanner.getFiles(directory);

    const hashMap = new Map();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const hash = await calculateHash(file.path);
        const group = hashMap.get(hash) || [];
        group.push(file);
        hashMap.set(hash, group);
      } catch (error) {
        this.emit('file-error', { path: file.path, error });
      }
      this.emit('file-processed', { path: file.path, current: i + 1, total: files.length });
    }

    const groups = [];
    let totalWasted = 0;

    for (const [hash, groupFiles] of hashMap) {
      if (groupFiles.length > 1) {
        const size = groupFiles[0].size;
        const wasted = size * (groupFiles.length - 1);
        totalWasted += wasted;
        groups.push({ hash, size, files: groupFiles.map((f) => f.path), wasted });
      }
    }

    groups.sort((a, b) => b.wasted - a.wasted);

    const result = { groups, totalWasted };
    this.emit('duplicates-found', result);
    return result;
  }
}

export default DuplicateFinder;