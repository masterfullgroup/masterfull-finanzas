const toMinor = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
};

export function categoryBudgetStatus(limitValue, spentValue) {
  const limitMinor = toMinor(limitValue);
  const spentMinor = toMinor(spentValue);
  const usedPercent = limitMinor > 0 ? (spentMinor / limitMinor) * 100 : null;
  const status = limitMinor <= 0
    ? "no-limit"
    : spentMinor > limitMinor
      ? "over"
      : usedPercent >= 80
        ? "near"
        : "on-track";
  return {
    limitMinor,
    spentMinor,
    remainingMinor: limitMinor - spentMinor,
    usedPercent,
    status,
  };
}

export function summarizeBudgetMonth({ incomeMinor = 0, expenseMinor = 0, budgets = [], categorySpending = [] } = {}) {
  const income = toMinor(incomeMinor);
  const expenses = toMinor(expenseMinor);
  const spendingByCategory = new Map(categorySpending.map((item) => [item.categoryId, toMinor(item.spentMinor)]));
  const groupedBudgets = new Map();

  for (const budget of budgets) {
    const categoryId = budget.categoria_id || budget.categoryId;
    const current = groupedBudgets.get(categoryId) || {
      categoryId,
      categoryName: budget.categoryName || "Categoría sin nombre",
      budgetIds: [],
      limitMinor: 0,
    };
    if (budget.id) current.budgetIds.push(budget.id);
    current.limitMinor += toMinor(budget.limiteMinor ?? budget.limitMinor);
    groupedBudgets.set(categoryId, current);
  }

  const categories = [...groupedBudgets.values()].map((budget) => ({
    ...budget,
    ...categoryBudgetStatus(budget.limitMinor, spendingByCategory.get(budget.categoryId) || 0),
  }));
  const budgetedCategoryIds = new Set(groupedBudgets.keys());
  const budgetedSpentMinor = [...budgetedCategoryIds].reduce((sum, id) => sum + (spendingByCategory.get(id) || 0), 0);
  const netSavingsMinor = income - expenses;

  return {
    incomeMinor: income,
    expenseMinor: expenses,
    netSavingsMinor,
    savingsRate: income > 0 ? (netSavingsMinor / income) * 100 : null,
    plannedMinor: categories.reduce((sum, item) => sum + item.limitMinor, 0),
    budgetedSpentMinor,
    unbudgetedExpenseMinor: Math.max(0, expenses - budgetedSpentMinor),
    categories,
    overBudget: categories.filter((item) => item.status === "over"),
    nearLimit: categories.filter((item) => item.status === "near"),
    duplicateCategoryCount: categories.reduce((sum, item) => sum + Math.max(0, item.budgetIds.length - 1), 0),
  };
}
