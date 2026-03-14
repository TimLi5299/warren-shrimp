// Available Currencies with Info
const currencies = [
    { code: 'CNY', name: 'Chinese Yuan', flag: 'cn' },
    { code: 'USD', name: 'US Dollar', flag: 'us' },
    { code: 'SGD', name: 'Singapore Dollar', flag: 'sg' },
    { code: 'IDR', name: 'Indonesian Rupiah', flag: 'id' },
    { code: 'PHP', name: 'Philippine Peso', flag: 'ph' },
    { code: 'PKR', name: 'Pakistani Rupee', flag: 'pk' },
    { code: 'AUD', name: 'Australian Dollar', flag: 'au' },
    { code: 'MXN', name: 'Mexican Peso', flag: 'mx' },
    { code: 'NGN', name: 'Nigerian Naira', flag: 'ng' },
    { code: 'HKD', name: 'Hong Kong Dollar', flag: 'hk' },
    { code: 'EUR', name: 'Euro', flag: 'eu' },
    { code: 'GBP', name: 'British Pound', flag: 'gb' },
    { code: 'JPY', name: 'Japanese Yen', flag: 'jp' },
    { code: 'CAD', name: 'Canadian Dollar', flag: 'ca' },
    { code: 'INR', name: 'Indian Rupee', flag: 'in' },
    { code: 'CHF', name: 'Swiss Franc', flag: 'ch' },
    { code: 'KRW', name: 'South Korean Won', flag: 'kr' },
    { code: 'BRL', name: 'Brazilian Real', flag: 'br' },
    { code: 'SEK', name: 'Swedish Krona', flag: 'se' },
    { code: 'NZD', name: 'New Zealand Dollar', flag: 'nz' },
    { code: 'ZAR', name: 'South African Rand', flag: 'za' },
    { code: 'NOK', name: 'Norwegian Krone', flag: 'no' },
    { code: 'THB', name: 'Thai Baht', flag: 'th' },
    { code: 'TWD', name: 'New Taiwan Dollar', flag: 'tw' },
    { code: 'MYR', name: 'Malaysian Ringgit', flag: 'my' },
];

const defaultTargets = ['USD', 'SGD', 'IDR', 'PHP', 'PKR', 'AUD', 'MXN', 'NGN', 'HKD'];

// State
let state = {
    baseCurrency: 'CNY',
    targetCurrencies: [],
    rates: {},
    lastUpdated: null,
    // Active source: whichever row the user last typed into
    activeCode: 'CNY',
    activeAmount: 100,
    // Modal
    modalMode: null, // 'base', 'replace', 'manage', 'chart-from', 'chart-to'
    activeIndex: null,
    // Chart
    chartFrom: 'CNY',
    chartTo: 'USD',
    chartPeriod: '3M',
};

// DOM Elements
const elements = {
    baseAmountInput: document.getElementById('base-amount'),
    baseCurrencyBtn: document.getElementById('base-currency-btn'),
    baseFlag: document.getElementById('base-flag'),
    baseCode: document.getElementById('base-code'),
    baseSymbol: document.getElementById('base-symbol'),
    baseCard: document.getElementById('base-card'),
    
    targetList: document.getElementById('target-list'),
    targetTemplate: document.getElementById('target-item-template'),
    manageBtn: document.getElementById('manage-currencies-btn'),
    
    lastUpdatedText: document.getElementById('last-updated-text'),
    
    // Modal
    modal: document.getElementById('currency-modal'),
    closeModalBtn: document.getElementById('close-modal-btn'),
    searchInput: document.getElementById('currency-search'),
    currencyListModal: document.getElementById('currency-list'),
    
    // Chart
    chartFromBtn: document.getElementById('chart-from-btn'),
    chartToBtn: document.getElementById('chart-to-btn'),
    chartFromFlag: document.getElementById('chart-from-flag'),
    chartToFlag: document.getElementById('chart-to-flag'),
    chartFromCode: document.getElementById('chart-from-code'),
    chartToCode: document.getElementById('chart-to-code'),
    chartCurrentRate: document.getElementById('chart-current-rate'),
    chartChange: document.getElementById('chart-change'),
    periodPills: document.getElementById('period-pills'),
    chartCanvas: document.getElementById('rate-chart'),
    chartLoading: document.getElementById('chart-loading'),
};

