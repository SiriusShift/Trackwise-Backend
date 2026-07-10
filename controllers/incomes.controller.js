import { asyncHandler } from "../middleware/asyncHandler.js";
import * as incomeService from "../services/incomes.service.js";
export const postIncome = asyncHandler(async (req, res) => {
  const response = await incomeService.postIncome(req.user.id, req.body, req.file);
  console.log("response", response);
  res.status(200).json({
    success: true,
    message: "Income successfully created",
    response,
  });
});

export const getIncome = asyncHandler(async (req, res) => {

  const response = await incomeService.getIncome(req.user.id, req.query);
  console.log(response);
  res.status(200).json({
    success: true,
    message: "Income fetched successfully",
    ...response,
  });
});

export const getGraph = asyncHandler(async (req, res, next) => {

  const response = await incomeService.getGraph(req.user.id, req.query)
  res.status(200).json({
    success: true,
    message: "Detailed incomes fetched successfully",
    data: response
  });
});

export const updateIncome = asyncHandler(async (req, res, next) => {
  const { id } = req.params;


  const income = await incomeService.updateIncome(
    req.user.id,
    req.body,
    req.file,
    id
  );

  res.status(200).json({
    success: true,
    message: "Income updated successfully",
    data: income,
  });

});


const archiveIncome = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const updateExpense = await incomeService.deleteExpense("income", id);

  res.status(200).json({
    success: true,
    message: "Income archived successfully",
    data: updateExpense,
  });

});

export const collectIncome = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const response = await incomeService.collectIncome(
    req.user.id,
    req.body,
    id,
    req.file
  );
  res.status(200).json({
    message: "Receive successful",
    success: true,
    data: response,
  });
});