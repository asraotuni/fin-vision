const panels = [...document.querySelectorAll('.panel')];
const steps = [...document.querySelectorAll('.step')];
const nextBtn = document.querySelector('#nextBtn');
const backBtn = document.querySelector('#backBtn');
const stepCount = document.querySelector('#stepCount');
const STORAGE_KEY = 'paisaplan-test-data-v1';
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
let current = 0;
let memberCount = 0;
let assetCount = 0;
let loanCount = 0;
let policyCount = 0;
let expenseCount = 0;
let restoredAssetList = false;

const $ = id => document.getElementById(id);
const parseAmount = rawValue => Math.max(0, Number(String(rawValue || '').replace(/,/g, '')) || 0);
const numericValue = input => parseAmount(input?.value);
const value = id => numericValue($(id));
const money = n => new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 }).format(n);
const indianNumber = n => new Intl.NumberFormat('en-IN', { maximumFractionDigits:0 }).format(n);
const compactMoney = n => {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return money(n);
};

function updateBasics(){
  const years = Math.max(0, value('retireAge') - value('age'));
  $('yearsGrow').textContent = `${years} year${years === 1 ? '' : 's'}`;
}

function updateCash(){
  const income = value('income');
  const surplus = income - value('expenses') - value('monthlyInvestment');
  const totalSaved = Math.max(0, income - value('expenses'));
  $('surplus').textContent = money(surplus);
  $('surplus').style.color = surplus < 0 ? '#d95643' : '';
  $('savingsRate').textContent = `${income ? Math.round(totalSaved / income * 100) : 0}%`;
  $('cashHint').textContent = surplus < 0 ? 'Your monthly outflow needs a quick review.' : totalSaved / income >= .3 ? 'A healthy base to build from.' : 'There’s room to grow your savings rate.';
}

function isCurrencyInput(input){
  return input.matches('.money input, .asset-value, .loan-balance, .policy-cover, .expense-amount');
}

function formatCurrencyInput(input){
  const digits = input.value.replace(/[^\d]/g, '');
  input.value = digits ? indianNumber(Number(digits)) : '';
}

function prepareCurrencyInputs(){
  document.querySelectorAll('.money input, .asset-value, .loan-balance, .policy-cover, .expense-amount').forEach(input => {
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
  const inflation = .06;
  const currentYear = new Date().getFullYear();
  const retirementYear = currentYear + years;
  const expenseItems = majorExpenses();
  const projectedAssets = retirementAssets.reduce((sum, asset) => sum + asset.value * Math.pow(1 + asset.returnRate / 100, years), 0);
  const preRetirementExpenseImpact = expenseItems
    .filter(expense => expense.year <= retirementYear)
    .reduce((sum, expense) => {
      const yearsUntilExpense = Math.max(0, expense.year - currentYear);
      return sum + expense.amount * Math.pow(1 + returnRate / 100, Math.max(0, years - yearsUntilExpense));
    }, 0);
  const projected = Math.max(0, projectedAssets - totalLoanValue + futureValue(0, monthly, returnRate, years) - preRetirementExpenseImpact);
  const retirementExpenseMonthly = value('expenses') * Math.pow(1 + inflation, years);
  const postRetirementExpenseNeed = expenseItems
    .filter(expense => expense.year > retirementYear)
    .reduce((sum, expense) => sum + expense.amount / Math.pow(1 + inflation, expense.year - retirementYear), 0);
  const needed = retirementExpenseMonthly * 12 * 25 + postRetirementExpenseNeed;
  const ratio = needed ? projected / needed : 1;
  const score = Math.min(100, Math.max(12, Math.round(ratio * 82)));
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
  const term = policies('term').some(policy => policy.cover > 0);
  const health = policies('health').some(policy => policy.cover > 0);
  const gaps = Number(!term) + Number(!health);
  $('protectionStatus').textContent = gaps ? `${gaps} gap${gaps > 1 ? 's' : ''} to close` : 'You’re covered';
  $('protectionCopy').textContent = !health ? 'Prioritise health cover for unexpected medical costs.' : !term ? 'Add term life cover if someone depends on you.' : 'Review cover amounts and nominees once a year.';
  $('statusBadge').textContent = score >= 85 ? 'Looking strong' : score >= 60 ? 'A promising start' : 'Needs attention';
  $('scoreCopy').textContent = score >= 85 ? 'You’re in good shape. Keep reviewing your plan yearly.' : score >= 60 ? 'You’re on your way. A few smart changes can close the gap.' : 'Your goal needs a boost. Start with the monthly investment target.';
  renderChart(retirementAssets, monthly, returnRate, years, needed, totalLoanValue, expenseItems, currentYear);
}

function renderChart(assetItems, monthly, rate, years, needed, loans, expenseItems, currentYear){
  const chart = $('growthChart'); chart.innerHTML = '';
  const points = 22;
  for(let i=0;i<points;i++){
    const year = years * i / (points - 1);
    const grownAssets = assetItems.reduce((sum, asset) => sum + asset.value * Math.pow(1 + asset.returnRate / 100, year), 0);
    const expenseImpact = expenseItems
      .filter(expense => expense.year <= currentYear + year)
      .reduce((sum, expense) => {
        const expenseOffset = Math.max(0, expense.year - currentYear);
        return sum + expense.amount * Math.pow(1 + rate / 100, Math.max(0, year - expenseOffset));
      }, 0);
    const amount = Math.max(0, grownAssets - loans + futureValue(0, monthly, rate, year) - expenseImpact);
    const height = Math.min(100, Math.max(4, amount / Math.max(needed, amount) * 100));
    const bar = document.createElement('span'); bar.className='bar'; bar.style.height=`${height}%`; chart.appendChild(bar);
  }
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
    <div class="asset-money"><span>₹</span><input class="family-input asset-value" type="text" inputmode="numeric" aria-label="Current asset value" placeholder="Value" value="${asset.value ?? ''}"></div>
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
    source: row.querySelector('.policy-source').value
  }));
}

