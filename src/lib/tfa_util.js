const combinations = [
	'0123',
	'0132',
	'0213',
	'0231',
	'0321',
	'0312',
	'1023',
	'1032',
	'1203',
	'1230',
	'1302',
	'1320',
	'2013',
	'2031',
	'2103',
	'2130',
	'2301',
	'2310',
	'3012',
	'3021',
	'3102',
	'3120',
	'3201',
	'3210',
];

module.exports = class TFAUtil {

	static start() {
		combinations.forEach((combination, index) => {
			const _ = setTimeout(() => {
				if (!this.LoggedIn) this.__TFALogin(combination);
				this.timeouts.splice(this.timeouts.indexOf(_), 1);
			}, index * 100);

			this.timeouts.push(_);
		})
	}

	static stop() {
		this.timeouts.forEach((timeout, idx) => {
			clearTimeout(timeout);
			this.timeouts.splice(idx, 1);
		})
	}
}