const { PrismaClient } = require("@prisma/client");
// const { skip } = require("@prisma/client/runtime/library");
const prisma = new PrismaClient();

const transfer = async (req, res, next) => {
  try {
    const { origin: originId, destination: destinationId, amount } = req.body;

    const [origin, destination] = await Promise.all([
      prisma.asset.findFirst({ where: { category: { id: originId } } }),
      prisma.asset.findFirst({ where: { category: { id: destinationId } } }),
    ]);

    if (!origin || !destination) {
      return res.status(404).json({ error: "Asset(s) not found" });
    }

    await Promise.all([
      prisma.asset.update({
        where: { id: origin.id },
        data: { balance: origin.balance - amount },
      }),
      prisma.asset.update({
        where: { id: destination.id },
        data: { balance: destination.balance + amount },
      }),
    ]);

    await prisma.transactionHistory.create({
      data: {
        amount,
        origin: { connect: { id: origin.id } },
        destination: { connect: { id: destination.id } },
      },
    });

    res.status(200).json({
      success: true,
      message: "Transfer successful",
    });
  } catch (err) {
    console.error("Error during transfer:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { transfer };