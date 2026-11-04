const path = require('path');
const readline = require('readline');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const User = require('../server/models/User');
const sendEmail = require('../server/utils/sendEmail');

dotenv.config({ path: path.join(__dirname, '..', 'server', '.env') });

const subject = 'Finance Tracker Email Service Restored';
const message = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1e293b;">
        <h2>Our email service is working again</h2>
        <p>Dear Finance Tracker user,</p>
        <p>We are sorry for the inconvenience caused while our email service was unavailable.</p>
        <p>The issue has now been resolved, and the system is working properly again. You can continue using Finance Tracker normally.</p>
        <p>Thank you for your patience and understanding.</p>
        <p>Kind regards,<br>Finance Tracker Team</p>
    </div>
`;

function confirmSend() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question('Type SEND to deliver this email to all recipients: ', (answer) => {
            rl.close();
            resolve(answer.trim() === 'SEND');
        });
    });
}

async function main() {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is not configured.');
    }

    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    const users = await User.find({ email: { $exists: true, $ne: '' } }).select('email name').lean();

    console.log(`Recipients: ${users.length} registered user(s) with an email address`);
    console.log(`Subject: ${subject}`);
    console.log('Preview: Finance Tracker is working again, with an apology for the interruption.');

    if (!process.argv.includes('--send')) {
        console.log('Preview only. Re-run with "--send" to request confirmation and deliver the email.');
        return;
    }

    if (!(await confirmSend())) {
        console.log('Sending cancelled.');
        return;
    }

    let sent = 0;
    let failed = 0;
    for (const user of users) {
        try {
            await sendEmail({ to: user.email, subject, message });
            sent += 1;
            console.log(`Sent to ${user.email}`);
        } catch (error) {
            failed += 1;
            console.error(`Failed for ${user.email}: ${error.message}`);
        }
    }

    console.log(`Finished. Sent: ${sent}; Failed: ${failed}; Total: ${users.length}`);
}

main()
    .catch((error) => {
        console.error(`Broadcast failed: ${error.message}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    });
