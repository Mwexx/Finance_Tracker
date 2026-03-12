// ============================================================
// Personal Finance Tracker - Frontend JavaScript
// ============================================================

const API_URL = '/api';

// ── Utility Helpers ──────────────────────────────────────────

function getToken() {
    return localStorage.getItem('token');
}

function getUser() {
    try { return JSON.parse(localStorage.getItem('user')); }
    catch { return null; }
}

function formatKsh(amount) {
    return 'Ksh ' + parseFloat(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' });
}

function toInputDate(dateStr) {
    return new Date(dateStr).toISOString().split('T')[0];
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

async function apiRequest(endpoint, method, body) {
    method = method || 'GET';
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'x-auth-token': getToken()
        }
    };
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(API_URL + endpoint, options);
    const data = await res.json();
    if (!res.ok) throw new Error(data.msg || 'Request failed');
    return data;
}

// ── Auth Page ─────────────────────────────────────────────────

const authForm = document.getElementById('auth-form');
if (authForm) {
    // Already logged in → go to dashboard
    if (getToken()) window.location.href = '/dashboard';

    let isLogin = true;
    const toggleLink    = document.getElementById('toggle-form');
    const switchLabel   = document.getElementById('auth-switch-label');
    const formTitle     = document.getElementById('form-title');
    const formSubtitle  = document.getElementById('form-subtitle');
    const nameGroup     = document.getElementById('name-group');
    const nameInput     = document.getElementById('name');
    const submitBtn     = document.getElementById('auth-submit-btn');
    const errorEl       = document.getElementById('auth-error');

    toggleLink.addEventListener('click', function(e) {
        e.preventDefault();
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

    authForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        errorEl.textContent = '';

        const email    = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const name     = nameInput.value.trim();

        if (!email || !password) {
            errorEl.textContent = 'Email and password are required.';
            return;
        }
        if (!isLogin && !name) {
            errorEl.textContent = 'Please enter your full name.';
            return;
        }
        if (password.length < 6) {
            errorEl.textContent = 'Password must be at least 6 characters.';
            return;
        }

        submitBtn.disabled     = true;
        submitBtn.textContent  = isLogin ? 'Signing in...' : 'Creating account...';

        try {
            const endpoint = isLogin ? '/auth/login' : '/auth/register';
            const body     = isLogin ? { email, password } : { name, email, password };

            const res = await fetch(API_URL + endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const result = await res.json();

            if (res.ok) {
                localStorage.setItem('token', result.token);
                localStorage.setItem('user', JSON.stringify(result.user));
                window.location.href = '/dashboard';
            } else {
                errorEl.textContent = result.msg || 'Authentication failed. Please try again.';
            }
        } catch (err) {
            errorEl.textContent = 'Server error. Is the server running?';
        } finally {
            submitBtn.disabled    = false;
            submitBtn.textContent = isLogin ? 'Sign In' : 'Create Account';
        }
    });
}

// ── Dashboard Page ───────────────────────────────────────────

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
        document.getElementById('user-greeting').textContent = 'Hello, ' + user.name;
    }

    // Default date for new transaction = today
    document.getElementById('t-date').value = new Date().toISOString().split('T')[0];

    // Logout
    document.getElementById('logout-btn').addEventListener('click', function() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/';
    });

    // ── Load Everything ──────────────────────────────────────

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
            if (err.message.includes('not valid') || err.message.includes('No token')) {
                localStorage.removeItem('token');
                window.location.href = '/';
            }
        }
    }

    loadDashboard();

    // ── Summary Cards ────────────────────────────────────────

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

    // ── Transaction Table ────────────────────────────────────

    function updateTransactionTable(transactions) {
        var tbody = document.getElementById('transaction-tbody');
        if (!transactions.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">No transactions found.</td></tr>';
            return;
        }
        tbody.innerHTML = transactions.map(function(t) {
            var sign = t.type === 'income' ? '+' : '-';
            return '<tr class="transaction-row ' + t.type + '">' +
                '<td>' + formatDate(t.date) + '</td>' +
                '<td><span class="category-badge">' + escapeHtml(t.category) + '</span></td>' +
                '<td><span class="type-badge ' + t.type + '">' + (t.type === 'income' ? 'Income' : 'Expense') + '</span></td>' +
                '<td class="desc-cell">' + escapeHtml(t.description || '\u2014') + '</td>' +
                '<td class="amount-cell ' + t.type + '">' + sign + formatKsh(t.amount) + '</td>' +
                '<td class="action-cell">' +
                    '<button class="btn-edit-sm" onclick="openEditModal(\'' + t._id + '\')">Edit</button>' +
                    '<button class="btn-delete-sm" onclick="deleteTransaction(\'' + t._id + '\')">Delete</button>' +
                '</td>' +
            '</tr>';
        }).join('');
    }

    // ── Pie Chart (Expense by Category) ─────────────────────

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

    // ── Bar Chart (Budget vs Actual) ─────────────────────────

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

    // ── Budget List with Progress Bars ───────────────────────

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
            return '<div class="budget-item">' +
                '<div class="budget-item-header">' +
                    '<span class="budget-category">' + escapeHtml(b.category) + '</span>' +
                    '<div class="budget-amounts">' +
                        '<span class="budget-spent ' + statusClass + '">Ksh ' + spent.toFixed(2) + '</span>' +
                        '<span class="budget-limit"> / Ksh ' + b.limit.toFixed(2) + '</span>' +
                        '<button class="btn-delete-sm" onclick="deleteBudget(\'' + b._id + '\')">&times;</button>' +
                    '</div>' +
                '</div>' +
                '<div class="progress-bar"><div class="progress-fill ' + statusClass + '" style="width:' + pct + '%"></div></div>' +
                '<small class="budget-pct ' + statusClass + '">' + pct.toFixed(1) + '% used' + (pct >= 80 ? ' &#9888;&#65039;' : '') + '</small>' +
            '</div>';
        }).join('');
    }

    // ── Add Transaction ──────────────────────────────────────

    document.getElementById('transaction-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        var btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = 'Adding...';

        var type        = document.getElementById('t-type').value;
        var category    = document.getElementById('t-category').value.trim();
        var amount      = parseFloat(document.getElementById('t-amount').value);
        var date        = document.getElementById('t-date').value;
        var description = document.getElementById('t-description').value.trim();

        if (!category) { alert('Please enter a category.'); btn.disabled = false; btn.textContent = 'Add Transaction'; return; }
        if (!date)     { alert('Please select a date.');    btn.disabled = false; btn.textContent = 'Add Transaction'; return; }

        try {
            await apiRequest('/transactions', 'POST', { type, category, amount, date, description });
            e.target.reset();
            document.getElementById('t-date').value = new Date().toISOString().split('T')[0];
            await loadDashboard();
        } catch (err) {
            alert('Failed to add transaction: ' + err.message);
        } finally {
            btn.disabled    = false;
            btn.textContent = 'Add Transaction';
        }
    });

    // ── Set Budget ───────────────────────────────────────────

    document.getElementById('budget-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        var btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = 'Saving...';

        var category = document.getElementById('b-category').value.trim();
        var limit    = parseFloat(document.getElementById('b-limit').value);

        if (!category) { alert('Please enter a category.'); btn.disabled = false; btn.textContent = 'Set Budget'; return; }

        try {
            await apiRequest('/budgets', 'POST', { category, limit });
            e.target.reset();
            await loadDashboard();
        } catch (err) {
            alert('Failed to set budget: ' + err.message);
        } finally {
            btn.disabled    = false;
            btn.textContent = 'Set Budget';
        }
    });

    // ── Delete Transaction ───────────────────────────────────

    window.deleteTransaction = async function(id) {
        if (!confirm('Delete this transaction? This cannot be undone.')) return;
        try {
            await apiRequest('/transactions/' + id, 'DELETE');
            await loadDashboard();
        } catch (err) {
            alert('Failed to delete: ' + err.message);
        }
    };

    // ── Delete Budget ────────────────────────────────────────

    window.deleteBudget = async function(id) {
        if (!confirm('Remove this budget limit?')) return;
        try {
            await apiRequest('/budgets/' + id, 'DELETE');
            await loadDashboard();
        } catch (err) {
            alert('Failed to remove budget: ' + err.message);
        }
    };

    // ── Edit Modal ───────────────────────────────────────────

    window.openEditModal = function(id) {
        var t = allTransactions.find(function(tx) { return tx._id === id; });
        if (!t) return;
        document.getElementById('edit-id').value          = t._id;
        document.getElementById('edit-type').value        = t.type;
        document.getElementById('edit-category').value    = t.category;
        document.getElementById('edit-amount').value      = t.amount;
        document.getElementById('edit-date').value        = toInputDate(t.date);
        document.getElementById('edit-description').value = t.description || '';
        document.getElementById('edit-modal').style.display = 'flex';
    };

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
        btn.disabled = true;
        btn.textContent = 'Saving...';

        var id          = document.getElementById('edit-id').value;
        var type        = document.getElementById('edit-type').value;
        var category    = document.getElementById('edit-category').value.trim();
        var amount      = parseFloat(document.getElementById('edit-amount').value);
        var date        = document.getElementById('edit-date').value;
        var description = document.getElementById('edit-description').value.trim();

        try {
            await apiRequest('/transactions/' + id, 'PUT', { type, category, amount, date, description });
            closeModal();
            await loadDashboard();
        } catch (err) {
            alert('Failed to update: ' + err.message);
        } finally {
            btn.disabled    = false;
            btn.textContent = 'Save Changes';
        }
    });

    // ── Transaction Filters ──────────────────────────────────

    document.getElementById('filter-apply-btn').addEventListener('click', async function() {
        var category  = document.getElementById('filter-category').value.trim();
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