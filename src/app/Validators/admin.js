const { check, body, param, query } = require('express-validator');

exports.login = [
    body('identifier')
        .if(body('email').not().exists())
        .notEmpty()
        .isString(),
    body('password')
        .notEmpty()
        .isString()
];