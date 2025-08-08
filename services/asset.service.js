const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const validateAsset = async (assetId, userId) => {
  const category = await prisma.categories.findFirst({
    where: {
      id: assetId,
      userId: userId
    },
  });

  if (!category) {
    return res.status(400).json({
      success: false,
      message: "Asset not found",
    });
  }
  return category
};

module.exports = {
  validateAsset
}