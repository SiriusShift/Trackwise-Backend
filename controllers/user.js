const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const register = async (req, res, next) => {
  const { email, password, username, firstName, lastName, otp } = req.body;
  const code = await prisma.emailVerification.findFirst({
    where: {
      email,
    },orderBy: {
      createdAt: 'desc'
    }
  })
  
  console.log("email", email);
  console.log("code", code);
  console.log("otp", otp);

  if (!code) {
    return res.status(400).json({
      success: false,
      message: "No OTP found for this email",
    });
  }
  //Check if the otp is valid
  if(code.verificationCode !== otp){
    return res.status(400).json({
      success: false,
      message: "Invalid OTP"
    })
  } 
  //Check if the OTP has expired
  const currentTime = new Date();
  if (currentTime > code.expirationTime) {
    return res.status(400).json({
      success: false,
      message: "OTP has expired"
    });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email: email,
      username: username,
      firstName: firstName,
      lastName: lastName,
      role: "user",
      password: hashedPassword,
    },
  });
  await prisma.emailVerification.update({
    where: {
      id: code.id,
    },
    data: {
      isVerified: true,
    },
  });

  return res.status(200).json({ user });
};

module.exports = {
  register,
};
