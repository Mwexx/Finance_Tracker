const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
    // Create transporter
    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        secure: false, // true for 465, false for other ports
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    // Define email options
    const mailOptions = {
        from: `Finance Tracker <${process.env.EMAIL_USER}>`,
        to: options.to,
        subject: options.subject,
        html: options.message,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Email sent successfully');
    } catch (error) {
        console.error('Error sending email:', error);
        // In development, if email fails, log it but don't crash app
        if(process.env.NODE_ENV === 'development') {
            console.log('Email content would be:', mailOptions);
        }
    }
};

module.exports = sendEmail;