const mongoose = require('mongoose');
const User = require('./models/User'); // Assuming this exists
const dotenv = require('dotenv');
dotenv.config();

mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI).then(async () => {
    const users = await User.find({}, 'username role email');
    console.log(users);
    process.exit(0);
});
