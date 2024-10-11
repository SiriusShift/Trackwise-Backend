const ExpressError = require("../utils/expressError");
const bcrypt = require("bcrypt");
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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

module.exports = { 
    register
}