const Client = require('../src/kahoot');

const secret = 'https://kahoot.it?pin=499304';

var Player = new Client(secret);

const OnQuestion = async (q) =>
	setTimeout(() => q.Answer(Math.round(Math.random() * 4)).then((s) => console.log(`Answered question correctly? ${s ? 'YES' : 'NO'}`)).catch(console.log), 100);

const OnLeft = (reason) => {
	console.log(`Client has left the game with reason: ${reason}`);
	Player = new Client(secret);

	Player.Join()
		.then(() => console.log(`Successfully rejoined game session as '${Player.PlayerName}'`))
		.catch((reason) => console.log(`Failed to rejoin game session due to: '${reason}'`));

	Player
		.on('left',
			OnLeft
		)
		.on('question',
			OnQuestion
		)
};



Player.Join()
	.then(() => {
		console.log(`Logged in as '${Player.PlayerName}'`);

		Player
			.on('left',
				OnLeft
			)
			.on('question',
				OnQuestion
			)
	})
	.catch((reason) => console.log(`Couldn't join game session: ${reason}`));