#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const process = require('process');
const EventEmitter = require('events');
const got = require('got');
const sharp = require('sharp');

const uploadImages = require('./upload-images');
const hashCalc = require('./hash-calculator');
const getJson = require('./get-json');
const imageFunctions = require('./image-functions');

let bsgData = false;
let presets = false;
let bsgPresets = false;
const itemsByHash = {};
const itemsById = {};

const iconCacheFolder = process.env.LOCALAPPDATA+'\\Temp\\Battlestate Games\\EscapeFromTarkov\\Icon Cache\\live\\'
let iconData = {};

const getIcon = async (filename, item, options) => {
    if (!item) {
        console.log(`No item provided for ${filename}`);
        return Promise.reject(new Error(`No item provided for ${filename}`));
    }

    const filepath = path.join(options.filePath || iconCacheFolder, filename);
    const sourceImage = sharp(filepath);
    const sourceMeta = await sourceImage.metadata();

    if (!options.response.generated[item.id]) options.response.generated[item.id] = [];
    if (!options.response.uploaded[item.id]) options.response.uploaded[item.id] = [];
    if (!options.response.uploadErrors[item.id]) options.response.uploadErrors[item.id] = [];

    // create base image
    const baseImagePromise = new Promise(resolve => {
        if (options.generateOnlyMissing && !item.needsBaseImage) {
            return resolve(false);
        }
        resolve(imageFunctions.createBaseImage(sourceImage, item).then(async baseImage => {
            const baseImagePath = path.join('./', 'generated-images', `${item.id}-base-image.png`);
            await baseImage.toFile(baseImagePath);
            options.response.generated[item.id].push('base');
            if (item.needsBaseImage && options.upload){
                console.log(`${item.id} should be uploaded for base-image`);
                fs.copyFileSync(result.path, path.join('./', 'generated-images-missing', `${item.id}-base-image.png`));
            }
            return {path: baseImagePath, type: 'base'};
        }));
    });

    // create icon
    const iconPromise = new Promise(resolve => {
        if (options.generateOnlyMissing && !item.needsIconImage) {
            return resolve(false);
        }
        resolve(imageFunctions.createIcon(sourceImage, item).then(async iconImage => {
            const iconPath = path.join('./', 'generated-images', `${item.id}-icon.jpg`);
            await iconImage.toFile(iconPath);
            options.response.generated[item.id].push('icon');
            if (item.needsIconImage && options.upload) {
                console.log(`${item.id} should be uploaded for icon`);
                fs.copyFileSync(iconPath, path.join('./', 'generated-images-missing', `${item.id}-icon.jpg`));
            }
            return {path: iconPath, type: 'icon'};
        }));
    });

    // create grid image
    const gridImagePromise = new Promise(resolve => {
        if (options.generateOnlyMissing && !item.needsGridImage) {
            return resolve(false);
        }
        resolve(imageFunctions.createGridImage(sourceImage, item).then(async gridImage => {
            const gridImagePath = path.join('./', 'generated-images', `${item.id}-grid-image.jpg`);
            await gridImage.toFile(gridImagePath);
            options.response.generated[item.id].push('grid image');
            if (item.needsGridImage && options.upload) {
                console.log(`${item.id} should be uploaded for grid-image`);
                fs.copyFileSync(gridImagePath, path.join('./', 'generated-images-missing', `${item.id}-grid-image.jpg`));
            }
            return {path: gridImagePath, type: 'grid'};
        }));
    });

    // create inspect image
    const inspectImagePromise = new Promise(resolve => {
        if (options.generateOnlyMissing && !item.needsInspectImage) {
            return resolve(false);
        }
        resolve(imageFunctions.createInspectImage(sourceImage, item).then(async inspectImage => {
            const inspectImagePath = path.join('./', 'generated-images', `${item.id}-image.jpg`);
            await inspectImage.toFile(inspectImagePath);
            options.response.generated[item.id].push('inspect image');
            if (item.needsInspectImage && options.upload) {
                console.log(`${item.id} should be uploaded for inspect image`);
                fs.copyFileSync(inspectImagePath, path.join('./', 'generated-images-missing', `${item.id}-image.jpg`));
            }
            return {path: inspectImagePath, type: 'image'};
        }).catch(error => {
            console.log(`Error creating inspect image for ${item.id}`, error);
            return false;
        }));
    });

    // create 512 image
    const largeImagePromise = new Promise(async resolve => {
        if (options.generateOnlyMissing && !item.needs512Image) {
            return resolve(false);
        }
        if (!await imageFunctions.canCreate512Image(sourceMeta)) {
            return resolve(false);
        }
        resolve(imageFunctions.create512Image(sourceImage, item).then(async largeImage => {
            const largeImagePath = path.join('./', 'generated-images', `${item.id}-512.webp`);
            await largeImage.toFile(largeImagePath);
            options.response.generated[item.id].push('512 image');
            if (item.needs512Image && options.upload) {
                console.log(`${item.id} should be uploaded for 512 image`);
                fs.copyFileSync(largeImagePath, path.join('./', 'generated-images-missing', `${item.id}-512.webp`));
            }
            return {path: largeImagePath, type: '512'};
        }).catch(error => {
            console.log(`Error creating 512 image for ${item.id}`, error);
            return false;
        }));
    });

    //create 8x image
    const xlImagePromise = new Promise(async resolve => {
        if (options.generateOnlyMissing && !item.needs8xImage) {
            return resolve(false);
        }
        if (!await imageFunctions.canCreate8xImage(sourceMeta, item)) {
            return resolve(false);
        }
        resolve(imageFunctions.create8xImage(sourceImage, item).then(async xlImage => {
            const imageFilename = imageFunctions.getImageName(item, '8x');
            const xlImagePath = path.join('./', 'generated-images', imageFilename);
            await xlImage.toFile(xlImagePath);
            options.response.generated[item.id].push('8x image');
            if (item.needs8xImage && options.upload) {
                console.log(`${item.id} should be uploaded for 8x image`);
                fs.copyFileSync(xlImagePath, path.join('./', 'generated-images-missing', imageFilename));
            }
            return {path: xlImagePath, type: '8x'};
        }).catch (error => {
            console.log(`Error creating 8x image for ${item.id}`, error);
        }));
    });

    return Promise.all([baseImagePromise, iconPromise, gridImagePromise, largeImagePromise, inspectImagePromise, xlImagePromise]).then(results => {
        return results.filter(Boolean);
    }).catch(error => {
        console.log(error);
    });
}

