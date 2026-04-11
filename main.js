// Personal Finance Tracker - Frontend JavaScrip

const API_URL = '/api';
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const TEXT_LIMITS = {
    name: 80,
    email: 254,
    category: 60,
    description: 240,
    password: 128
};

// Utility Helpers 

function getToken() {
    try { return localStorage.getItem('token'); }
    catch { return null; }
}

function getUser() {
    try {
        var rawUser = localStorage.getItem('user');
        return rawUser ? JSON.parse(rawUser) : null;
    }
    catch { return null; }
}

function clearSession() {
    try {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    } catch {
        // Ignore storage failures and continue with logout flow.
    }
}

function formatKsh(amount) {
    var numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount)) numericAmount = 0;
    return 'Ksh ' + numericAmount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' });
}

function toInputDate(dateStr) {
    if (!dateStr) return '';
    var datePart = String(dateStr).match(/^\d{4}-\d{2}-\d{2}/);
    if (datePart) return datePart[0];

    var date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '';

    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return date.getFullYear() + '-' + month + '-' + day;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function normalizeText(value, maxLength) {
    if (value === undefined || value === null) return '';
    return String(value)
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}

function isValidObjectId(value) {
    return OBJECT_ID_PATTERN.test(String(value || ''));
}

function setButtonState(button, busy, idleText, busyText) {
    if (!button) return;
    button.disabled = busy;
    button.textContent = busy ? busyText : idleText;
}

async function parseResponseData(res) {
    var rawText = await res.text();
    if (!rawText) return {};

    try {
        return JSON.parse(rawText);
    } catch {
        return { msg: rawText };
    }
}

async function apiRequest(endpoint, method, body, config) {
    method = method || 'GET';
    config = config || {};
    const options = {
        method: method,
        headers: {
            'Accept': 'application/json'
        }
    };

    if (body) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }

    var token = getToken();
    if (!config.skipAuth && token) {
        options.headers['x-auth-token'] = token;
    }

    try {
        const res = await fetch(API_URL + endpoint, options);
        const data = await parseResponseData(res);

        if (!res.ok) {
            if (res.status === 401 && !config.skipAuth) {
                clearSession();
            }
            throw new Error(data.msg || data.message || ('Request failed (' + res.status + ')'));
        }

        return data;
    } catch (err) {
        if (err instanceof TypeError) {
            throw new Error('Unable to reach the server. Please try again.');
        }
        throw err;
    }
}

// Auth Page 

