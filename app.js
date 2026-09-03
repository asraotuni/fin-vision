const panels = [...document.querySelectorAll('.panel')];
const steps = [...document.querySelectorAll('.step')];
const nextBtn = document.querySelector('#nextBtn');
const backBtn = document.querySelector('#backBtn');
const stepCount = document.querySelector('#stepCount');
const STORAGE_KEY = 'hiramyatech-test-data-v1';
const ASSET_RETURNS = {
  'Independent house / villa': 6, 'Flat': 6, 'Plot': 7, 'Agricultural land': 7, 'EPF / PF': 8.25,
  'PPF': 7.1, 'Gold': 8, 'Savings bank account': 3, 'Cash': 0,
  'Mutual funds': 11, 'Stocks': 12, 'Fixed deposit': 7, 'NPS': 10, 'Other': 6
};
const LOAN_RATES = {
  'Home loan / EMI': 8.5, 'Personal loan from bank': 13, 'Gold loan': 10,
  'Bank loan with collateral': 10, 'Private loan (high interest)': 24,
  'Vehicle loan': 10, 'Education loan': 9, 'Credit card debt': 36, 'Other': 12
};
const POLICY_INSURERS = {
  health: ['Not specified', 'ICICI Lombard', 'HDFC ERGO', 'Star Health', 'Niva Bupa', 'Care Health', 'Aditya Birla Health', 'New India Assurance', 'United India Insurance', 'Other / custom'],
  term: ['Not specified', 'ICICI Prudential', 'LIC', 'HDFC Life', 'SBI Life', 'Max Life', 'Tata AIA', 'Bajaj Allianz Life', 'Kotak Life', 'Other / custom']
};
const EXPENSE_TYPES = ['Son’s marriage', 'Daughter’s marriage', 'Son’s education', 'Daughter’s education', 'Other / custom'];
const RETIREMENT_ALLOCATION = [
  {name:'Real estate', suggestedAllocation:10, returnRate:7.5},
  {name:'Gold', suggestedAllocation:20, returnRate:6},
  {name:'Fixed deposits', suggestedAllocation:10, returnRate:7},
  {name:'Mutual funds', suggestedAllocation:30, returnRate:9},
  {name:'Direct equity', suggestedAllocation:10, returnRate:11},
  {name:'Pension / annuity products', suggestedAllocation:20, returnRate:6.5}
];
let current = 0;
let memberCount = 0;
let assetCount = 0;
let loanCount = 0;
let policyCount = 0;
let expenseCount = 0;
let restoredAssetList = false;
let deploymentAllocations = null;
let deploymentReturns = null;

const $ = id => document.getElementById(id);
const parseAmount = rawValue => Math.max(0, Number(String(rawValue || '').replace(/,/g, '')) || 0);
const numericValue = input => parseAmount(input?.value);
const value = id => numericValue($(id));
const money = n => new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 }).format(n).replace(/₹\s*/, '₹ ');
const indianNumber = n => new Intl.NumberFormat('en-IN', { maximumFractionDigits:0 }).format(n);
const compactMoney = n => {
  if (n >= 1e7) return `₹ ${(n / 1e7).toFixed(1)} Cr`;
  if (n >= 1e5) return `₹ ${(n / 1e5).toFixed(1)} L`;
  return money(n);
};

function setStatusTone(element, tone){
  element.classList.remove('status-good', 'status-alert', 'status-bad');
  element.classList.add(`status-${tone}`);
}

function updateBasics(){
  const years = Math.max(0, value('retireAge') - value('age'));
  $('yearsGrow').textContent = `${years} year${years === 1 ? '' : 's'}`;
}

function updateCash(){
  const income = value('income');
  const monthlyExpenses = value('groceryExpenses') + value('utilityBills') + value('healthInsurancePremiums') + value('termInsurancePremiums') +
    value('loanPayments') + value('rentExpense') + value('societyMaintenance') + value('otherExpenses');
  $('expenses').value = indianNumber(monthlyExpenses);
  const surplus = income - monthlyExpenses - value('monthlyInvestment');
  const totalSaved = Math.max(0, income - monthlyExpenses);
  $('surplus').textContent = money(surplus);
  $('surplus').style.color = surplus < 0 ? '#d95643' : '';
  $('savingsRate').textContent = `${income ? Math.round(totalSaved / income * 100) : 0}%`;
  $('cashHint').textContent = surplus < 0 ? 'Your monthly outflow needs a quick review.' : totalSaved / income >= .3 ? 'A healthy base to build from.' : 'There’s room to grow your savings rate.';
  setStatusTone(document.querySelector('.metric-strip'), surplus < 0 ? 'bad' : totalSaved / Math.max(1, income) >= .3 ? 'good' : 'alert');
}

function remainingIncomeReplacementYears(){
  return Math.max(0, Math.min(10, value('retireAge') - value('age')));
}

function termCoverNeed(){
  return value('income') * 12 * remainingIncomeReplacementYears();
}

function monthlyRetirementLivingExpenses(){
  return Math.max(0, value('expenses') - value('loanPayments') - value('termInsurancePremiums'));
}

function updateRiskProfile(){
  const scoredAnswers = [...document.querySelectorAll('[data-risk-score]:checked')];
  const score = scoredAnswers.reduce((sum, answer) => sum + Number(answer.dataset.riskScore), 0);
  const maximum = new Set([...document.querySelectorAll('[data-risk-score]')].map(answer => answer.name)).size * 3;
  const percentage = maximum ? Math.round(score / maximum * 100) : 0;
  const profile = percentage <= 35
    ? {label:'Conservative', className:'profile-conservative', copy:'You prioritise capital stability and may be less comfortable with market declines.'}
    : percentage <= 70
      ? {label:'Moderate', className:'profile-moderate', copy:'You appear comfortable balancing long-term growth with stability.'}
      : {label:'Growth-oriented', className:'profile-growth', copy:'You appear able and willing to accept larger fluctuations for long-term growth.'};
  const result = $('riskResult');
  result.classList.remove('profile-conservative', 'profile-moderate', 'profile-growth');
  result.classList.add(profile.className);
  $('riskProfileLabel').textContent = profile.label;
  $('riskProfileCopy').textContent = profile.copy;
  $('riskMeterFill').style.width = `${percentage}%`;
}

function isCurrencyInput(input){
  return input.matches('.money input, .asset-value, .loan-balance, .policy-cover, .policy-premium, .expense-amount');
}

function formatCurrencyInput(input){
  const digits = input.value.replace(/[^\d]/g, '');
  input.value = digits ? indianNumber(Number(digits)) : '';
}