// Formatting Helpers
const getCurrencySymbol = (currencyCode) => {
    try {
        const formatter = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currencyCode,
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
        const formatted = formatter.format(0);
        return formatted.replace(/\d/g, '').replace(/\./g, '').trim();
    } catch (e) {
        return currencyCode;
    }
};

const formatAmount = (num) => {
    let maxDigits = 2;
    if (Math.abs(num) < 1 && num !== 0) maxDigits = 4;
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: maxDigits
    }).format(num);
};

const getFlagUrl = (isoCode) => `https://flagcdn.com/w40/${isoCode.toLowerCase()}.png`;

// LocalStorage
const loadState = () => {
    try {
        const savedBase = localStorage.getItem('baseCurrency');
        const savedTargets = localStorage.getItem('targetCurrencies');
        if (savedBase) state.baseCurrency = savedBase;
        if (savedTargets) {
            state.targetCurrencies = JSON.parse(savedTargets);
        } else {
            state.targetCurrencies = [...defaultTargets];
        }
        state.activeCode = state.baseCurrency;
        console.log('State loaded:', state.baseCurrency, state.targetCurrencies);
    } catch (e) {
        state.targetCurrencies = [...defaultTargets];
        console.error('Failed to load state:', e);
    }
};

const saveState = () => {
    localStorage.setItem('baseCurrency', state.baseCurrency);
    localStorage.setItem('targetCurrencies', JSON.stringify(state.targetCurrencies));
};

// Fetch Exchange Rates
const fetchRates = async () => {
    try {
        const response = await fetch('https://open.er-api.com/v6/latest/USD');
        const data = await response.json();
        if (data && data.rates) {
            state.rates = data.rates;
            state.lastUpdated = new Date();
            updateLastUpdatedTime();
            recalcAll();
        }
    } catch (error) {
        console.error('Failed to fetch rates:', error);
        if (Object.keys(state.rates).length === 0) {
            state.rates = { USD:1, CNY:7.23, EUR:0.92, GBP:0.79, JPY:151.3, SGD:1.35, IDR:15800, PHP:56.5, PKR:278, AUD:1.53, MXN:16.5, NGN:1300, HKD:7.82, INR:83, CAD:1.36, CHF:0.88, KRW:1340, BRL:5.0, SEK:10.5, NZD:1.63, ZAR:18.5, NOK:10.7, THB:35.5, TWD:31.5, MYR:4.7 };
            recalcAll();
        }
    }
};

const updateLastUpdatedTime = () => {
    if (state.lastUpdated) {
        const timeStr = state.lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateStr = state.lastUpdated.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
        elements.lastUpdatedText.textContent = `Last updated: ${dateStr} ${timeStr}`;
    }
};

// ==========================================
// Symmetric Conversion Logic
// ==========================================
// Convert `amount` of `fromCode` into `toCode`
const convert = (amount, fromCode, toCode) => {
    if (!state.rates[fromCode] || !state.rates[toCode]) return 0;
    return (amount / state.rates[fromCode]) * state.rates[toCode];
};

// Recalculate all rows based on the active source
const recalcAll = () => {
    // Update base card value (if it's not the active source)
    if (state.activeCode !== state.baseCurrency) {
        const baseVal = convert(state.activeAmount, state.activeCode, state.baseCurrency);
        elements.baseAmountInput.value = baseVal ? parseFloat(baseVal.toFixed(4)) : '';
    }
    // Highlight active card
    elements.baseCard.classList.toggle('active-source', state.activeCode === state.baseCurrency);

    // Update each target row
    const items = elements.targetList.querySelectorAll('.target-item');
    items.forEach(li => {
        const code = li.dataset.code;
        const input = li.querySelector('.item-amount-input');
        
        if (code === state.activeCode) {
            // This is the active source, don't overwrite its value
            li.classList.add('active-source');
        } else {
            li.classList.remove('active-source');
            const val = convert(state.activeAmount, state.activeCode, code);
            input.value = val ? parseFloat(val.toFixed(4)) : '';
        }

        // Update unit rate text
        const unitRate = convert(1, state.activeCode, code);
        li.querySelector('.base-code-ref').textContent = state.activeCode;
        li.querySelector('.unit-rate').textContent = formatAmount(unitRate);
        li.querySelector('.target-code-ref').textContent = code;
    });
};