const authForm = document.getElementById('auth-form');
if (authForm) {
    var authUrl = new URL(window.location.href);
    var pageMode = authUrl.searchParams.get('mode');
    var resetToken = normalizeText(authUrl.searchParams.get('token') || '', 200);

    // Already logged in → go to dashboard, except when actively resetting password.
    if (getToken() && pageMode !== 'reset' && pageMode !== 'forgot') window.location.href = '/dashboard';

    let isLogin = true;
    const toggleLink    = document.getElementById('toggle-form');
    const switchLabel   = document.getElementById('auth-switch-label');
    const formTitle     = document.getElementById('form-title');
    const formSubtitle  = document.getElementById('form-subtitle');
    const nameGroup     = document.getElementById('name-group');
    const nameInput     = document.getElementById('name');
    const submitBtn     = document.getElementById('auth-submit-btn');
    const errorEl       = document.getElementById('auth-error');
    const emailInput    = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const forgotSection = document.getElementById('forgot-section');
    const resetSection = document.getElementById('reset-section');
    const authSwitch = document.querySelector('.auth-switch');
    const forgotForm = document.getElementById('forgot-form');
    const forgotEmailInput = document.getElementById('forgot-email');
    const forgotMessage = document.getElementById('forgot-message');
    const forgotSubmitBtn = document.getElementById('forgot-submit-btn');
    const resetForm = document.getElementById('reset-form');
    const resetPasswordInput = document.getElementById('reset-password');
    const resetConfirmPasswordInput = document.getElementById('reset-confirm-password');
    const resetMessage = document.getElementById('reset-message');
    const resetSubmitBtn = document.getElementById('reset-submit-btn');

    nameInput.maxLength = TEXT_LIMITS.name;
    emailInput.maxLength = TEXT_LIMITS.email;
    passwordInput.maxLength = TEXT_LIMITS.password;
    forgotEmailInput.maxLength = TEXT_LIMITS.email;
    resetPasswordInput.maxLength = TEXT_LIMITS.password;
    resetConfirmPasswordInput.maxLength = TEXT_LIMITS.password;

    function setPageMode(mode) {
        var isForgotMode = mode === 'forgot';
        var isResetMode = mode === 'reset';

        authForm.style.display = isForgotMode || isResetMode ? 'none' : 'block';
        authSwitch.style.display = isForgotMode || isResetMode ? 'none' : 'block';
        forgotSection.style.display = isForgotMode ? 'block' : 'none';
        resetSection.style.display = isResetMode ? 'block' : 'none';

        if (isForgotMode) {
            formTitle.textContent = 'Forgot Password';
            formSubtitle.textContent = 'Recover access to your account';
        } else if (isResetMode) {
            formTitle.textContent = 'Reset Password';
            formSubtitle.textContent = 'Set a secure new password';
        } else {
            formTitle.textContent = isLogin ? 'Welcome Back' : 'Create Account';
            formSubtitle.textContent = isLogin ? 'Sign in to your account' : 'Fill in your details to get started';
        }
    }

    function clearStatusMessage(el) {
        if (!el) return;
        el.textContent = '';
        el.classList.remove('success', 'error');
    }

    function setStatusMessage(el, text, type) {
        if (!el) return;
        el.textContent = text;
        el.classList.remove('success', 'error');
        if (type === 'success' || type === 'error') {
            el.classList.add(type);
        }
    }

    toggleLink.addEventListener('click', function(e) {
        e.preventDefault();
        if (pageMode === 'forgot' || pageMode === 'reset') return;
        isLogin = !isLogin;
        formTitle.textContent    = isLogin ? 'Welcome Back'   : 'Create Account';
        formSubtitle.textContent = isLogin ? 'Sign in to your account' : 'Fill in your details to get started';
        nameGroup.style.display  = isLogin ? 'none' : 'block';
        nameInput.required       = !isLogin;
        submitBtn.textContent    = isLogin ? 'Sign In' : 'Create Account';
        switchLabel.textContent  = isLogin ? "Don't have an account?" : 'Already have an account?';
        toggleLink.textContent   = isLogin ? ' Register here' : ' Sign in instead';
        errorEl.textContent      = '';
    });

    document.getElementById('forgot-link').addEventListener('click', function(e) {
        e.preventDefault();
        pageMode = 'forgot';
        setPageMode(pageMode);
        clearStatusMessage(forgotMessage);
        authUrl.searchParams.set('mode', 'forgot');
        authUrl.searchParams.delete('token');
        window.history.replaceState({}, '', authUrl.pathname + authUrl.search);
    });

    document.getElementById('back-to-signin-from-forgot').addEventListener('click', function(e) {
        e.preventDefault();
        pageMode = null;
        setPageMode(pageMode);
        clearStatusMessage(forgotMessage);
        authUrl.searchParams.delete('mode');
        authUrl.searchParams.delete('token');
        window.history.replaceState({}, '', authUrl.pathname + authUrl.search);
    });

    document.getElementById('back-to-signin-from-reset').addEventListener('click', function(e) {
        e.preventDefault();
        pageMode = null;
        setPageMode(pageMode);
        clearStatusMessage(resetMessage);
        authUrl.searchParams.delete('mode');
        authUrl.searchParams.delete('token');
        window.history.replaceState({}, '', authUrl.pathname + authUrl.search);
    });

    forgotForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        clearStatusMessage(forgotMessage);

        var email = normalizeText(forgotEmailInput.value, TEXT_LIMITS.email).toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setStatusMessage(forgotMessage, 'Please enter a valid email address.', 'error');
            return;
        }

        setButtonState(forgotSubmitBtn, true, 'Send Reset Link', 'Sending...');
        try {
            var response = await apiRequest('/auth/forgot-password', 'POST', { email }, { skipAuth: true });
            setStatusMessage(
                forgotMessage,
                response.msg || 'If an account with that email exists, a reset link has been sent.',
                'success'
            );
        } catch (err) {
            setStatusMessage(forgotMessage, err.message || 'Unable to process your request right now.', 'error');
        } finally {
            setButtonState(forgotSubmitBtn, false, 'Send Reset Link', 'Sending...');
        }
    });

    resetForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        clearStatusMessage(resetMessage);

        var newPassword = String(resetPasswordInput.value || '');
        var confirmPassword = String(resetConfirmPasswordInput.value || '');

        if (!resetToken || !/^[a-f\d]{64}$/i.test(resetToken)) {
            setStatusMessage(resetMessage, 'Invalid or expired reset link.', 'error');
            return;
        }
        if (!newPassword || !confirmPassword) {
            setStatusMessage(resetMessage, 'Please fill in both password fields.', 'error');
            return;
        }
        if (newPassword !== confirmPassword) {
            setStatusMessage(resetMessage, 'Passwords do not match.', 'error');
            return;
        }
        if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) {
            setStatusMessage(resetMessage, 'Password must be 8+ chars with uppercase, lowercase, and a number.', 'error');
            return;
        }

        setButtonState(resetSubmitBtn, true, 'Reset Password', 'Resetting...');
        try {
            var result = await apiRequest('/auth/reset-password/' + encodeURIComponent(resetToken), 'POST', {
                password: newPassword,
                confirmPassword: confirmPassword
            }, { skipAuth: true });

            setStatusMessage(resetMessage, result.msg || 'Password reset successful. You can now sign in.', 'success');
            resetForm.reset();
            authUrl.searchParams.delete('mode');
            authUrl.searchParams.delete('token');
            window.history.replaceState({}, '', authUrl.pathname + authUrl.search);

            setTimeout(function() {
                pageMode = null;
                setPageMode(pageMode);
            }, 1200);
        } catch (err) {
            setStatusMessage(resetMessage, err.message || 'Unable to reset password.', 'error');
        } finally {
            setButtonState(resetSubmitBtn, false, 'Reset Password', 'Resetting...');
        }
    });

    setPageMode(pageMode === 'forgot' ? 'forgot' : (pageMode === 'reset' ? 'reset' : null));
    if (pageMode === 'reset' && (!resetToken || !/^[a-f\d]{64}$/i.test(resetToken))) {
        setStatusMessage(resetMessage, 'Invalid or expired reset link.', 'error');
    }

    authForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        errorEl.textContent = '';

        const email    = normalizeText(emailInput.value, TEXT_LIMITS.email).toLowerCase();
        const password = passwordInput.value;
        const name     = normalizeText(nameInput.value, TEXT_LIMITS.name);

        if (!email || !password) {
            errorEl.textContent = 'Email and password are required.';
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            errorEl.textContent = 'Please enter a valid email address.';
            return;
        }
        if (!isLogin && !name) {
            errorEl.textContent = 'Please enter your full name.';
            return;
        }
        if (password.length > TEXT_LIMITS.password) {
            errorEl.textContent = 'Password is too long.';
            return;
        }
        if (!isLogin) {
            if (password.length < 8) {
                errorEl.textContent = 'Password must be at least 8 characters.';
                return;
            }
            if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
                errorEl.textContent = 'Password must include uppercase, lowercase, and a number.';
                return;
            }
        }

        setButtonState(submitBtn, true, isLogin ? 'Sign In' : 'Create Account', isLogin ? 'Signing in...' : 'Creating account...');

        try {
            const endpoint = isLogin ? '/auth/login' : '/auth/register';
            const body     = isLogin ? { email, password } : { name, email, password };

            const result = await apiRequest(endpoint, 'POST', body, { skipAuth: true });
            localStorage.setItem('token', result.token);
            localStorage.setItem('user', JSON.stringify(result.user));
            window.location.href = '/dashboard';
        } catch (err) {
            errorEl.textContent = err.message || 'Authentication failed. Please try again.';
        } finally {
            setButtonState(submitBtn, false, isLogin ? 'Sign In' : 'Create Account', isLogin ? 'Signing in...' : 'Creating account...');
        }
    });
}

