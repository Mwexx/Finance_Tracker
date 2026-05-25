// Personal Finance Tracker - Frontend JavaScrip

const DEFAULT_LIVE_API_URL = 'https://finance-tracker-tau-amber.vercel.app/api';
const IS_GITHUB_PAGES = /\.github\.io$/i.test(window.location.hostname);
const APP_BASE_PATH = IS_GITHUB_PAGES ? '/Finance_Tracker' : '';
const API_URL = window.__FINANCE_TRACKER_API_URL__ || (IS_GITHUB_PAGES ? DEFAULT_LIVE_API_URL : '/api');
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const APP_NOTICE_VERSION = '2026-05-update';
const TEXT_LIMITS = {
    name: 80,
    email: 254,
    category: 60,
    description: 240,
    password: 128
};

const COUNTRY_CURRENCIES = [
    { country: 'Kenya', currencyCode: 'KES', currencySymbol: 'Ksh' },
    { country: 'Uganda', currencyCode: 'UGX', currencySymbol: 'USh' },
    { country: 'Tanzania', currencyCode: 'TZS', currencySymbol: 'TSh' },
    { country: 'Rwanda', currencyCode: 'RWF', currencySymbol: 'RF' },
    { country: 'South Africa', currencyCode: 'ZAR', currencySymbol: 'R' },
    { country: 'Nigeria', currencyCode: 'NGN', currencySymbol: '₦' },
    { country: 'Ghana', currencyCode: 'GHS', currencySymbol: 'GH₵' },
    { country: 'United States', currencyCode: 'USD', currencySymbol: '$' },
    { country: 'Canada', currencyCode: 'CAD', currencySymbol: 'C$' },
    { country: 'United Kingdom', currencyCode: 'GBP', currencySymbol: '£' },
    { country: 'India', currencyCode: 'INR', currencySymbol: '₹' },
    { country: 'Australia', currencyCode: 'AUD', currencySymbol: 'A$' },
    { country: 'Eurozone', currencyCode: 'EUR', currencySymbol: '€' }
];

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

function setUser(user) {
    try {
        localStorage.setItem('user', JSON.stringify(user || {}));
    } catch {
        // Ignore storage failures and continue with in-memory state.
    }
}

function getCountryCurrency(country) {
    var normalized = normalizeText(country, 60).toLowerCase();
    return COUNTRY_CURRENCIES.find(function(item) {
        return item.country.toLowerCase() === normalized;
    }) || COUNTRY_CURRENCIES[0];
}

function getActiveCurrencyInfo() {
    var user = getUser();
    return getCountryCurrency(user && user.country ? user.country : 'Kenya');
}

function formatMoney(amount, currencySymbol) {
    var numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount)) numericAmount = 0;
    var symbol = currencySymbol || getActiveCurrencyInfo().currencySymbol || 'Ksh';
    return symbol + ' ' + numericAmount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function clearSession() {
    try {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        sessionStorage.removeItem('finance-tracker-biometric-unlocked');
    } catch {
        // Ignore storage failures and continue with logout flow.
    }
}

function appUrl(path) {
    if (!IS_GITHUB_PAGES) {
        return path;
    }

    if (!path || path === '/') {
        return APP_BASE_PATH + '/index.html';
    }

    if (path === '/dashboard') {
        return APP_BASE_PATH + '/dashboard.html';
    }

    if (path === '/setting.html') {
        return APP_BASE_PATH + '/setting.html';
    }

    if (path.charAt(0) === '/') {
        return APP_BASE_PATH + path;
    }

    return APP_BASE_PATH + '/' + path;
}

function goToApp(path) {
    window.location.href = appUrl(path);
}