// Render Base Currency Header
const renderBaseCurrency = () => {
    const info = currencies.find(c => c.code === state.baseCurrency) || { flag: 'cn', name: state.baseCurrency };
    elements.baseFlag.src = getFlagUrl(info.flag);
    elements.baseCode.textContent = state.baseCurrency;
    elements.baseSymbol.textContent = getCurrencySymbol(state.baseCurrency);
    elements.baseAmountInput.dataset.currency = state.baseCurrency;
};

// Render Target List
const renderTargetList = () => {
    console.log('Rendering target list. Count:', state.targetCurrencies.length);
    elements.targetList.innerHTML = '';
    
    state.targetCurrencies.forEach((targetCode, index) => {
        const info = currencies.find(c => c.code === targetCode) || { flag: 'us', name: targetCode };
        
        const clone = elements.targetTemplate.content.cloneNode(true);
        const li = clone.querySelector('li');
        li.dataset.index = index;
        li.dataset.code = targetCode;
        
        clone.querySelector('.item-flag').src = getFlagUrl(info.flag);
        clone.querySelector('.item-code').textContent = targetCode;
        clone.querySelector('.item-symbol').textContent = getCurrencySymbol(targetCode);
        
        // Set computed value
        const input = clone.querySelector('.item-amount-input');
        input.dataset.currency = targetCode;
        const val = convert(state.activeAmount, state.activeCode, targetCode);
        input.value = val ? parseFloat(val.toFixed(4)) : '';
        
        // When user types in THIS row, it becomes the active source
        input.addEventListener('input', (e) => {
            let v = parseFloat(e.target.value);
            if (isNaN(v)) v = 0;
            state.activeCode = targetCode;
            state.activeAmount = v;
            recalcAll();
        });
        input.addEventListener('focus', function() { this.select(); });
        
        // Rate info
        const unitRate = convert(1, state.activeCode, targetCode);
        clone.querySelector('.base-code-ref').textContent = state.activeCode;
        clone.querySelector('.unit-rate').textContent = formatAmount(unitRate);
        clone.querySelector('.target-code-ref').textContent = targetCode;
        
        // Highlight if this row is active source
        if (targetCode === state.activeCode) {
            li.classList.add('active-source');
        }
        
        // Menu button -> replace currency
        clone.querySelector('.menu-btn').addEventListener('click', () => {
            state.modalMode = 'replace';
            state.activeIndex = index;
            openModal();
        });
        
        elements.targetList.appendChild(clone);
    });
};

// ==========================================
// Modal Logic
// ==========================================
const renderCurrencyListModal = (filter = '') => {
    elements.currencyListModal.innerHTML = '';
    const searchTerm = filter.toLowerCase();
    
    const filteredCurrencies = currencies.filter(c => 
        c.code.toLowerCase().includes(searchTerm) || 
        c.name.toLowerCase().includes(searchTerm)
    );
    
    filteredCurrencies.forEach(currency => {
        const li = document.createElement('li');
        li.className = 'currency-list-item';
        
        let isSelected = false;
        if (state.modalMode === 'base' && state.baseCurrency === currency.code) isSelected = true;
        if (state.modalMode === 'replace' && state.targetCurrencies[state.activeIndex] === currency.code) isSelected = true;
        if (state.modalMode === 'manage' && state.targetCurrencies.includes(currency.code)) isSelected = true;
        if (state.modalMode === 'chart-from' && state.chartFrom === currency.code) isSelected = true;
        if (state.modalMode === 'chart-to' && state.chartTo === currency.code) isSelected = true;
                           
        if (isSelected) li.classList.add('selected');
        
        li.innerHTML = `
            <img src="${getFlagUrl(currency.flag)}" class="list-flag" alt="${currency.code}">
            <div class="list-details">
                <div class="list-code">${currency.code}</div>
                <div class="list-name">${currency.name}</div>
            </div>
            <i class="fa-solid fa-check list-check"></i>
        `;
        
        li.addEventListener('click', () => selectCurrency(currency.code));
        elements.currencyListModal.appendChild(li);
    });
};

