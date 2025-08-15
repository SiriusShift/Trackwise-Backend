const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const validateAsset = async (assetId, userId) => {
  console.log("assetID", assetId);

  const category = await prisma.asset.findFirst({
    where: {
      id: assetId,
      userId: userId,
    },
  });

  if (!category) {
    throw new Error("Asset not found"); // ❌ Throw error here
  }
  return category;
};

module.exports = {
  validateAsset,
};
