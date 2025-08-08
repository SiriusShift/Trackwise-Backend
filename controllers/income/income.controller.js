const { PrismaClient } = require("@prisma/client");
// const { skip } = require("@prisma/client/runtime/library");
const prisma = new PrismaClient();

const postIncome = async (req, res) => {
    try{
        
    }catch(err){
        res.status(500).json({
            error: "Internal server error"
        })
    }
}