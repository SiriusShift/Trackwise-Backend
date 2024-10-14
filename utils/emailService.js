const {
    SES
} = require("@aws-sdk/client-ses");

require('dotenv').config();

const ses = new SES({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY
    },

    region: process.env.AWS_REGION
});

const verifyEmailAddress = async (emails) => {
    try{
        const verificationPromisses = emails.map(async email=>{
            const params = {
                EmailAddress: email
            };
            return await ses.verifyEmailIdentity(params);
        })
    }catch(err){
        console.log("Failed to verify email address", err);
        return false
    }
}


const sendEmail = async (email, message) => {
    const params = {
        Source: "lagmanmarquez@gmail.com",
        Destination: {
            ToAddresses: email
        },
        Message: {
            Subject: {
                Data: 'Verification code'
            },
            Body: {
                Text: {
                    Data: message
                }
            }
        }
    }
    try{
        const data = await ses.sendEmail(params);
        console.log("Email sent", data);
    }catch(err){
        console.log("Failed to send email", err);
        throw err;
    }
}

module.exports = { verifyEmailAddress, sendEmail };