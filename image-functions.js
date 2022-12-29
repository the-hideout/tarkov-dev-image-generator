const path = require('path');
const Jimp = require('jimp-compact');
const sharp = require('sharp');

process.env.FONTCONFIG_PATH = path.join(__dirname, 'fonts');

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

const imageSizes = {
    icon: {
        append: 'icon',
        field: 'icon_link',
        format: 'jpg',
    },
    'base-image': {
        append: 'base-image',
        field: 'base_image_link',
        format: 'png'
    },
    'grid-image': {
        append: 'grid-image',
        field: 'grid_image_link',
        format: 'jpg'
    },
    image: {
        append: 'image',
        field: 'image_link',
        format: 'jpg'
    },
    '512': {
        append: '512',
        field: 'image_512_link',
        format: 'webp'
    },
    '8x': {
        append: '8x',
        field: 'image_8x_link',
        format: 'webp'
    },
};

const imageFormats = {
    jpg: {
        contentType: 'image/jpeg',
    },
    png: {
        contentType: 'image/png',
    },
    webp: {
        contentType: 'image/webp',
    }
};
for (const imgSize of Object.values(imageSizes)) {
    imgSize.contentType = imageFormats[imgSize.format].contentType;
}

const getSharp = async (input, clone = true) => {
    if (typeof input === 'string') {
        return sharp(input);
    }
    if (input.constructor.name === 'Jimp') {
        return sharp.clone();
    }
    if (!clone)
        return input;
    return sharp(await input.toBuffer());
}

const getShadow = async (image) => {
    image = (await Jimp.read(await image.toBuffer()));
    image.shadow({opacity: 0.8, size: 1, blur: 2, x: 0, y: 0});
    return sharp(await image.getBufferAsync(Jimp.AUTO));
};

const getChecks = async (width, height, itemColors) => {
    try {
        const pixels = [];
        let x = 0;
        let y = 0;
        while (pixels.length < width * height) {
            pixels.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${itemColors[(x + y) % 2]}"/>`);
            if (x < width -1) {
                x++;
            } else {
                x = 0;
                y++;
            }
        }
        const checks = Buffer.from(`
            <svg width="${width}" height="${height}">
                ${pixels.join('\n')}
            </svg>
        `);
        return sharp(checks).png();
    } catch (error) {
        console.log(error);
        return Promise.reject(error);
    }
};

const getItemGridSize = (item, baseImageMetadata) => {
    if (item.width && item.height) {
        return {width: (item.width * 63) + 1, height: (item.height * 63) + 1};
    }
    if (baseImageMetadata && baseImageMetadata.width && baseImageMetadata.height) {
        return {width: (baseImageMetadata.width - 1) / 63, height: (baseImageMetadata.height - 1) / 63};
    }
    return false;
};