function formatKsh(amount) {
    return formatMoney(amount);
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
    if (getToken() && pageMode !== 'reset' && pageMode !== 'forgot') goToApp('/dashboard');

    let isLogin = true;
    const toggleLink    = document.getElementById('toggle-form');
    const switchLabel   = document.getElementById('auth-switch-label');
    const formTitle     = document.getElementById('form-title');
    const formSubtitle  = document.getElementById('form-subtitle');
    const nameGroup     = document.getElementById('name-group');
    const nameInput     = document.getElementById('name');
    const countryGroup   = document.getElementById('country-group');
    const countryInput   = document.getElementById('country');
    const phoneGroup     = document.getElementById('phone-group');
    const phoneInput     = document.getElementById('phone-number');
    const currencyGroup  = document.getElementById('currency-group');
    const currencyPreview = document.getElementById('currency-preview');
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
    populateCountrySelect(countryInput, getActiveCurrencyInfo().country);
    updateCurrencyPreview(countryInput, currencyPreview);
    if (phoneInput) phoneInput.maxLength = 24;

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
        if (countryGroup) countryGroup.style.display = isLogin ? 'none' : 'block';
        if (phoneGroup) phoneGroup.style.display = isLogin ? 'none' : 'block';
        if (currencyGroup) currencyGroup.style.display = isLogin ? 'none' : 'block';
        nameInput.required       = !isLogin;
        if (countryInput) countryInput.required = !isLogin;
        submitBtn.textContent    = isLogin ? 'Sign In' : 'Create Account';
        switchLabel.textContent  = isLogin ? "Don't have an account?" : 'Already have an account?';
        toggleLink.textContent   = isLogin ? ' Register here' : ' Sign in instead';
        errorEl.textContent      = '';
    });

    if (countryInput) {
        countryInput.addEventListener('change', function() {
            updateCurrencyPreview(countryInput, currencyPreview);
        });
    }

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
            const body     = isLogin ? { email, password } : {
                name,
                email,
                password,
                country: countryInput ? countryInput.value : 'Kenya',
                phoneNumber: phoneInput ? normalizeText(phoneInput.value, 24) : ''
            };

            const result = await apiRequest(endpoint, 'POST', body, { skipAuth: true });
            localStorage.setItem('token', result.token);
            setUser(result.user);
            goToApp('/dashboard');
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
    if (!getToken()) { goToApp('/'); }

    // State
    var allTransactions  = [];
    var allBudgets       = [];
    var pieChartInstance = null;
    var barChartInstance = null;
    var currentUserProfile = getUser() || {};

    const updateBanner = document.getElementById('update-banner');
    const updateBannerText = document.getElementById('update-banner-text');
    const dismissUpdateBtn = document.getElementById('dismiss-update-banner');
    const accountNameInput = document.getElementById('account-name');
    const accountCountryInput = document.getElementById('account-country');
    const accountPhoneInput = document.getElementById('account-phone');
    const accountCurrencyInput = document.getElementById('account-currency');
    const accountBiometricToggle = document.getElementById('account-biometric');
    const biometricOverlay = document.getElementById('biometric-overlay');
    const biometricUnlockBtn = document.getElementById('biometric-unlock-btn');
    const biometricSkipBtn = document.getElementById('biometric-skip-btn');
    const reportForm = document.getElementById('report-form');
    const reportMonthSelect = document.getElementById('report-month');
    const reportGenerateBtn = document.getElementById('report-generate-btn');
    const reportExportCsvBtn = document.getElementById('report-export-csv-btn');
    const reportExportPdfBtn = document.getElementById('report-export-pdf-btn');
    const reportStatus = document.getElementById('report-status');
    const reportSummary = document.getElementById('report-summary');
    const archiveForm = document.getElementById('archive-form');
    const archiveMonthInput = document.getElementById('archive-month');
    const archiveStartInput = document.getElementById('archive-start');
    const archiveEndInput = document.getElementById('archive-end');
    const archiveMonthBtn = document.getElementById('archive-month-btn');
    const archiveRangeBtn = document.getElementById('archive-range-btn');
    const restoreMonthBtn = document.getElementById('restore-month-btn');
    const restoreRangeBtn = document.getElementById('restore-range-btn');
    const refreshArchivedBtn = document.getElementById('refresh-archived-btn');
    const archivedList = document.getElementById('archived-list');
    const archiveStatus = document.getElementById('archive-status');

    // Greet user
    applyProfileToUI(currentUserProfile);

    // Default date for new transaction = today
    document.getElementById('t-date').value = new Date().toISOString().split('T')[0];

    // Logout
    document.getElementById('logout-btn').addEventListener('click', function() {
        clearSession();
        goToApp('/');
    });

    if (dismissUpdateBtn) {
        dismissUpdateBtn.addEventListener('click', dismissUpdateNotice);
    }

    if (biometricUnlockBtn) {
        biometricUnlockBtn.addEventListener('click', unlockWithBiometrics);
    }

    if (biometricSkipBtn) {
        biometricSkipBtn.addEventListener('click', function() {
            sessionStorage.setItem('finance-tracker-biometric-unlocked', '1');
            hideBiometricOverlay();
            loadDashboard();
            queueMonthlyReportAutoCheck();
        });
    }

    if (reportForm) {
        reportForm.addEventListener('submit', generateMonthlyReport);
    }

    if (reportExportCsvBtn) {
        reportExportCsvBtn.addEventListener('click', function() {
            downloadMonthlyReport('csv');
        });
    }

    if (reportExportPdfBtn) {
        reportExportPdfBtn.addEventListener('click', function() {
            downloadMonthlyReport('pdf');
        });
    }

    if (archiveMonthInput && !archiveMonthInput.value) {
        archiveMonthInput.value = getDefaultArchiveMonth();
    }

    if (archiveMonthBtn) {
        archiveMonthBtn.addEventListener('click', function() {
            archiveTransactionsByPeriod({ month: archiveMonthInput ? archiveMonthInput.value : '' });
        });
    }

    if (archiveRangeBtn) {
        archiveRangeBtn.addEventListener('click', function() {
            archiveTransactionsByPeriod({
                startDate: archiveStartInput ? archiveStartInput.value : '',
                endDate: archiveEndInput ? archiveEndInput.value : ''
            });
        });
    }

    if (restoreMonthBtn) {
        restoreMonthBtn.addEventListener('click', function() {
            restoreTransactionsByPeriod({ month: archiveMonthInput ? archiveMonthInput.value : '' });
        });
    }

    if (restoreRangeBtn) {
        restoreRangeBtn.addEventListener('click', function() {
            restoreTransactionsByPeriod({
                startDate: archiveStartInput ? archiveStartInput.value : '',
                endDate: archiveEndInput ? archiveEndInput.value : ''
            });
        });
    }

    if (refreshArchivedBtn) {
        refreshArchivedBtn.addEventListener('click', function() {
            loadArchivedTransactions();
        });
    }

    if (archivedList) {
        archivedList.addEventListener('click', function(e) {
            var button = e.target.closest('button[data-action="unarchive-transaction"]');
            if (!button) return;
            unarchiveTransaction(button.getAttribute('data-id'));
        });
    }

    // Load Everything

    function showStatusText(el, text, type) {
        if (!el) return;
        el.textContent = text || '';
        el.classList.remove('success', 'error');
        if (type === 'success' || type === 'error') {
            el.classList.add(type);
        }
    }

    function getDefaultArchiveMonth() {
        var now = new Date();
        now.setMonth(now.getMonth() - 1);
        return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    }

    function getRelativeMonthKey(monthOffset) {
        var referenceDate = new Date();
        referenceDate.setMonth(referenceDate.getMonth() + monthOffset);
        return referenceDate.getFullYear() + '-' + String(referenceDate.getMonth() + 1).padStart(2, '0');
    }

    function getReportMonthOptions(count) {
        var options = [];
        var monthCount = count || 12;

        for (var offset = -1; offset >= -monthCount; offset -= 1) {
            var monthKey = getRelativeMonthKey(offset);
            var monthDate = new Date(monthKey + '-01T00:00:00');
            options.push({
                value: monthKey,
                label: monthDate.toLocaleString('default', { month: 'long', year: 'numeric' })
            });
        }

        return options;
    }

    function populateReportMonthSelect(monthOptions) {
        if (!reportMonthSelect) return;

        var options = Array.isArray(monthOptions) && monthOptions.length ? monthOptions : getReportMonthOptions(12);
        var previouslySelected = reportMonthSelect.value || getDefaultArchiveMonth();

        reportMonthSelect.innerHTML = options.map(function(option) {
            return '<option value="' + escapeHtml(option.value) + '">' + escapeHtml(option.label) + '</option>';
        }).join('');

        reportMonthSelect.value = options.some(function(option) { return option.value === previouslySelected; })
            ? previouslySelected
            : (options[0] ? options[0].value : previouslySelected);
    }

    function getSelectedReportMonth() {
        return reportMonthSelect && reportMonthSelect.value ? reportMonthSelect.value : getDefaultArchiveMonth();
    }

    function getSelectedReportMonthLabel() {
        if (!reportMonthSelect) return getSelectedReportMonth();
        var selectedOption = reportMonthSelect.options[reportMonthSelect.selectedIndex];
        return selectedOption ? selectedOption.textContent : getSelectedReportMonth();
    }

    if (reportMonthSelect) {
        populateReportMonthSelect();
    }

    async function loadReportMonths() {
        if (!reportMonthSelect) return;

        try {
            var monthOptions = await apiRequest('/transactions/months');
            populateReportMonthSelect(monthOptions);
        } catch (err) {
            console.error('Failed to load report months:', err.message);
            populateReportMonthSelect();
        }
    }

    async function fetchBinary(endpoint) {
        var options = {
            method: 'GET',
            headers: { 'Accept': '*/*' }
        };
        var token = getToken();
        if (token) {
            options.headers['x-auth-token'] = token;
        }

        var response = await fetch(API_URL + endpoint, options);
        if (!response.ok) {
            var text = await response.text();
            throw new Error(text || ('Request failed (' + response.status + ')'));
        }
        return response;
    }

    function triggerDownload(blob, fileName) {
        var url = URL.createObjectURL(blob);
        var anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(function() {
            URL.revokeObjectURL(url);
        }, 1000);
    }

    function applyProfileToUI(profile) {
        profile = profile || {};
        currentUserProfile = profile;
        setUser(profile);

        if (profile.name) {
            document.getElementById('user-greeting').textContent = 'Hello, ' + (normalizeText(profile.name, TEXT_LIMITS.name) || 'there');
        }

        if (accountNameInput) accountNameInput.value = profile.name || '';
        if (accountCountryInput) {
            populateCountrySelect(accountCountryInput, profile.country || getActiveCurrencyInfo().country);
            updateCurrencyPreview(accountCountryInput, accountCurrencyInput);
        }
        if (accountPhoneInput) accountPhoneInput.value = profile.phoneNumber || '';
        if (accountBiometricToggle) accountBiometricToggle.checked = !!profile.biometricEnabled;

        if (updateBannerText) {
            updateBannerText.textContent = 'A new version of Finance Tracker is available. Review the changes and confirm your account settings to keep your profile in sync.';
        }

        if (profile.appNoticeVersionSeen !== APP_NOTICE_VERSION) {
            showUpdateBanner();
        } else {
            hideUpdateBanner();
        }
    }

    function showUpdateBanner() {
        if (updateBanner) updateBanner.style.display = 'flex';
    }

    function hideUpdateBanner() {
        if (updateBanner) updateBanner.style.display = 'none';
    }

    async function dismissUpdateNotice() {
        try {
            var result = await apiRequest('/auth/me', 'PUT', { appNoticeVersionSeen: APP_NOTICE_VERSION });
            if (result && result.user) {
                applyProfileToUI(result.user);
            }
            hideUpdateBanner();
        } catch (err) {
            alert('Could not dismiss the update notice: ' + err.message);
        }
    }

    function biometricCredentialStorageKey() {
        return 'finance-tracker-biometric-credential-id';
    }

    function hasBiometricSessionUnlock() {
        try {
            return sessionStorage.getItem('finance-tracker-biometric-unlocked') === '1';
        } catch {
            return false;
        }
    }

    function supportsBiometricUnlock() {
        return typeof window.PublicKeyCredential !== 'undefined' && !!navigator.credentials;
    }

    function bufferToBase64Url(buffer) {
        var bytes = new Uint8Array(buffer);
        var binary = '';
        for (var i = 0; i < bytes.byteLength; i += 1) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }

    function base64UrlToBuffer(value) {
        var normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
        while (normalized.length % 4) normalized += '=';
        var binary = atob(normalized);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    function hideBiometricOverlay() {
        if (biometricOverlay) biometricOverlay.style.display = 'none';
    }

    function showBiometricOverlay() {
        if (biometricOverlay) biometricOverlay.style.display = 'flex';
    }

    async function enrollBiometricCredential(profile) {
        profile = profile || currentUserProfile;
        if (!supportsBiometricUnlock()) {
            throw new Error('Biometric unlock is not supported in this browser.');
        }

        var userId = window.crypto.getRandomValues(new Uint8Array(32));
        var challenge = window.crypto.getRandomValues(new Uint8Array(32));
        var credential = await navigator.credentials.create({
            publicKey: {
                challenge: challenge,
                rp: { name: 'Finance Tracker' },
                user: {
                    id: userId,
                    name: profile.email || 'user@finance-tracker.local',
                    displayName: profile.name || 'Finance Tracker User'
                },
                pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
                timeout: 60000,
                attestation: 'none',
                authenticatorSelection: {
                    authenticatorAttachment: 'platform',
                    userVerification: 'required',
                    residentKey: 'preferred'
                }
            }
        });

        if (!credential || !credential.id) {
            throw new Error('Biometric enrollment was not completed.');
        }

        localStorage.setItem(biometricCredentialStorageKey(), credential.id);
        sessionStorage.setItem('finance-tracker-biometric-unlocked', '1');
        return credential.id;
    }

    async function enrollBiometricFromProfile() {
        try {
            var nextName = accountNameInput ? normalizeText(accountNameInput.value, TEXT_LIMITS.name) : currentUserProfile.name;
            var nextCountry = accountCountryInput ? accountCountryInput.value : currentUserProfile.country;
            var nextPhone = accountPhoneInput ? normalizeText(accountPhoneInput.value, 24) : '';

            if (!nextName) nextName = currentUserProfile.name || '';
            if (!nextCountry) nextCountry = currentUserProfile.country || getActiveCurrencyInfo().country;

            await enrollBiometricCredential({
                name: nextName,
                email: currentUserProfile.email,
                country: nextCountry
            });

            if (accountBiometricToggle) accountBiometricToggle.checked = true;

            var result = await apiRequest('/auth/me', 'PUT', {
                name: nextName,
                country: nextCountry,
                phoneNumber: nextPhone,
                biometricEnabled: true
            });

            if (result && result.user) {
                applyProfileToUI(result.user);
            }

            showStatusText(reportStatus, 'Biometric unlock enrolled successfully.', 'success');
        } catch (err) {
            showStatusText(reportStatus, err.message || 'Could not enroll biometrics.', 'error');
        }
    }

    async function unlockWithBiometrics() {
        try {
            if (!supportsBiometricUnlock()) {
                throw new Error('Biometric unlock is not supported in this browser.');
            }

            var credentialId = localStorage.getItem(biometricCredentialStorageKey());
            if (!credentialId) {
                throw new Error('No biometric credential is enrolled on this device. Enable it in Account Settings first.');
            }

            var challenge = window.crypto.getRandomValues(new Uint8Array(32));
            await navigator.credentials.get({
                publicKey: {
                    challenge: challenge,
                    allowCredentials: [{ id: base64UrlToBuffer(credentialId), type: 'public-key' }],
                    userVerification: 'required',
                    timeout: 60000
                }
            });

            sessionStorage.setItem('finance-tracker-biometric-unlocked', '1');
            hideBiometricOverlay();
            await loadDashboard();
            queueMonthlyReportAutoCheck();
        } catch (err) {
            alert(err.message || 'Biometric unlock failed.');
        }
    }

    async function saveAccountSettings(e) {
        e.preventDefault();
        var btn = accountSaveBtn || e.target.querySelector('button[type="submit"]');
        setButtonState(btn, true, 'Save Account Settings', 'Saving...');

        try {
            var nextName = accountNameInput ? normalizeText(accountNameInput.value, TEXT_LIMITS.name) : currentUserProfile.name;
            var nextCountry = accountCountryInput ? accountCountryInput.value : currentUserProfile.country;
            var nextPhone = accountPhoneInput ? normalizeText(accountPhoneInput.value, 24) : '';
            var nextBiometricEnabled = !!(accountBiometricToggle && accountBiometricToggle.checked);

            if (!nextName) nextName = currentUserProfile.name || '';
            if (!nextCountry) nextCountry = currentUserProfile.country || getActiveCurrencyInfo().country;

            if (nextBiometricEnabled && !localStorage.getItem(biometricCredentialStorageKey())) {
                await enrollBiometricCredential({
                    name: nextName || currentUserProfile.name,
                    email: currentUserProfile.email,
                    country: nextCountry
                });
            }

            var result = await apiRequest('/auth/me', 'PUT', {
                name: nextName,
                country: nextCountry,
                phoneNumber: nextPhone,
                biometricEnabled: nextBiometricEnabled
            });

            if (result && result.user) {
                applyProfileToUI(result.user);
            }

            showStatusText(accountStatus, 'Account settings saved successfully.', 'success');
            await loadDashboard();
        } catch (err) {
            showStatusText(accountStatus, err.message || 'Could not save account settings.', 'error');
        } finally {
            setButtonState(btn, false, 'Save Account Settings', 'Saving...');
        }
    }

    function renderReportSummary(report) {
        if (!reportSummary) return;
        if (!report) {
            reportSummary.innerHTML = '<p class="empty-msg">Generate a monthly report to see the summary here.</p>';
            return;
        }

        var currency = report.currency && report.currency.symbol ? report.currency.symbol : getActiveCurrencyInfo().currencySymbol;
        var categoryRows = (report.categoryTotals || []).map(function(entry) {
            return '<li><strong>' + escapeHtml(entry.category) + '</strong>: ' + formatMoney(entry.total, currency) + '</li>';
        }).join('');
        if (!categoryRows) {
            categoryRows = '<li>No spending recorded for that month.</li>';
        }

        var budgetRows = (report.budgetSnapshots || []).map(function(snapshot) {
            return '<tr>' +
                '<td>' + escapeHtml(snapshot.category) + '</td>' +
                '<td>' + formatMoney(snapshot.limit, currency) + '</td>' +
                '<td>' + formatMoney(snapshot.spent, currency) + '</td>' +
                '<td>' + snapshot.percentage.toFixed(1) + '%</td>' +
            '</tr>';
        }).join('');

        if (!budgetRows) {
            budgetRows = '<tr><td colspan="4" class="empty-msg">No budgets set for this month.</td></tr>';
        }

        reportSummary.innerHTML =
            '<div class="report-summary-grid">' +
                '<div><span>Month</span><strong>' + escapeHtml(report.monthLabel || '') + '</strong></div>' +
                '<div><span>Income</span><strong>' + formatMoney(report.summary.income, currency) + '</strong></div>' +
                '<div><span>Expenses</span><strong>' + formatMoney(report.summary.expense, currency) + '</strong></div>' +
                '<div><span>Balance</span><strong>' + formatMoney(report.summary.balance, currency) + '</strong></div>' +
            '</div>' +
            '<div class="report-summary-columns">' +
                '<div>' +
                    '<h4>Top Categories</h4>' +
                    '<ul class="report-list">' + categoryRows + '</ul>' +
                '</div>' +
                '<div>' +
                    '<h4>Budget Snapshot</h4>' +
                    '<div class="table-wrapper report-table-wrapper"><table><thead><tr><th>Category</th><th>Limit</th><th>Spent</th><th>Used</th></tr></thead><tbody>' + budgetRows + '</tbody></table></div>' +
                '</div>' +
            '</div>';
    }

    async function generateMonthlyReport(e) {
        e.preventDefault();
        var btn = reportGenerateBtn || e.target.querySelector('button[type="submit"]');
        setButtonState(btn, true, 'Generate Monthly Report', 'Generating...');
        showStatusText(reportStatus, 'Generating monthly report for ' + getSelectedReportMonthLabel() + '...', '');

        try {
            var monthKey = getSelectedReportMonth();
            var result = await apiRequest('/reports/monthly/send', 'POST', { month: monthKey });
            if (result && result.report) {
                renderReportSummary(result.report);
            }
            showStatusText(reportStatus, result.msg || 'Monthly report generated successfully.', 'success');
        } catch (err) {
            showStatusText(reportStatus, err.message || 'Could not generate the report.', 'error');
        } finally {
            setButtonState(btn, false, 'Generate Monthly Report', 'Generating...');
        }
    }

    async function downloadMonthlyReport(format) {
        try {
            var selectedMonthKey = getSelectedReportMonth();
            var endpoint = '/reports/monthly/export?format=' + encodeURIComponent(format || 'csv') + '&month=' + encodeURIComponent(selectedMonthKey);
            var response = await fetchBinary(endpoint);
            var blob = await response.blob();
            var contentDisposition = response.headers.get('content-disposition') || 'finance-report';
            var fileName = format === 'pdf' ? 'finance-report.pdf' : 'finance-report.csv';
            if (/finance-report-[\d-]+/i.test(contentDisposition)) {
                var match = contentDisposition.match(/finance-report-[\d-]+/i);
                if (match) {
                    fileName = match[0] + (format === 'pdf' ? '.pdf' : '.csv');
                }
            }
            triggerDownload(blob, fileName);
            showStatusText(reportStatus, 'Monthly report downloaded as ' + format.toUpperCase() + '.', 'success');
        } catch (err) {
            showStatusText(reportStatus, err.message || 'Could not download the report.', 'error');
        }
    }

    async function archiveTransactionsByPeriod(payload) {
        try {
            var cleanedPayload = {};
            if (payload.month) cleanedPayload.month = payload.month;
            if (payload.startDate) cleanedPayload.startDate = payload.startDate;
            if (payload.endDate) cleanedPayload.endDate = payload.endDate;

            if (!cleanedPayload.month && !cleanedPayload.startDate && !cleanedPayload.endDate) {
                throw new Error('Select a month or date range to archive.');
            }

            var archivePeriod = cleanedPayload.month || (cleanedPayload.startDate && cleanedPayload.endDate ? cleanedPayload.startDate + ' to ' + cleanedPayload.endDate : '');
            var result = await apiRequest('/transactions/archive', 'POST', {
                ...cleanedPayload,
                archivePeriod: archivePeriod
            });

            showStatusText(archiveStatus, result.msg || 'Transactions archived successfully.', 'success');
            await loadDashboard();
            await loadArchivedTransactions();
        } catch (err) {
            showStatusText(archiveStatus, err.message || 'Could not archive transactions.', 'error');
        }
    }

    async function restoreTransactionsByPeriod(payload) {
        try {
            var cleanedPayload = {};
            if (payload.month) cleanedPayload.month = payload.month;
            if (payload.startDate) cleanedPayload.startDate = payload.startDate;
            if (payload.endDate) cleanedPayload.endDate = payload.endDate;

            if (!cleanedPayload.month && !cleanedPayload.startDate && !cleanedPayload.endDate) {
                throw new Error('Select a month or date range to restore.');
            }

            var archivePeriod = cleanedPayload.month || (cleanedPayload.startDate && cleanedPayload.endDate ? cleanedPayload.startDate + ' to ' + cleanedPayload.endDate : '');
            var result = await apiRequest('/transactions/unarchive', 'POST', {
                ...cleanedPayload,
                archivePeriod: archivePeriod
            });

            showStatusText(archiveStatus, result.msg || 'Transactions restored successfully.', 'success');
            await loadDashboard();
            await loadArchivedTransactions();
        } catch (err) {
            showStatusText(archiveStatus, err.message || 'Could not restore transactions.', 'error');
        }
    }

    async function unarchiveTransaction(transactionId) {
        if (!isValidObjectId(transactionId)) {
            showStatusText(archiveStatus, 'Selected transaction is invalid.', 'error');
            return;
        }

        try {
            var result = await apiRequest('/transactions/unarchive', 'POST', { ids: [transactionId] });
            showStatusText(archiveStatus, result.msg || 'Transaction restored successfully.', 'success');
            await loadDashboard();
            await loadArchivedTransactions();
        } catch (err) {
            showStatusText(archiveStatus, err.message || 'Could not restore transaction.', 'error');
        }
    }

    async function loadArchivedTransactions() {
        if (!archivedList) return;

        try {
            var transactions = await apiRequest('/transactions/archived');
            renderArchivedTransactions(transactions);
        } catch (err) {
            archivedList.innerHTML = '<p class="empty-msg">Unable to load archived transactions.</p>';
            console.error('Failed to load archived transactions:', err.message);
        }
    }

    function renderArchivedTransactions(transactions) {
        if (!archivedList) return;
        if (!transactions || !transactions.length) {
            archivedList.innerHTML = '<p class="empty-msg">No archived transactions yet.</p>';
            return;
        }

        archivedList.innerHTML = '<div class="table-wrapper"><table class="archived-table"><thead><tr><th>Date</th><th>Category</th><th>Type</th><th>Amount</th><th>Archived</th><th>Action</th></tr></thead><tbody>' +
            transactions.map(function(t) {
                return '<tr>' +
                    '<td>' + formatDate(t.date) + '</td>' +
                    '<td>' + escapeHtml(t.category) + '</td>' +
                    '<td><span class="type-badge ' + t.type + '">' + (t.type === 'income' ? 'Income' : 'Expense') + '</span></td>' +
                    '<td>' + formatKsh(t.amount) + '</td>' +
                    '<td>' + formatDate(t.archivedAt || t.updatedAt || t.createdAt || t.date) + '</td>' +
                    '<td><button type="button" class="btn-secondary btn-auto" data-action="unarchive-transaction" data-id="' + escapeHtml(t._id) + '">Unarchive</button></td>' +
                '</tr>';
            }).join('') + '</tbody></table></div>';
    }

    async function queueMonthlyReportAutoCheck() {
        try {
            var result = await apiRequest('/reports/monthly/auto', 'POST', {});
            if (result && result.report) {
                renderReportSummary(result.report);
                showStatusText(reportStatus, 'Previous month report generated automatically.', 'success');
            }
        } catch (err) {
            console.error('Monthly report auto-check failed:', err.message);
        }
    }

    async function bootstrapDashboard() {
        try {
            var profileResult = await apiRequest('/auth/me');
            if (profileResult && profileResult.user) {
                applyProfileToUI(profileResult.user);
            }

            if (currentUserProfile.biometricEnabled && !hasBiometricSessionUnlock()) {
                showBiometricOverlay();
                return;
            }

            hideBiometricOverlay();
            await loadDashboard();
            await loadReportMonths();
            await loadArchivedTransactions();
            queueMonthlyReportAutoCheck();
        } catch (err) {
            console.error('Failed to initialize dashboard:', err.message);
            if (/token|authoriz/i.test(err.message)) {
                clearSession();
                goToApp('/');
            }
        }
    }

    async function loadDashboard() {
        try {
            const transactions = await apiRequest('/transactions');
            allTransactions = Array.isArray(transactions) ? transactions : [];

            updateSummaryCards(allTransactions);
            updateTransactionTable(allTransactions);
            renderPieChart(allTransactions);
        } catch (err) {
            console.error('Failed to load transactions:', err.message);
            if (/token|authoriz/i.test(err.message)) {
                clearSession();
                goToApp('/');
                return;
            }
        }

        try {
            const budgets = await apiRequest('/budgets');
            allBudgets = Array.isArray(budgets) ? budgets : [];
            renderBarChart(allTransactions, allBudgets);
            renderBudgetList(allBudgets, allTransactions);
        } catch (err) {
            console.error('Failed to load budgets:', err.message);
            if (/token|authoriz/i.test(err.message)) {
                clearSession();
                goToApp('/');
            }
        }
    }

    bootstrapDashboard();

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
                            label: function(ctx) { return ' ' + ctx.label + ': ' + formatKsh(ctx.parsed); }
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
                                return ' ' + ctx.dataset.label + ': ' + formatKsh(ctx.parsed.y);
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(val) { return formatKsh(val); }
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
                        '<span class="budget-spent ' + statusClass + '">' + formatKsh(spent) + '</span>' +
                        '<span class="budget-limit"> / ' + formatKsh(b.limit) + '</span>' +
                        '<button type="button" class="btn-delete-sm" data-action="delete-budget" data-id="' + escapeHtml(budgetId) + '" aria-label="Delete budget"' + (budgetId ? '' : ' disabled') + '>&times;</button>' +
                    '</div>' +
                '</div>' +
                '<div class="progress-bar"><div class="progress-fill ' + statusClass + '" style="width:' + pct + '%"></div></div>' +
                '<small class="budget-pct ' + statusClass + '">' + pct.toFixed(1) + '% used' + (pct >= 80 ? ' &#9888;&#65039;' : '') + '</small>' +
            '</div>';
        }).join('');
    }

    function scrollToTransactionHistory() {
        var historySection = document.querySelector('.history-section');
        if (!historySection || typeof historySection.scrollIntoView !== 'function') return;

        historySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
            var createdTransaction = await apiRequest('/transactions', 'POST', { type, category, amount, date, description });
            e.target.reset();
            document.getElementById('t-date').value = new Date().toISOString().split('T')[0];
            if (createdTransaction && createdTransaction._id) {
                allTransactions = [createdTransaction].concat(allTransactions.filter(function(item) {
                    return item && item._id !== createdTransaction._id;
                }));
                updateSummaryCards(allTransactions);
                updateTransactionTable(allTransactions);
                renderPieChart(allTransactions);
                renderBarChart(allTransactions, allBudgets);
                renderBudgetList(allBudgets, allTransactions);
            }
            await loadDashboard();
            scrollToTransactionHistory();
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

function populateCountrySelect(selectEl, selectedCountry) {
    if (!selectEl) return;
    selectEl.innerHTML = COUNTRY_CURRENCIES.map(function(entry) {
        return '<option value="' + escapeHtml(entry.country) + '">' + escapeHtml(entry.country) + ' (' + escapeHtml(entry.currencyCode) + ')</option>';
    }).join('');
    if (selectedCountry) {
        selectEl.value = selectedCountry;
    }
}

function updateCurrencyPreview(countrySelect, currencyField, codeField) {
    if (!countrySelect) return;
    var info = getCountryCurrency(countrySelect.value);
    if (currencyField) currencyField.value = info.currencySymbol + ' - ' + info.currencyCode;
    if (codeField) codeField.value = info.currencyCode;
}