function prepareCurrencyInputs(){
  document.querySelectorAll('.money input, .asset-value, .loan-balance, .policy-cover, .policy-premium, .expense-amount').forEach(input => {
    input.type = 'text';
    input.inputMode = 'numeric';
    formatCurrencyInput(input);
  });
}

function futureValue(principal, monthly, annualRate, years){
  const months = years * 12;
  const rate = annualRate / 100 / 12;
  return principal * Math.pow(1 + rate, months) + (rate ? monthly * ((Math.pow(1 + rate, months) - 1) / rate) : monthly * months);
}

function deriveAllocationsFromAssets(assetItems){
  const amounts = Object.fromEntries(RETIREMENT_ALLOCATION.map(item => [item.name, 0]));
  assetItems.forEach(asset => {
    let category = 'Fixed deposits';
    if(['Independent house / villa','Flat','Plot','Agricultural land'].includes(asset.type)) category = 'Real estate';
    else if(asset.type === 'Mutual funds') category = 'Mutual funds';
    else if(asset.type === 'Gold') category = 'Gold';
    else if(asset.type === 'Stocks') category = 'Direct equity';
    else if(['EPF / PF','NPS'].includes(asset.type)) category = 'Pension / annuity products';
    amounts[category] += asset.value;
  });
  const total = Object.values(amounts).reduce((sum, amount) => sum + amount, 0);
  if(!total) return Object.fromEntries(RETIREMENT_ALLOCATION.map(item => [item.name, item.suggestedAllocation]));
  const allocations = Object.fromEntries(Object.entries(amounts).map(([name, amount]) => [name, Math.round(amount / total * 1000) / 10]));
  const roundedTotal = Object.values(allocations).reduce((sum, allocation) => sum + allocation, 0);
  allocations['Fixed deposits'] = Math.max(0, Math.round((allocations['Fixed deposits'] + 100 - roundedTotal) * 10) / 10);
  return allocations;
}

function actualAllocations(assetItems){
  if(!deploymentAllocations) deploymentAllocations = deriveAllocationsFromAssets(assetItems);
  return deploymentAllocations;
}

function actualDeploymentReturns(){
  if(!deploymentReturns){
    deploymentReturns = Object.fromEntries(RETIREMENT_ALLOCATION.map(item => [item.name, item.returnRate]));
  }
  return deploymentReturns;
}

function weightedDeploymentReturn(){
  const allocations = deploymentAllocations || {};
  const returns = actualDeploymentReturns();
  return RETIREMENT_ALLOCATION.reduce((sum, item) => sum + (allocations[item.name] || 0) * (returns[item.name] || 0), 0) / 100;
}

function updateDeploymentReturnGauge(){
  const weightedReturn = weightedDeploymentReturn();
  const gauge = $('deploymentReturnGauge');
  gauge.style.setProperty('--gauge', Math.min(100, weightedReturn / 15 * 100));
  setStatusTone(gauge, weightedReturn < 6 ? 'bad' : weightedReturn <= 10 ? 'alert' : 'good');
  $('deploymentReturn').textContent = `${weightedReturn.toFixed(1)}%`;
}

