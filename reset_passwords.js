const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User'); // Assuming this exists
const dotenv = require('dotenv');
dotenv.config();

mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI).then(async () => {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('Admin', salt);

    await User.updateOne({ username: 'admin@gmail.com' }, { $set: { passwordHash } });
    await User.updateOne({ username: 'adheenbhuva0007@gmail.com' }, { $set: { passwordHash } });
    
    console.log("Passwords for 'admin@gmail.com' and 'adheenbhuva0007@gmail.com' have been reset to 'Admin'.");
    process.exit(0);
});
