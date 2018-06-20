const { errors } = require('arsenal');

const { config } = require('../../../Config');
const { listLocationMetric, pushLocationMetric } =
    require('../../../utapi/utilities');

function _gbToBytes(gb) {
    return gb * 1024 * 1024 * 1024;
}

/**
 *
 * @param {number} newObjSize - new size to check against quota in bytes
 * @param {number} prevObjSize - old size of obj if existed, else null
 * @param {boolean} isDeleteMarker - true if delete marker
 * @param {string} location - name of location to check quota
 * @param {object} log - werelogs logger
 * @param {function} cb - callback function
 * @return {undefined}
 */
function locationStorageCheck(newObjSize, prevObjSize, isDeleteMarker, location,
log, cb) {
    const sizeLimitGB = config.locationConstraints[location].
        details.sizeLimitGB;
    const sizeDiff = newObjSize - prevObjSize;

    if (isDeleteMarker || sizeDiff === 0 || sizeLimitGB === undefined) {
        return cb();
    }
    // no need to list location metric, since it should be decreased
    if (sizeDiff < 0) {
        const posDiff = -sizeDiff;
        return pushLocationMetric(location, posDiff, 'decrby', log, cb);
    }
    return listLocationMetric(location, log, (err, bytesStored) => {
        if (err) {
            log.error(`Error listing metrics from Utapi: ${err.message}`);
            return cb(err);
        }
        const newStorageSize = bytesStored + sizeDiff;
        const sizeLimitBytes = _gbToBytes(sizeLimitGB);
        if (sizeLimitBytes < newStorageSize) {
            return cb(errors.AccessDenied.customizeDescription(
                `The assigned storage space limit for location ${location} ` +
                'will be exceeded'));
        }
        if ((newStorageSize / sizeLimitBytes) > 0.8) {
            log.warn(`${location} location storage space is above 80% ` +
                'capacity');
        }
        return pushLocationMetric(location, sizeDiff, 'incrby', log, cb);
    });
}

module.exports = locationStorageCheck;