function calculatePlan(){
  const age = value('age'), retirementAge = Math.max(age + 1, value('retireAge'));
  const years = retirementAge - age;
  const assetItems = assets();
  const retirementAssets = assetItems.filter(asset => !asset.excludedFromRetirement);
  const loanItems = loans();
  const currentAssetValue = retirementAssets.reduce((sum, asset) => sum + asset.value, 0);
  const totalLoanValue = loanItems.reduce((sum, loan) => sum + loan.balance, 0);
  const monthly = value('monthlyInvestment');
  const returnRate = currentAssetValue
    ? retirementAssets.reduce((sum, asset) => sum + asset.value * asset.returnRate, 0) / currentAssetValue
    : 10;
  const inflation = Math.min(20, value('inflationRate')) / 100;
  const lifeExpectancy = Math.min(100, Math.max(retirementAge + 1, value('lifeExpectancy')));
  const retirementYears = lifeExpectancy - retirementAge;
  const enteredAllocations = actualAllocations(retirementAssets);
  const enteredReturns = actualDeploymentReturns();
  const retirementReturn = weightedDeploymentReturn() / 100;
  const currentYear = new Date().getFullYear();
  const retirementYear = currentYear + years;
  const expenseItems = majorExpenses();
  const projectedAssets = retirementAssets.reduce((sum, asset) => sum + asset.value * Math.pow(1 + asset.returnRate / 100, years), 0);
  const preRetirementExpenseImpact = expenseItems
    .filter(expense => expense.year < retirementYear)
    .reduce((sum, expense) => {
      const yearsUntilExpense = Math.max(0, expense.year - currentYear);
      return sum + expense.amount * Math.pow(1 + returnRate / 100, Math.max(0, years - yearsUntilExpense));
    }, 0);
  const projected = Math.max(0, projectedAssets - totalLoanValue + futureValue(0, monthly, returnRate, years) - preRetirementExpenseImpact);
  const retirementExpenseMonthly = monthlyRetirementLivingExpenses() * Math.pow(1 + inflation, years);
  const firstYearRetirementExpense = retirementExpenseMonthly * 12;
  let needed = 0;
  for(let yearIndex = 0; yearIndex < retirementYears; yearIndex++){
    needed += firstYearRetirementExpense * Math.pow(1 + inflation, yearIndex) / Math.pow(1 + retirementReturn, yearIndex);
  }
  needed += expenseItems
    .filter(expense => expense.year >= retirementYear && expense.year < retirementYear + retirementYears)
    .reduce((sum, expense) => sum + expense.amount / Math.pow(1 + retirementReturn, expense.year - retirementYear), 0);
  const ratio = needed ? projected / needed : 1;
  const gaugeScores = calculatePlanGaugeScores({
    projected, needed, retirementAssets, monthly, returnRate, totalLoanValue, expenseItems, currentYear
  });
  const readinessComponents = [
    {score:gaugeScores.retirementScore, weight:40},
    {score:gaugeScores.healthScore, weight:20},
    {score:gaugeScores.termScore, weight:20},
    ...(gaugeScores.education.score === null ? [] : [{score:gaugeScores.education.score, weight:10}]),
    ...(gaugeScores.marriage.score === null ? [] : [{score:gaugeScores.marriage.score, weight:10}])
  ];
  const readinessWeight = readinessComponents.reduce((sum, component) => sum + component.weight, 0);
  const score = Math.round(readinessComponents.reduce((sum, component) => sum + component.score * component.weight, 0) / readinessWeight);
  const targetMonthly = Math.max(monthly, monthly / Math.max(ratio, .1));
  const recommended = Math.ceil(targetMonthly / 500) * 500;
  const todayIncome = retirementExpenseMonthly / Math.pow(1 + inflation, years);
  const firstName = $('firstName').value.trim();
  $('resultName').textContent = firstName ? `${firstName}, you’re` : 'You’re';
  $('score').textContent = score;
  $('scoreRing').style.setProperty('--score', score);
  $('projectedCorpus').textContent = compactMoney(projected);
  $('neededCorpus').textContent = compactMoney(needed);
  $('recommendedSip').textContent = money(recommended);
  $('sipGap').textContent = recommended > monthly ? `That’s ${money(recommended - monthly)} more per month.` : 'You’re investing enough for this estimate.';
  $('retirementIncome').textContent = `${compactMoney(todayIncome)} / month`;
  $('midYear').textContent = `In ${Math.round(years/2)} yrs`;
  $('endYear').textContent = `Age ${retirementAge}`;
  const term = gaugeScores.termScore >= 100;
  const health = gaugeScores.healthScore >= 100;
  const gaps = Number(!term) + Number(!health);
  $('protectionStatus').textContent = gaps ? `${gaps} gap${gaps > 1 ? 's' : ''} to close` : 'You’re covered';
  $('protectionCopy').textContent = !health ? 'Prioritise health cover for unexpected medical costs.' : !term ? 'Add term life cover if someone depends on you.' : 'Review cover amounts and nominees once a year.';
  $('scoreCopy').textContent = score >= 85 ? 'A combined view of retirement funds, insurance and entered family goals.' : score >= 60 ? 'Some parts of your plan still need attention; review the gauges below.' : 'Several important parts of your plan need attention; start with the red gauges.';
  const hasBadCoreGauge = [gaugeScores.retirementScore, gaugeScores.healthScore, gaugeScores.termScore].some(componentScore => componentScore < 60);
  const planTone = hasBadCoreGauge ? (score >= 60 ? 'alert' : 'bad') : score >= 85 ? 'good' : score >= 60 ? 'alert' : 'bad';
  $('statusBadge').textContent = planTone === 'good' ? 'Looking strong' : planTone === 'alert' ? 'Needs review' : 'Needs attention';
  setStatusTone($('scoreRing'), planTone);
  setStatusTone($('statusBadge'), planTone);
  setStatusTone($('growthChart'), gaugeScores.retirementScore >= 90 ? 'good' : gaugeScores.retirementScore >= 60 ? 'alert' : 'bad');
  setStatusTone($('recommendedSip').closest('article'), recommended <= monthly ? 'good' : recommended - monthly <= Math.max(0, value('income') - value('expenses') - monthly) ? 'alert' : 'bad');
  setStatusTone($('retirementIncome').closest('article'), planTone);
  setStatusTone($('protectionStatus').closest('article'), gaps === 0 ? 'good' : gaps === 1 ? 'alert' : 'bad');
  renderChart(retirementAssets, monthly, returnRate, years, needed, totalLoanValue, expenseItems, currentYear);
  renderDeployment(projected, enteredAllocations, enteredReturns);
  renderDrawdown(projected, retirementAge, lifeExpectancy, retirementYear, firstYearRetirementExpense, inflation, retirementReturn, expenseItems);
  renderPlanGauges(gaugeScores, projected, needed);
  $('disclaimerInflation').textContent = `${(inflation * 100).toFixed(inflation * 100 % 1 ? 1 : 0)}%`;
}

function renderChart(assetItems, monthly, rate, years, needed, loans, expenseItems, currentYear){
  const chart = $('growthChart'); chart.innerHTML = '';
  const pointCount = 10;
  const points = [];
  for(let i=0;i<pointCount;i++){
    const year = years * i / (pointCount - 1);
    const grownAssets = assetItems.reduce((sum, asset) => sum + asset.value * Math.pow(1 + asset.returnRate / 100, year), 0);
    const expenseImpact = expenseItems
      .filter(expense => expense.year < currentYear + year)
      .reduce((sum, expense) => {
        const expenseOffset = Math.max(0, expense.year - currentYear);
        return sum + expense.amount * Math.pow(1 + rate / 100, Math.max(0, year - expenseOffset));
      }, 0);
    const amount = Math.max(0, grownAssets - loans + futureValue(0, monthly, rate, year) - expenseImpact);
    points.push({year, amount});
  }
  const chartMaximum = Math.max(1, needed, ...points.map(point => point.amount)) * 1.08;
  if(needed > 0){
    const targetLine = document.createElement('span');
    targetLine.className = 'chart-target';
    targetLine.style.bottom = `${Math.min(100, needed / chartMaximum * 100)}%`;
    targetLine.innerHTML = '<em>Required corpus</em>';
    chart.appendChild(targetLine);
  }
  points.forEach(point => {
    const height = Math.min(100, Math.max(3, point.amount / chartMaximum * 100));
    const bar = document.createElement('span');
    bar.className = 'bar';
    bar.style.height = `${height}%`;
    bar.title = `In ${Math.round(point.year)} years: ${money(point.amount)}`;
    chart.appendChild(bar);
  });
  const finalAmount = points.at(-1)?.amount || 0;
  chart.setAttribute('aria-label', `Bar chart of projected corpus growth from today to retirement, ending at ${money(finalAmount)}, compared with a required corpus of ${money(needed)}.`);
}

function renderDeployment(corpus, enteredAllocations, enteredReturns){
  updateDeploymentReturnGauge();
  $('deploymentRows').innerHTML = RETIREMENT_ALLOCATION.map(item => {
    const actual = enteredAllocations[item.name] || 0;
    const highlightsRealEstate = item.name === 'Real estate' && actual > item.suggestedAllocation;
    const severeRealEstate = item.name === 'Real estate' && actual >= 30;
    return `
    <div class="deployment-row${highlightsRealEstate ? ' overallocated' : ''}${severeRealEstate ? ' badly-overallocated' : ''}">
      <b>${item.name}</b>
      <span class="allocation-cell"><span class="allocation-bar"><i style="width:${item.suggestedAllocation * 4}%"></i></span>${item.suggestedAllocation}%</span>
      <label class="actual-allocation-wrap"><input class="actual-allocation" type="number" min="0" max="100" step="0.1" data-asset-class="${item.name}" value="${actual}"><span>%</span></label>
      <label class="actual-allocation-wrap"><input class="assumed-return" type="number" min="0" max="30" step="0.1" data-asset-class="${item.name}" value="${enteredReturns[item.name]}"><span>%</span></label>
      <span>${money(corpus * actual / 100)}</span>
    </div>`;
  }).join('');
  updateAllocationInsight();
}

