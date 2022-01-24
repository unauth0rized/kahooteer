const vm = require('vm'), axios = require('axios'), random_useragent = require('random-useragent');

module.exports = class TokenUtil {
	static async RequestToken(pin)
	{
		return new Promise(async (resolve, reject) => {
			const success = (res) => {
				if (res.headers['x-kahoot-session-token']) {
					return resolve([Buffer.from(res.headers['x-kahoot-session-token'], 'base64').toString('utf8'), res.data]);
				} else {
					return reject('The game pin is invalid.');
				}
			}
			await axios.get(`https://kahoot.it/reserve/session/${pin}/?${Date.now()}`, {headers: {
				'User-Agent': random_useragent.getRandom(),
				'host': 'kahoot.it',
				'Origin': 'kahoot.it',
				'Referer': 'https://kahoot.it',
				'Accept-Language': 'en-US,en;q=0.8',
				'Accept': '*/*'
			}})
			.then(success)
			.catch((err) => {
				const { response: res } = err;
				if (res.status === 503) {
					const retry = async (err) => {
						const { response: res } = err;
						if (res.status === 503) {
							axios.get(`https://kahoot.it/reserve/session/${pin}/?${Date.now()}`, {headers: {
								'User-Agent': random_useragent.getRandom(),
								'host': 'kahoot.it',
								'Origin': 'kahoot.it',
								'Referer': 'https://kahoot.it',
								'Accept-Language': 'en-US,en;q=0.8',
								'Accept': '*/*'
							}}).then(success).catch(retry);
						}
					}

					setTimeout(() => axios.get(`https://kahoot.it/reserve/session/${pin}/?${Date.now()}`, {headers: {
						'User-Agent': random_useragent.getRandom(),
						'host': 'kahoot.it',
						'Origin': 'kahoot.it',
						'Referer': 'https://kahoot.it',
						'Accept-Language': 'en-US,en;q=0.8',
						'Accept': '*/*'
					}}).then(success).catch(retry), Math.ceil(Math.random() * 5) * 1000);
				} else {
					console.log(res.status)
					reject('No game associated with pin.')
				}
			});
		})
	}

	static async RequestChallenge(pin)
	{
		const res = await axios.get(`https://kahoot.it/rest/challenges/${pin}`, { headers: {
			'User-Agent': random_useragent.getRandom(),
			'host': 'kahoot.it',
			'Origin': 'kahoot.it',
			'Referer': 'https://kahoot.it',
			'Accept-Language': 'en-US,en;q=0.8',
			'Accept': '*/*'
		}});

		return Object.assign({
				IsChallenge: true,
				_2fa: false,
				data: res.data.kahoot,
				RawChallengeData: res.data.challenge
			},
			res.data.challenge.game_options
		)
	}

	static async SolveChallenge({ challenge })
	{
		challenge = challenge.replace(/(\u0009|\u2003)/mg, '');
		challenge = challenge.replace(/this /mg, 'this');
		challenge = challenge.replace(/ *\. */mg, '.');
		challenge = challenge.replace(/ *\( */mg, '(');
		challenge = challenge.replace(/ *\) */mg, ')');
		challenge = challenge.replace('console.', '');
		challenge = challenge.replace('this.angular.isObject(offset)', 'true');
		challenge = challenge.replace('this.angular.isString(offset)', 'true');
		challenge = challenge.replace('this.angular.isDate(offset)', 'true');
		challenge = challenge.replace('this.angular.isArray(offset)', 'true');

		const _code = (`var _ = {
			replace: function() {
				var args = arguments;
				var str = arguments[0];
				return str.replace(args[1], args[2]);
			}
		};
		var log = function(){}; result = ${challenge}`)

		// omg rce patchd!!!1
		const ctx = vm.createContext({ result: '?'});

		vm.runInContext(_code, ctx);

		return ctx.result;
	}

	static ApplyAlgorithm(A1, A2)
	{
		const R1 = [];

		for (let Index = 0; Index < A1.length; Index++) {
			const Value = A1.charCodeAt(Index);
			const S1 = A2.charCodeAt(Index % A2.length);
			R1.push(String.fromCharCode(Value ^ S1));
		}

		return R1.join('');
	}

	static async Resolve(pin)
	{

		if (pin.toString()[0] === '0') {
			return this.RequestChallenge(pin)
		}

		const [HeaderToken, EvalToken] = await this.RequestToken(pin);
		const SolvedEvalToken = await this.SolveChallenge(EvalToken);
		return new Promise(resolve => resolve({
			token: this.ApplyAlgorithm(HeaderToken, SolvedEvalToken),
			data: EvalToken
		}));
	}
}