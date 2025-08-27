const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient()
const { validateCategory } = require("./categories.service");
const { connect } = require("../routes/emails.routes");

const postRecurring = async (userId, data) => {
    const amount = parseInt(data.amount);
  const categoryId = parseInt(data.category);
    try{
        validateCategory(categoryId)
        const recurring = prisma.recurringTransaction.create({
            data: {
                user: {
                    connect: {
                        id: userId
                    }
                },
                type: data?.type
            }
        })
    }catch(err){
        return err
    }
}

module.exports = {
    postRecurring
}