const resizeToGrid = async (image, item) => {
    if (image.constructor.name === 'Sharp') {
        image = await image.metadata();
    } else {
        image = image.bitmap;
    }
    const gridSize = getItemGridSize(item);
    if (gridSize) {
        if (image.width !== gridSize.width || image.height !== gridSize.height) {
            return gridSize;
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

const getTextImage = async (metadata, text, fontSize = 12) => {
    if (!text) {
        return Promise.reject(new Error('You must provide text to print on the image'));
    }
    const svgText = `
        <svg>
            <style>
                .name-text {
                    font-size: ${fontSize}px;
                    font-family: Bender;
                    font-weight: bold;
                    paint-order: stroke;
                    stroke: #000000;
                    stroke-width: 2px;
                    stroke-linecap: butt;
                    stroke-linejoin: miter;
                }
            </style>
            <text x="0" y="9" fill="#a4aeb4" class="name-text">${text}</text>
        </svg>
    `;
    const textImg = sharp(Buffer.from(svgText)).png();
    const textMeta = await textImg.metadata();
    if (textMeta.width <= metadata.width-1) {
        return textImg;
    }
    return false;
    let font = await getFont(fontSize);
    const textWidth = Jimp.measureText(font, text);
    if (textWidth <= metadata.width-2) {
        const image = new Jimp(metadata.width, metadata.height);
        image.print(font, metadata.width-textWidth-2, 2, {
            text: text,
            alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT,
            alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE
        });
        return sharp(await image.getBufferAsync(Jimp.MIME_PNG));
    }
    return false;
};

const addImageMeta = (image, item, imageType) => {
    image.withMetadata({
        exif: {
            IFD0: {
                Software: 'tarkov-dev-image-generator',
                ID: item.id,
                Name: item.name,
                ShortName: item.shortName,
                ImageType: imageType,
                XPSubject: item.id,
                XPTitle: item.name,
                XPComment: item.shortName,
                XPKeywords: imageType,
            }
        }
    });
};

const createIcon = async (sourceImage, item) => {
    const itemColors = colors[item.backgroundColor];
    if (!itemColors){
        return Promise.reject(new Error(`No colors found for ${item.name} ${item.id}`));
    }

    sourceImage = await getSharp(sourceImage);
    const metadata = await sourceImage.metadata();

    if (metadata.width < 64 || metadata.height < 64) {
        return Promise.reject(new Error(`Source image is ${metadata.width}x${metadata.height}; icon requires at least 64x64`));
    }
    if (metadata.width !== 64 || metadata.height !== 64) {
        sourceImage = sourceImage.resize(64, 64, {fit: 'inside'});
    }
    sourceImage = await getShadow(sourceImage);
    sourceImage = await sourceImage.toBuffer();
    const icon = await getChecks(64, 64, itemColors).then(async background => {
        const buffer = await background.composite([{
            input: sourceImage,
        }]).toBuffer()
        return sharp(buffer);
    });
    //addImageMeta(icon, item, 'icon');
    return icon.jpeg({quality: 100, chromaSubsampling: '4:4:4'});
};

const createGridImage = async (sourceImage, item) => {
    const itemColors = colors[item.backgroundColor];
    if (!itemColors){
        return Promise.reject(new Error(`No colors found for ${item.name} ${item.id}`));
    }

    sourceImage = await getSharp(sourceImage);
    const metadata = await sourceImage.metadata();

    const gridSize = getItemGridSize(item, medatada);
    console.log(gridSize);
    if (metadata.width !== gridSize.width || metadata.height !== gridSize.height) {
        if (metadata.width < gridSize.width || metadata.height < gridSize.height) {
            return Promise.reject(new Error(`Source image is ${metadata.width}x${metadata.height}; grid image requires at least ${resize.width}x${resize.height}`));
        }
        sourceImage = sharp(await sourceImage.resize(gridSize.width, gridSize.height, {fit: 'inside'}).toBuffer());
    }
    sourceImage = await getShadow(sourceImage);

    let gridImage = await getChecks(gridSize.width, gridSize.height, itemColors);

    gridImage.composite([{input: await sourceImage.png().toBuffer()}]);

    let shortName = false;
    if (item.shortName) {
        try {
            shortName = String(item.shortName);
            if (item.types && item.types.includes('preset')) {
                shortName = shortName.replace(/ (?:Default|По умолчанию|Por defecto|Par défaut|Výchozí|Alapértelmezett)$/, '')
            }
            shortName = shortName.replace(/\r/g, '').replace(/\n/g, '').trim();
        } catch (error) {
            console.log(`Error trimming shortName ${shortName} for ${JSON.stringify(item)}`);
            shortName = false;
        }
    } else {
        console.log(`No shortName for ${JSON.stringify(item)}`);
    }
    if (shortName) {
        let textImage = false;
        // first we try to add the full shortName in font sized 12-10
        for (let fontSize = 12; !textImage && fontSize > 9; fontSize--) {
            textImage = await getTextImage(gridSize, shortName, fontSize);
        }
        // if we haven't pritned the name, try truncating the shortName at the last
        // space or slash, whichever comes later
        let clippedName = shortName;
        while (!textImage && (clippedName.includes('/') || clippedName.includes(' '))) {
            const lastSpace = clippedName.lastIndexOf(' ');
            const lastSlash = clippedName.lastIndexOf('/');
            let cutoff = lastSpace;
            if (lastSlash > lastSpace) cutoff = lastSlash;
            if (cutoff == -1) break;
            clippedName = clippedName.substring(0, cutoff);
            for (let fontSize = 12; fontSize > 10 && !textImage; fontSize--) {
                textImage = await getTextImage(gridSize, clippedName, fontSize);
            }
        }
        // if we still haven't printed the name, drop one letter at a time and try on
        // font sizes 12-10 until something fits
        while (!textImage && clippedName.length > 0) {
            clippedName = clippedName.substring(0, clippedName.length-1);
            for (let fontSize = 12; fontSize > 10 && !textImage; fontSize--) {
                textImage = await getTextImage(gridSize, clippedName, fontSize);
            }
        }
        if (!textImage) {
            return Promise.reject(new Error(`Unable print shortName (${item.shortName}) on grid image for ${item.id}`));
        }
        const textMeta = await textImage.metadata();
        gridImage = sharp(await gridImage.toBuffer()).composite([{
            input: await textImage.toBuffer(),
            top: 2,
            left: gridSize.width-textMeta.width-1
        }]);
    }

    return gridImage.jpeg({quality: 100, chromaSubsampling: '4:4:4'});
};

const createBaseImage = async (image, item) => {
    image = await getSharp(image);
    const metadata = await image.metadata();

    const resize = await resizeToGrid(image, item);
    if (resize) {
        if (metadata.width < resize.width || metadata.height < resize.height) {
            return Promise.reject(new Error(`Source image is ${metadata.width}x${metadata.height}; base image requires at least ${resize.width}x${resize.height}`));
        }
        image.resize(resize.width, resize.height, {fit: 'contain'});
    }

    return image.png({compressionLevel: 9});
};

const canCreateInspectImage = async (image) => {
    if (typeof image === 'string') {
        image = await (await getSharp(image)).metadata();
    } else if (typeof image === 'object') {
        if (image.constructor.name === 'Sharp') {
            image = await image.metadata();
        } else if (image.constructor.name === 'Jimp') {
            image = image.bitmap;
        }
    }
    if (image.width >= 512 || image.height >= 350) {
        return true;
    }
    return false;
};

const createInspectImage = async(sourceImage, item) => {
    sourceImage = await getSharp(sourceImage);
    const metadata = await sourceImage.metadata();

    if (!await canCreateInspectImage(metadata)) {
        return Promise.reject(new Error(`Source image for ${item.name} ${item.id} is not large enough; must be at least 512px wide or 350px tall`));
    }

    if (metadata.width > 512 || metadata.height > 350) {
        sourceImage.resize(512, 350, {fit: 'inside'});
    }

    const inspectImage = sharp(path.join(__dirname, 'background.png'));

    inspectImage.composite([{input: await sourceImage.toBuffer()}]);

    return inspectImage.jpeg({quality: 100});
};

const canCreate512Image = async (image) => {
    if (typeof image === 'string') {
        image = await (await getSharp(image)).metadata();
    } else if (typeof image === 'object') {
        if (image.constructor.name === 'Sharp') {
            image = await image.metadata();
        } else if (image.constructor.name === 'Jimp') {
            image = image.bitmap;
        }
    }
    if (image.width >= 512 || image.height >= 512) {
        return true;
    }
    return false;
};

const create512Image = async (image, item) => {
    image = await getSharp(image);
    const metadata = await image.metadata();

    if (!await canCreate512Image(metadata)) {
        return Promise.reject(new Error(`Source image for ${item.name} ${item.id} is not large enough; must be at least 512px wide or tall`));
    }

    if (metadata.width > 512 || metadata.height > 512) {
        image.resize(512, 512, {fit: 'inside'});
    }

    return image.webp({lossless: true});
};


const get8xSize = item => {
    const gridSize = getItemGridSize(item);
    if (gridSize) {
        return {width: gridSize.width * 8, height: gridSize.height * 8};
    }
    return false;
};

const canCreate8xImage = async (image, item) => {
    const targetSize = get8xSize(item);
    if (!targetSize) {
        return false;
    }
    if (typeof image === 'string') {
        image = await (await getSharp(image)).metadata();
    } else if (typeof image === 'object') {
        if (image.constructor.name === 'Sharp') {
            image = await image.metadata();
        } else if (image.constructor.name === 'Jimp') {
            image = image.bitmap;
        }
    }
    if (image.width === targetSize.width && image.height === targetSize.height) {
        return true;
    }
    return false;
};

const create8xImage = async (image, item) => {
    image = await getSharp(image);
    const metadata = await image.metadata();
    if (!await canCreate8xImage(image, item)) {
        const targetSize = get8xSize(item);
        return Promise.reject(new Error(`Source image for ${item.name} ${item.id} is a valid for 8x; it is ${metadata.width}x${metadata.height} but must be ${targetSize.width}x${targetSize.height}`));
    }
    return image.webp({lossless: true});
};

const getImageName = (item, imageSize) => {
    if (!imageSizes[imageSize]) {
        throw new Error(`${imageSize} is not a valid image size`);
    }
    return `${item.id}-${imageSizes[imageSize].append}.${imageSizes[imageSize].format}`;
};

module.exports = {
    colors: colors,
    imageSizes: imageSizes,
    createIcon: createIcon,
    createGridImage: createGridImage,
    createBaseImage: createBaseImage,
    createInspectImage: createInspectImage,
    create512Image: create512Image,
    create8xImage: create8xImage,
    canCreate512Image: canCreate512Image,
    canCreateInspectImage: canCreateInspectImage,
    get8xSize: get8xSize,
    canCreate8xImage: canCreate8xImage,
    getImageName: getImageName,
};
