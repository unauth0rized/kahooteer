require('cometd-nodejs-client').adapt();

const { EventEmitter } = require('stream');
const { CometD } = require('cometd');
const namerator = require('./lib/namerator')
const Token = require('./lib/token');
const TFAUtil = require('./lib/tfa_util');
const uuid4 = require('uuid4');
const OpCodes = require('./data/opcodes');
const GameModes = require('./data/gamemodes');
const { getRandom: gen_ua } = require('random-useragent');
const { inspect } = require('util');

const { Question, Nemesis } = require('./lib/raw_api_types');

const random_screen_sizes = {
	w: [
		1280,
		1920,
		2560,
		3840
	],
	h: [
		720,
		1080,
		1440,
		2160
	]
};

Object.assign(random_screen_sizes, {
	_: Math.min(random_screen_sizes.w.length, random_screen_sizes.h.length)
});

const gen_ss = () => {
	let _ = Math.floor(Math.random() * random_screen_sizes._ + 1);
	const { w: widths, h: heights } = random_screen_sizes;
	const [w, h] = [widths[_], heights[_]];
	return { width: w, height: h };
}

const GatewayChannels = [
	'/service/status',
	'/service/player',
	'/service/controller'
];

const ChannelMap = new Map();

// Populate ChannelMap.

GatewayChannels.forEach((channel) => ChannelMap.set(channel.split('/').pop(), channel));

