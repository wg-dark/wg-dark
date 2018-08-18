const execSync = require('child_process').execSync;
const fetch = require('node-fetch');
const commandExists = require('command-exists');

(async function() {
  if (!(await commandExists('wg'))) {
    console.error('wireguard is not installed.');
    process.exit(1);
  }
  
  const server = process.argv[2];
  const keypair = generate_keypair();
  const opts = {
    method: 'POST',
    body: JSON.stringify({pubkey: keypair.pubkey})
  };

  console.log(keypair);

  try {
    const res = await fetch(`${server}/join`, opts);
    const json = await res.json();
  } catch (error) {
    console.error('failed to contact the server');
    process.exit(1);
  }
})();
