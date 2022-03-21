const fs = require('fs');
const path = require('path');

const got = require('got');
const FormData = require('form-data');

const ENDPOINT = 'https:///manager.tarkov.dev/suggest-image';

const maxSimultaneousUploads = 1;

module.exports = async (options) => {
    const uploadFiles = fs.readdirSync(path.join('./', 'generated-images-missing'));

    let currentUploads = [];
    if (uploadFiles.length == 0) return 0;
    for(const filename of uploadFiles){
        const form = new FormData();
        const matches = filename.match(/(?<id>.{24})-(?<type>.+?)\.(?:jpg|png)/);

        if(!matches){
            console.log(`Found junkfile ${filename}, skipping`);

            continue;
        }
        if (!options.response.uploaded[matches.groups.id]) options.response.uploaded[matches.groups.id] = [];
        if (!options.response.uploadErrors[matches.groups.id]) options.response.uploadErrors[matches.groups.id] = [];

        form.append('id', matches.groups.id);
        form.append('type', matches.groups.type);
        form.append(matches.groups.type, fs.createReadStream(path.join('./', 'generated-images-missing', filename)));

        console.log(`Uploading new ${matches.groups.type} for ${matches.groups.id}`);

        const upload = got.post(ENDPOINT, {
            body: form,
        }).then(() => {
            options.response.uploaded[matches.groups.id].push(matches.groups.type.replace('-', ' '));
        }).catch(error => {
            options.response.uploadErrors[matches.groups.id].push(error);
            if(!error.response){
                console.log(error);
            } else {
                console.log(error.response.statusCode);
                console.log(error.response.body);
            }
        });
        currentUploads.push(upload);
        if (currentUploads.length >= maxSimultaneousUploads) {
            await Promise.allSettled(currentUploads);
            currentUploads = [];
        }
    }
};

