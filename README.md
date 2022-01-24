# kahooteer
Node.js module which gives you the ability to interact with the kahoot API.

# Installation
```sh
npm install kahooteer
```
# Usage
```js
const kahooteer = require('kahooteer');

const Client = new kahooteer.Client('xxxxxx', 'kahooteer'); // this accepts an invite link or a pin.

Client.Join()
 	.then(() => {
		console.log(`We are in-game as ${Client.PlayerName}!`)
	})
	.catch((reason) => console.log(`Couldn't join game session: ${reason}`));
```
# Documentation
Not done yet, but you can look on the scripts on the /test folder for an example.
