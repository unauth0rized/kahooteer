const Client = require('../src/kahoot');
const Players = new Map();
const bot_amount = 100;
(async () => {
	for (let i = 0; i < bot_amount; i++) {
		const Player = new Client('https://kahoot.it?pin=8342303');
	
		Players.set(Player.PlayerName, Player);

		setImmediate(async () => await Player.Join().then(({ PlayerName }) => console.log(PlayerName)).catch(console.log));

		Player.on('question', async (q) => {
			setTimeout(async () => await q.Answer(Math.floor(Math.random() * 4)).catch(console.log), Math.ceil(Math.random() * 40) * 100);
		});
	}
})()

process.on('SIGINT', () => Promise.all(Array.from(Players.values()).map(p => p.Leave)).then(process.exit))