const fs = require('fs-extra');
const path = require('path');
const Image = require('./../../image.js');
const UtilsHelper = require('./../../helpers/utils');

let context = false;

process.on('message', function(msg){
    let mediaPath = false;
    let catalog = false;

    if(msg.type === 'dependencies') {
        context = msg.context;
        catalog = msg.catalog;
        mediaPath = msg.mediaPath;

        regenerateImages(mediaPath, catalog);
    }

    if(msg.type === 'next-images') {
        catalog = msg.catalog;
        mediaPath = msg.mediaPath;

        regenerateImages(mediaPath, catalog);
    }
});

/**
 * Regenerate images
 *
 * @param mediaPath
 * @param catalog
 */
function regenerateImages(mediaPath, catalog) {
    let fullPath = path.join(mediaPath, (catalog).toString());
    let images = fs.readdirSync(fullPath);

    images = images.filter(image => {
        let fullImagePath = path.join(fullPath, image);
        return isImage(image, fullImagePath);
    });

    if(!images.length) {
        process.send({
            type: 'empty'
        });

        return;
    }

    regenerateImage(images, fullPath, catalog);
}

/**
 * Regenerate recursively single images
 *
 * @param images
 * @param fullPath
 * @param catalog
 */
function regenerateImage(images, fullPath, catalog) {
    if(!images.length) {
        return;
    }

    let image = images.shift();
    let fullImagePath = path.join(fullPath, image);
    let imageHelper = new Image(context.application, {
        site: context.name,
        id: catalog,
        path: fullImagePath
    });

    let imageType = getImageType(context, image, catalog);
    let promises = imageHelper.createResponsiveImages(fullImagePath, imageType);

    if(!promises.length && context.totalProgress >= context.numberOfImages) {
        finishProcess();
        return;
    }

    if (promises) {
        Promise.all(promises).then(results => {
            // Send a +1 signal for the total progress
            context.totalProgress++;
            console.log('PROGRESS: ' + context.totalProgress, context.numberOfImages);

            process.send({
                type: 'progress',
                value: parseInt((context.totalProgress / context.numberOfImages) * 100),
                files: results
            });

            if(context.totalProgress >= context.numberOfImages) {
                finishProcess();
                return;
            }

            regenerateImage(images, fullPath, catalog);
        }).catch(err => {
            console.log(err);
            context.totalProgress++;
            regenerateImage(images, fullPath, catalog);
        });
    } else {
        context.totalProgress++;

        if (context.totalProgress >= context.numberOfImages) {
            finishProcess();
            return;
        } else {
            regenerateImage(images, fullPath, catalog);
        }
    }
}

/**
 * Detect if given filename is an image
 *
 * @param image
 * @param fullImagePath
 * @returns {boolean}
 * @private
 */
function isImage(image, fullImagePath) {
    if(image.substr(0, 1) === '.') {
        return false;
    }

    if(image === 'responsive') {
        return false;
    }

    if(image === 'gallery') {
        return false;
    }

    if(path.parse(image).ext === '') {
        return false;
    }

    if(UtilsHelper.dirExists(fullImagePath)) {
        return false;
    }

    return true;
}

/**
 * Detects image type
 *
 * @param context
 * @param image
 * @param catalog
 * @returns {string}
 * @private
 */
function getImageType(context, image, catalog) {
    let imageType = 'contentImages';
    let featuredImage = false;
    let preparedCatalog = catalog.replace('posts/', '');

    if(context.postImagesRef && context.postImagesRef[0]) {
        featuredImage = context.postImagesRef.filter(xref => xref.id == preparedCatalog);
    }

    if(featuredImage && featuredImage.id && image === featuredImage.url) {
        imageType = 'featuredImages';
    }

    if(catalog === 'website') {
        imageType = 'optionImages';
    }

    // Check if "gallery" is at the end of catalog path
    if(catalog.indexOf('gallery') === catalog.length - 7) {
        imageType = 'galleryImages';
    }

    return imageType;
}

/**
 * Ends the worker process
 *
 * @private
 */
function finishProcess() {
    process.send({
        type: 'finished'
    });

    setTimeout(function() {
        process.exit();
    }, 1000);
}
