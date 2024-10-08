const path = require('path');
const dotenv = require('dotenv');
const sharp = require('sharp');
const got = require('got');

dotenv.config();

const imageFunctions = require('./image-functions');
const api = require('./scanner-api');

const cloudflarePurgeLimit = 1000;

(async () => {
    if (!process.env.HQ_IMAGE_DIR) {
        console.log('Must set HQ_IMG_DIR env var');
        return;
    }
    const imageFields = [];
    for (const imageType in imageFunctions.imageSizes) {
        imageFields.push(imageFunctions.imageSizes[imageType].api);
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

    let items = [];
    items.push(...response.data.items);
    items.push(...response.data.questItems.map(qItem => {
        qItem.types = ['quest'];
        qItem.backgroundColor = 'yellow';
        return qItem;
    }));
    items = items.map(itemData => {
        /*for (const imageField of imageFields) {
            if (itemData[imageField].includes('unknown-item')) {
                return itemData;
            }
        }
        return false;*/
        /*itemData.needsGridImage = false;
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
        }*/
        //if (!itemData.needs8xImage) return false;
        return itemData;
    }).filter(Boolean);

    let purgeCount = 0;
    for (let index = 0; index < items.length; index++) {
        const item = items[index];
        console.log(`${index+1}/${items.length} ${item.name}`);
        let id = item.id;
        const sourceImage = sharp(path.join(process.env.HQ_IMAGE_DIR, `${id}.png`));
        /*await Promise.all([
            imageFunctions.createIcon(sourceImage, item).then(image => {
                return image.toFile(`./generated-images/${item.id}-icon.webp`);
            }),
            imageFunctions.createGridImage(sourceImage, item).then(image => {
                return image.toFile(`./generated-images/${item.id}-grid-image.webp`);
            }),
            imageFunctions.createBaseImage(sourceImage, item).then(image => {
                return image.toFile(`./generated-images/${item.id}-base-image.webp`);
            }),
            imageFunctions.createInspectImage(sourceImage, item).then(image => {
                return image.toFile(`./generated-images/${item.id}-image.webp`);
            }),
            imageFunctions.create512Image(sourceImage, item).then(image => {
                return image.toFile(`./generated-images/${item.id}-512.webp`);
            }),
            imageFunctions.create8xImage(sourceImage, item).then(image => {
                return image.toFile(`./generated-images/${item.id}-8x.webp`);
            }),
        ]);*/
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
                const uploadResults = await Promise.allSettled([
                    imageFunctions.createIcon(sourceImage, item).then(iconImage => {
                        return api.submitImage(item.id, 'icon', iconImage.toBuffer(), true).then(response => {
                            if (response.data[0].purged) {
                                purgeCount++;
                            }
                            return response;
                        });
                    }),
                    imageFunctions.createGridImage(sourceImage, item).then(gridImage => {
                        return api.submitImage(item.id, 'grid-image', gridImage.toBuffer(), true).then(response => {
                            if (response.data[0].purged) {
                                purgeCount++;
                            }
                            return response;
                        });
                    }),
                    imageFunctions.createBaseImage(sourceImage, item).then(baseImage => {
                        return api.submitImage(item.id, 'base-image', baseImage.toBuffer(), true).then(response => {
                            if (response.data[0].purged) {
                                purgeCount++;
                            }
                            return response;
                        });
                    }),
                    imageFunctions.createInspectImage(sourceImage, item).then(inspectImage => {
                        return api.submitImage(item.id, 'image', inspectImage.toBuffer(), true).then(response => {
                            if (response.data[0].purged) {
                                purgeCount++;
                            }
                            return response;
                        });
                    }),
                    imageFunctions.create512Image(sourceImage, item).then(largeImage => {
                        return api.submitImage(item.id, '512', largeImage.toBuffer(), true).then(response => {
                            if (response.purged) {
                                purgeCount++;
                            }
                            return response;
                        });
                    }),
                    imageFunctions.create8xImage(sourceImage, item).then(xlImage => {
                        return api.submitImage(item.id, '8x', xlImage.toBuffer(), true).then(response => {
                            if (response.purged) {
                                purgeCount++;
                            }
                            return response;
                        });
                    }),
                ]);
                for (const result of uploadResults) {
                    if (result.status === 'rejected') {
                        console.log(result);
                        throw result.reason;
                    }
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
})();
