const path = require('path');
const dotenv = require('dotenv');
const sharp = require('sharp');
const got = require('got');

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
    /*const response = await got.post('https://api.tarkov.dev/graphql', {
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
                        defaultWidth
                        defaultHeight
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
    }).filter(Boolean);*/
    const response = await got.post('https://api.tarkov.dev/graphql', {
        body: JSON.stringify({query: `{
            tasks {
                objectives {
                    ...on TaskObjectiveQuestItem {
                        questItem {
                            id
                            name
                            shortName
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
    const items = response.data.tasks.reduce((questItems, task) => {
        for (const objective of task.objectives) {
            if (!objective.questItem) {
                continue;
            }
            if (questItems.some(questItem => questItem.id === objective.questItem.id)) {
                continue;
            }
            objective.questItem.types = [];
            objective.questItem.backgroundColor = 'yellow';
            questItems.push( objective.questItem);
        }
        return questItems;
    }, []);

    for (const item of items) {
        console.log(item.name);
        let id = item.id;
        if (item.types.includes('gun')) {
            for (const preset of Object.values(presets)) {
                if (preset.baseId === id && preset.default) {
                    id = preset.id;
                    break;
                }
            }
            item.width = item.properties.defaultWidth;
            item.height = item.properties.defaultHeight;
        }
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