function openModal() {
    elements.modal.classList.add('active');
    const titleObj = document.getElementById('modal-title');
    if (state.modalMode === 'manage') {
        titleObj.textContent = 'Add / Remove Currencies';
    } else {
        titleObj.textContent = 'Select Currency';
    }
    elements.searchInput.value = '';
    renderCurrencyListModal();
}

function closeModal() {
    elements.modal.classList.remove('active');
}

function selectCurrency(code) {
    if (state.modalMode === 'base') {
        state.baseCurrency = code;
        renderBaseCurrency();
        // If this was also the active source, update activeCode
        state.activeCode = code;
        closeModal();
    } else if (state.modalMode === 'replace') {
        state.targetCurrencies[state.activeIndex] = code;
        closeModal();
    } else if (state.modalMode === 'manage') {
        const idx = state.targetCurrencies.indexOf(code);
        if (idx > -1) {
            state.targetCurrencies.splice(idx, 1);
        } else {
            state.targetCurrencies.push(code);
        }
        renderCurrencyListModal(elements.searchInput.value);
    } else if (state.modalMode === 'chart-from') {
        state.chartFrom = code;
        updateChartSelectors();
        loadChartData();
        closeModal();
    } else if (state.modalMode === 'chart-to') {
        state.chartTo = code;
        updateChartSelectors();
        loadChartData();
        closeModal();
    }
    
    saveState();
    renderTargetList();
    recalcAll();
}

// ==========================================
// Chart Logic
// ==========================================
let rateChart = null;

const periodToDays = {
    '1D': 1,
    '1W': 7,
    '3M': 90,
    '1Y': 365,
    '5Y': 365 * 5,
    '10Y': 365 * 10,
};

const updateChartSelectors = () => {
    const fromInfo = currencies.find(c => c.code === state.chartFrom) || { flag: 'cn' };
    const toInfo = currencies.find(c => c.code === state.chartTo) || { flag: 'us' };
    elements.chartFromFlag.src = getFlagUrl(fromInfo.flag);
    elements.chartFromCode.textContent = state.chartFrom;
    elements.chartToFlag.src = getFlagUrl(toInfo.flag);
    elements.chartToCode.textContent = state.chartTo;
};

const loadChartData = async () => {
    elements.chartLoading.classList.add('active');
    
    const days = periodToDays[state.chartPeriod] || 90;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);
    
    const fmt = (d) => d.toISOString().split('T')[0];
    
    // Frankfurter API supports EUR, USD, and many currencies but NOT CNY directly.
    // We'll use open.er-api for the latest rate and Frankfurter for historical.
    // For currencies not supported by Frankfurter, we'll generate approximate data.
    
    const fromCode = state.chartFrom;
    const toCode = state.chartTo;
    
    try {
        // Try Frankfurter API first
        const url = `https://api.frankfurter.app/${fmt(startDate)}..${fmt(endDate)}?from=${fromCode}&to=${toCode}`;
        const response = await fetch(url);
        
        if (response.ok) {
            const data = await response.json();
            const dates = Object.keys(data.rates).sort();
            const values = dates.map(d => data.rates[d][toCode]);
            
            renderChart(dates, values);
        } else {
            // Fallback: generate mock historical data based on current rate
            generateMockChart(fromCode, toCode, days);
        }
    } catch (error) {
        console.error('Chart data fetch failed:', error);
        generateMockChart(fromCode, toCode, days);
    }
    
    elements.chartLoading.classList.remove('active');
};

const generateMockChart = (fromCode, toCode, days) => {
    // Generate plausible mock data based on the current rate with random walk
    const currentRate = convert(1, fromCode, toCode);
    const dates = [];
    const values = [];
    
    // Number of data points (limit to reasonable count)
    const points = Math.min(days, 200);
    const step = Math.max(1, Math.floor(days / points));
    
    let rate = currentRate * (0.9 + Math.random() * 0.1); // Start slightly lower
    const volatility = 0.002; // Daily volatility
    
    for (let i = days; i >= 0; i -= step) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().split('T')[0]);
        
        rate = rate * (1 + (Math.random() - 0.48) * volatility * Math.sqrt(step));
        values.push(parseFloat(rate.toFixed(6)));
    }
    
    // Ensure last value matches current rate
    values[values.length - 1] = currentRate;
    
    renderChart(dates, values);
};

