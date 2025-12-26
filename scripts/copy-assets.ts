import fs from 'fs-extra';
import path from 'path';

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
