const nodemailer = require('nodemailer');

function normalizeEnvValue(value) {
    return String(value || '')
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getSmtpConfig() {
    const host = normalizeEnvValue(process.env.EMAIL_HOST).split(' ')[0];
    const portValue = normalizeEnvValue(process.env.EMAIL_PORT);
    const user = normalizeEnvValue(process.env.EMAIL_USER);
    const pass = normalizeEnvValue(process.env.EMAIL_PASS);
    const port = Number(portValue);

    if (!host || !Number.isFinite(port) || !user || !pass) {
        throw new Error('Email configuration is incomplete. Check EMAIL_HOST, EMAIL_PORT, EMAIL_USER, and EMAIL_PASS.');
    }

    return {
        host,
        port,
        secure: port === 465,
        user,
        pass
    };
}

const sendEmail = async (options) => {
    const smtp = getSmtpConfig();

    // Create transporter
    const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: {
            user: smtp.user,
            pass: smtp.pass,
        },
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 5000,
    });

    // Define email options
    const mailOptions = {
        from: `Finance Tracker <${smtp.user}>`,
        to: options.to,
        subject: options.subject,
        html: options.message,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Email sent successfully');
    } catch (error) {
        const safeHost = smtp.host ? smtp.host.slice(0, 80) : 'unknown';
        console.error(`Error sending email via host ${safeHost}:`, error.message);
        throw error;
    }
};

module.exports = sendEmail;