const path = require('path');
const dotenv = require('dotenv');
const Jimp = require('jimp-compact');
const sharp = require('sharp');

dotenv.config();

const imageFunctions = require('./image-functions');
const api = require('./scanner-api');
const getJson = require('./get-json');

(async () => {
    if (!process.env.HQ_IMAGE_DIR) {
        console.log('Must set HQ_IMG_DIR env var');
        return;
    }
    const foundBaseImages = JSON.parse((await got('https:///manager.tarkov.dev/data/existing-bases.json')).body);
    const presets = await getJson.td_presets();
    const response = await got.post('https://api.tarkov.dev/graphql', {
        body: JSON.stringify({query: `{
            items {
                id
                name
                shortName
                iconLink
                gridImageLink
                imageLink
                backgroundColor
                types
                width
                height
                properties {
                ...on ItemPropertiesPreset {
                    baseItem {
                        id
                    }
                }
                ...on ItemPropertiesWeapon {
                    slots {
                        name
                    }
                }
                }
            }
        }`}),
        responseType: 'json',
        resolveBodyOnly: true
    });

    const items = response.data.items.map(itemData => {
        if (itemData.types.includes('disabled')) return false;
        itemData.needsGridImage = false;
        itemData.needsIconImage = false;
        itemData.needsBaseImage = false;
        itemData.needsInspectImage = false;
        itemData.needsLargeImage = false;
        if (itemData.gridImageLink.includes('unknown-item')) {
            itemData.needsGridImage = true;
        }
        if (itemData.iconLink.includes('unknown-item')) {
            itemData.needsIconImage = true;
        }
        if (!foundBaseImages.includes(itemData.id)) {
            itemData.needsBaseImage = true;
        }
        if (itemData.imageLink.includes('unknown-item')) {
            itemData.needsInspectImage = true;
        }
        return itemData;
    }).filter(Boolean);
    
    for (const item of items) {
        let id = item.id;
        if (item.types.includes('gun')) {
            for (const preset of Object.values(presets)) {
                if (preset.baseId === id && preset.default) {
                    id = preset.id;
                    break;
                }
            }
        }
        const sourceImage = sharp(path.join(process.env.HQ_IMAGE_DIR, `${id}.png`)).catch(error => {
            return false;
        });
        if (!sourceImage) {
            console.log(`Could not load source image for ${item.name} ${item.id}`);
            continue;
        }
        let success = false;
        while (!success) {
            try {
                await Promise.all([
                    imageFunctions.createInspectImage(sourceImage, item).then(inspectImage => {
                        return api.submitImage(item.id, 'image', inspectImage.toBuffer());
                    }),
                    imageFunctions.create512Image(sourceImage, item).then(largeImage => {
                        return api.submitImage(item.id, '512', largeImage.toBuffer());
                    }),
                    imageFunctions.create8xImage(sourceImage, item).then(xlImage => {
                        return api.submitImage(item.id, '8x', xlImage.toBuffer());
                    }),
                ]);
                success = true;
            } catch (error) {
                console.log(`Error processing image for ${item.name} ${item.id}`, error);
                break;
            }
        }
        break;
    }
})();
