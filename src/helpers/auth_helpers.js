// Libraries
const bcrypt = require('bcrypt');
var uuid = require('uuid');
var randomize = require('randomatic');
const jwt = require('jsonwebtoken');

// Models
// Constants
const app_constants = require("../../config/constants")

module.exports = {
    generateLoginInfo: async (userData, authProvider = 'jwt') => {
        return new Promise(async (resolve, reject) => {
            try {
                let accessToken = await jwt.sign({
                    user: {
                        id: userData.contact,
                        role: 'user',
                    }
                }, app_constants.APP_SECRET);

                let refreshToken = await bcrypt.hash(`${uuid.v4()}`, 10)
                if (!accessToken || !refreshToken) {
                    return reject(`Error: accessToken or refreshToken Couldn't be generated`)
                }


                return resolve({
                    accessToken,
                    refreshToken
                })

            } catch (error) {
                reject(error)
            }

        })
    },

    generateAdminLoginInfo: async (userData, authProvider = 'jwt') => {
        return new Promise(async (resolve, reject) => {
            try {
                const {id, type, role = null, email} = userData;
                let accessToken = await jwt.sign({
                    user: {
                        id: id,
                        role: type || role,
                        email: email
                    }
                }, app_constants.APP_SECRET);

                let refreshToken = await bcrypt.hash(`${uuid.v4()}`, 10)
                if (!accessToken || !refreshToken) {
                    return reject(`Error: accessToken or refreshToken Couldn't be generated`)
                }


                return resolve({
                    accessToken,
                    refreshToken
                })

            } catch (error) {
                reject(error)
            }

        })
    },
}