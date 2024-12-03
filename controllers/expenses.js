const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const postExpense = async (res,req,next) => {
    console.log(req.body)
}

module.exports = {
    postExpense
};
  