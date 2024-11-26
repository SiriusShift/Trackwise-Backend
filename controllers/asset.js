const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const createAsset = async (req, res, next) => {
  const { name, balance, user } = req.body;

  const data = await prisma.asset.create({
    data: {
      name,
      balance,
      user: {
        connect: {
          id: user.id,
        },
      },
    },
  });
  res.status(200).json({
    success: true,
    message: "Asset created successfully",
    data: data,
  });
};

module.exports = {
  createAsset,
};
