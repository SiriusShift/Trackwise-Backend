const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const {validateCategory} = require("../category.service")
const {validateAsset} = require("../asset.service");
const { uploadFileToS3 } = require("../s3.service");

const postInstallment = async (userId, data, file) => {
  const amount = parseInt(data.amount);
  const categoryId = parseInt(data.category?.id);
  const assetId = parseInt(data.source?.id);

  validateCategory(categoryId);
  validateAsset(assetId);

  const installment = await prisma.installmentPlan.create({
    data: {
      userId: userId,
      description: data?.description,
      totalAmount: amount,
      months: parseInt(data?.months),
      startDate: data?.date,
      category: {
        connect: {
          id: categoryId
        }
      },
      asset: {
        connect: {
          id: assetId
        }
      },
    }
  })

  return installment
};

const getInstallment = async (userId, data) => {

}

module.exports = {
  postInstallment,
  getInstallment
};
