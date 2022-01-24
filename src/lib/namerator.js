const {createHmac, pseudoRandomBytes} = require('crypto');

const IV = pseudoRandomBytes(256);

const Generator = function GeneratorFactory() {
	return `${createHmac('md5', IV).update(pseudoRandomBytes(256)).digest('hex').slice(32 - 5)}-${createHmac('md5', IV).update(pseudoRandomBytes(256)).digest('hex').slice(32 - 6)}-${createHmac('md5', IV).update(pseudoRandomBytes(256)).digest('hex').slice(32 - 4)}`;
};

Generator.bulk = function BulkGenerator(amount = 10) {
	const generated_names = [];
	for (let Index = 0; Index < amount; Index++) {
		generated_names.push(Generator());
	}
	return generated_names;
};

module.exports = Generator;