import fs from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv'

import api from './scanner-api.mjs';

dotenv.config();

const maxSimultaneousUploads = 1;

module.exports = async (options) => {
    const uploadFiles = fs.readdirSync(path.join('./', 'generated-images-missing'));

    let currentUploads = [];
    if (uploadFiles.length == 0) return 0;
    if (!process.env.API_USERNAME || !process.env.API_PASSWORD) {
        console.log('API_USERNAME and API_PASSWORD must be set to upload images');
        return 0;
    }
    for(const filename of uploadFiles){
        const matches = filename.match(/(?<id>.{24})-(?<type>.+?)\.(?:jpg|png)/);

        if(!matches){
            console.log(`Found junkfile ${filename}, skipping`);
            continue;
        }
        if (!options.response.uploaded[matches.groups.id]) options.response.uploaded[matches.groups.id] = [];
        if (!options.response.uploadErrors[matches.groups.id]) options.response.uploadErrors[matches.groups.id] = [];

        console.log(`Uploading new ${matches.groups.type} for ${matches.groups.id}`);

        const upload = api.submitImage(matches.groups.id, matches.groups.type, path.join('./', 'generated-images-missing', filename)).then(response => {
            if (response.errors.length > 0) {return Promise.reject(new Error(response.errors[0]));}
            options.response.uploaded[matches.groups.id].push(matches.groups.type.replace('-', ' '));
        }).catch(error => {
            options.response.uploadErrors[matches.groups.id].push(error);
            console.log(error.message);
        });
        currentUploads.push(upload);
        if (currentUploads.length >= maxSimultaneousUploads) {
            await Promise.allSettled(currentUploads);
            currentUploads = [];
        }
    }
    if (currentUploads.length > 0) {
        await Promise.allSettled(currentUploads);
    }
};

