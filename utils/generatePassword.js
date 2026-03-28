const crypto = require('crypto');
module.exports = (length = 16) => crypto.randomBytes(length).toString('hex').slice(0, length);