const settingsPage = document.getElementById('settings-page');
if (settingsPage) {
    if (!getToken()) {
        goToApp('/');
    }

    let currentUserProfile = getUser() || {};
    const greeting = document.getElementById('user-greeting');
    const logoutBtn = document.getElementById('logout-btn');
    const accountForm = document.getElementById('account-form');
    const accountNameInput = document.getElementById('account-name');
    const accountCountryInput = document.getElementById('account-country');
    const accountPhoneInput = document.getElementById('account-phone');
    const accountCurrencyInput = document.getElementById('account-currency');
    const accountBiometricToggle = document.getElementById('account-biometric');
    const accountSaveBtn = document.getElementById('account-save-btn');
    const accountStatus = document.getElementById('account-status');
    const biometricSetupBtn = document.getElementById('biometric-setup-btn');

    function setStatusText(text, type) {
        if (!accountStatus) return;
        accountStatus.textContent = text || '';
        accountStatus.classList.remove('success', 'error');
        if (type === 'success' || type === 'error') {
            accountStatus.classList.add(type);
        }
    }

    function supportsBiometricUnlock() {
        return typeof window.PublicKeyCredential !== 'undefined' && !!navigator.credentials;
    }

    function biometricCredentialStorageKey() {
        return 'finance-tracker-biometric-credential-id';
    }

    function bufferToBase64Url(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let index = 0; index < bytes.byteLength; index += 1) {
            binary += String.fromCharCode(bytes[index]);
        }
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }

    function base64UrlToBuffer(value) {
        let normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
        while (normalized.length % 4) normalized += '=';
        const binary = atob(normalized);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
        }
        return bytes.buffer;
    }

    async function enrollBiometricCredential(profile) {
        profile = profile || currentUserProfile;
        if (!supportsBiometricUnlock()) {
            throw new Error('Biometric unlock is not supported in this browser.');
        }

        const userId = window.crypto.getRandomValues(new Uint8Array(32));
        const challenge = window.crypto.getRandomValues(new Uint8Array(32));
        const credential = await navigator.credentials.create({
            publicKey: {
                challenge,
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

    function applyProfileToForm(profile) {
        profile = profile || {};
        currentUserProfile = profile;
        setUser(profile);

        if (greeting) {
            greeting.textContent = 'Hello, ' + (normalizeText(profile.name || '', 80) || 'there');
        }

        if (accountNameInput) accountNameInput.value = profile.name || '';
        if (accountCountryInput) {
            populateCountrySelect(accountCountryInput, profile.country || getActiveCurrencyInfo().country);
            updateCurrencyPreview(accountCountryInput, accountCurrencyInput);
        }
        if (accountPhoneInput) accountPhoneInput.value = profile.phoneNumber || '';
        if (accountBiometricToggle) accountBiometricToggle.checked = !!profile.biometricEnabled;
    }

    async function loadProfile() {
        try {
            const profileResult = await apiRequest('/auth/me');
            if (profileResult && profileResult.user) {
                applyProfileToForm(profileResult.user);
            }
        } catch (error) {
            if (/token|authoriz/i.test(error.message)) {
                clearSession();
                goToApp('/');
                return;
            }
            setStatusText(error.message || 'Could not load account settings.', 'error');
        }
    }

    async function saveAccountSettings(e) {
        e.preventDefault();
        const btn = accountSaveBtn || e.target.querySelector('button[type="submit"]');
        setButtonState(btn, true, 'Save Account Settings', 'Saving...');

        try {
            let nextName = accountNameInput ? normalizeText(accountNameInput.value, 80) : currentUserProfile.name;
            let nextCountry = accountCountryInput ? accountCountryInput.value : currentUserProfile.country;
            const nextPhone = accountPhoneInput ? normalizeText(accountPhoneInput.value, 24) : '';
            const nextBiometricEnabled = !!(accountBiometricToggle && accountBiometricToggle.checked);

            if (!nextName) nextName = currentUserProfile.name || '';
            if (!nextCountry) nextCountry = currentUserProfile.country || getActiveCurrencyInfo().country;

            if (nextBiometricEnabled && !localStorage.getItem(biometricCredentialStorageKey())) {
                await enrollBiometricCredential({
                    name: nextName || currentUserProfile.name,
                    email: currentUserProfile.email,
                    country: nextCountry
                });
            }

            const result = await apiRequest('/auth/me', 'PUT', {
                name: nextName,
                country: nextCountry,
                phoneNumber: nextPhone,
                biometricEnabled: nextBiometricEnabled
            });

            if (result && result.user) {
                applyProfileToForm(result.user);
            }

            setStatusText('Account settings saved successfully.', 'success');
        } catch (error) {
            setStatusText(error.message || 'Could not save account settings.', 'error');
        } finally {
            setButtonState(btn, false, 'Save Account Settings', 'Saving...');
        }
    }

    function enrollBiometricFromProfile() {
        if (!accountForm) return;
        saveAccountSettings({
            preventDefault() {},
            target: accountForm
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            clearSession();
            goToApp('/');
        });
    }

    if (accountCountryInput) {
        accountCountryInput.addEventListener('change', function() {
            updateCurrencyPreview(accountCountryInput, accountCurrencyInput);
        });
    }

    if (biometricSetupBtn) {
        biometricSetupBtn.addEventListener('click', enrollBiometricFromProfile);
    }

    if (accountForm) {
        accountForm.addEventListener('submit', saveAccountSettings);
    }

    applyProfileToForm(currentUserProfile);
    loadProfile();
}