const cacheListener = new EventEmitter();
const refreshCache = () => {
    iconData = JSON.parse(fs.readFileSync(iconCacheFolder+'index.json', 'utf8'));
    cacheListener.emit('refresh');
};

const cacheChanged = (timeoutMs) => {
    return new Promise((resolve, reject) => {
        let timeoutId = false;
        cacheListener.once('refresh', () => {
            if (timeoutId) clearTimeout(timeoutId);
            resolve(new Date());
        });
        if (timeoutMs) {
            timeoutId = setTimeout(() => {
                reject(new Error(`Cache did not update in ${timeoutMs}ms`));
            }, timeoutMs);
        }
    });
};

const cacheIsLoaded = () => {
    for (let key in iconData) {
        if (iconData.hasOwnProperty(key)) {
            return true;
        }
    }
    return false;
};

const loadBsgData = async (options) => {
    if (options && options.bsgItems) {
        bsgData = options.bsgItems;
        return;
    }
    bsgData = await getJson.items();
};

const loadPresets = async (options) => {
    if (options && options.tdPresets) {
        presets = options.tdPresets;
        return;
    }
    presets = await getJson.td_presets();
};

const loadBsgPresets = async (options) => {
    if (options && options.bsgPresets) {
        bsgPresets = options.bsgPresets;
        return;
    }
    bsgPresets = await getJson.presets();
};

const setBackgroundColor = (item) => {
    item.backgroundColor = 'default';
    if (bsgData && bsgData[item.id]) {
        if (bsgData[item.id]._props) {
            if (imageFunctions.colors[bsgData[item.id]._props.BackgroundColor]) {
                item.backgroundColor = bsgData[item.id]._props.BackgroundColor;
            }
        }
    }
};