function updateAllocationInsight(){
  const allocations = deploymentAllocations || {};
  const realEstate = Number(allocations['Real estate']) || 0;
  const suggestedRealEstate = RETIREMENT_ALLOCATION.find(item => item.name === 'Real estate').suggestedAllocation;
  const total = RETIREMENT_ALLOCATION.reduce((sum, item) => sum + (Number(allocations[item.name]) || 0), 0);
  const severeRealEstate = realEstate >= 30;
  const messages = [];
  if(realEstate > suggestedRealEstate){
    messages.push(`<strong>High real-estate concentration:</strong> ${realEstate}% actual versus ${suggestedRealEstate}% suggested. Heavy property exposure can reduce liquidity and diversification during retirement.`);
  } else {
    messages.push(`Real estate is ${realEstate}% of the entered retirement allocation, against a ${suggestedRealEstate}% suggestion.`);
  }
  if(Math.abs(total - 100) > 0.05) messages.push(`<strong>Actual allocation totals ${total.toFixed(1)}%.</strong> Adjust it to 100% for a complete projection.`);
  $('allocationInsight').innerHTML = messages.join(' ');
  $('allocationInsight').classList.toggle('alert', !severeRealEstate && (realEstate > suggestedRealEstate || Math.abs(total - 100) > 0.05));
  $('allocationInsight').classList.toggle('bad', severeRealEstate);
}

function renderDrawdown(openingCorpus, retirementAge, lifeExpectancy, retirementYear, firstYearExpense, inflation, returnRate, expenseItems){
  let openingFunds = openingCorpus;
  let depletedAtAge = null;
  const rows = [];
  for(let age = retirementAge; age < lifeExpectancy; age++){
    const yearIndex = age - retirementAge;
    const calendarYear = retirementYear + yearIndex;
    const returns = openingFunds > 0 ? openingFunds * returnRate : 0;
    const livingExpenses = firstYearExpense * Math.pow(1 + inflation, yearIndex);
    const majorExpense = expenseItems
      .filter(expense => expense.year === calendarYear)
      .reduce((sum, expense) => sum + expense.amount, 0);
    const closingFunds = openingFunds + returns - livingExpenses - majorExpense;
    if(closingFunds < 0 && depletedAtAge === null) depletedAtAge = age;
    rows.push(`<tr${closingFunds < 0 ? ' class="depleted"' : ''}>
      <td>${calendarYear}</td><td>${age}</td><td>${money(openingFunds)}</td><td>${money(returns)}</td>
      <td>${money(livingExpenses)}</td><td>${money(majorExpense)}</td><td>${money(closingFunds)}</td>
    </tr>`);
    openingFunds = closingFunds;
  }
  $('drawdownBody').innerHTML = rows.join('');
  $('scheduleHorizon').textContent = `Through age ${lifeExpectancy}`;
  setStatusTone($('drawdownNote'), depletedAtAge !== null ? 'bad' : 'good');
  $('drawdownNote').textContent = depletedAtAge !== null
    ? `On these assumptions, the retirement fund may be depleted around age ${depletedAtAge}.`
    : `On these assumptions, approximately ${money(Math.max(0, openingFunds))} remains at age ${lifeExpectancy}.`;
}

function fundsBeforeGoal(targetYear, assetItems, monthly, returnRate, loans, expenseItems, currentYear){
  const yearsUntilGoal = Math.max(0, targetYear - currentYear);
  const grownAssets = assetItems.reduce((sum, asset) => sum + asset.value * Math.pow(1 + asset.returnRate / 100, yearsUntilGoal), 0);
  const earlierExpenseImpact = expenseItems
    .filter(expense => expense.year < targetYear)
    .reduce((sum, expense) => {
      const yearsAfterExpense = Math.max(0, targetYear - expense.year);
      return sum + expense.amount * Math.pow(1 + returnRate / 100, yearsAfterExpense);
    }, 0);
  return Math.max(0, grownAssets - loans + futureValue(0, monthly, returnRate, yearsUntilGoal) - earlierExpenseImpact);
}

function goalReadiness(predicate, assetItems, monthly, returnRate, loans, expenseItems, currentYear){
  const matching = expenseItems.filter(expense => predicate(`${expense.type} ${expense.customType}`.toLowerCase()));
  const total = matching.reduce((sum, expense) => sum + expense.amount, 0);
  if(!matching.length) return {score:null, total:0};
  if(!total) return {score:0, total:0};
  const covered = matching.reduce((sum, expense) => {
    const allCostsThatYear = expenseItems.filter(item => item.year === expense.year).reduce((yearSum, item) => yearSum + item.amount, 0);
    const available = fundsBeforeGoal(expense.year, assetItems, monthly, returnRate, loans, expenseItems, currentYear);
    const yearCoverage = allCostsThatYear ? Math.min(1, available / allCostsThatYear) : 0;
    return sum + expense.amount * yearCoverage;
  }, 0);
  return {score:Math.min(100, covered / total * 100), total};
}

function renderGauge(name, score, meta){
  const gauge = $(`${name}Gauge`);
  const normalizedScore = score === null ? 0 : Math.min(100, Math.max(0, score));
  gauge.style.setProperty('--gauge', normalizedScore);
  gauge.classList.remove('status-good', 'status-alert', 'status-bad');
  if(score !== null) setStatusTone(gauge, normalizedScore >= 90 ? 'good' : normalizedScore >= 60 ? 'alert' : 'bad');
  $(`${name}GaugeValue`).textContent = score === null ? '—' : `${Math.round(normalizedScore)}%`;
  $(`${name}GaugeMeta`).textContent = meta;
}

function calculatePlanGaugeScores({projected, needed, retirementAssets, monthly, returnRate, totalLoanValue, expenseItems, currentYear}){
  const retirementScore = needed ? Math.min(100, projected / needed * 100) : 100;
  const healthCover = policies('health').reduce((sum, policy) => sum + policy.cover, 0);
  const termCover = policies('term').reduce((sum, policy) => sum + policy.cover, 0);
  const targetHealth = Math.max(1000000, monthlyRetirementLivingExpenses() * 12);
  const termIncomeYears = remainingIncomeReplacementYears();
  const targetTerm = termCoverNeed();
  const healthScore = Math.min(100, healthCover / targetHealth * 100);
  const termScore = targetTerm > 0 ? Math.min(100, termCover / targetTerm * 100) : 100;
  const education = goalReadiness(text => text.includes('education'), retirementAssets, monthly, returnRate, totalLoanValue, expenseItems, currentYear);
  const marriage = goalReadiness(text => text.includes('marriage'), retirementAssets, monthly, returnRate, totalLoanValue, expenseItems, currentYear);
  return {retirementScore, healthScore, termScore, healthCover, termCover, targetHealth, targetTerm, termIncomeYears, education, marriage};
}

