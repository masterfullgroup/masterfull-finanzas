import test from "node:test";
import assert from "node:assert/strict";
import { categoryBudgetStatus, summarizeBudgetMonth } from "../js/budgeting.js";

test("budget status distinguishes on-track, near limit, exact limit and overspend", () => {
  assert.equal(categoryBudgetStatus(10000, 7999).status, "on-track");
  assert.equal(categoryBudgetStatus(10000, 8000).status, "near");
  assert.equal(categoryBudgetStatus(10000, 10000).status, "near");
  assert.equal(categoryBudgetStatus(10000, 10001).status, "over");
});

test("remaining budget becomes negative only when actual spending exceeds the limit", () => {
  assert.equal(categoryBudgetStatus(5000, 3000).remainingMinor, 2000);
  assert.equal(categoryBudgetStatus(5000, 6500).remainingMinor, -1500);
});

test("zero or invalid limits never produce an infinite percentage", () => {
  assert.deepEqual(categoryBudgetStatus(0, 400).usedPercent, null);
  assert.equal(categoryBudgetStatus(-2, Number.NaN).status, "no-limit");
});

test("monthly summary calculates savings, rate and expenses outside category budgets", () => {
  const summary = summarizeBudgetMonth({
    incomeMinor: 300000,
    expenseMinor: 200000,
    budgets: [{ id: "b1", categoria_id: "food", categoryName: "Alimentación", limiteMinor: 120000 }],
    categorySpending: [{ categoryId: "food", spentMinor: 90000 }],
  });
  assert.equal(summary.netSavingsMinor, 100000);
  assert.ok(Math.abs(summary.savingsRate - (100 / 3)) < 1e-12);
  assert.equal(summary.plannedMinor, 120000);
  assert.equal(summary.budgetedSpentMinor, 90000);
  assert.equal(summary.unbudgetedExpenseMinor, 110000);
});

test("negative savings are retained as a deficit, and income-free months have no rate", () => {
  assert.equal(summarizeBudgetMonth({ incomeMinor: 10000, expenseMinor: 15000 }).netSavingsMinor, -5000);
  const noIncome = summarizeBudgetMonth({ incomeMinor: 0, expenseMinor: 2500 });
  assert.equal(noIncome.savingsRate, null);
  assert.equal(noIncome.netSavingsMinor, -2500);
});

test("duplicate category budgets aggregate limits but count actual expenses once", () => {
  const summary = summarizeBudgetMonth({
    incomeMinor: 100000,
    expenseMinor: 40000,
    budgets: [
      { id: "b1", categoria_id: "food", categoryName: "Alimentación", limiteMinor: 30000 },
      { id: "b2", categoria_id: "food", categoryName: "Alimentación", limiteMinor: 20000 },
    ],
    categorySpending: [{ categoryId: "food", spentMinor: 40000 }],
  });
  assert.equal(summary.categories.length, 1);
  assert.equal(summary.plannedMinor, 50000);
  assert.equal(summary.budgetedSpentMinor, 40000);
  assert.equal(summary.unbudgetedExpenseMinor, 0);
  assert.equal(summary.duplicateCategoryCount, 1);
});
