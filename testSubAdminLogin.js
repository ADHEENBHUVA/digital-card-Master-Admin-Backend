require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

const runTest = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        // 1. Get a test sub admin
        let subAdmin = await User.findOne({ role: 'SUB_ADMIN' });
        if (!subAdmin) {
            console.log("No sub admin found to test");
            process.exit(1);
        }

        console.log(`Testing with Sub Admin: ${subAdmin.username}`);

        // 2. Simulate Master Admin change password
        const newPassword = 'TestPassword123!';
        const finalPassword = newPassword || `${subAdmin.username}@Previous`;
        const salt = await bcrypt.genSalt(10);
        subAdmin.passwordHash = await bcrypt.hash(finalPassword, salt);
        subAdmin.mustChangePassword = !newPassword;
        subAdmin.tokenVersion = (subAdmin.tokenVersion || 0) + 1;
        await subAdmin.save();

        console.log(`Password reset to ${newPassword}`);

        // 3. Simulate Sub Admin login (like in sub admin backend routes)
        const passwordToLogin = newPassword;
        const user = await User.findOne({ username: { $regex: new RegExp(`^${subAdmin.username}$`, 'i') } });

        if (user && (await bcrypt.compare(passwordToLogin, user.passwordHash))) {
            console.log("LOGIN SUCCESSFUL");
        } else {
            console.log("LOGIN FAILED");
        }
    } catch (err) {
        console.error("Test failed", err);
    } finally {
        process.exit(0);
    }
}
runTest();
