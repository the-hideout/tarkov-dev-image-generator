import { generateImages } from './generate.mjs';

(async () => {
    let targetItemId = false;
    let forceImage = false;
    for (let i = 2; i < process.argv.length; i++) {
        const arg = process.argv[i];
        if (arg == '-id') {
            if (process.argv.length > i+1) {
                targetItemId = process.argv[i+1];
            }
        } else if (arg == '-img' || arg == '-image') {
            if (process.argv.length > i+1) {
                forceImage = process.argv[i+1];
            }
        }
    }
    if (!targetItemId && process.argv[2] && process.argv[2].length == 24) {
        targetItemId = process.argv[2];
    }
    if (!forceImage && process.argv[3] && !isNaN(process.argv[3].length)) {
        forceImage = process.argv[3];
    }
    try {
        //await initializeImageGenerator({hashOnly: targetItemId});
        await generateImages({targetItemId: targetItemId, forceImageIndex: forceImage});
    } catch (error) {
        console.log(error);
    }
})();
