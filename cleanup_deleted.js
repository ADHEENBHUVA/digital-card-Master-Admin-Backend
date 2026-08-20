(async () => {
    try {
        const mongoose = require('mongoose');
        require('dotenv').config();
        await mongoose.connect(process.env.MONGO_URI);
        const User = require('./models/User');
        const DigitalCard = require('./models/DigitalCard');

        const deletedUsers = await User.find({ role: 'SUB_ADMIN', isDeleted: true });
        console.log(`Found ${deletedUsers.length} deleted users.`);

        for (const user of deletedUsers) {
            if (!user.username.includes('_deleted_')) {
                const timestamp = Date.now();
                console.log(`Updating deleted user: ${user.username}`);

                user.username = `${user.username}_deleted_${timestamp}`;
                if (user.email && !user.email.includes('_deleted_')) {
                    user.email = `${user.email}_deleted_${timestamp}`;
                }
                user.slug = `${user.slug}_deleted_${timestamp}`;

                await user.save();

                await DigitalCard.findOneAndUpdate(
                    { ownerId: user._id },
                    { $set: { slug: user.slug } }
                );
                console.log("Updated digital card slug.");
            }
        }
        console.log("Done upgrading existing deleted users.");
    } catch (e) {
        console.error("ERROR:", e);
    }
    process.exit();
})();
