const bcrypt = require('bcrypt');
const uuid = require('uuid');

module.exports = {

	IsValidJSONString: function (str) {
		try {
			return JSON.parse(str);
		} catch (e) {
			return false;
		}
	},

	generateRefreshToken: async () => {
		return new Promise(async (resolve, reject) => {
			try {
				let value = await bcrypt.hash(`${uuid.v4()}`, 10)
				return resolve(value);
			} catch (error) {
				reject(error)
			}
		})
		// return crypto.randomBytes(40).toString('hex');
		// return uuid.v4();
	},

	validateReqData: function (reqData, validParams) {
		try {
			let errors = [];
			let isValid = true

			let reqKeys = Object.keys(reqData);

			try {
				validParams = JSON.parse(validParams).length ? JSON.parse(validParams) : []
			} catch (error) {
				validParams = []
			}


			validParams.map(validParam => {
				let reqKey = reqKeys.find(reqKey => reqKey === validParam.name)

				isValid = validParam.required && !reqKey ? false : isValid

				if (!isValid) {
					errors.push(`${validParam.name} is required`)
					return
				}

				isValid = reqKey && typeof reqData[reqKey] != validParam.type ? false : isValid

				if (!isValid) {
					errors.push(`${reqKey} should be ${validParam.type}`)
				}
			})



			return isValid
		} catch (error) {
			return Error(error)
		}
	},
}



