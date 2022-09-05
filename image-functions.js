const fs = require('fs');
const path = require('path');
const Jimp = require('jimp-compact');

const fonts = {};

const colors = {
    violet: [
        '#271d2a',
        '#2c232f',
    ],
    grey: [
        '#191a1a',
        '#1e1e1e',
    ],
    yellow: [
        '#2f301d',
        '#343421',
    ],
    orange: [
        '#221611',
        '#261d14',
    ],
    green: [
        '#161c11',
        '#1a2314',
    ],
    red: [
        '#311c18',
        '#38221f',
    ],
    default: [
        '#363537',
        '#3a3c3b',
    ],
    black: [
        '#100f11',
        '#141614',
    ],
    blue: [
        '#1d262f',
        '#202d32',
    ],
};

const getChecks = (width, height, itemColors) => {
    const checks = new Jimp(width, height);
    checks.scan(0, 0, width, height, function(x, y) {
        checks.setPixelColor(Jimp.cssColorToHex(itemColors[(x + y) % 2]), x, y);
    });
    return checks;
};

const resizeToGrid = (image, item) => {
    if (item.width && item.height) {
        const properWidth = item.width > 1 ? (item.width * 64) - item.width+1 : 64;
        const properHeight = item.height > 1 ? (item.height * 64) - item.height+1 : 64;
        if (image.bitmap.width !== properWidth || image.bitmap.height !== properHeight) {
            return {width: properWidth, height: properHeight};
        }
    }
    return false;
};

const getFont = async (fontSize = 12) => {
    if (!fonts[fontSize]) {
        fonts[fontSize] = await Jimp.loadFont(path.join(__dirname, 'fonts', `Bender-Bold-${fontSize}.fnt`));
    }
    return fonts[fontSize];
};

const printText = async (image, text, fontSize = 12) => {
    if (!text) {
        return Promise.reject(new Error('You must provide text to print on the image'));
    }
    let font = await getFont(fontSize);
    const textWidth = Jimp.measureText(font, text);
    if (textWidth <= image.bitmap.width-2) {
        image.print(font, image.bitmap.width-textWidth-2, 2, {
            text: text,
            alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT,
            alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE
        });
        return true;
    }
    return false;
};

const createIcon = async (sourceImage, item) => {
    const itemColors = colors[item.backgroundColor];
    if (!itemColors){
        return Promise.reject(new Error(`No colors found for ${item.name} ${item.id}`));
    }

    if (typeof sourceImage === 'string') {
        sourceImage = await Jimp.read(sourceImage);
    } else {
        sourceImage = sourceImage.clone();
    }

    if (sourceImage.bitmap.width < 64 || sourceImage.bitmap.height < 64) {
        return Promise.reject(new Error(`Source image is ${sourceImage.bitmap.width}x${sourceImage.bitmap.height}; icon requires at least 64x64`));
    }

    const iconImage = getChecks(62, 62, itemColors);

    iconImage.composite(sourceImage.contain(64, 64).crop(1, 1, 62, 62), 0, 0);

    const iconPath = path.join('./', 'generated-images', `${item.id}-icon.jpg`);
    await iconImage.writeAsync(iconPath);
    return {path: iconPath, image: iconImage};
};

const createGridImage = async (sourceImage, item) => {
    const itemColors = colors[item.backgroundColor];
    if (!itemColors){
        return Promise.reject(new Error(`No colors found for ${item.name} ${item.id}`));
    }

    if (typeof sourceImage === 'string') {
        sourceImage = await Jimp.read(sourceImage);
    } else {
        sourceImage = sourceImage.clone();
    }

    const resize = resizeToGrid(sourceImage, item);
    if (resize) {
        //console.log(`Resizing ${item.name} ${item.id} from ${image.bitmap.width}x${image.bitmap.height} to ${resize.width}x${resize.height} for grid image`);
        if (sourceImage.bitmap.width < resize.width || sourceImage.bitmap.height < resize.height) {
            return Promise.reject(new Error(`Source image is ${sourceImage.bitmap.width}x${sourceImage.bitmap.height}; grid image requires at least ${resize.width}x${resize.height}`));
        }
        sourceImage.scaleToFit(resize.width, resize.height);
    }

    const gridImage = getChecks(sourceImage.bitmap.width, sourceImage.bitmap.height, itemColors);

    gridImage.composite(sourceImage, 0, 0);

    let shortName = String(item.shortName);
    if (shortName) {
        try {
            shortName = shortName.trim().replace(/\r/g, '').replace(/\n/g, '');
        } catch (error) {
            console.log(`Error trimming shortName ${shortName} for ${JSON.stringify(item)}`);
            shortName = false;
        }
    } else {
        console.log(`No shortName for ${JSON.stringify(item)}`);
    }
    if (shortName) {
        let namePrinted = false;
        // first we try to add the full shortName in font sized 12-10
        for (let fontSize = 12; !namePrinted && fontSize > 9; fontSize--) {
            namePrinted = await printText(gridImage, shortName, fontSize);
        }
        // if we haven't pritned the name, try truncating the shortName at the last
        // space or slash, whichever comes later
        let clippedName = shortName;
        while (!namePrinted && (clippedName.includes('/') || clippedName.includes(' '))) {
            const lastSpace = clippedName.lastIndexOf(' ');
            const lastSlash = clippedName.lastIndexOf('/');
            let cutoff = lastSpace;
            if (lastSlash > lastSpace) cutoff = lastSlash;
            if (cutoff == -1) break;
            clippedName = clippedName.substring(0, cutoff);
            for (let fontSize = 12; fontSize > 10 && !namePrinted; fontSize--) {
                namePrinted = await printText(gridImage, clippedName, fontSize);
            }
        }
        // if we still haven't printed the name, drop one letter at a time and try on
        // font sizes 12-10 until something fits
        while (!namePrinted && clippedName.length > 0) {
            clippedName = clippedName.substring(0, clippedName.length-1);
            for (let fontSize = 12; fontSize > 10 && !namePrinted; fontSize--) {
                namePrinted = await printText(gridImage, clippedName, fontSize);
            }
        }
        if (!namePrinted) {
            return Promise.reject(new Error(`Unable print shortName (${item.shortName}) on grid image for ${item.id}`));
        }
    }

    const gridImagePath = path.join('./', 'generated-images', `${item.id}-grid-image.jpg`);
    await gridImage.writeAsync(gridImagePath);

    return {path: gridImagePath, image: gridImage};
};