function renderPlanGauges(scores, projected, needed){
  renderGauge('retirement', scores.retirementScore, `${compactMoney(projected)} of ${compactMoney(needed)} needed`);
  renderGauge('healthInsurance', scores.healthScore, `${compactMoney(scores.healthCover)} of ${compactMoney(scores.targetHealth)} target`);
  renderGauge('termInsurance', scores.termScore, scores.termIncomeYears > 0
    ? `${compactMoney(scores.termCover)} of ${compactMoney(scores.targetTerm)} target (${scores.termIncomeYears} income year${scores.termIncomeYears === 1 ? '' : 's'})`
    : 'No income-replacement target after retirement');
  renderGauge('education', scores.education.score, scores.education.score === null ? 'No expense entered' : `${compactMoney(scores.education.total)} anticipated`);
  renderGauge('marriage', scores.marriage.score, scores.marriage.score === null ? 'No expense entered' : `${compactMoney(scores.marriage.total)} anticipated`);
}

function addAsset(asset = {}, shouldFocus = true){
  assetCount += 1;
  const isExcluded = asset.excludedFromRetirement === true;
  const migratedType = asset.type === 'House' ? 'Independent house / villa' : asset.type;
  const type = ASSET_RETURNS[migratedType] !== undefined ? migratedType : 'Other';
  const availableTypes = isExcluded ? ['Independent house / villa', 'Flat'] : Object.keys(ASSET_RETURNS);
  const row = document.createElement('div');
  row.className = `asset-row${isExcluded ? ' excluded-asset' : ''}`;
  row.dataset.assetId = assetCount;
  row.dataset.excludedFromRetirement = String(isExcluded);
  row.innerHTML = `
    <select class="family-input asset-type" aria-label="Asset type">
      ${availableTypes.map(option => `<option${type === option ? ' selected' : ''}>${option}</option>`).join('')}
    </select>
    <input class="family-input asset-notes" type="text" aria-label="Asset notes" placeholder="e.g. location, account or owner" value="${escapeText(asset.notes || '')}">
    <div class="asset-money asset-current-value"><span>₹</span><input class="family-input asset-value" type="text" inputmode="numeric" aria-label="Current asset value" placeholder="Value" value="${asset.value ?? ''}"></div>
    <div class="asset-rate"><input class="family-input asset-return" type="number" aria-label="Expected annual return" min="0" max="30" step="0.1" value="${asset.returnRate ?? ASSET_RETURNS[type]}"><span>%</span></div>
    ${isExcluded
      ? '<span class="excluded-mark" title="Not counted toward retirement assets" aria-label="Not counted toward retirement assets">⊘</span>'
      : '<button type="button" class="remove-member" aria-label="Remove asset">×</button>'}`;
  const removeButton = row.querySelector('.remove-member');
  if(removeButton) removeButton.addEventListener('click', () => {
      row.remove();
      updateAssetSummary();
      saveState();
    });
  if(isExcluded && $('assetList').firstChild){
    $('assetList').insertBefore(row, $('assetList').firstChild);
  } else {
    $('assetList').appendChild(row);
  }
  updateAssetSummary();
  if(shouldFocus) row.querySelector('.asset-type').focus();
}

function assets(){
  return [...$('assetList').querySelectorAll('.asset-row')].map(row => ({
    type: row.querySelector('.asset-type').value,
    notes: row.querySelector('.asset-notes').value.trim(),
    value: numericValue(row.querySelector('.asset-value')),
    returnRate: Math.max(0, Number(row.querySelector('.asset-return').value) || 0),
    excludedFromRetirement: row.dataset.excludedFromRetirement === 'true'
  }));
}

function updateAssetSummary(){
  const total = assets().filter(asset => !asset.excludedFromRetirement).reduce((sum, asset) => sum + asset.value, 0);
  $('totalAssets').textContent = money(total);
  $('emptyAssets').classList.toggle('hidden', $('assetList').children.length > 0);
}

function addLoan(loan = {}, shouldFocus = true){
  loanCount += 1;
  const type = LOAN_RATES[loan.type] !== undefined ? loan.type : 'Other';
  const row = document.createElement('div');
  row.className = 'loan-row';
  row.dataset.loanId = loanCount;
  row.innerHTML = `
    <select class="family-input loan-type" aria-label="Loan type">
      ${Object.keys(LOAN_RATES).map(option => `<option${type === option ? ' selected' : ''}>${option}</option>`).join('')}
    </select>
    <div class="asset-money"><span>₹</span><input class="family-input loan-balance" type="text" inputmode="numeric" aria-label="Outstanding loan balance" placeholder="Balance" value="${loan.balance ?? ''}"></div>
    <div class="asset-rate"><input class="family-input loan-rate" type="number" aria-label="Annual loan interest rate" min="0" max="60" step="0.1" value="${loan.interestRate ?? LOAN_RATES[type]}"><span>%</span></div>
    <button type="button" class="remove-member" aria-label="Remove loan">×</button>`;
  row.querySelector('.remove-member').addEventListener('click', () => {
    row.remove();
    updateLoanSummary();
    saveState();
  });
  $('loanList').appendChild(row);
  updateLoanSummary();
  if(shouldFocus) row.querySelector('.loan-type').focus();
}

function loans(){
  return [...$('loanList').querySelectorAll('.loan-row')].map(row => ({
    type: row.querySelector('.loan-type').value,
    balance: numericValue(row.querySelector('.loan-balance')),
    interestRate: Math.max(0, Number(row.querySelector('.loan-rate').value) || 0)
  }));
}

function updateLoanSummary(){
  const loanItems = loans();
  const total = loanItems.reduce((sum, loan) => sum + loan.balance, 0);
  const weightedRate = total
    ? loanItems.reduce((sum, loan) => sum + loan.balance * loan.interestRate, 0) / total
    : 0;
  $('totalLoans').textContent = money(total);
  $('averageLoanRate').textContent = `${weightedRate.toFixed(weightedRate % 1 ? 1 : 0)}%`;
  $('emptyLoans').classList.toggle('hidden', $('loanList').children.length > 0);
}

