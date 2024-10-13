const ExpressError = require("../utils/expressError");
const bcrypt = require("bcrypt");
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { sendEmail, verifyEmailAddress } = require("../utils/emailService");

const register = async (req, res, next) => {
    const { password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
        data: {
            ...req.body,
            password: hashedPassword,
        },
    });

    return res.status(200).json({ user });

};

// THIS IS FOR VERIFYING EMAIL IN SANDBOX MODE
const verifyEmail = async (req, res, next) => {
    const { email } = req.body;
    if(!email || !Array.isArray(email)){
        return res.status(400).json({
            message: 'Invalid format'
        })
    }
    try{
        const verificationSuccess = await verifyEmailAddress(email);
        if(verificationSuccess){
            return res.status(200).json({
                success: true,
                message: 'Email verified'
            })
        }else{
            return res.status(400).json({
                success: false,
                message: 'Failed to verify email address'
            })
        }
    }catch(err){
        console.log("Error while verifying email address", err);
        return res.json(500).json({
            error: "Internal server error"
        })
    }
}

const sendEmailCode = async (req, res, next) => {
    const { email, message } = req.body;
    console.log(req.body)
    if(!email || !Array.isArray(email)){
        return res.status(400).json({
            message: 'Invalid format'
        })
    }
    try{
       await sendEmail(email, message);
        return res.status(200).json({
            success: true,
            message: 'Email sent'
        })
    }catch(err){
        console.log("Error while sending email", err);
        return res.json(500).json({
            error: "Internal server error"
        })
    }
}


module.exports = { 
    register,
    verifyEmail,
    sendEmailCode
}