const OpCodes = require('../data/opcodes');

class Question {
	Index = undefined;
	Client = undefined;

	Answers = [];

	AnswersAllowed = 1;

	AvaiableChoices = 4;

	ReceivedPoints = 0;

	Revealt = false;

	Answerable = false;

	TimeLeft = undefined;

	GivenAt = Date.now();

	AnsweredCorrectly = false;

	Type = 'unknown';

	HasAnswer = false;

	constructor(QuestionIndex) {
		this.Index = QuestionIndex;
	}

	async Answer(choice, overwriteContent = undefined) {
		return new Promise((resolve, reject) => {
			this.Client.Send('controller', {
				content: JSON.stringify(overwriteContent ?? {
					type: this.Type,
					choice,
					questionIndex: this.Index,
					meta: {
						lag: Math.round(Math.random() * 45 + 5)
					}
				}),
				id: OpCodes.GAME_BLOCK_ANSWER,
				type: 'message'
			})
			.then(async () => {
				this.Client.on('message', async Message => {
					if (Message.OpCode === OpCodes.REVEAL_ANSWER) return setImmediate(() => resolve(this.AnsweredCorrectly));
				})
			})
			.catch(reject)
		})
	}

}

class Nemesis {
	Name = undefined;

	Score = 0;

	constructor(Name, Score = 0) {
		this.Name = Name; this.Score = Score;
	}
}

module.exports = { Question, Nemesis }