function addPolicy(kind, policy = {}, shouldFocus = true){
  policyCount += 1;
  const availableInsurers = POLICY_INSURERS[kind];
  const selectedInsurer = availableInsurers.includes(policy.insurer) ? policy.insurer : 'Not specified';
  const isCustom = selectedInsurer === 'Other / custom';
  const row = document.createElement('div');
  row.className = 'policy-row';
  row.dataset.policyId = policyCount;
  row.dataset.policyKind = kind;
  row.innerHTML = `
    <div class="insurer-control">
      <select class="family-input insurer-select" aria-label="${kind === 'health' ? 'Health' : 'Term'} insurer">
        ${availableInsurers.map(insurer => `<option${selectedInsurer === insurer ? ' selected' : ''}>${insurer}</option>`).join('')}
      </select>
      <input class="family-input custom-insurer${isCustom ? '' : ' hidden'}" type="text" aria-label="Custom insurer name" placeholder="Enter insurer name" value="${escapeText(policy.customInsurer || '')}">
    </div>
    <div class="asset-money"><span>₹</span><input class="family-input policy-cover" type="text" inputmode="numeric" aria-label="Policy cover amount" placeholder="Cover" value="${policy.cover ?? ''}"></div>
    <div class="asset-money"><span>₹</span><input class="family-input policy-premium" type="text" inputmode="numeric" aria-label="Monthly policy premium" placeholder="Monthly" value="${policy.premium ?? ''}"></div>
    <select class="family-input policy-source" aria-label="Policy provided through">
      <option${policy.source !== 'Employer provided' ? ' selected' : ''}>Personally taken</option>
      <option${policy.source === 'Employer provided' ? ' selected' : ''}>Employer provided</option>
    </select>
    <button type="button" class="remove-member" aria-label="Remove policy">×</button>`;
  row.querySelector('.remove-member').addEventListener('click', () => {
    row.remove();
    updateProtectionSummary();
    saveState();
  });
  $(`${kind}PolicyList`).appendChild(row);
  updateProtectionSummary();
  if(shouldFocus) row.querySelector('.insurer-select').focus();
}

function policies(kind){
  return [...$(`${kind}PolicyList`).querySelectorAll('.policy-row')].map(row => ({
    insurer: row.querySelector('.insurer-select').value,
    customInsurer: row.querySelector('.custom-insurer').value,
    cover: numericValue(row.querySelector('.policy-cover')),
    premium: numericValue(row.querySelector('.policy-premium')),
    source: row.querySelector('.policy-source').value
  }));
}

function updateProtectionSummary(){
  const healthPolicies = policies('health');
  const termPolicies = policies('term');
  const healthCover = healthPolicies.reduce((sum, policy) => sum + policy.cover, 0);
  const termCover = termPolicies.reduce((sum, policy) => sum + policy.cover, 0);
  const healthPremium = healthPolicies.reduce((sum, policy) => sum + policy.premium, 0);
  const termPremium = termPolicies.reduce((sum, policy) => sum + policy.premium, 0);
  $('totalHealthCover').textContent = money(healthCover);
  $('totalTermCover').textContent = money(termCover);
  $('totalHealthPremium').textContent = money(healthPremium);
  $('totalTermPremium').textContent = money(termPremium);
  $('emptyHealthPolicies').classList.toggle('hidden', healthPolicies.length > 0);
  $('emptyTermPolicies').classList.toggle('hidden', termPolicies.length > 0);
  const suggestedTermCover = termCoverNeed();
  const incomeYears = remainingIncomeReplacementYears();
  if(!healthCover){
    $('insuranceHint').textContent = 'Add health cover to protect your savings from unexpected medical costs.';
    setStatusTone(document.querySelector('.warning'), 'bad');
  } else if(suggestedTermCover > 0 && (!termCover || termCover < suggestedTermCover)){
    $('insuranceHint').textContent = `Consider total term cover of around ${money(suggestedTermCover)} to replace ${incomeYears} remaining year${incomeYears === 1 ? '' : 's'} of income until retirement.`;
    setStatusTone(document.querySelector('.warning'), 'alert');
  } else {
    $('insuranceHint').textContent = 'Your core protection is recorded. Review cover amounts and nominees every year.';
    setStatusTone(document.querySelector('.warning'), 'good');
  }
}

function addMajorExpense(expense = {}, shouldFocus = true){
  expenseCount += 1;
  const selectedType = EXPENSE_TYPES.includes(expense.type) ? expense.type : 'Other / custom';
  const isCustom = selectedType === 'Other / custom';
  const currentYear = new Date().getFullYear();
  const row = document.createElement('div');
  row.className = 'expense-row';
  row.dataset.expenseId = expenseCount;
  row.innerHTML = `
    <div class="expense-type-control">
      <select class="family-input expense-type" aria-label="Major expense type">
        ${EXPENSE_TYPES.map(type => `<option${selectedType === type ? ' selected' : ''}>${type}</option>`).join('')}
      </select>
      <input class="family-input custom-expense${isCustom ? '' : ' hidden'}" type="text" aria-label="Custom expense description" placeholder="Describe the expense" value="${escapeText(expense.customType || '')}">
    </div>
    <input class="family-input expense-year" type="number" aria-label="Year of expense" min="${currentYear}" max="2100" placeholder="Year" value="${expense.year || currentYear + 5}">
    <div class="asset-money"><span>₹</span><input class="family-input expense-amount" type="text" inputmode="numeric" aria-label="Anticipated expense amount" placeholder="Amount" value="${expense.amount ?? ''}"></div>
    <button type="button" class="remove-member" aria-label="Remove expense">×</button>`;
  row.querySelector('.remove-member').addEventListener('click', () => {
    row.remove();
    updateExpenseSummary();
    saveState();
  });
  $('expenseList').appendChild(row);
  updateExpenseSummary();
  if(shouldFocus) row.querySelector('.expense-type').focus();
}

function majorExpenses(){
  return [...$('expenseList').querySelectorAll('.expense-row')].map(row => ({
    type: row.querySelector('.expense-type').value,
    customType: row.querySelector('.custom-expense').value,
    year: Math.max(new Date().getFullYear(), Number(row.querySelector('.expense-year').value) || new Date().getFullYear()),
    amount: numericValue(row.querySelector('.expense-amount'))
  }));
}

