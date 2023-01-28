const path = require('path');
const dotenv = require('dotenv');
const sharp = require('sharp');
const got = require('got');

dotenv.config();

const imageFunctions = require('./image-functions');
const api = require('./scanner-api');

(async () => {
    if (!process.env.HQ_IMAGE_DIR) {
        console.log('Must set HQ_IMG_DIR env var');
        return;
    }
    const response = await got.post('https://api.tarkov.dev/graphql', {
        body: JSON.stringify({query: `{
            items {
                id
                name
                shortName
                iconLink
                gridImageLink
                baseImageLink
                inspectImageLink
                image512pxLink
                image8xLink
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
                        defaultPreset {
                            id
                            width
                            height
                        }
                    }
                }
            }
        }`}),
        responseType: 'json',
        resolveBodyOnly: true
    });

    const items = response.data.items.map(itemData => {
        if (itemData.types.includes('disabled')) {
            return false;
        }
        itemData.needsGridImage = false;
        itemData.needsIconImage = false;
        itemData.needsBaseImage = false;
        itemData.needsInspectImage = false;
        itemData.needs512pxImage = false;
        itemData.needs8xImage = false;
        if (itemData.gridImageLink.includes('unknown-item')) {
            itemData.needsGridImage = true;
        }
        if (itemData.iconLink.includes('unknown-item')) {
            itemData.needsIconImage = true;
        }
        if (itemData.baseImageLink.includes('unknown-item')) {
            itemData.needsBaseImage = true;
        }
        if (itemData.inspectImageLink.includes('unknown-item')) {
            itemData.needsInspectImage = true;
        }
        if (itemData.image512pxLink.includes('unknown-item')) {
            itemData.needs512pxImage = true;
        }
        if (itemData.image8xLink.includes('unknown-item')) {
            itemData.needs8xImage = true;
        }
        if (!itemData.needs8xImage) return false;
        return itemData;
    }).filter(Boolean);

    const questItemsResponse = await got.post('https://api.tarkov.dev/graphql', {
        body: JSON.stringify({query: `{
            questItems {
                id
                name
                shortName
                iconLink
                gridImageLink
                baseImageLink
                inspectImageLink
                image512pxLink
                image8xLink
                width
                height
            }
        }`}),
        responseType: 'json',
        resolveBodyOnly: true
    });

    for (const itemData of questItemsResponse.data.questItems) {
        itemData.types = ['quest'];
        itemData.backgroundColor = 'yellow';
        itemData.needsGridImage = false;
        itemData.needsIconImage = false;
        itemData.needsBaseImage = false;
        itemData.needsInspectImage = false;
        itemData.needs512pxImage = false;
        itemData.needs8xImage = false;
        if (itemData.gridImageLink.includes('unknown-item')) {
            itemData.needsGridImage = true;
        }
        if (itemData.iconLink.includes('unknown-item')) {
            itemData.needsIconImage = true;
        }
        if (itemData.baseImageLink.includes('unknown-item')) {
            itemData.needsBaseImage = true;
        }
        if (itemData.inspectImageLink.includes('unknown-item')) {
            itemData.needsInspectImage = true;
        }
        if (itemData.image512pxLink.includes('unknown-item')) {
            itemData.needs512pxImage = true;
        }
        if (itemData.image8xLink.includes('unknown-item')) {
            itemData.needs8xImage = true;
        }
        if (!itemData.needs8xImage) continue;
        items.push(itemData);
    }

    for (const item of items) {
        console.log(item.name);
        let id = item.id;
        const sourceImage = sharp(path.join(process.env.HQ_IMAGE_DIR, `${id}.png`));
        let success = false;
        while (!success) {
            try {
                await Promise.all([
                    imageFunctions.createIcon(sourceImage, item).then(iconImage => {
                        return api.submitImage(item.id, 'icon', iconImage.toBuffer(), true);
                    }),
                    imageFunctions.createGridImage(sourceImage, item).then(gridImage => {
                        return api.submitImage(item.id, 'grid-image', gridImage.toBuffer(), true);
                    }),
                    imageFunctions.createBaseImage(sourceImage, item).then(baseImage => {
                        return api.submitImage(item.id, 'base-image', baseImage.toBuffer(), true);
                    }),
                    imageFunctions.createInspectImage(sourceImage, item).then(inspectImage => {
                        return api.submitImage(item.id, 'image', inspectImage.toBuffer(), true);
                    }),
                    imageFunctions.create512Image(sourceImage, item).then(largeImage => {
                        return api.submitImage(item.id, '512', largeImage.toBuffer(), true);
                    }),
                    imageFunctions.create8xImage(sourceImage, item).then(xlImage => {
                        return api.submitImage(item.id, '8x', xlImage.toBuffer(), true);
                    }),
                ]);
                success = true;
            } catch (error) {
                if (error.message.includes('Input file is missing')) {
                    console.log(`Could not load source image for ${item.name} ${item.id}`);
                    success = true;
                    continue;
                }
                console.log(`Error processing image for ${item.name} ${item.id}`, error.message);
                break;
            }
        }
    }
})();