const hashItems = async (options) => {
    defaultOptions = {
        targetItemId: false,
    };
    if (!options) options = {};
    options = {
        ...defaultOptions,
        ...options
    }
    try {
        let queryArgs = '';
        //let queryParams = 'type: any';
        if (options.targetItemId) {
            queryArgs = `(ids: ["${options.targetItemId}"])`;
        }
        const response = await got.post('https://api.tarkov.dev/graphql', {
            body: JSON.stringify({query: `{
                items${queryArgs} {
                  id
                  name
                  shortName
                  iconLink
                  gridImageLink
                  imageLink
                  baseImageLink
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
                        slots {
                            name
                        }
                    }
                  }
                }
              }`
            }),
            responseType: 'json',
            resolveBodyOnly: true
        });
        let missingGridImage = 0;
        let missingIcon = 0;
        let missingBaseImage = 0;
        let missingInspectImage = 0;
        //response.data.items.forEach((itemData) => {
        for (let i = 0; i < response.data.items.length; i++) {
            const itemData = response.data.items[i];
            if (itemData.types.includes('disabled')) continue;
            itemData.needsGridImage = false;
            itemData.needsIconImage = false;
            itemData.needsBaseImage = false;
            itemData.needsInspectImage = false;
            itemData.needs512Image = false;
            itemData.needs8xImage = false;
            if (itemData.gridImageLink.includes('unknown-item')) {
                itemData.needsGridImage = true;
                missingGridImage++;
            }

            if (itemData.iconLink.includes('unknown-item')) {
                itemData.needsIconImage = true;
                missingIcon++;
            }
            if (itemData.baseImageLink.includes('unknown-item')) {
                itemData.needsBaseImage = true;
                missingBaseImage++;
            }
            if (itemData.imageLink.includes('unknown-item')) {
                itemData.needsInspectImage = true;
                missingInspectImage++;
            }
            if (itemData.image512pxLink.includes('unknown-item')) {
                itemData.needs512Image = true;
            }
            if (itemData.image8xLink.includes('unknown-item')) {
                itemData.needs8xImage = true;
            }
            //setBackgroundColor(itemData);

            try {
                const hash = hashCalc.getItemHash(itemData.id);
                itemData.hash = hash;
                itemsByHash[hash.toString()] = itemData;
            } catch (error) {
                console.log(`Error hashing ${itemData.id}: ${error}`);
            }
            itemsById[itemData.id] = itemData;
            if (itemData.id == options.targetItemId && itemData.hash) {
                console.log(itemData.hash);
                break;
            }
        };
        console.log(`${missingIcon} items missing icon`);
        console.log(`${missingGridImage} items missing grid image`);
        console.log(`${missingBaseImage} items missing base image`);
        console.log(`${missingInspectImage} items missing inspect image`);
    } catch (error) {
        return Promise.reject(error);
    }
};

const getItemWithHash = async (options) => {
    let item = false;
    if (options.targetItemId) {
        if (!itemsById[options.targetItemId]) {
            await hashItems(options);
        }
        item = itemsById[options.targetItemId];
    } else {
        item = options.item;
        options.targetItemId = item.id;
        if (!item.backgroundColor) {
            setBackgroundColor(item);
        }
        try {
            item.hash = hashCalc.getItemHash(item.id);
            if (!itemsByHash[item.hash.toString()]) {
                itemsByHash[item.hash.toString()] = item;
            }
        } catch (error) {
            console.log(`Error hashing ${item.id}: ${error}`);
        }
    }
    return item;
};

const getIconCacheNumberForItem = async (item, options) => {
    options = {
        cacheUpdateTimeout: 0,
        ...options
    };
    if ((Array.isArray(item.types) && (item.types.includes('gun') || item.types.includes('preset')))) {
        return Promise.reject(new Error('Cannot hash weapons and presets'));
    }
    const hash = item.hash;
    if (!hash) return Promise.reject(new Error(`Item ${item.id} has no hash`));
    if (!iconData[hash]) {
        await new Promise((resolve, reject) => {
            const cacheUpdateFunc = () => {
                if (iconData[hash]) {
                    clearTimeout(cacheUpdateTimeout);
                    cacheListener.off(cacheUpdateFunc);
                    resolve();
                }
            };
            const cacheUpdateTimeout = setTimeout(() => {
                if (iconData[hash]) {
                    cacheListener.off(cacheUpdateFunc);
                    return resolve();
                }
                reject(new Error(`Item ${item.id} hash ${hash} not found in cache`));
            }, options.cacheUpdateTimeout);
            cacheListener.on('refresh', cacheUpdateFunc);
        });
    }
    return iconData[hash];
};

const initialize = async (options) => {
    const defaultOptions = {
        skipHashing: false
    };
    if (typeof options !== 'object') options = {};
    const opts = {
        ...defaultOptions,
        ...options
    }
    if (options.API_USERNAME) process.env.API_USERNAME = options.API_USERNAME;
    if (options.API_PASSWORD) process.env.API_PASSWORD = options.API_PASSWORD;
    if (options.SCANNER_NAME) process.env.SCANNER_NAME = options.SCANNER_NAME;
    await loadBsgData(opts);
    await loadPresets(opts);
    await loadBsgPresets(opts);
    hashCalc.init(bsgData, bsgPresets, presets);
    if (!options.skipHashing) {
        await hashItems(opts);
    }
};

