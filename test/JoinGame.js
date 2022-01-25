const Client = require('../src/kahoot');

const Player = new Client('https://kahoot.it?pin=3167106');

//Player.verbose = true;

Player.on('left', (reason) => console.log(`Client has left the game with reason: ${reason}`))

Player.Join()
	.then(() => {
		console.log(`Logged in as '${Player.PlayerName}'`);

		Player.on('question', async (q) => q.Answer(Math.floor(Math.random() * 4)).then((s) => console.log(`Correct? :: ${s ? 'YES' : 'NO'}`)).catch(console.log))
	})
	.catch((reason) => console.log(`Couldn't join game session: ${reason}`));