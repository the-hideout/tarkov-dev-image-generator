import path from 'node:path';
import fs from 'node:fs/promises';
import dotenv  from'dotenv';
import sharp from 'sharp';

dotenv.config();

import * as imageFunctions from'./image-functions.js';
import apiRequest from './api-request.mjs';
import api from './scanner-api.js';

const cloudflarePurgeLimit = 1000;

if (!process.env.HQ_IMAGE_DIR) {
    throw new Error('Must set HQ_IMG_DIR env var');
}
const imageFields = [];
for (const imageType in imageFunctions.imageSizes) {
    imageFields.push(imageFunctions.imageSizes[imageType].api);
}
const [items, questItems] = await Promise.all([
    apiRequest('regular/items', {lang: 'en'}).then(response => response.items),
    apiRequest('regular/tasks', {lang: 'en'}).then(response => response.questItems),
]);

for (const id in questItems) {
    const qItem = questItems[id];
    qItem.types = ['quest'];
    qItem.backgroundColor = 'yellow';
    items[id] = qItem;
}

await fs.mkdir('./generated-images').catch(error => {
    if (error.code === 'EEXIST') {
        return;
    }
    console.log('Error creating generated-images folder', error);
});

let purgeCount = 0;
const imageFiles = await fs.readdir(process.env.HQ_IMAGE_DIR);
for (let i = 0; i < imageFiles.length; i++) {
    const fileName = imageFiles[i];
    const id = fileName.split('.')[0];
    const item = items[id];
    if (!item) {
        console.log(`${i+1}/${imageFiles.length} No item found with id ${id}`);
        continue;
    }
    if (!item.image8xLink.includes('unknown')) {
        console.log(`${i+1}/${imageFiles.length} ${item.name} already has an 8x image`);
        continue;
    }
    console.log(`${i+1}/${imageFiles.length} ${item.name}`);
    const sourceImage = sharp(path.join(process.env.HQ_IMAGE_DIR, fileName));

    let success = false;
    while (!success) {
        if (purgeCount + 4 >= cloudflarePurgeLimit) {
            await new Promise(resolve => {
                setTimeout(() => {
                    purgeCount = 0;
                    resolve();
                }, 60000);
            });
        }
        try {
            const result = await api.submitImage(id, sourceImage, true).then(response => {
                if (response.data[0]?.purged) {
                    purgeCount++;
                }
                return response;
            });
            if (result.status === 'rejected') {
                console.log(result);
                throw result.reason;
            }
            success = true;
        } catch (error) {
            if (error.message.includes('Input file is missing')) {
                console.log(`Could not load source image for ${item.name} ${item.id}`);
                success = true;
                continue;
            }
            console.log(`Error processing image for ${item.name} ${item.id}`, error);
            console.log('Cloudflare purge count:', purgeCount);
            //break;
        }
    }
}
