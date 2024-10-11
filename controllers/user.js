const ExpressError = require("../utils/expressError");
const bcrypt = require("bcrypt");

const register = async (req, res, next) => {
    res.status(200).json({ message: "User created successfully", data: req.body });
    // const { password } = req.body;

    // const hashedPassword = await bcrypt.hashPassword(password);
};

module.exports = { 
    register
}