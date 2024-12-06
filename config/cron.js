const { PrismaClient } = require("@prisma/client");
const moment = require("moment");
const cron = require("node-cron");

const prisma = new PrismaClient();

/* Create a scheduler where 
1.) A scheduler where it will check everyday 12am, to check all expenses that exceeds their due date, 
then update their status to Overdue
2.) A scheduler where it will create a new expense row per expense that has status to Unpaid
3.) A scheduler where it will check everyday 12am, to check all expenses that is 2 days before their due date, 
then send a email / text that notifies them of their upcoming payment
*/
