import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function copyAssets() {
    const src = path.resolve(__dirname, '../src/assets');
    const dest = path.resolve(__dirname, '../dist/assets');

    console.log(`Copying assets from ${src} to ${dest}`);
    try {
        await fs.copy(src, dest);
        console.log('Assets copied successfully.');
    } catch (err) {
        console.error('Error copying assets:', err);
        process.exit(1);
    }
}

copyAssets();