const renderChart = (dates, values) => {
    // Update current rate display
    const currentRate = values[values.length - 1];
    const startRate = values[0];
    const change = ((currentRate - startRate) / startRate) * 100;
    
    elements.chartCurrentRate.textContent = `1 ${state.chartFrom} = ${formatAmount(currentRate)} ${state.chartTo}`;
    
    if (change >= 0) {
        elements.chartChange.textContent = `▲ ${change.toFixed(2)}%`;
        elements.chartChange.className = 'chart-change positive';
    } else {
        elements.chartChange.textContent = `▼ ${Math.abs(change).toFixed(2)}%`;
        elements.chartChange.className = 'chart-change negative';
    }
    
    // Destroy existing chart
    if (rateChart) {
        rateChart.destroy();
    }
    
    const ctx = elements.chartCanvas.getContext('2d');
    
    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    const color = change >= 0 ? '52, 199, 89' : '255, 59, 48';
    gradient.addColorStop(0, `rgba(${color}, 0.3)`);
    gradient.addColorStop(1, `rgba(${color}, 0.0)`);
    
    rateChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                data: values,
                borderColor: change >= 0 ? '#34C759' : '#FF3B30',
                backgroundColor: gradient,
                fill: true,
                borderWidth: 2,
                pointRadius: 0,
                pointHitRadius: 10,
                tension: 0.3,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        title: (items) => items[0].label,
                        label: (item) => `${state.chartFrom}/${state.chartTo}: ${formatAmount(item.raw)}`
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: { display: false },
                    ticks: {
                        maxTicksLimit: 5,
                        font: { size: 10 },
                        color: '#8E8E93'
                    }
                },
                y: {
                    display: true,
                    position: 'right',
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: {
                        maxTicksLimit: 4,
                        font: { size: 10 },
                        color: '#8E8E93',
                        callback: (val) => val.toFixed(4)
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
};

// ==========================================
// Event Listeners
// ==========================================

// Base amount input
elements.baseAmountInput.addEventListener('input', (e) => {
    let val = parseFloat(e.target.value);
    if (isNaN(val)) val = 0;
    state.activeCode = state.baseCurrency;
    state.activeAmount = val;
    recalcAll();
});

elements.baseAmountInput.addEventListener('focus', function() {
    this.select();
});

elements.baseCurrencyBtn.addEventListener('click', () => {
    state.modalMode = 'base';
    openModal();
});

elements.manageBtn.addEventListener('click', () => {
    state.modalMode = 'manage';
    openModal();
});

elements.closeModalBtn.addEventListener('click', closeModal);
elements.modal.addEventListener('click', (e) => {
    if (e.target === elements.modal) closeModal();
});

elements.searchInput.addEventListener('input', (e) => {
    renderCurrencyListModal(e.target.value);
});

// Chart event listeners
elements.chartFromBtn.addEventListener('click', () => {
    state.modalMode = 'chart-from';
    openModal();
});

elements.chartToBtn.addEventListener('click', () => {
    state.modalMode = 'chart-to';
    openModal();
});

elements.periodPills.addEventListener('click', (e) => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    
    // Update active pill
    elements.periodPills.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    
    state.chartPeriod = pill.dataset.period;
    loadChartData();
});

// ==========================================
// Initialization
// ==========================================
const init = () => {
    console.log('Initializing App...');
    loadState();
    renderBaseCurrency();
    renderTargetList();
    elements.baseAmountInput.value = state.activeAmount;
    fetchRates().then(() => {
        updateChartSelectors();
        loadChartData();
    });
};

window.addEventListener('DOMContentLoaded', () => {
    // Re-verify elements wrap to ensure they are found
    Object.keys(elements).forEach(key => {
        if (!elements[key]) {
            elements[key] = document.getElementById(elements[key]?.id || key.replace(/([A-Z])/g, "-$1").toLowerCase());
        }
    });
    
    init();
});
