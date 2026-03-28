 /*
 email →
Ye us insaan ka receiver email address hai jisko mail bhejna hai.
Example: "friend@gmail.com"

subject →
Ye email ka title / heading hoga.
Example: "Your OTP Code"

data →
Ye ek object hai jisme extra details hoti hain jo mail ke andar dikhengi.
Example:

{ name: "Khushi", otp: 123456 }


data.name → receiver ka naam (mail me “Hello Khushi” aayega)

data.otp → OTP number jo mail me show hoga
 
 */
import dotenv from "dotenv"
dotenv.config()
 import {createTransport} from 'nodemailer'
 

// const sendMail=async(email,subject,data)=>{
//     const transporter=createTransport({
//       host:"smtp.gmail.com",
//       port:465,
//       secure:true,
//       auth:{
//         user:process.env.GMAIL,
//         pass:process.env.PASSWORD
//       }
//     })
//     const html = `<!DOCTYPE html>
// <html lang="en">
// <head>
//     <meta charset="UTF-8">
//     <meta name="viewport" content="width=device-width, initial-scale=1.0">
//     <title>OTP Verification</title>
//     <style>
//         body {
//             font-family: Arial, sans-serif;
//             margin: 0;
//             padding: 0;
//             display: flex;
//             justify-content: center;
//             align-items: center;
//             height: 100vh;
//         }
//         .container {
//             background-color: #fff;
//             padding: 20px;
//             border-radius: 8px;
//             box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
//             text-align: center;
//         }
//         h1 {
//             color: red;
//         }
//         p {
//             margin-bottom: 20px;
//             color: #666;
//         }
//         .otp {
//             font-size: 36px;
//             color: #7b68ee; /* Purple text */
//             margin-bottom: 30px;
//         }
//     </style>
// </head>
// <body>
//     <div class="container">
//         <h1>OTP Verification</h1>
//         <p>Hello ${data.name} your (One-Time Password) for your account verification is.</p>
//         <p class="otp">${data.otp}</p> 
//     </div>
// </body>
// </html>
// `;
// await transporter.sendMail({
//     from:process.env.GMAIL,
//     to:email,  //jisko bhej rhe hai
//     subject,
//     html

// })


// }
import dotenv from "dotenv";
dotenv.config();
import { createTransport } from "nodemailer";

const sendMail = async (email, subject, data) => {
  try {
    console.log("🔹 sendMail called"); // Function call check
    console.log("Recipient email:", email);
    console.log("Subject:", subject);
    console.log("Data object:", data);

    const transporter = createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.GMAIL,
        pass: process.env.PASSWORD,
      },
    });

    // Optional: check transporter
    transporter.verify((err, success) => {
      if (err) {
        console.log("❌ Transporter verification failed:", err);
      } else {
        console.log("✅ Transporter ready to send emails");
      }
    });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OTP Verification</title>
<style>
body { font-family: Arial; margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; height: 100vh; }
.container { background-color: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }
h1 { color: red; } p { margin-bottom: 20px; color: #666; } .otp { font-size: 36px; color: #7b68ee; margin-bottom: 30px; }
</style>
</head>
<body>
<div class="container">
<h1>OTP Verification</h1>
<p>Hello ${data.name} your (One-Time Password) for your account verification is.</p>
<p class="otp">${data.otp}</p>
</div>
</body>
</html>`;

    const info = await transporter.sendMail({
      from: process.env.GMAIL,
      to: email,
      subject,
      html,
    });

    console.log("✅ Email sent successfully:", info.messageId);
    return info; // Return info in case you want to use in register response
  } catch (error) {
    console.log("❌ Error sending email:", error);
    throw error; // Throw so that register handler knows
  }
};




export const sendForgotMail=async(subject,data)=>{
    
    const transporter=createTransport({
      host:"smtp.gmail.com",
      port:465,
      secure:true,
      auth:{
        user:process.env.GMAIL,
        pass:process.env.PASSWORD
      }
    })
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background-color: #f3f3f3;
      margin: 0;
      padding: 0;
    }
    .container {
      background-color: #ffffff;
      padding: 20px;
      margin: 20px auto;
      border-radius: 8px;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
      max-width: 600px;
    }
    h1 {
      color: #5a2d82;
    }
    p {
      color: #666666;
    }
    .button {
      display: inline-block;
      padding: 15px 25px;
      margin: 20px 0;
      background-color: #5a2d82;
      color: white;
      text-decoration: none;
      border-radius: 4px;
      font-size: 16px;
    }
    .footer {
      margin-top: 20px;
      color: #999999;
      text-align: center;
    }
    .footer a {
      color: #5a2d82;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Reset Your Password</h1>
    <p>Hello,</p>
    <p>You have requested to reset your password. Please click the button below to reset your password.</p>
    <a href="${process.env.frontendurl}/reset-password/${data.token}" class="button">Reset Password</a>
    <p>If you did not request this, please ignore this email.</p>
    <div class="footer">
      <p>Thank you,<br>Your Website Team</p>
      <p><a href="https://yourwebsite.com">yourwebsite.com</a></p>
    </div>
  </div>
</body>
</html>
`;
    await transporter.sendMail({
    from:process.env.GMAIL,
    to:data.email,  //jisko bhej rhe hai
    subject,
    html

})
    

}
export default sendMail;