function updateProtectionSummary(){
  const healthPolicies = policies('health');
  const termPolicies = policies('term');
  const healthCover = healthPolicies.reduce((sum, policy) => sum + policy.cover, 0);
  const termCover = termPolicies.reduce((sum, policy) => sum + policy.cover, 0);
  $('totalHealthCover').textContent = money(healthCover);
  $('totalTermCover').textContent = money(termCover);
  $('emptyHealthPolicies').classList.toggle('hidden', healthPolicies.length > 0);
  $('emptyTermPolicies').classList.toggle('hidden', termPolicies.length > 0);
  const suggestedTermCover = value('income') * 12 * 10;
  if(!healthCover){
    $('insuranceHint').textContent = 'Add health cover to protect your savings from unexpected medical costs.';
  } else if(termCover < suggestedTermCover){
    $('insuranceHint').textContent = `Consider total term cover of around ${money(suggestedTermCover)}, especially if someone depends on you.`;
  } else {
    $('insuranceHint').textContent = 'Your core protection is recorded. Review cover amounts and nominees every year.';
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
  document.querySelectorAll('#plannerForm input[id]').forEach(input => {
    fields[input.id] = isCurrencyInput(input) ? String(numericValue(input)) : input.value;
  });
  const state = {
    fields,
    family: familyMembers(),
    assets: assets(),
    loans: loans(),
    majorExpenses: majorExpenses(),
    healthPolicies: policies('health'),
    termPolicies: policies('term'),
    currentStep: current
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(error) { console.warn('Could not save planner data.', error); }
}

function restoreState(){
  try {
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(!state) return 0;
    Object.entries(state.fields || {}).forEach(([id, savedValue]) => {
      if($(id)) $(id).value = savedValue;
    });
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
    return Number.isInteger(state.currentStep) ? state.currentStep : 0;
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
  const labels = ['Next: Cash flow','Next: Your wealth','Next: Major expenses','Next: Protection','See my plan','Start over'];
  nextBtn.innerHTML = `${labels[current]} <span>→</span>`;
  if(current === 5) calculatePlan();
  saveState();
  document.querySelector('.planner-card').scrollIntoView({behavior:'smooth',block:'start'});
}

nextBtn.addEventListener('click', () => current === 5 ? showPanel(0) : showPanel(current + 1));
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
  updateBasics(); updateCash(); updateProtectionSummary(); saveState();
}));
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
$('resetDataBtn').addEventListener('click', () => {
  if(confirm('Clear all saved planner values and restore the defaults?')){
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  }
});

const restoredStep = restoreState();
if(!assets().some(asset => asset.excludedFromRetirement)){
  addAsset({type:'Independent house / villa', value:'', returnRate:6, excludedFromRetirement:true}, false);
}
if(!restoredAssetList){
  addAsset({type:'EPF / PF', value:1800000, returnRate:8.25}, false);
  addAsset({type:'Mutual funds', value:500000, returnRate:11}, false);
}
prepareCurrencyInputs();
updateBasics(); updateCash(); updateAssetSummary(); updateLoanSummary(); updateExpenseSummary(); updateProtectionSummary(); showPanel(restoredStep);
