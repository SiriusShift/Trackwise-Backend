const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { validateCategory } = require("./categories.service");
const { validateAsset } = require("./assets.service");
const { uploadFileToS3 } = require("./s3.service");

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
          id: categoryId,
        },
      },
      asset: {
        connect: {
          id: assetId,
        },
      },
    },
  });

  return installment;
};

const getInstallment = async (userId, query) => {
  const {
    search,
    pageIndex,
    pageSize,
    Categories,
    startDate,
    endDate,
    status,
  } = query;

  const page = parseInt(pageIndex) >= 0 ? parseInt(pageIndex) + 1 : 1;
  const size = parseInt(pageSize) > 0 ? parseInt(pageSize) : 10;
  const skip = (page - 1) * size;

  const filters = {
    userId: parseInt(userId),
    ...(startDate && endDate
      ? {
          startDate: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        }
      : {}),
    isActive: true,
  };

  if (search) {
    filters.description = {
      startsWith: search,
      mode: "insensitive",
    };
  }

  if (status) {
    filters.status = {
      startsWith: status,
    };
  }

  if (Categories !== undefined) {
    filters.categoryId = {
      in: JSON.parse(Categories),
    };
  }

  const totalCount = await prisma.installmentPlan.count({ where: filters });

  const installment = await prisma.installmentPlan.findMany({
    where: filters,
    orderBy: { startDate: "desc" },
    skip,
    take: size,
  });

  const totalPages = Math.ceil(totalCount / size);
  
  return {
    data: installment,
    totalCount,
    totalPages,
  };
};

module.exports = {
  postInstallment,
  getInstallment,
};
