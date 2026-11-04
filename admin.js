const adminPage = document.querySelector('.admin-main');

if (adminPage) {
    const token = getToken();
    if (!token) goToApp('/');

    const status = document.getElementById('broadcast-status');
    let users = [];
    let previewed = false;

    function setStatus(message, type) {
        status.textContent = message || '';
        status.className = 'info-text' + (type ? ` ${type}` : '');
    }

    async function adminRequest(endpoint, method, body) {
        try {
            return await apiRequest('/admin' + endpoint, method, body);
        } catch (error) {
            if (/admin access|authorization|token/i.test(error.message)) {
                clearSession();
                goToApp('/');
            }
            throw error;
        }
    }

    function renderUsers() {
        const query = normalizeText(document.getElementById('user-search').value, 120).toLowerCase();
        const rows = users.filter((user) => !query || `${user.name} ${user.email}`.toLowerCase().includes(query));
        document.getElementById('admin-users-table').innerHTML = rows.length ? rows.map((user) => `
            <tr>
                <td>${escapeHtml(user.name)}<br><small>${escapeHtml(user.email)}</small></td>
                <td>${escapeHtml(user.role)}</td>
                <td>${escapeHtml(user.accountStatus)}</td>
                <td><button class="btn-secondary btn-auto admin-user-toggle" data-id="${escapeHtml(user._id)}" data-status="${user.accountStatus === 'active' ? 'suspended' : 'active'}">${user.accountStatus === 'active' ? 'Suspend' : 'Activate'}</button></td>
            </tr>`).join('') : '<tr><td colspan="4" class="empty-msg">No users found.</td></tr>';
    }

    function renderFeedback(items) {
        document.getElementById('admin-feedback-table').innerHTML = items.length ? items.map((item) => `
            <tr>
                <td>${escapeHtml(item.user?.name || 'Unknown')}<br><small>${escapeHtml(item.user?.email || '')}</small></td>
                <td>${escapeHtml(item.subject)}</td>
                <td>${escapeHtml(item.message)}</td>
                <td>${escapeHtml(item.status)}</td>
                <td><select class="admin-feedback-status" data-id="${escapeHtml(item._id)}"><option value="new" ${item.status === 'new' ? 'selected' : ''}>New</option><option value="in_progress" ${item.status === 'in_progress' ? 'selected' : ''}>In progress</option><option value="resolved" ${item.status === 'resolved' ? 'selected' : ''}>Resolved</option></select></td>
            </tr>`).join('') : '<tr><td colspan="5" class="empty-msg">No feedback yet.</td></tr>';
    }

    async function loadAdminData() {
        try {
            const [summary, userResult, feedbackResult, profileResult] = await Promise.all([
                adminRequest('/summary'),
                adminRequest('/users'),
                adminRequest('/feedback'),
                apiRequest('/auth/me')
            ]);
            document.getElementById('admin-users-count').textContent = summary.users;
            document.getElementById('admin-active-count').textContent = summary.activeUsers;
            document.getElementById('admin-feedback-count').textContent = summary.newFeedback;
            users = userResult.users || [];
            document.getElementById('admin-greeting').textContent = `Hello, ${profileResult.user.name}`;
            renderUsers();
            renderFeedback(feedbackResult.feedback || []);
        } catch (error) {
            setStatus(error.message || 'Could not load admin data.', 'error');
        }
    }

    document.getElementById('user-search').addEventListener('input', renderUsers);
    document.getElementById('broadcast-preview-btn').addEventListener('click', async () => {
        const subject = document.getElementById('broadcast-subject').value;
        const message = document.getElementById('broadcast-message').value;
        try {
            const result = await adminRequest('/broadcast/preview', 'POST', { subject, message });
            document.getElementById('broadcast-preview').textContent = `${result.recipientCount} active recipient(s) will receive this email.`;
            document.getElementById('broadcast-confirm-group').style.display = 'block';
            document.getElementById('broadcast-send-btn').disabled = false;
            previewed = true;
            setStatus('Preview ready. Confirm the exact recipient count before sending.', 'success');
        } catch (error) {
            setStatus(error.message, 'error');
        }
    });

    document.getElementById('broadcast-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!previewed || document.getElementById('broadcast-confirmation').value.trim() !== 'SEND') {
            setStatus('Preview the message and type SEND before sending.', 'error');
            return;
        }
        const button = document.getElementById('broadcast-send-btn');
        setButtonState(button, true, 'Send broadcast', 'Sending...');
        try {
            const result = await adminRequest('/broadcast/send', 'POST', {
                subject: document.getElementById('broadcast-subject').value,
                message: document.getElementById('broadcast-message').value,
                confirmation: 'SEND'
            });
            setStatus(`Broadcast complete. Sent: ${result.sent}; failed: ${result.failed}.`, result.failed ? 'error' : 'success');
            previewed = false;
            document.getElementById('broadcast-confirmation').value = '';
            button.disabled = true;
        } catch (error) {
            setStatus(error.message, 'error');
        } finally {
            setButtonState(button, false, 'Send broadcast', 'Sending...');
            if (!previewed) button.disabled = true;
        }
    });

    document.getElementById('admin-users-table').addEventListener('click', async (event) => {
        const button = event.target.closest('.admin-user-toggle');
        if (!button) return;
        try {
            await adminRequest(`/users/${button.dataset.id}`, 'PATCH', { accountStatus: button.dataset.status });
            await loadAdminData();
        } catch (error) {
            setStatus(error.message, 'error');
        }
    });

    document.getElementById('admin-feedback-table').addEventListener('change', async (event) => {
        const select = event.target.closest('.admin-feedback-status');
        if (!select) return;
        try {
            await adminRequest(`/feedback/${select.dataset.id}`, 'PATCH', { status: select.value });
            await loadAdminData();
        } catch (error) {
            setStatus(error.message, 'error');
        }
    });

    document.getElementById('admin-logout-btn').addEventListener('click', () => {
        clearSession();
        goToApp('/');
    });

    loadAdminData();
    window.setInterval(loadAdminData, 30000);
}