module.exports = class Client extends EventEmitter {
	GamePin = undefined;

	PlayerName = namerator();

	WebSocket = null;

	Identifier = uuid4();

	InstanceInformation = {
		TFA: undefined,
		GameId: undefined,
		ClientId: undefined,
		GameMode: undefined,
		Teammates: undefined
	}

	Stats = {
		Points: 0,
		Streak: 0,
		Multiplier: 1,
		Rank: -1,
	}

	QuizQuestionAnswers = undefined;

	BlockCount = undefined;

	CurrentBlock = undefined;

	Questions = [];

	CurrentQuestion = undefined;

	Nemesis = undefined;

	ForceTFA = false;

	ProvidedTeammates = [];

	timeouts = [];

	constructor(GamePin, PlayerName)
	{
		super();

		this.setMaxListeners(Infinity);

		this.GamePin = GamePin.includes('?pin=') ? new URL(GamePin).searchParams.get('pin') : GamePin;

		this.PlayerName = PlayerName ?? this.PlayerName;
	}

	async #Handshake() {
		return new Promise(async (resolve, reject) => {
			if (this.WebSocket === null) return reject(new Error('Socket is NULL.'));
			if (this.LoggedIn) return reject(new Error('Client is already in-game!'));
			if (this.WebSocket.websocketEnabled) return resolve();

			this.WebSocket.websocketEnabled = true;
			this.WebSocket.handshake((_) => {
				if (_.successful) {
					return resolve(_);
				}
				else {
					return reject(_.error);
				}
			});
		});
	}

	async Send(_channel, data) {
		return new Promise((resolve, _) => {
			if (this.WebSocket === null || this.WebSocket.isDisconnected()) {
				return _('Client is disconnected.');
			} else {
				const channel = ChannelMap.has(_channel) ? ChannelMap.get(_channel) : _channel;
				this.WebSocket.publish(channel, Object.assign({
					gameid: this.GamePin,
					host: 'kahoot.it'
				}, data), resolve);
			}
		})
	}

	async #ApplySubscriptions() {
		return new Promise((resolve, reject) => {
			if (this.WebSocket === null || this.WebSocket.isDisconnected()) {
				return reject('WebSocket is NULL or disconnected.')
			}
	
			GatewayChannels.forEach(async (channel, _) => {
				const event_name = channel.split('/').pop();
				this.WebSocket.subscribe(channel,
				(...args) => {
					this.emit(event_name, ...args);
				},
				() => {
					//console.log(`Handling channel '${channel}' as '${event_name}'.`);
				});
				if (_ === GatewayChannels.length - 1) resolve();
			});
		})
	}

	async Join()
	{
		return new Promise((resolve, reject) => {
			this.removeAllListeners();
			/*if (this.Left) {
				return reject('This client has left the session once, cannot rejoin.');
			}*/
			Token.Resolve(this.GamePin).then(
				async (GameInformation) =>
					{
						const WebSocketToken = GameInformation.token;

						this.InstanceInformation.TFA = GameInformation.data.twoFactorAuth || this.ForceTFA;

						this.InstanceInformation.GameId = GameInformation.data.liveGameId;

						this.InstanceInformation.GameMode = GameInformation.data.gameMode && GameInformation.data.gameMode === 'team' ? GameModes.Team : GameModes.Individual;

						if (this.WebSocket && !this.WebSocket.isDisconnected()) await (new Promise(resolve => this.WebSocket.disconnect(resolve)));

						this.WebSocket = new CometD();

						this.WebSocket.configure({
							url: `wss://kahoot.it/cometd/${this.GamePin}/${WebSocketToken}`
						})

						
						this.#Handshake().then(async () => {
							await this.#ApplySubscriptions();

							await this.#__init__();

							this.on('controller', async (Message) => {
								const { data } = Message;

								if (data?.type === 'loginResponse') {
									if (data?.error) {
										if (data.error === 'USER_INPUT') {
											this.PlayerName = namerator();
											setTimeout(() => {
												this.Send('controller', {
													content: JSON.stringify({
														device: { userAgent: gen_ua(), screen: gen_ss() }
													}),
													gameid: this.GamePin,
													name: this.PlayerName,
													type: 'login'
												})
											}, 1000 + Math.round(Math.random() * 1000));
										}
										else {
											reject(data.description ?? 'unknown');
										}
									}
									else {
										this.InstanceInformation.ClientId = data?.cid;
										if (!this.InstanceInformation.TFA || this.InstanceInformation.GameMode !== GameModes.Team) {
											return;
										} else return resolve(this);
									}
								}
							});

							if (this.InstanceInformation.TFA) {
								this.once('status', (Message) => {
									const { data: { status } } = Message;
									if (status === 'ACTIVE') {
										this.on('player', (Message) => {
											const { data: { id: OpCode = OpCodes.NOP } } = Message;

											if (OpCode === OpCodes.RESET_2FA && !this.LoggedIn) {
												TFAUtil.stop.call(this);
												TFAUtil.start.call(this);
											} else if (OpCode === OpCodes.CORRECT_2FA) {
												if (this.InstanceInformation.GameMode !== GameModes.Team) {
													this.LoggedIn = true;
													this.emit('ready');
													resolve(this);
												}
												TFAUtil.stop.call(this);
											} else if (OpCode === OpCodes.USERNAME_ACCEPTED) {
												TFAUtil.start.call(this);
											} else if (OpCode === OpCodes.NOP) {
												return reject('Failed to parse OpCode from gateway.');
											}
										})
									}
									else if (status === 'LOCKED') {
										return reject('This game session is locked for new players.');
									}
								})
							} else {
								this.once('status', async Message => {
									const { data: { status: Status } } = Message;

									if (Status === 'ACTIVE') {
										this.on('message', async Message => {
											const { OpCode } = Message;
											if (OpCode === OpCodes.USERNAME_ACCEPTED) {
												this.LoggedIn = true;
												this.emit('ready');
												return resolve(this);
											}
										});
									} else if (Status === 'LOCKED') {
										return reject('This game session is locked for new players.');
									}
								});
							}


							setTimeout(() => {
								this.Send('controller', {
									content: JSON.stringify({
										device: { userAgent: gen_ua(), screen: gen_ss() }
									}),
									gameid: this.GamePin,
									name: this.PlayerName,
									type: 'login'
								})
							}, 1000 + Math.round(Math.random() * 1000));

							if (this.InstanceInformation.GameMode === GameModes.Team) {
								this.on('player', async Message => {
									const { data: { type: Type = 'unknown', id: OpCode = OpCodes.NOP }, data } = Message;

									if (Type === 'message' && OpCode === OpCodes.JOIN_TEAM_RESPONSE) {
										if (data.error) {
											return reject(new Error(data.description ?? 'unknown reason'));
										} else {
											this.InstanceInformation.ClientId = data.cid;

											const Content = JSON.parse(data.content);

											this.InstanceInformation.Teammates = Content.memberNames;

											if (this.InstanceInformation.TFA) {
												this.on('player', async Message => {
													const { data: { id: OpCode = OpCodes.NOP } } = Message;

													if (OpCode === OpCodes.RESET_2FA && !this.LoggedIn) {
														TFAUtil.stop.call(this);
														TFAUtil.start.call(this);
													} else if (OpCode === OpCodes.CORRECT_2FA) {
														this.LoggedIn = true;
														this.emit('ready');
														TFAUtil.stop.call(this);
													} else if (OpCode === OpCodes.USERNAME_ACCEPTED) TFAUtil.start.call(this);
												})
											} else {
												this.LoggedIn = true;
												this.emit('ready');
												return resolve(this);
											}
										}
									}
								});
								this.on('message', async Message => {
									const { OpCode } = Message;
									if (OpCode === OpCodes.USERNAME_ACCEPTED) {
										const names = [this.PlayerName, ...this.ProvidedTeammates]; //namerator.bulk(199);
										
										setTimeout(async () => await this.Send('controller', {
											content: JSON.stringify(names),
											id: OpCodes.JOIN_TEAM,
											type: 'message'
										})
										.catch(reject), 1000)
									}
								});
							}
						})
						.catch(
							reject
						)
					}
			)
			.catch(
				reject
			)
		})
	}

	async Leave(reason = 'manual') {
		return new Promise(async (resolve, reject) => {
			if (this.WebSocket === null || this.WebSocket.isDisconnected())
			{
				return reject('Not connected to a game session.')
			}

			await this.Send('controller', {
				cid: this.InstanceInformation.ClientId, type: 'left'
			})
			.then(() => {
				this.LoggedIn = false;
				this.PlayerName = namerator();
				this.WebSocket.disconnect(resolve);
				this.emit('left', reason);
			})
			.catch(reject);
		})
	}

	async #SendMessage(OpCode = OpCodes.NOP, Content = {}) {
		return new Promise((resolve, reject) =>
			this.Send('controller', {
				type: 'message',
				id: OpCode,
				content: JSON.stringify(Content)
			})
				.then(resolve)
				.catch(reject)
		);
	}

	async __TFALogin(sequence) {
		return new Promise((resolve, reject) => this.#SendMessage(OpCodes.SUMBIT_2FA, { sequence }).then(resolve).catch(reject));
	}

	// haha python constructor go brrrrrrrr
	async #__init__() {
		// Convert primitive gateway objects to something more `sophisticated`.
		this.on('player', async Message => {
			const { data: { type: Type = 'unknown' } } = Message;

			switch(Type) {
				case 'message': {
					const { data: { id: OpCode = OpCodes.NOP, content: Content = '{}' } } = Message;

					this.emit('message', { OpCode, Content: JSON.parse(Content) });

					break;
				}

				default: break;
			}
		});

		this.on('status', async Message => {
			const { status: Status } = Message;

			if (Status === 'MISSING') await this.Leave('unexpected');
		});

		const ReversedOpCodes = {};

		Object.keys(OpCodes).forEach((Name) => {
			ReversedOpCodes[OpCodes[Name]] = Name;
		});

		this.on('message', async Message => {
			const { OpCode, Content } = Message;

			if (this.verbose) console.log(`OpCode: ${ReversedOpCodes[OpCode]}\nContent: ${inspect(Content, true, 100, true)}\n`);

			switch (OpCode) {
				case OpCodes.START_QUIZ:
					var { quizQuestionAnswers: QuizQuestionAnswers } = Content;

					this.QuizQuestionAnswers = QuizQuestionAnswers;
					break;
				case OpCodes.GET_READY:
					var { questionIndex: QuestionIndex, numberOfAnswersAllowed: AnswersAllowedCount, timeLeft: TimeLeft, currentQuestionAnswerCount: AnswerCount, numberOfChoices: AvaiableChoices, type: Type } = Content;

					var question = new Question(QuestionIndex);

					question.Client = this;

					question.AnswersAllowedCount = AnswersAllowedCount;

					question.GetReadyTime = TimeLeft;

					question.AnswerCount = AnswerCount;

					question.AvaiableChoices = AvaiableChoices;

					if (Content.title) question.Title = Content.title;
					if (Content.choices) question.Choices = Content.choices;

					question.Type = Type;

					this.BlockCount = Content.totalGameBlockCount;

					this.CurrentBlock = Content.gameBlockIndex;

					this.Questions.push(question);

					this.CurrentQuestion = question;

					this.emit('get_ready', question, QuestionIndex);
					break;

				case OpCodes.START_QUESTION:
					var { questionIndex: QuestionIndex } = Content;

					this.CurrentQuestion = this.Questions[QuestionIndex];

					if (this.CurrentQuestion) {
						var question = this.CurrentQuestion;
						question.TimeLeft = Content.timeLeft;
						if (Content.title) question.Title = Content.title;
						if (Content.choices) question.Choices = Content.choices;
					}

					// This should only pass if we have joined in an already running game.
					if (this.CurrentQuestion === undefined) {
						// Create a new Question class.
						var { questionIndex: QuestionIndex, numberOfAnswersAllowed: AnswersAllowedCount, timeLeft: TimeLeft, currentQuestionAnswerCount: AnswerCount, numberOfChoices: AvaiableChoices, type: Type } = Content;
						var question = new Question(QuestionIndex);

						question.Client = this;

						question.AnswersAllowedCount = AnswersAllowedCount;

						question.TimeLeft = TimeLeft;

						question.Title = Content.Title; question.Choices = Content.choices;

						question.AnswerCount = AnswerCount;

						question.Type = Type;

						question.AvaiableChoices = AvaiableChoices;

						this.Questions.push(question);

						this.CurrentQuestion = question;
					}

					this.CurrentQuestion.Answerable = true;

					this.CurrentBlock = Content.gameBlockIndex;

					this.BlockCount = Content.totalGameBlockCount;

					this.emit('question', this.CurrentQuestion)

					break;

				case OpCodes.TIMES_UP:
					if (this.CurrentQuestion) {
						this.CurrentQuestion.Answerable = false;
					}
					break;

				case OpCodes.REVEAL_ANSWER:
					var { isCorrect: AnsweredCorrectly, rank: Rank, totalScore: Score, pointsData: { totalPointsWithBonuses: ReceivedPoints, answerStreakPoints: { streakLevel: Streak } } } = Content;

					this.Stats.Rank = Rank; this.Stats.Score = Score; this.Stats.Streak = Streak;

					if (this.CurrentQuestion) {
						var question = this.CurrentQuestion;

						question.Revealt = true;

						question.AnsweredCorrectly = AnsweredCorrectly;

						question.ReceivedPoints = ReceivedPoints;
					}

					// Nemesis

					if (Content.nemesis && typeof Content.nemesis === 'object') {
						var { name, totalScore } = Content.nemesis;
						var nemesis = new Nemesis(name, totalScore);

						this.Nemesis = nemesis;
					}

					break;

				case OpCodes.GAME_OVER:
				case OpCodes.PLAY_AGAIN:
					await this.Leave('game_end');
					this.emit('end');
					break;
				case OpCodes.RESET_CONTROLLER:
					this.LoggedIn = false;

					if (Content.kickCode === 1) {
						await this.Leave('kicked');
					} else if (Content.kickCode === undefined) {
						await this.Leave('host_left');
					} else {
						await this.Leave('unknown');
					}
					break;

			}
		})
	}

}