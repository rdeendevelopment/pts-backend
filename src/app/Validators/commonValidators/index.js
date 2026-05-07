const { validationResult } = require('express-validator');


// send response of error messages
exports.responseValidationResults = async function (req, res, next) {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(422).json({ message: 'Invalid data' })
    } else {
        next();
    }
}