const createBaseImage = async (image, item) => {
    if (typeof image === 'string') {
        image = await Jimp.read(image);
    } else {
        image = image.clone();
    }

    const resize = resizeToGrid(image, item);
    if (resize) {
        //console.log(`Resizing ${item.name} ${item.id} from ${image.bitmap.width}x${image.bitmap.height} to ${resize.width}x${resize.height} for base image`);
        if (image.bitmap.width < resize.width || image.bitmap.height < resize.height) {
            return Promise.reject(new Error(`Source image is ${image.bitmap.width}x${image.bitmap.height}; base image requires at least ${resize.width}x${resize.height}`));
        }
        image.scaleToFit(resize.width, resize.height);
    }

    const baseImagePath = path.join('./', 'generated-images', `${item.id}-base-image.png`);
    await image.writeAsync(baseImagePath);

    return {path: baseImagePath, image: image};
};

const canCreateInspectImage = async (image) => {
    if (typeof image === 'string') image = await Jimp.read(image);
    if (image.bitmap.width >= 450 || image.bitmap.height >= 350) {
        return true;
    }
    return false;
};

const createInspectImage = async(sourceImage, item) => {
    if (typeof sourceImage === 'string') {
        sourceImage = await Jimp.read(sourceImage)
    } else {
        sourceImage = sourceImage.clone();
    }

    if (!await canCreateInspectImage(sourceImage)) {
        return Promise.reject(`Source image for ${item.name} ${item.id} is not large enough, must be at least 448px wide or tall`);
    }

    if (sourceImage.bitmap.width > 450 || sourceImage.bitmap.height > 350) {
        sourceImage.scaleToFit(450, 350);
    }

    const inspectImage = await Jimp.read(path.join(__dirname, 'background.png'));

    inspectImage.composite(sourceImage, 
        Math.round(inspectImage.bitmap.width/2)-Math.round(sourceImage.bitmap.width/2), 
        Math.round(inspectImage.bitmap.height/2)-Math.round(sourceImage.bitmap.height/2)
    );

    const inspectImagePath = path.join('./', 'generated-images', `${item.id}-image.jpg`);
    await inspectImage.writeAsync(inspectImagePath);

    return {path: inspectImagePath, image: inspectImage};
};

const canCreateLargeImage = async (image) => {
    if (typeof image === 'string') image = await Jimp.read(image);
    if (image.bitmap.width >= 512 || image.bitmap.height >= 512) {
        return true;
    }
    return false;
};

const createLargeImage = async(image, item) => {
    if (typeof image === 'string') {
        image = await Jimp.read(image)
    } else {
        image = image.clone();
    }

    if (!await canCreateLargeImage(image)) {
        return Promise.reject(`Source image for ${item.name} ${item.id} is not large enough, must be at least 512px wide or tall`);
    }

    if (image.bitmap.width > 512 || image.bitmap.height > 512) {
        image.scaleToFit(512, 512);
    }

    const largeImagePath = path.join('./', 'generated-images', `${item.id}-large.png`);
    await image.writeAsync(largeImagePath);

    return {path: largeImagePath, image: image};
};

module.exports = {
    colors: colors,
    createIcon: createIcon,
    createGridImage: createGridImage,
    createBaseImage: createBaseImage,
    createLargeImage: createLargeImage,
    createInspectImage: createInspectImage,
    canCreateLargeImage: canCreateLargeImage,
    canCreateInspectImage: canCreateInspectImage
};
