const bcrypt = require('bcryptjs');

async function generateHash() {
  const password = 'admin123';
  const hash = await bcrypt.hash(password, 12);
  console.log('=== HASH GENERATION ===');
  console.log(`Password: ${password}`);
  console.log(`Hash: ${hash}`);
  console.log('=======================');
  
  // Verify the hash works
  const isValid = await bcrypt.compare(password, hash);
  console.log(`Verification: ${isValid}`);
  console.log('=======================');
}

generateHash().catch(console.error); 