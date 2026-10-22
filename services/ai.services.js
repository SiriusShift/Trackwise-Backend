import { Type } from "@google/genai";
import { ai } from "../config/geminiConfig.js";
import { prisma } from "../config/prisma.js";
export const scanReceipt = async (file, userId) => {
    console.log(userId, "id");
    const categories = await prisma.categories.findMany({
        where: {
            isActive: true,
            type: "Expense",
            OR: [{ userId: null }, { userId }],
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
    });

    console.log(categories);

    const categoryList = categories.map((c) => `${c.id}: ${c.name}`).join("\n");

    console.log(categoryList, "categories!");

    const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [
            { inlineData: { mimeType: file.mimetype, data: file.buffer.toString("base64") } },
            {
                text:
                    "Extract this receipt. Use the transaction timestamp as the date, not permit or accreditation dates. Amounts in PHP.\n" +
                    "Pick the single best matching category id from this list:\n" + categoryList,
            },
        ],
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    merchant: { type: Type.STRING },
                    date: { type: Type.STRING, description: "YYYY-MM-DD" },
                    total: { type: Type.NUMBER },
                    categoryId: {
                        type: Type.STRING,
                        enum: categories.map((c) => String(c.id)),
                    },
                    description: { type: Type.STRING },
                },
                required: ["merchant", "date", "total", "categoryId"],
            },
        },
    });

    const result = JSON.parse(response.text);
    return { ...result, categoryId: result.categoryId ? Number(result.categoryId) : null };
};