function updateExpenseSummary(){
  const expenseItems = majorExpenses();
  const total = expenseItems.reduce((sum, expense) => sum + expense.amount, 0);
  $('totalExpenses').textContent = money(total);
  $('emptyExpenses').classList.toggle('hidden', expenseItems.length > 0);
}

function addFamilyMember(member = {}, shouldFocus = true){
  memberCount += 1;
  const row = document.createElement('div');
  row.className = 'family-row';
  row.dataset.memberId = memberCount;
  row.innerHTML = `
    <input class="family-input member-name" type="text" aria-label="Family member name" placeholder="Member name" value="${escapeText(member.name || '')}">
    <select class="family-input" aria-label="Relationship">
      ${['Spouse','Child','Parent','Sibling','Other'].map(option => `<option${member.relationship === option ? ' selected' : ''}>${option}</option>`).join('')}
    </select>
    <div class="age-input"><input class="family-input" type="number" aria-label="Family member age" placeholder="Age" min="0" max="110" value="${member.age ?? ''}"><span>yrs</span></div>
    <button type="button" class="remove-member" aria-label="Remove family member">×</button>`;
  row.querySelector('.remove-member').addEventListener('click', () => {
    row.remove();
    updateFamilyEmptyState();
    saveState();
  });
  $('familyList').appendChild(row);
  updateFamilyEmptyState();
  if(shouldFocus) row.querySelector('.member-name').focus();
}

function escapeText(text){
  const span = document.createElement('span');
  span.textContent = text;
  return span.innerHTML;
}

function updateFamilyEmptyState(){
  $('emptyFamily').classList.toggle('hidden', $('familyList').children.length > 0);
}

function familyMembers(){
  return [...$('familyList').querySelectorAll('.family-row')].map(row => ({
    name: row.querySelector('.member-name').value,
    relationship: row.querySelector('select').value,
    age: row.querySelector('.age-input input').value
  }));
}

function saveState(){
  const fields = {};
  document.querySelectorAll('#plannerForm input[id], #plannerForm select[id]').forEach(field => {
    fields[field.id] = field.type === 'radio' ? field.checked : isCurrencyInput(field) ? String(numericValue(field)) : field.value;
  });
  const state = {
    fields,
    family: familyMembers(),
    assets: assets(),
    loans: loans(),
    majorExpenses: majorExpenses(),
    healthPolicies: policies('health'),
    termPolicies: policies('term'),
    deploymentAllocations,
    deploymentReturns,
    riskProfileVersion: 1,
    cashFlowBreakdownVersion: 3,
    currentStep: current
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(error) { console.warn('Could not save planner data.', error); }
}

function migrateLegacyPlannerState(){
  if(localStorage.getItem(STORAGE_KEY)) return;
  for(let index = 0; index < localStorage.length; index += 1){
    const candidateKey = localStorage.key(index);
    if(!candidateKey || candidateKey === STORAGE_KEY || !candidateKey.endsWith('-test-data-v1')) continue;
    try {
      const candidateState = JSON.parse(localStorage.getItem(candidateKey));
      if(!candidateState || typeof candidateState.fields !== 'object' || !Number.isInteger(candidateState.currentStep)) continue;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(candidateState));
      localStorage.removeItem(candidateKey);
      return;
    } catch(error){
      console.warn('Could not migrate saved planner data.', error);
    }
  }
}

function restoreState(){
  try {
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(!state) return 0;
    Object.entries(state.fields || {}).forEach(([id, savedValue]) => {
      if(!$(id)) return;
      if($(id).type === 'radio') $(id).checked = savedValue === true || savedValue === 'true';
      else $(id).value = savedValue;
    });
    if(!state.cashFlowBreakdownVersion){
      ['groceryExpenses','utilityBills','healthInsurancePremiums','termInsurancePremiums','rentExpense','societyMaintenance'].forEach(id => { $(id).value = '0'; });
      $('otherExpenses').value = String(parseAmount(state.fields?.expenses));
    } else if(state.cashFlowBreakdownVersion === 1){
      $('healthInsurancePremiums').value = String(Math.round(parseAmount(state.fields?.annualInsurancePremiums) / 12));
      $('termInsurancePremiums').value = '0';
    } else if(state.cashFlowBreakdownVersion === 2){
      $('healthInsurancePremiums').value = String(parseAmount(state.fields?.insurancePremiums));
      $('termInsurancePremiums').value = '0';
    }
    (state.family || []).forEach(member => addFamilyMember(member, false));
    if(Array.isArray(state.assets)){
      restoredAssetList = true;
      state.assets.forEach(asset => addAsset(asset, false));
    } else {
      const legacyCorpus = Math.max(0, Number(state.fields?.corpus) || 0);
      const legacyOther = Math.max(0, Number(state.fields?.otherAssets) || 0);
      if(legacyCorpus) addAsset({type:'Mutual funds', value:legacyCorpus, returnRate:Number(state.fields?.returnRate) || 10}, false);
      if(legacyOther) addAsset({type:'Other', value:legacyOther, returnRate:Number(state.fields?.returnRate) || 6}, false);
      restoredAssetList = Boolean(legacyCorpus || legacyOther);
    }
    if(Array.isArray(state.loans)){
      state.loans.forEach(loan => addLoan(loan, false));
    } else {
      const legacyLoans = parseAmount(state.fields?.loans);
      if(legacyLoans) addLoan({type:'Other', balance:legacyLoans, interestRate:12}, false);
    }
    if(Array.isArray(state.majorExpenses)){
      state.majorExpenses.forEach(expense => addMajorExpense(expense, false));
    }
    if(Array.isArray(state.healthPolicies)){
      state.healthPolicies.forEach(policy => addPolicy('health', policy, false));
    } else if(state.health === 'yes' || parseAmount(state.fields?.healthCover)){
      addPolicy('health', {insurer:'Not specified', cover:parseAmount(state.fields?.healthCover), source:'Personally taken'}, false);
    }
    if(Array.isArray(state.termPolicies)){
      state.termPolicies.forEach(policy => addPolicy('term', policy, false));
    } else if(state.term === 'yes' || parseAmount(state.fields?.termCover)){
      addPolicy('term', {insurer:'Not specified', cover:parseAmount(state.fields?.termCover), source:'Personally taken'}, false);
    }
    if(state.deploymentAllocations && typeof state.deploymentAllocations === 'object'){
      deploymentAllocations = Object.fromEntries(RETIREMENT_ALLOCATION.map(item => [
        item.name,
        Math.min(100, Math.max(0, Number(state.deploymentAllocations[item.name]) || 0))
      ]));
    }
    if(state.deploymentReturns && typeof state.deploymentReturns === 'object'){
      deploymentReturns = Object.fromEntries(RETIREMENT_ALLOCATION.map(item => [
        item.name,
        state.deploymentReturns[item.name] === undefined
          ? item.returnRate
          : Math.min(30, Math.max(0, Number(state.deploymentReturns[item.name]) || 0))
      ]));
    }
    const savedStep = Number.isInteger(state.currentStep) ? state.currentStep : 0;
    return state.riskProfileVersion || savedStep < 2 ? savedStep : savedStep + 1;
  } catch(error) {
    console.warn('Could not restore planner data.', error);
    return 0;
  }
}

