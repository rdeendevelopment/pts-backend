const { check, body, param, query } = require('express-validator');

exports.login = [   
    body('email')
        .notEmpty()
        .isString(),
    body('password')
        .notEmpty()
        .isString()               
];