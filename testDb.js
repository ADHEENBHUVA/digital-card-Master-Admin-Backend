require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        const users = await User.find({});
        console.log("Users:", users.map(u => ({ id: u._id, username: u.username, role: u.role, isDeleted: u.isDeleted })));
        process.exit(0);
    });