function showPanel(index){
  current = Math.max(0, Math.min(index, panels.length - 1));
  panels.forEach((p,i) => p.classList.toggle('active', i === current));
  steps.forEach((s,i) => { s.classList.toggle('active',i===current); s.classList.toggle('done',i<current); });
  backBtn.disabled = current === 0;
  stepCount.textContent = `Step ${current + 1} of ${panels.length}`;
  const labels = ['Next: Cash flow','Next: Risk profile','Next: Your wealth','Next: Major expenses','Next: Protection','See my plan','Download report'];
  const actionIcon = current === panels.length - 1 ? '↓' : '→';
  nextBtn.innerHTML = `${labels[current]} <span>${actionIcon}</span>`;
  if(current === panels.length - 1) calculatePlan();
  saveState();
  document.querySelector('.planner-card').scrollIntoView({behavior:'smooth',block:'start'});
}

nextBtn.addEventListener('click', () => {
  if(current === panels.length - 1){
    calculatePlan();
    window.print();
  } else {
    showPanel(current + 1);
  }
});
backBtn.addEventListener('click', () => showPanel(current - 1));
steps.forEach(step => step.addEventListener('click', () => showPanel(Number(step.dataset.step))));
$('addMemberBtn').addEventListener('click', () => { addFamilyMember(); saveState(); });
$('addAssetBtn').addEventListener('click', () => { addAsset(); saveState(); });
$('addLoanBtn').addEventListener('click', () => { addLoan(); saveState(); });
$('addExpenseBtn').addEventListener('click', () => { addMajorExpense(); saveState(); });
$('addHealthPolicyBtn').addEventListener('click', () => { addPolicy('health'); saveState(); });
$('addTermPolicyBtn').addEventListener('click', () => { addPolicy('term'); saveState(); });
document.querySelectorAll('input').forEach(input => input.addEventListener('input', () => {
  if(isCurrencyInput(input)) formatCurrencyInput(input);
  updateBasics(); updateCash(); updateRiskProfile(); updateProtectionSummary(); saveState();
}));
document.querySelectorAll('select[id]').forEach(select => select.addEventListener('change', saveState));
$('familyList').addEventListener('input', saveState);
$('familyList').addEventListener('change', saveState);
$('assetList').addEventListener('input', event => {
  if(isCurrencyInput(event.target)) formatCurrencyInput(event.target);
  updateAssetSummary(); saveState();
});
$('assetList').addEventListener('change', event => {
  if(event.target.classList.contains('asset-type')){
    event.target.closest('.asset-row').querySelector('.asset-return').value = ASSET_RETURNS[event.target.value];
  }
  updateAssetSummary();
  saveState();
});
$('loanList').addEventListener('input', event => {
  if(isCurrencyInput(event.target)) formatCurrencyInput(event.target);
  updateLoanSummary(); saveState();
});
$('loanList').addEventListener('change', event => {
  if(event.target.classList.contains('loan-type')){
    event.target.closest('.loan-row').querySelector('.loan-rate').value = LOAN_RATES[event.target.value];
  }
  updateLoanSummary();
  saveState();
});
$('expenseList').addEventListener('input', event => {
  if(isCurrencyInput(event.target)) formatCurrencyInput(event.target);
  updateExpenseSummary(); saveState();
});
$('expenseList').addEventListener('change', event => {
  if(event.target.classList.contains('expense-type')){
    const customInput = event.target.closest('.expense-row').querySelector('.custom-expense');
    const isCustom = event.target.value === 'Other / custom';
    customInput.classList.toggle('hidden', !isCustom);
    if(isCustom) customInput.focus();
  }
  updateExpenseSummary(); saveState();
});
['health','term'].forEach(kind => {
  const list = $(`${kind}PolicyList`);
  list.addEventListener('input', event => {
    if(isCurrencyInput(event.target)) formatCurrencyInput(event.target);
    updateProtectionSummary(); saveState();
  });
  list.addEventListener('change', event => {
    if(event.target.classList.contains('insurer-select')){
      const customInput = event.target.closest('.policy-row').querySelector('.custom-insurer');
      const isCustom = event.target.value === 'Other / custom';
      customInput.classList.toggle('hidden', !isCustom);
      if(isCustom) customInput.focus();
    }
    updateProtectionSummary(); saveState();
  });
});
$('deploymentRows').addEventListener('input', event => {
  if(event.target.classList.contains('actual-allocation')){
    const allocation = Math.min(100, Math.max(0, Number(event.target.value) || 0));
    deploymentAllocations[event.target.dataset.assetClass] = allocation;
    updateAllocationInsight();
    updateDeploymentReturnGauge();
    saveState();
  }
  if(event.target.classList.contains('assumed-return')){
    const returnRate = Math.min(30, Math.max(0, Number(event.target.value) || 0));
    deploymentReturns[event.target.dataset.assetClass] = returnRate;
    updateDeploymentReturnGauge();
    saveState();
  }
});
$('deploymentRows').addEventListener('change', event => {
  if(event.target.classList.contains('actual-allocation') || event.target.classList.contains('assumed-return')) calculatePlan();
});
$('resetDataBtn').addEventListener('click', () => {
  if(confirm('Clear all saved planner values and restore the defaults?')){
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  }
});

migrateLegacyPlannerState();
const restoredStep = restoreState();
if(!assets().some(asset => asset.excludedFromRetirement)){
  addAsset({type:'Independent house / villa', value:'', returnRate:6, excludedFromRetirement:true}, false);
}
if(!restoredAssetList){
  addAsset({type:'EPF / PF', value:1800000, returnRate:8.25}, false);
  addAsset({type:'Mutual funds', value:500000, returnRate:11}, false);
}
prepareCurrencyInputs();
updateBasics(); updateCash(); updateRiskProfile(); updateAssetSummary(); updateLoanSummary(); updateExpenseSummary(); updateProtectionSummary(); showPanel(restoredStep);
