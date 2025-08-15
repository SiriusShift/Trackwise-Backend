const { Router } = require("express");
const catchAsync = require("../utils/catchAsync");
const { createCategory, getAllCategory } = require("../controllers/categories.controller");
const { isLoggedIn, validateCreateRequest } = require("../middleware/validate");
const { addExpenseLimit, getAllExpenseLimit, updateExpenseLimit, deleteExpenseLimit } = require("../controllers/limits.controller");
const router = Router();

/**
 * @swagger
 * /category/create:
 *   post:
 *     summary: Create a new category
 *     description: Creates a new category in the system.
 *     tags:
 *       - Category
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Food"
 *               type:
 *                 type: string
 *                 example: "Expense"
 *     responses:
 *       201:
 *         description: Category created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Category created successfully"
 *       400:
 *         description: Invalid input
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Invalid input data"
 */

/**
 * @swagger
 * /category/get:
 *   get:
 *     summary: Get all categories
 *     description: Retrieves a list of all categories. You can filter by type (e.g., Expense or Income).
 *     tags:
 *       - Category
 *     parameters:
 *       - name: type
 *         in: query
 *         description: The type of category (e.g., "Expense" or "Income")
 *         required: false
 *         schema:
 *           type: string
 *         example: "Expense"  # You can use any string as an example here
 *     responses:
 *       200:
 *         description: List of categories retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     example: 1
 *                   name:
 *                     type: string
 *                     example: "Food"
 *                   type:
 *                     type: string
 *                     example: "Expense"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Internal server error"
 */

router.route("/create").post(isLoggedIn, catchAsync(createCategory));
router.route("/get").get(isLoggedIn, catchAsync(getAllCategory));
router.route("/patchLimit/:id").patch(isLoggedIn, catchAsync(updateExpenseLimit));
router.route("/deleteLimit/:id").put(isLoggedIn, catchAsync(deleteExpenseLimit))
router.route("/postLimit").post(isLoggedIn, catchAsync(addExpenseLimit));
router.route("/getAllExpenseCategoryLimit").get(isLoggedIn, catchAsync(getAllExpenseLimit));

module.exports = router;
