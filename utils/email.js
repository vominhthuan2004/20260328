const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.mailtrap.io',
  port: 2525,
  auth: {
    user: '3cb4934379419f', // thay bằng thực tế
    pass: 'cef2116a88d414'
  }
});

const sendPasswordEmail = async (email, username, password) => {
  const mailOptions = {
    from: 'no-reply@yourapp.com',
    to: email,
    subject: 'Your account has been created',
    html: `<h2>Hello ${username},</h2>
           <p>Your account has been successfully created. You can log in with the following password:</p>
           <p><strong>${password}</strong></p>
           <p>Please change your password after logging in.</p>`
  };
  await transporter.sendMail(mailOptions);
};

module.exports = sendPasswordEmail;