const generate = async (options, forceImageIndex) => {
    const defaultOptions = {
        targetItemId: false, 
        forceImageIndex: false, 
        generateOnlyMissing: false, 
        cacheUpdateTimeout: false,
        upload: true
    };
    if (!options) options = defaultOptions;
    if (typeof options === 'string') {
        options = {
            targetItemId: options
        };
    }
    if (forceImageIndex) {
        options.forceImageIndex = forceImageIndex;
        if (!options.targetItemId) {
            return Promise.reject(new Error('You must specify the target item id to use forceImageIndex'));
        }
    }
    options = {
        ...defaultOptions,
        ...options,
        response: {
            generated: {},
            uploaded: {},
            uploadErrors: {}
        }
    };
    if (!bsgData) {
        await loadBsgData(options);
    }
    if (!presets) {
        await loadPresets(options);
    }
    if (!bsgPresets) {
        await loadBsgPresets(options);
    }
    hashCalc.init(bsgData, bsgPresets, presets);
    if (!cacheIsLoaded()) {
        refreshCache();
    }
    try {
        const imgDir = path.join('./', 'generated-images');
        if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir);

        const missingImgDir = path.join('./', 'generated-images-missing');
        if (!fs.existsSync(missingImgDir)) {
            fs.mkdirSync(missingImgDir);
        } else {
            console.log('Removing old missing images...');
            const oldMissingFiles = fs.readdirSync(missingImgDir);
            for (let i = 0; i < oldMissingFiles.length; i++) {
                fs.unlink(path.join(missingImgDir, oldMissingFiles[i]), (err) => {
                    if (err) {
                        throw err;
                    }
                });
            }
        }

    } catch (mkdirError){
        // Do nothing
        console.log(mkdirError);
        return Promise.reject(mkdirError);
    }

    if (options.targetItemId || options.item) {
        let item = await getItemWithHash(options);
        if (!item) return Promise.reject(new Error(`Item ${options.targetItemId || options.item.id} is unknown`));
        let fileName = `${options.forceImageIndex}.png`;
        if (!options.forceImageIndex) {
            const hash = item.hash;
            if (!hash) return Promise.reject(new Error(`Item ${options.targetItemId || options.item.id} has no hash`));
            fileName = `${await getIconCacheNumberForItem(item, options)}.png`;
        } 
        try {
            await getIcon(fileName, item, options);
        } catch (error) {
            console.log(error);
            return Promise.reject(error);
        }
    } else {
        await hashItems(options);
        const hashes = Object.keys(iconData);
        for (let i = 0; i < hashes.length; i++) {
            const hash = hashes[i];
            try {
                console.log(`Processing ${i + 1}/${hashes.length}`);
                if (!itemsByHash[hash]) {
                    continue;
                }
                if (itemsByHash[hash].types.includes('gun') || itemsByHash[hash].types.includes('preset')) {
                    continue;
                }
                await getIcon(`${iconData[hash]}.png`, itemsByHash[hash], options);
            } catch (error) {
                console.log(error);
            }
        }
    }

    if (options.upload) {
        await uploadImages(options);
    }
    return options.response;
};

let watcher = false;
const watchIconCacheFolder = () => {
    if (watcher) watcher.close();
    watcher = fs.watch(iconCacheFolder, {persistent: false}, (eventType, filename) => {
        if (filename === 'index.json') {
            try {
                refreshCache();
            } catch (error) {
                console.log('Icon cache is missing');
            }
        }
    });
    watcher.on('error', () => {
        watcher.close();
        watcher = false;
        watchIconCacheFolderReady();
    });
};

let readyWatcher = false;
const watchIconCacheFolderReady = () => {
    if (readyWatcher) readyWatcher.close();
    const bsgTemp = process.env.LOCALAPPDATA+'\\Temp\\Battlestate Games';
    readyWatcher = fs.watch(bsgTemp, {persistent: false, recursive: true}, (eventType, filename) => {
        console.log(`${eventType} ${filename}`);
        if (filename === 'EscapeFromTarkov\\Icon Cache\\live\\index.json') {
            watchIconCacheFolder();
            readyWatcher.close();
            readyWatcher = false;
        }
    });
};

const startWatcher = () => {
    try {
        refreshCache();
    } catch (error) {
        console.log('Icon cache is missing');
    }
    try {
        watchIconCacheFolder();
    } catch (error) {
        watchIconCacheFolderReady();
    }
};

module.exports = {
    initializeImageGenerator: initialize,
    generateImages: generate,
    startWatchingCache: startWatcher,
    stopWatchingCache: () => {
        if (watcher) {
            watcher.close();
            watcher = false;
        }
        if (readyWatcher) {
            readyWatcher.close();
            readyWatcher = false;
        }
    },
    getImagesFromSource: getIcon,
    imageFunctions: imageFunctions,
    getIconCachePath: async (options) => {
        if (typeof options === 'string') 
            options = {targetItemId: options};
        let item = await getItemWithHash(options);
        if (!item) 
            return Promise.reject(new Error(`Item ${options.targetItemId || options.item.id} is unknown`));
        const hash = item.hash;
        if (!hash) 
            return Promise.reject(new Error(`Item ${options.targetItemId || options.item.id} has no hash`));
        const filename = `${await getIconCacheNumberForItem(item, options)}.png`;
        return path.join(options.filePath || iconCacheFolder, filename);
    }
};