// Dashboard Page 

const dashboardContainer = document.getElementById('dashboard-container');
if (dashboardContainer) {

    // Not authenticated → redirect
    if (!getToken()) { window.location.href = '/'; }

    // State
    var allTransactions  = [];
    var allBudgets       = [];
    var pieChartInstance = null;
    var barChartInstance = null;

    // Greet user
    const user = getUser();
    if (user) {
        document.getElementById('user-greeting').textContent = 'Hello, ' + (normalizeText(user.name, TEXT_LIMITS.name) || 'there');
    }

    // Default date for new transaction = today
    document.getElementById('t-date').value = new Date().toISOString().split('T')[0];

    // Logout
    document.getElementById('logout-btn').addEventListener('click', function() {
        clearSession();
        window.location.href = '/';
    });

    // Load Everything

    async function loadDashboard() {
        try {
            const results = await Promise.all([
                apiRequest('/transactions'),
                apiRequest('/budgets')
            ]);
            allTransactions = results[0];
            allBudgets      = results[1];

            updateSummaryCards(allTransactions);
            updateTransactionTable(allTransactions);
            renderPieChart(allTransactions);
            renderBarChart(allTransactions, allBudgets);
            renderBudgetList(allBudgets, allTransactions);
        } catch (err) {
            console.error('Failed to load dashboard:', err.message);
            if (/token|authoriz/i.test(err.message)) {
                clearSession();
                window.location.href = '/';
            }
        }
    }

    loadDashboard();

    // Summary Cards 

    function updateSummaryCards(transactions) {
        var income = 0, expense = 0;
        transactions.forEach(function(t) {
            if (t.type === 'income') income += t.amount;
            else expense += t.amount;
        });
        document.getElementById('total-income').textContent  = formatKsh(income);
        document.getElementById('total-expense').textContent = formatKsh(expense);
        var balance = income - expense;
        var balanceEl = document.getElementById('total-balance');
        balanceEl.textContent  = formatKsh(balance);
        balanceEl.style.color  = balance >= 0 ? '#10b981' : '#ef4444';
    }

    // Transaction Table 

    function updateTransactionTable(transactions) {
        var tbody = document.getElementById('transaction-tbody');
        if (!transactions.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">No transactions found.</td></tr>';
            return;
        }
        tbody.innerHTML = transactions.map(function(t) {
            var sign = t.type === 'income' ? '+' : '-';
            var transactionId = isValidObjectId(t._id) ? t._id : '';
            return '<tr class="transaction-row ' + t.type + '">' +
                '<td>' + formatDate(t.date) + '</td>' +
                '<td><span class="category-badge">' + escapeHtml(t.category) + '</span></td>' +
                '<td><span class="type-badge ' + t.type + '">' + (t.type === 'income' ? 'Income' : 'Expense') + '</span></td>' +
                '<td class="desc-cell">' + escapeHtml(t.description || '\u2014') + '</td>' +
                '<td class="amount-cell ' + t.type + '">' + sign + formatKsh(t.amount) + '</td>' +
                '<td class="action-cell"><div class="action-buttons">' +
                    '<button type="button" class="btn-edit-sm" data-action="edit-transaction" data-id="' + escapeHtml(transactionId) + '"' + (transactionId ? '' : ' disabled') + '>Edit</button>' +
                    '<button type="button" class="btn-delete-sm" data-action="delete-transaction" data-id="' + escapeHtml(transactionId) + '"' + (transactionId ? '' : ' disabled') + '>Delete</button>' +
                '</div>' +
                '</td>' +
            '</tr>';
        }).join('');
    }

    // Pie Chart (Expense by Category) 

    function renderPieChart(transactions) {
        var expenses = transactions.filter(function(t) { return t.type === 'expense'; });
        var ctx      = document.getElementById('pieChart');

        if (!expenses.length) {
            ctx.style.display = 'none';
            document.getElementById('pie-empty').style.display = 'block';
            if (pieChartInstance) { pieChartInstance.destroy(); pieChartInstance = null; }
            return;
        }
        ctx.style.display = 'block';
        document.getElementById('pie-empty').style.display = 'none';

        var catTotals = {};
        expenses.forEach(function(t) {
            catTotals[t.category] = (catTotals[t.category] || 0) + t.amount;
        });

        var palette = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f59e0b','#6366f1'];

        if (pieChartInstance) pieChartInstance.destroy();
        pieChartInstance = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: Object.keys(catTotals),
                datasets: [{
                    data: Object.values(catTotals),
                    backgroundColor: palette.slice(0, Object.keys(catTotals).length),
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom', labels: { padding: 14, font: { size: 12 } } },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) { return ' ' + ctx.label + ': Ksh ' + ctx.parsed.toFixed(2); }
                        }
                    }
                }
            }
        });
    }

    // Bar Chart (Budget vs Actual)

    function currentMonthExpenses(transactions) {
        var now = new Date();
        return transactions.filter(function(t) {
            if (t.type !== 'expense') return false;
            var d = new Date(t.date);
            return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        });
    }

    function renderBarChart(transactions, budgets) {
        var ctx = document.getElementById('barChart');

        if (!budgets.length) {
            ctx.style.display = 'none';
            document.getElementById('bar-empty').style.display = 'block';
            if (barChartInstance) { barChartInstance.destroy(); barChartInstance = null; }
            return;
        }
        ctx.style.display = 'block';
        document.getElementById('bar-empty').style.display = 'none';

        var now = new Date();
        var monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });
        document.getElementById('bar-month-label').textContent = '— ' + monthLabel;

        var monthExpenses = currentMonthExpenses(transactions);
        var categories = budgets.map(function(b) { return b.category; });
        var limits     = budgets.map(function(b) { return b.limit; });
        var spent      = categories.map(function(cat) {
            return monthExpenses
                .filter(function(t) { return t.category === cat; })
                .reduce(function(sum, t) { return sum + t.amount; }, 0);
        });

        // Green < 80%, Orange 80-99%, Red >= 100%
        var barColors = spent.map(function(s, i) {
            var pct = (s / limits[i]) * 100;
            if (pct >= 100) return '#ef4444';
            if (pct >= 80)  return '#f97316';
            return '#22c55e';
        });

        if (barChartInstance) barChartInstance.destroy();
        barChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: categories,
                datasets: [
                    {
                        label: 'Budget Limit',
                        data: limits,
                        backgroundColor: 'rgba(59,130,246,0.25)',
                        borderColor: '#3b82f6',
                        borderWidth: 2
                    },
                    {
                        label: 'Amount Spent',
                        data: spent,
                        backgroundColor: barColors,
                        borderColor: barColors,
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                return ' ' + ctx.dataset.label + ': Ksh ' + ctx.parsed.y.toFixed(2);
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(val) { return 'Ksh ' + val; }
                        }
                    }
                }
            }
        });
    }

    // Budget List with Progress Bars 

    function renderBudgetList(budgets, transactions) {
        var container = document.getElementById('budget-list');
        if (!budgets.length) {
            container.innerHTML = '<p class="empty-msg">No budgets set yet.</p>';
            return;
        }
        var monthExpenses = currentMonthExpenses(transactions);
        container.innerHTML = budgets.map(function(b) {
            var spent = monthExpenses
                .filter(function(t) { return t.category === b.category; })
                .reduce(function(sum, t) { return sum + t.amount; }, 0);
            var pct         = Math.min((spent / b.limit) * 100, 100);
            var statusClass = pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'safe';
            var budgetId = isValidObjectId(b._id) ? b._id : '';
            return '<div class="budget-item">' +
                '<div class="budget-item-header">' +
                    '<span class="budget-category">' + escapeHtml(b.category) + '</span>' +
                    '<div class="budget-amounts">' +
                        '<span class="budget-spent ' + statusClass + '">Ksh ' + spent.toFixed(2) + '</span>' +
                        '<span class="budget-limit"> / Ksh ' + b.limit.toFixed(2) + '</span>' +
                        '<button type="button" class="btn-delete-sm" data-action="delete-budget" data-id="' + escapeHtml(budgetId) + '" aria-label="Delete budget"' + (budgetId ? '' : ' disabled') + '>&times;</button>' +
                    '</div>' +
                '</div>' +
                '<div class="progress-bar"><div class="progress-fill ' + statusClass + '" style="width:' + pct + '%"></div></div>' +
                '<small class="budget-pct ' + statusClass + '">' + pct.toFixed(1) + '% used' + (pct >= 80 ? ' &#9888;&#65039;' : '') + '</small>' +
            '</div>';
        }).join('');
    }

    //Add Transaction 

    document.getElementById('transaction-tbody').addEventListener('click', function(e) {
        var button = e.target.closest('button[data-action]');
        if (!button) return;

        var action = button.getAttribute('data-action');
        var id = button.getAttribute('data-id');

        if (action === 'edit-transaction') {
            openEditModal(id);
        }
        if (action === 'delete-transaction') {
            deleteTransaction(id);
        }
    });

    document.getElementById('budget-list').addEventListener('click', function(e) {
        var button = e.target.closest('button[data-action="delete-budget"]');
        if (!button) return;
        deleteBudget(button.getAttribute('data-id'));
    });

    document.getElementById('transaction-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        var btn = e.target.querySelector('button[type="submit"]');
        setButtonState(btn, true, 'Add Transaction', 'Adding...');

        var type        = document.getElementById('t-type').value;
        var category    = normalizeText(document.getElementById('t-category').value, TEXT_LIMITS.category);
        var amount      = parseFloat(document.getElementById('t-amount').value);
        var date        = document.getElementById('t-date').value;
        var description = normalizeText(document.getElementById('t-description').value, TEXT_LIMITS.description);

        if (!category) { alert('Please enter a category.'); setButtonState(btn, false, 'Add Transaction', 'Adding...'); return; }
        if (!date)     { alert('Please select a date.');    setButtonState(btn, false, 'Add Transaction', 'Adding...'); return; }
        if (!Number.isFinite(amount) || amount <= 0) {
            alert('Please enter a valid amount greater than zero.');
            setButtonState(btn, false, 'Add Transaction', 'Adding...');
            return;
        }

        try {
            await apiRequest('/transactions', 'POST', { type, category, amount, date, description });
            e.target.reset();
            document.getElementById('t-date').value = new Date().toISOString().split('T')[0];
            await loadDashboard();
        } catch (err) {
            alert('Failed to add transaction: ' + err.message);
        } finally {
            setButtonState(btn, false, 'Add Transaction', 'Adding...');
        }
    });

    // Set Budget 

    document.getElementById('budget-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        var btn = e.target.querySelector('button[type="submit"]');
        setButtonState(btn, true, 'Set Budget', 'Saving...');

        var category = normalizeText(document.getElementById('b-category').value, TEXT_LIMITS.category);
        var limit    = parseFloat(document.getElementById('b-limit').value);

        if (!category) { alert('Please enter a category.'); setButtonState(btn, false, 'Set Budget', 'Saving...'); return; }
        if (!Number.isFinite(limit) || limit <= 0) {
            alert('Please enter a valid monthly limit greater than zero.');
            setButtonState(btn, false, 'Set Budget', 'Saving...');
            return;
        }

        try {
            await apiRequest('/budgets', 'POST', { category, limit });
            e.target.reset();
            await loadDashboard();
        } catch (err) {
            alert('Failed to set budget: ' + err.message);
        } finally {
            setButtonState(btn, false, 'Set Budget', 'Saving...');
        }
    });

    // Delete Transaction

    async function deleteTransaction(id) {
        if (!isValidObjectId(id)) {
            alert('The selected transaction is invalid.');
            return;
        }
        if (!confirm('Delete this transaction? This cannot be undone.')) return;
        try {
            await apiRequest('/transactions/' + id, 'DELETE');
            await loadDashboard();
        } catch (err) {
            alert('Failed to delete: ' + err.message);
        }
    }

    // Delete Budget 

    async function deleteBudget(id) {
        if (!isValidObjectId(id)) {
            alert('The selected budget is invalid.');
            return;
        }
        if (!confirm('Remove this budget limit?')) return;
        try {
            await apiRequest('/budgets/' + id, 'DELETE');
            await loadDashboard();
        } catch (err) {
            alert('Failed to remove budget: ' + err.message);
        }
    }

    // Edit Modal 

    function openEditModal(id) {
        if (!isValidObjectId(id)) return;
        var t = allTransactions.find(function(tx) { return tx._id === id; });
        if (!t) return;
        document.getElementById('edit-id').value          = t._id;
        document.getElementById('edit-type').value        = t.type;
        document.getElementById('edit-category').value    = t.category;
        document.getElementById('edit-amount').value      = t.amount;
        document.getElementById('edit-date').value        = toInputDate(t.date);
        document.getElementById('edit-description').value = t.description || '';
        document.getElementById('edit-modal').style.display = 'flex';
    }

    function closeModal() {
        document.getElementById('edit-modal').style.display = 'none';
    }

    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('cancel-edit').addEventListener('click', closeModal);
    document.getElementById('edit-modal').addEventListener('click', function(e) {
        if (e.target.id === 'edit-modal') closeModal();
    });

    document.getElementById('edit-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        var btn = e.target.querySelector('button[type="submit"]');
        setButtonState(btn, true, 'Save Changes', 'Saving...');

        var id          = document.getElementById('edit-id').value;
        var type        = document.getElementById('edit-type').value;
        var category    = normalizeText(document.getElementById('edit-category').value, TEXT_LIMITS.category);
        var amount      = parseFloat(document.getElementById('edit-amount').value);
        var date        = document.getElementById('edit-date').value;
        var description = normalizeText(document.getElementById('edit-description').value, TEXT_LIMITS.description);

        if (!isValidObjectId(id)) {
            alert('The selected transaction is invalid.');
            setButtonState(btn, false, 'Save Changes', 'Saving...');
            return;
        }
        if (!category) {
            alert('Please enter a category.');
            setButtonState(btn, false, 'Save Changes', 'Saving...');
            return;
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            alert('Please enter a valid amount greater than zero.');
            setButtonState(btn, false, 'Save Changes', 'Saving...');
            return;
        }
        if (!date) {
            alert('Please select a date.');
            setButtonState(btn, false, 'Save Changes', 'Saving...');
            return;
        }

        try {
            await apiRequest('/transactions/' + id, 'PUT', { type, category, amount, date, description });
            closeModal();
            await loadDashboard();
        } catch (err) {
            alert('Failed to update: ' + err.message);
        } finally {
            setButtonState(btn, false, 'Save Changes', 'Saving...');
        }
    });

    //  Transaction Filter

    document.getElementById('filter-apply-btn').addEventListener('click', async function() {
        var category  = normalizeText(document.getElementById('filter-category').value, TEXT_LIMITS.category);
        var type      = document.getElementById('filter-type').value;
        var startDate = document.getElementById('filter-start').value;
        var endDate   = document.getElementById('filter-end').value;

        var params = [];
        if (category)  params.push('category=' + encodeURIComponent(category));
        if (type)      params.push('type=' + encodeURIComponent(type));
        if (startDate) params.push('startDate=' + encodeURIComponent(startDate));
        if (endDate)   params.push('endDate=' + encodeURIComponent(endDate));

        var qs = params.length ? '?' + params.join('&') : '';

        try {
            var filtered = await apiRequest('/transactions' + qs);
            updateTransactionTable(filtered);
        } catch (err) {
            alert('Filter failed: ' + err.message);
        }
    });

    document.getElementById('filter-reset-btn').addEventListener('click', function() {
        document.getElementById('filter-category').value = '';
        document.getElementById('filter-type').value     = '';
        document.getElementById('filter-start').value    = '';
        document.getElementById('filter-end').value      = '';
        updateTransactionTable(allTransactions);
    });
}