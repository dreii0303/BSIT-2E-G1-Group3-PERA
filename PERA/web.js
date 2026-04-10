// ========== DARK MODE & CURRENCY INITIALIZATION ==========
// Apply dark mode on page load with smooth transitions
(function() {
    const darkModeEnabled = localStorage.getItem('pera_darkMode') === 'true';
    
    if (darkModeEnabled) {
        document.body.classList.add('dark-mode-enabled');
    }
})();

// Get currency symbol
window.getCurrencySymbol = function() {
    const currency = localStorage.getItem('pera_currency') || 'PHP';
    const symbols = {
        'PHP': '₱',
        'USD': '$',
        'EUR': '€',
        'GBP': '£'
    };
    return symbols[currency] || '₱';
};

// Format currency display
window.formatCurrency = function(amount) {
    const symbol = window.getCurrencySymbol();
    return symbol + parseFloat(amount).toFixed(2);
};

// Get currency code
window.getCurrencyCode = function() {
    return localStorage.getItem('pera_currency') || 'PHP';
};

// ========== EXPENSE LIMIT FUNCTIONS ==========
// Check if expense limit is enabled
window.isExpenseLimitEnabled = function() {
    return localStorage.getItem('pera_expenseLimitEnabled') === 'true';
};

// Get expense limit amount
window.getExpenseLimitAmount = function() {
    return parseFloat(localStorage.getItem('pera_expenseLimitAmount') || '50000');
};

// Get current month's total expenses
window.getCurrentMonthExpenses = function() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12
    
    // Try to get data using the window functions if available
    let transactions = [];
    
    if (typeof window.getData === 'function') {
        transactions = window.getData('transactions') || [];
    } else {
        try {
            const user = JSON.parse(localStorage.getItem('activePeraUser'));
            const userKey = `${user?.email || 'guest'}_transactions`;
            transactions = JSON.parse(localStorage.getItem(userKey)) || [];
        } catch (error) {
            console.error('Error getting transactions:', error);
            return 0;
        }
    }
    
    // Sum all expenses for the current month
    const monthlyTotal = transactions
        .filter(t => {
            const transDate = new Date(t.date);
            const transYear = transDate.getFullYear();
            const transMonth = transDate.getMonth() + 1;
            return t.type === 'expense' && transYear === currentYear && transMonth === currentMonth;
        })
        .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
    
    return monthlyTotal;
};

// Check if monthly expenses exceeded the limit
window.hasExceededExpenseLimit = function() {
    if (!window.isExpenseLimitEnabled()) {
        return false;
    }
    
    const limit = window.getExpenseLimitAmount();
    const currentExpenses = window.getCurrentMonthExpenses();
    
    return currentExpenses > limit;
};

// Get expense limit status object
window.getExpenseLimitStatus = function() {
    const isEnabled = window.isExpenseLimitEnabled();
    const limit = window.getExpenseLimitAmount();
    const currentExpenses = window.getCurrentMonthExpenses();
    const exceeded = currentExpenses > limit;
    const percentageUsed = (currentExpenses / limit) * 100;
    
    return {
        enabled: isEnabled,
        limit: limit,
        current: currentExpenses,
        exceeded: exceeded,
        percentageUsed: percentageUsed,
        remaining: Math.max(0, limit - currentExpenses)
    };
};

// --- CLEAR HISTORY LOGIC ---
window.clearHistory = () => {
    if (confirm("Are you sure? This will reset all bank balances to their initial state and delete all transaction logs and recurring payments.")) {

        const localGetData = (key) => {
            if (typeof window.getData === 'function') {
                return window.getData(key);
            }
            try {
                const user = JSON.parse(localStorage.getItem("activePeraUser"));
                const userKey = `${user?.email || 'guest'}_${key}`;
                return JSON.parse(localStorage.getItem(userKey)) || [];
            } catch (error) {
                console.error(`Error parsing ${key}:`, error);
                return [];
            }
        };

        const localOverwriteData = (key, dataArray) => {
            if (typeof window.overwriteData === 'function') {
                window.overwriteData(key, dataArray);
                return;
            }
            try {
                const user = JSON.parse(localStorage.getItem("activePeraUser"));
                const userKey = `${user?.email || 'guest'}_${key}`;
                localStorage.setItem(userKey, JSON.stringify(dataArray));
            } catch (error) {
                console.error(`Error writing ${key}:`, error);
            }
        };

        // 1. Reset all bank balances to their initial amounts
        const accounts = localGetData("bankAccounts");
        accounts.forEach(acc => {
            // For backward compatibility, if initialBalance doesn't exist, set it to current balance first
            if (acc.initialBalance === undefined) {
                acc.initialBalance = parseFloat(acc.balance);
            }
            acc.balance = acc.initialBalance;
        });
        localOverwriteData("bankAccounts", accounts);

        // 2. Remove all transactions and recurring payments
        const user = JSON.parse(localStorage.getItem("activePeraUser") || '{}');
        const prefix = user.email || 'guest';

        if (typeof window.overwriteData === 'function') {
            window.overwriteData('transactions', []);
            window.overwriteData('recurringPayments', []);
        } else {
            localStorage.removeItem(`${prefix}_transactions`);
            localStorage.removeItem(`${prefix}_recurringPayments`);
        }

        // 3. Refresh the UI (these functions are defined inside DOMContentLoaded, so we need to call them differently)
        // For now, just reload the page to refresh everything
        alert("History cleared. All bank balances have been reset to their initial amounts.");
        window.location.reload();
    }
};

document.addEventListener("DOMContentLoaded", function () {
    console.log('DOMContentLoaded fired - JavaScript is loading');

    // Helper to safely get element
    const el = (id) => document.getElementById(id);

    // User sync state for server-backed storage
    let isLoggedIn = false;
    let userDataCache = {};

    const syncDataToServer = (key, data) => {
        if (!isLoggedIn) return;

        fetch('sync_data.php', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ key, data })
        })
        .then(res => res.json())
        .then(resp => {
            if (!resp.success) {
                console.warn('Server sync failed:', resp.message);
            }
        })
        .catch(err => {
            console.error('Server sync error:', err);
        });
    };

    const loadServerData = async () => {
        try {
            const loginResp = await fetch('check_login.php', { credentials: 'include' });
            const loginData = await loginResp.json();

            if (loginData.logged_in) {
                isLoggedIn = true;
                if (loginData.user && loginData.user.email) {
                    localStorage.setItem('activePeraUser', JSON.stringify({ email: loginData.user.email }));
                }

                const dataResp = await fetch('sync_data.php', { credentials: 'include' });
                const serverData = await dataResp.json();

                if (serverData.success && serverData.data) {
                    userDataCache = serverData.data;
                } else {
                    userDataCache = {};
                }
            } else {
                isLoggedIn = false;
                userDataCache = {};
            }
        } catch (error) {
            console.error('Error loading user data from server:', error);
            isLoggedIn = false;
            userDataCache = {};
        }
    };

    const getUserPrefix = () => {
        try {
            const user = JSON.parse(localStorage.getItem('activePeraUser'));
            return user && user.email ? user.email : 'guest';
        } catch (error) {
            console.error('Error parsing active user:', error);
            return 'guest';
        }
    };

    const getData = (key) => {
        if (isLoggedIn) {
            const data = Array.isArray(userDataCache[key]) ? userDataCache[key] : [];
            return data;
        }

        try {
            const userKey = `${getUserPrefix()}_${key}`;
            const data = localStorage.getItem(userKey);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error(`Error parsing ${key}:`, error);
            return [];
        }
    };

    const saveData = (key, value) => {
        let existingData = getData(key);
        if (!Array.isArray(existingData)) existingData = [];
        existingData.push(value);

        if (isLoggedIn) {
            userDataCache[key] = existingData;
            localStorage.setItem(`${getUserPrefix()}_${key}`, JSON.stringify(existingData));
            syncDataToServer(key, existingData);
        } else {
            localStorage.setItem(`${getUserPrefix()}_${key}`, JSON.stringify(existingData));
        }
    };

    const overwriteData = (key, dataArray) => {
        if (!Array.isArray(dataArray)) dataArray = [];

        if (isLoggedIn) {
            userDataCache[key] = dataArray;
            localStorage.setItem(`${getUserPrefix()}_${key}`, JSON.stringify(dataArray));
            syncDataToServer(key, dataArray);
        } else {
            localStorage.setItem(`${getUserPrefix()}_${key}`, JSON.stringify(dataArray));
        }
    };

    // ========== UI ENHANCEMENT FUNCTIONS ==========

    // Add loading state to button
    const setButtonLoading = (button, loading = true) => {
        if (!button) return;
        button.disabled = loading;
        button.style.opacity = loading ? '0.7' : '1';
        if (loading) {
            button.setAttribute('data-original-text', button.textContent);
            button.textContent = 'Loading...';
        } else {
            const originalText = button.getAttribute('data-original-text');
            button.textContent = originalText || button.textContent;
        }
    };

    // Show toast notification
    const showNotification = (message, type = 'success', duration = 3000) => {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 16px 24px;
            background: ${type === 'success' ? '#4ade80' : type === 'error' ? '#f87171' : '#4db8ff'};
            color: white;
            border-radius: 12px;
            z-index: 9999;
            animation: slideUp 0.4s ease-out;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
            font-weight: 600;
            max-width: 300px;
            word-wrap: break-word;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideUp 0.4s ease-out reverse';
            setTimeout(() => notification.remove(), 400);
        }, duration);
    };

    // Add ripple effect to buttons
    const initRippleEffect = () => {
        const buttons = document.querySelectorAll('button');
        buttons.forEach(button => {
            button.addEventListener('click', function(e) {
                const ripple = document.createElement('span');
                const rect = this.getBoundingClientRect();
                const size = Math.max(rect.width, rect.height);
                const x = e.clientX - rect.left - size / 2;
                const y = e.clientY - rect.top - size / 2;

                ripple.style.cssText = `
                    position: absolute;
                    width: ${size}px;
                    height: ${size}px;
                    background: rgba(255, 255, 255, 0.5);
                    border-radius: 50%;
                    left: ${x}px;
                    top: ${y}px;
                    animation: ripple 0.6s ease-out;
                    pointer-events: none;
                `;

                if (this.style.position !== 'absolute' && this.style.position !== 'fixed') {
                    this.style.position = 'relative';
                }

                this.appendChild(ripple);
                setTimeout(() => ripple.remove(), 600);
            });
        });
    };

    // Add ripple animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes ripple {
            to {
                width: 500px;
                height: 500px;
                opacity: 0;
            }
        }
        @keyframes slideUp {
            from {
                transform: translateY(100%);
                opacity: 0;
            }
            to {
                transform: translateY(0);
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);

    // ========== AUTHENTICATION FUNCTIONS ==========

    // Password strength checker
    const checkPasswordStrength = (password) => {
        let strength = 0;
        
        if (password.length >= 8) strength++;
        if (password.length >= 12) strength++;
        if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
        if (/[0-9]/.test(password)) strength++;
        if (/[^a-zA-Z0-9]/.test(password)) strength++;
        
        return strength;
    };

    // Display password strength
    const updatePasswordStrength = () => {
        const passwordInput = el('password');
        const strengthDiv = el('passwordStrength');
        const strengthText = el('strengthText');
        
        if (passwordInput && strengthDiv && strengthText) {
            const password = passwordInput.value;
            if (password.length > 0) {
                strengthDiv.style.display = 'block';
                const strength = checkPasswordStrength(password);
                
                // Clear all classes
                ['weak', 'fair', 'good', 'strong'].forEach(cls => {
                    strengthText.classList.remove(cls);
                });
                
                // Update bars and strength text
                const bars = strengthDiv.querySelectorAll('.strength-bar');
                bars.forEach((bar, index) => {
                    bar.classList.remove('weak', 'fair', 'good', 'strong');
                    if (index < strength) {
                        if (strength <= 1) bar.classList.add('weak');
                        else if (strength <= 2) bar.classList.add('fair');
                        else if (strength <= 3) bar.classList.add('good');
                        else bar.classList.add('strong');
                    }
                });
                
                let strengthLabel = '';
                let strengthClass = '';
                if (strength <= 1) {
                    strengthLabel = 'Weak password';
                    strengthClass = 'weak';
                } else if (strength <= 2) {
                    strengthLabel = 'Fair password';
                    strengthClass = 'fair';
                } else if (strength <= 3) {
                    strengthLabel = 'Good password';
                    strengthClass = 'good';
                } else {
                    strengthLabel = 'Strong password';
                    strengthClass = 'strong';
                }
                
                strengthText.textContent = strengthLabel;
                strengthText.classList.add(strengthClass);
            } else {
                strengthDiv.style.display = 'none';
            }
        }
    };

    // Handle registration
    const registerForm = el('registerForm');
    if (registerForm) {
        // Add password strength listener
        const passwordInput = el('password');
        if (passwordInput) {
            passwordInput.addEventListener('input', updatePasswordStrength);
        }

        registerForm.addEventListener('submit', function(e) {
            console.log('Registration form submitted');
            e.preventDefault();
            console.log('Prevented default form submission');

            const fullName = el('fullName').value.trim();
            const email = el('email').value.trim();
            const password = el('password').value;
            const confirmPassword = el('confirmPassword').value;

            console.log('Form values:', { fullName, email, password: password ? '***' : '', confirmPassword: confirmPassword ? '***' : '' });

            // Clear previous errors
            ['nameError', 'emailError', 'passwordError', 'confirmError'].forEach(id => {
                el(id).textContent = '';
            });

            let hasError = false;

            // Validate full name
            if (!fullName) {
                el('nameError').textContent = 'Full name is required';
                hasError = true;
            } else if (fullName.length < 3) {
                el('nameError').textContent = 'Full name must be at least 3 characters';
                hasError = true;
            }

            // Validate email
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!email) {
                el('emailError').textContent = 'Email is required';
                hasError = true;
            } else if (!emailRegex.test(email)) {
                el('emailError').textContent = 'Please enter a valid email';
                hasError = true;
            }

            // Validate password strength
            if (!password) {
                el('passwordError').textContent = 'Password is required';
                hasError = true;
            } else if (password.length < 6) {
                el('passwordError').textContent = 'Password must be at least 6 characters';
                hasError = true;
            } else if (checkPasswordStrength(password) < 2) {
                el('passwordError').textContent = 'Password is too weak (use uppercase, lowercase, numbers, and symbols)';
                hasError = true;
            }

            // Validate confirm password
            if (password !== confirmPassword) {
                el('confirmError').textContent = 'Passwords do not match';
                hasError = true;
            }

            if (hasError) return;

            // Show loading state
            const submitBtn = el('registerBtn');
            setButtonLoading(submitBtn, true);

            // Send AJAX request to PHP
            console.log('Sending registration request to register.php');
            const formData = new FormData();
            formData.append('name', fullName);
            formData.append('email', email);
            formData.append('password', password);

            fetch('register.php', {
                method: 'POST',
                body: formData
            })
            .then(response => {
                console.log('Registration response received:', response.status, response.statusText);
                if (!response.ok) {
                    throw new Error(`Server returned status ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Registration response data:', data);
                setButtonLoading(submitBtn, false);

                if (data.success) {
                    // Show success message
                    el('successMessage').textContent = 'Account created successfully! Redirecting to login...';
                    el('successMessage').style.display = 'block';

                    // Redirect to login after 2 seconds
                    setTimeout(() => {
                        window.location.href = 'login.html';
                    }, 2000);

                    // Reset form
                    this.reset();
                    if (el('passwordStrength')) {
                        el('passwordStrength').style.display = 'none';
                    }
                } else {
                    // Show error message
                    if (data.message.includes('Email already registered')) {
                        el('emailError').textContent = data.message;
                    } else {
                        el('emailError').textContent = data.message;
                    }
                }
            })
            .catch(error => {
                setButtonLoading(submitBtn, false);
                console.error('Registration error:', error);
                el('emailError').textContent = 'An error occurred. Please try again.';
            });
        });
    }

    // Handle login
    const loginForm = el('loginForm');
    if (loginForm) {
        // Check for "remember me" on page load
        const rememberMeCheckbox = el('rememberMe');
        const savedEmail = localStorage.getItem('peraRememberedEmail');
        if (savedEmail && el('loginEmail')) {
            el('loginEmail').value = savedEmail;
            if (rememberMeCheckbox) rememberMeCheckbox.checked = true;
        }

        loginForm.addEventListener('submit', function(e) {
            console.log('Login form submitted');
            e.preventDefault();
            console.log('Prevented default form submission');

            const email = el('loginEmail').value.trim();
            const password = el('loginPassword').value;
            const rememberMe = rememberMeCheckbox ? rememberMeCheckbox.checked : false;

            console.log('Login form values:', { email, password: password ? '***' : '', rememberMe });

            // Clear previous errors
            el('loginEmailError').textContent = '';
            el('loginPasswordError').textContent = '';
            el('loginFail').textContent = '';
            el('loginFail').style.display = 'none';

            // Validate fields
            if (!email || !password) {
                el('loginFail').textContent = 'Please enter both email and password';
                el('loginFail').style.display = 'block';
                return;
            }

            // Show loading state
            const submitBtn = el('loginBtn');
            setButtonLoading(submitBtn, true);

            // Send AJAX request to PHP
            console.log('Sending login request to login.php');
            const formData = new FormData();
            formData.append('email', email);
            formData.append('password', password);

            fetch('login.php', {
                method: 'POST',
                credentials: 'include',
                body: formData
            })
            .then(response => {
                console.log('Login response received:', response.status, response.statusText);
                return response.json();
            })
            .then(data => {
                console.log('Login response data:', data);
                setButtonLoading(submitBtn, false);

                if (data.success) {
                    // Handle "remember me" (store in localStorage for client-side convenience)
                    if (rememberMe) {
                        localStorage.setItem('peraRememberedEmail', email);
                    } else {
                        localStorage.removeItem('peraRememberedEmail');
                    }

                    // Set active user in localStorage for client-side use
                    // Note: In production, you might want to fetch user data from server
                    localStorage.setItem('activePeraUser', JSON.stringify({ email: email }));

                    // Redirect to home
                    window.location.href = 'home.html';
                } else {
                    el('loginFail').textContent = data.message;
                    el('loginFail').style.display = 'block';
                }
            })
            .catch(error => {
                setButtonLoading(submitBtn, false);
                console.error('Login error:', error);
                el('loginFail').textContent = 'An error occurred. Please try again.';
                el('loginFail').style.display = 'block';
            });
        });
    }

    // ========== PASSWORD TOGGLE FUNCTIONS ==========

    // Register form password toggle
    const togglePass = el('togglePass');
    const toggleConfirm = el('toggleConfirm');
    const password = el('password');
    const confirmPassword = el('confirmPassword');

    if (togglePass && password) {
        togglePass.addEventListener('click', function() {
            if (password.type === 'password') {
                password.type = 'text';
                togglePass.textContent = 'Hide';
            } else {
                password.type = 'password';
                togglePass.textContent = 'Show';
            }
        });
    }

    if (toggleConfirm && confirmPassword) {
        toggleConfirm.addEventListener('click', function() {
            if (confirmPassword.type === 'password') {
                confirmPassword.type = 'text';
                toggleConfirm.textContent = 'Hide';
            } else {
                confirmPassword.type = 'password';
                toggleConfirm.textContent = 'Show';
            }
        });
    }

    // Login form password toggle
    const toggleLoginPass = el('toggleLoginPass');
    const loginPassword = el('loginPassword');

    if (toggleLoginPass && loginPassword) {
        toggleLoginPass.addEventListener('click', function() {
            if (loginPassword.type === 'password') {
                loginPassword.type = 'text';
                toggleLoginPass.textContent = 'Hide';
            } else {
                loginPassword.type = 'password';
                toggleLoginPass.textContent = 'Show';
            }
        });
    }

    // ========== FORM VALIDATION & BUTTON STATE ==========

    // Register form button state handler
    const registerBtn = el('registerBtn');
    if (registerForm && registerBtn) {
        const checkRegisterFormValidity = () => {
            const fullName = el('fullName').value.trim();
            const email = el('email').value.trim();
            const password = el('password').value;
            const confirmPassword = el('confirmPassword').value;
            
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const isValid = fullName.length >= 3 && 
                          emailRegex.test(email) && 
                          password.length >= 6 && 
                          password === confirmPassword;
            
            console.log('Register form validation:', { fullName: fullName.length, email: emailRegex.test(email), password: password.length, confirmMatch: password === confirmPassword, isValid });
            // Keep the register button enabled so the user always gets validation feedback via errors
            // registerBtn.disabled = !isValid;
        };

        el('fullName').addEventListener('input', checkRegisterFormValidity);
        el('email').addEventListener('input', checkRegisterFormValidity);
        el('password').addEventListener('input', checkRegisterFormValidity);
        el('confirmPassword').addEventListener('input', checkRegisterFormValidity);
        
        checkRegisterFormValidity(); // Initial check
    }

    // Login form button state handler
    const loginBtn = el('loginBtn');
    if (loginForm && loginBtn) {
        const checkLoginFormValidity = () => {
            const email = el('loginEmail').value.trim();
            const password = el('loginPassword').value;
            
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const isValid = emailRegex.test(email) && password.length > 0;
            
            console.log('Login form validation:', { email: emailRegex.test(email), password: password.length > 0, isValid });
            loginBtn.disabled = !isValid;
        };

        el('loginEmail').addEventListener('input', checkLoginFormValidity);
        el('loginPassword').addEventListener('input', checkLoginFormValidity);
        
        checkLoginFormValidity(); // Initial check
    }

    // ========== BANK MANAGEMENT FUNCTIONS ==========

    // Render bank accounts
    const renderBanks = () => {
        const bankContainer = el("bankList");
        if (!bankContainer) return;

        const accounts = getData("bankAccounts");
        
        // Clear existing bank cards but keep the "Add Account" card
        const addAccountCard = bankContainer.querySelector('.card[onclick*="openBankModal"]');
        bankContainer.innerHTML = "";
        
        // Always add the "Add Account" card first
        if (addAccountCard) {
            bankContainer.appendChild(addAccountCard);
        }

        // Add existing bank accounts
        accounts.forEach((account, index) => {
            const bankCard = document.createElement("div");
            bankCard.className = "bank-card";
            bankCard.innerHTML = `
                <h3>${account.name}</h3>
                <p class="balance">${window.getCurrencySymbol()}${parseFloat(account.balance).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                <div class="bank-actions">
                    <button class="add-balance-btn" data-index="${index}">Add Balance</button>
                    <button class="delete-bank-btn" data-index="${index}">Delete</button>
                </div>
            `;
            bankContainer.appendChild(bankCard);
        });
    };

    // Use event delegation for bank buttons (added once, outside renderBanks)
    if (!window.bankListenersInitialized) {
        const bankContainer = el("bankList");
        if (bankContainer) {
            bankContainer.addEventListener('click', function(e) {
                if (e.target.classList.contains('add-balance-btn')) {
                    const index = parseInt(e.target.getAttribute('data-index'), 10);
                    const accounts = getData("bankAccounts");
                    if (accounts && accounts[index]) {
                        const amount = prompt("Enter amount to add:");
                        if (amount && !isNaN(parseFloat(amount))) {
                            const parsed = parseFloat(amount);
                            if (parsed > 0) {
                                const currentBalance = parseFloat(accounts[index].balance) || 0;
                                accounts[index].balance = (currentBalance + parsed).toFixed(2);
                                overwriteData("bankAccounts", accounts);
                                renderBanks();
                                renderTransactions();
                                renderSubscriptions();
                                renderDashboard();
                                showNotification("Balance added successfully!", "success");
                            } else {
                                showNotification("Amount must be greater than 0", "error");
                            }
                        }
                    }
                } else if (e.target.classList.contains('delete-bank-btn')) {
                    const index = parseInt(e.target.getAttribute('data-index'), 10);
                    const accounts = getData("bankAccounts");
                    if (accounts && accounts[index] && confirm("Are you sure you want to delete this bank account?")) {
                        accounts.splice(index, 1);
                        overwriteData("bankAccounts", accounts);
                        renderBanks();
                        showNotification("Bank account deleted successfully!", "success");
                    }
                }
            });
            window.bankListenersInitialized = true;
        }
    }

    // Populate deduction source dropdowns
    const populateDeductionSources = () => {
        const deductionSelects = document.querySelectorAll('.deduction-source');
        const accounts = getData("bankAccounts");

        deductionSelects.forEach(select => {
            const isIncomeForm = select.id === 'incomeBank';
            
            if (isIncomeForm) {
                // For income form, default to Cash account (auto-created), fallback to "Income (No bank)" for legacy
                select.innerHTML = '<option value="income">Income (No bank)</option>';
                // Set Cash as selected if it exists
                const cashExists = accounts.find(acc => acc.name === 'Cash');
                if (cashExists) {
                    select.innerHTML = `<option value="Cash">Cash (₱${parseFloat(cashExists.balance).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})})</option>`;
                }
            } else {
                // For expense/recurring forms, don't include "income" option - only banks
                select.innerHTML = '<option value="">Select deduction source</option>';
            }

            // Add bank account options (don't add "income" option anymore)
            accounts.forEach(account => {
                const value = isIncomeForm ? account.name : `bank_${account.name}`;
                const displayName = account.name === 'Cash' ? account.name : `Bank: ${account.name}`;
                const option = `<option value="${value}">${displayName} (₱${parseFloat(account.balance).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})})</option>`;
                select.innerHTML += option;
            });
            
            // For expense/recurring, set Cash as default if it exists
            if (!isIncomeForm) {
                const cashExists = accounts.find(acc => acc.name === 'Cash');
                if (cashExists && select.value === '') {
                    select.value = `bank_Cash`;
                }
            }
        });
    };

    // ========== EXPENSE RECORDING FUNCTIONS ==========

    // Record expense with deduction logic
    const recordExpense = (expenseData) => {
        const { amount, category, description, deductionSource } = expenseData;
        const expenseAmount = parseFloat(amount);

        // Validate deduction source
        if (!deductionSource) {
            showNotification("Please select a deduction source.", "error");
            return false;
        }

        // Deduct from bank account
        const bankName = deductionSource.replace('bank_', '');
        const accounts = getData("bankAccounts");
        const account = accounts.find(acc => acc.name === bankName);

        if (!account || parseFloat(account.balance) < expenseAmount) {
            showNotification("Insufficient funds in selected account.", "error");
            return false;
        }

        // Deduct from bank account
        account.balance = (parseFloat(account.balance) - expenseAmount).toFixed(2);
        overwriteData("bankAccounts", accounts);

        // Save the expense
        const expense = {
            amount: expenseAmount,
            category,
            description,
            deductionSource,
            date: expenseData.date ? expenseData.date : dateToLocalString(new Date()),
            type: 'expense',
            createdAt: dateTimeToLocalString(new Date())
        };

        saveData("transactions", expense);
        showNotification("Expense recorded successfully!", "success");
        return true;
    };

    // ========== RECURRING PAYMENTS FUNCTIONS ==========

    // Convert a Date object to a local date string (YYYY-MM-DD) without timezone issues
    const dateToLocalString = (date) => {
        if (!date || isNaN(date.getTime())) return null;
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Convert a Date object to a local datetime string (YYYY-MM-DD HH:MM:SS) for database timestamps
    const dateTimeToLocalString = (date) => {
        if (!date || isNaN(date.getTime())) return null;
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    };

    const toDateOnly = (value) => {
        if (!value) return null;
        const d = new Date(value);
        if (isNaN(d)) return null;
        // Parse as local date string to avoid timezone issues
        const dateStr = dateToLocalString(d);
        const parts = dateStr.split('-');
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    };

    const isDateStringValid = (value) => {
        const d = toDateOnly(value);
        return !!d;
    };

    const addInterval = (date, frequency) => {
        // Ensure we're working with a proper Date object
        let d;
        if (typeof date === 'string') {
            const parts = date.split('-');
            d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        } else {
            d = new Date(date);
        }
        
        switch (frequency) {
            case 'daily':
                d.setDate(d.getDate() + 1);
                break;
            case 'weekly':
                d.setDate(d.getDate() + 7);
                break;
            case 'monthly':
                d.setMonth(d.getMonth() + 1);
                break;
            case 'yearly':
                d.setFullYear(d.getFullYear() + 1);
                break;
            default:
                return null;
        }
        return toDateOnly(d);
    };

    // Process recurring payments
    const processRecurringDeductions = () => {
        const recurringPayments = getData('recurringPayments');
        const today = toDateOnly(new Date());
        let hasUpdated = false;

        recurringPayments.forEach(payment => {
            let startDate = toDateOnly(payment.startDate);
            if (!startDate) {
                startDate = toDateOnly(payment.nextPaymentDate) || today;
            }
            if (!payment.startDate || payment.startDate === '0000-00-00' || !isDateStringValid(payment.startDate)) {
                payment.startDate = dateToLocalString(startDate);
                hasUpdated = true;
            }

            if (!payment.nextPaymentDate || payment.nextPaymentDate === '0000-00-00' || !isDateStringValid(payment.nextPaymentDate)) {
                payment.nextPaymentDate = dateToLocalString(startDate);
                hasUpdated = true;
            }

            if (!payment.nextDue || payment.nextDue === '0000-00-00' || !isDateStringValid(payment.nextDue)) {
                payment.nextDue = dateToLocalString(startDate);
                hasUpdated = true;
            }

            const endDate = payment.endDate ? toDateOnly(payment.endDate) : null;

            if (startDate > today) {
                return;
            }

            if (endDate && today > endDate) {
                return;
            }

            let nextDue;
            // For the FIRST payment (no lastProcessed), use startDate
            // For SUBSEQUENT payments, use nextPaymentDate or calculate from lastProcessed
            if (payment.lastProcessed) {
                const lastDate = toDateOnly(payment.lastProcessed);
                nextDue = lastDate ? addInterval(lastDate, payment.frequency) : startDate;
            } else {
                // First payment should be on startDate, not nextPaymentDate
                nextDue = startDate;
            }

            // Ensure fail counters exist
            payment.failedAttempts = payment.failedAttempts || 0;

            while (nextDue && nextDue <= today && (!endDate || nextDue <= endDate)) {
                const amount = parseFloat(payment.amount);
                let deducted = false;

                if (payment.deductionSource.startsWith('bank_')) {
                    const bankName = payment.deductionSource.replace('bank_', '');
                    const accounts = getData('bankAccounts');
                    const account = accounts.find(acc => acc.name === bankName);

                    if (account && parseFloat(account.balance) >= amount) {
                        account.balance = (parseFloat(account.balance) - amount).toFixed(2);
                        overwriteData('bankAccounts', accounts);
                        deducted = true;
                    }
                }

                if (!deducted) {
                    // record failed attempt and stop processing further cycles until funds are available
                    payment.lastFailed = dateToLocalString(nextDue);
                    payment.failedAttempts = (payment.failedAttempts || 0) + 1;
                    payment.times_failed_insufficient_funds = (payment.times_failed_insufficient_funds || 0) + 1;
                    hasUpdated = true;
                    break;
                }

                // clear failed flags on successful processing (recovery)
                payment.lastFailed = null;
                payment.failedAttempts = 0;

                const transaction = {
                    amount: amount,
                    category: payment.category,
                    description: `Recurring: ${payment.description}`,
                    deductionSource: payment.deductionSource,
                    date: dateToLocalString(nextDue),
                    type: 'recurring',
                    createdAt: dateTimeToLocalString(new Date())
                };

                saveData('transactions', transaction);
                payment.lastProcessed = dateToLocalString(nextDue);
                
                // Update tracking fields for successful deduction
                payment.times_deducted = (payment.times_deducted || 0) + 1;
                payment.total_paid = (parseFloat(payment.total_paid || 0) + amount).toFixed(2);
                
                // Increment to next due date BEFORE updating nextPaymentDate
                nextDue = addInterval(nextDue, payment.frequency);
                payment.nextPaymentDate = nextDue ? dateToLocalString(nextDue) : payment.lastProcessed;
                hasUpdated = true;
            }
        });

        if (hasUpdated) {
            overwriteData('recurringPayments', recurringPayments);
        }

        renderBanks();
        renderTransactions();
        renderSubscriptions();
        renderRecurringPayments();
        renderDashboard();
    };

    // ========== INCOME MANAGEMENT FUNCTIONS ==========

    // Render income
    const renderIncome = () => {
        const incomeContainer = el("incomeContainer");
        if (!incomeContainer) return;

        const income = getData("income");
        incomeContainer.innerHTML = "";

        if (income.length === 0) {
            incomeContainer.innerHTML = "<p>No income sources added yet.</p>";
            return;
        }

        income.forEach((inc, index) => {
            const incomeCard = document.createElement("div");
            incomeCard.className = "income-card";
            incomeCard.innerHTML = `
                <h3>${inc.source}</h3>
                <p class="amount">${window.formatCurrency(inc.amount)}</p>
                <button class="delete-btn" data-index="${index}">Delete</button>
            `;
            incomeContainer.appendChild(incomeCard);
        });

        // Add delete functionality
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const index = this.getAttribute('data-index');
                if (confirm("Are you sure you want to delete this income source?")) {
                    income.splice(index, 1);
                    overwriteData("income", income);
                    renderIncome();
                    showNotification("Income source deleted successfully!", "success");
                }
            });
        });
    };

    // ========== EXPORT TRANSACTIONS LOGIC ==========
    const exportTransactionsToCSV = () => {
        const transactions = getData("transactions") || [];

        if (transactions.length === 0) {
            alert("No transactions to export.");
            return;
        }

        // Sort transactions by date (newest first)
        transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Create CSV header
        let csv = "Type,Date,Description,Category,Amount\n";

        // Add each transaction
        transactions.forEach(transaction => {
            const rawAmount = parseFloat(transaction.amount);
            let amountValue = Number.isFinite(rawAmount) ? rawAmount : 0;
            if (transaction.type !== 'income') amountValue = -Math.abs(amountValue);
            const amount = amountValue.toFixed(2);

            const dateObj = new Date(transaction.date);
            const date = Number.isFinite(dateObj.getTime()) ? dateToLocalString(dateObj) : '';

            const description = `"${(transaction.description || '').replace(/"/g, '""')}"`; // Escape quotes
            const category = `"${(transaction.category || '').replace(/"/g, '""')}"`;

            csv += `${transaction.type},${date},${description},${category},${amount}\n`;
        });

        // Create and download the file
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "transactions.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // ========== TRANSACTION HISTORY FUNCTIONS ==========

    // Render transaction history
    const renderTransactions = () => {
        const transactions = getData("transactions");

        // If the page has a table body for transactions, render rows there
        const transactionTableBody = el("transactionTableBody");
        if (transactionTableBody) {
            transactionTableBody.innerHTML = "";

            if (!transactions || transactions.length === 0) {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td colspan="5">No transactions recorded yet.</td>`;
                transactionTableBody.appendChild(tr);
                return;
            }

            // Sort transactions by date (newest first)
            transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

            transactions.forEach(transaction => {
                const tr = document.createElement('tr');
                const amountSign = transaction.type === 'income' ? '+' : '-';
                tr.innerHTML = `
                    <td>${transaction.type}</td>
                    <td>${new Date(transaction.date).toLocaleDateString()}</td>
                    <td>${transaction.description}</td>
                    <td>${transaction.category || ''}</td>
                    <td>${amountSign}${window.getCurrencySymbol()}${parseFloat(transaction.amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                `;
                transactionTableBody.appendChild(tr);
            });

            return;
        }

        // Fallback: render card-style transaction list (older pages)
        const transactionContainer = el("transactionContainer");
        if (!transactionContainer) return;

        transactionContainer.innerHTML = "";

        if (!transactions || transactions.length === 0) {
            transactionContainer.innerHTML = "<p>No transactions recorded yet.</p>";
            return;
        }

        // Sort transactions by date (newest first)
        transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        transactions.forEach(transaction => {
            const transactionCard = document.createElement("div");
            transactionCard.className = `transaction-card ${transaction.type}`;
            transactionCard.innerHTML = `
                <div class="transaction-info">
                    <h4>${transaction.description}</h4>
                    <p class="category">${transaction.category}</p>
                    <p class="date">${new Date(transaction.date).toLocaleDateString()}</p>
                </div>
                <div class="transaction-amount">
                    <span class="amount ${transaction.type === 'income' ? 'positive' : 'negative'}">
                        ${transaction.type === 'income' ? '+' : '-'}${window.getCurrencySymbol()}${parseFloat(transaction.amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </span>
                    <p class="source">${transaction.deductionSource || 'N/A'}</p>
                </div>
            `;
            transactionContainer.appendChild(transactionCard);
        });
    };

    // ========== DASHBOARD RENDERING ==========
    const renderDashboard = () => {
        // Update welcome message with user's name
        const user = JSON.parse(localStorage.getItem("activePeraUser"));
        const welcomeTitleEl = el('welcomeTitle');
        if (welcomeTitleEl && user && user.name) {
            welcomeTitleEl.textContent = `Welcome, ${user.name}`;
        } else if (welcomeTitleEl) {
            welcomeTitleEl.textContent = 'Welcome, User';
        }

        const dashTotalBalanceEl = el('dashTotalBalance');
        const dashTotalIncomeEl = el('dashTotalIncome');
        const dashTotalExpenseEl = el('dashTotalExpense');
        const dashActiveSubsEl = el('dashActiveSubs');

        const accounts = getData('bankAccounts');
        const transactions = getData('transactions') || [];
        const recurringPayments = getData('recurringPayments');

        const totalBalance = accounts.reduce((s, a) => s + parseFloat(a.balance || 0), 0);
        // Income totals now come only from transactions (to avoid double-counting with income array)
        const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount || 0), 0);
        const totalExpense = transactions.filter(t => t.type !== 'income').reduce((s, t) => s + parseFloat(t.amount || 0), 0);

        if (dashTotalBalanceEl) dashTotalBalanceEl.textContent = `${window.getCurrencySymbol()}${totalBalance.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        if (dashTotalIncomeEl) dashTotalIncomeEl.textContent = `${window.getCurrencySymbol()}${totalIncome.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        if (dashTotalExpenseEl) dashTotalExpenseEl.textContent = `${window.getCurrencySymbol()}${totalExpense.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        if (dashActiveSubsEl) dashActiveSubsEl.textContent = (recurringPayments && recurringPayments.length) ? recurringPayments.length : 0;

        // Update dashboard widgets
        updateDashboardWidgets();
    };

    // Update dashboard widgets
    const updateDashboardWidgets = () => {
        // Current time
        const now = new Date();
        const timeEl = el('currentTimeWidget');
        if (timeEl) {
            timeEl.textContent = now.toLocaleTimeString();
        }

        // Current date
        const dateEl = el('currentDateWidget');
        if (dateEl) {
            dateEl.textContent = now.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        }

        // Monthly goal (placeholder - could be made configurable)
        const goalEl = el('monthlyGoalWidget');
        if (goalEl) {
            // For now, show a static message or calculate based on data
            const transactions = getData('transactions') || [];
            const thisMonth = new Date().getMonth();
            const thisYear = new Date().getFullYear();
            const monthlyExpenses = transactions
                .filter(t => t.type !== 'income' && new Date(t.date).getMonth() === thisMonth && new Date(t.date).getFullYear() === thisYear)
                .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

            if (monthlyExpenses > 0) {
                goalEl.textContent = `₱${monthlyExpenses.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} spent this month`;
            } else {
                goalEl.textContent = 'Ready to track your spending!';
            }
        }

        // Update financial health
        updateFinancialHealth();

        // Update recent activity
        updateRecentActivity();

        // Update upcoming payments
        updateUpcomingPayments();
    };

    // Update financial health indicators
    const updateFinancialHealth = () => {
        const transactions = getData('transactions') || [];
        const accounts = getData('bankAccounts') || [];
        const recurringPayments = getData('recurringPayments') || [];

        const totalBalance = accounts.reduce((s, a) => s + parseFloat(a.balance || 0), 0);
        const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount || 0), 0);
        const totalExpense = transactions.filter(t => t.type !== 'income').reduce((s, t) => s + parseFloat(t.amount || 0), 0);

        // Calculate savings rate (income - expenses) / income
        const savingsRate = totalIncome > 0 ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100) : 0;
        const savingsRateEl = el('savingsRate');
        const savingsProgressEl = el('savingsProgress');
        if (savingsRateEl) savingsRateEl.textContent = `${Math.max(0, savingsRate)}%`;
        if (savingsProgressEl) savingsProgressEl.style.width = `${Math.min(100, Math.max(0, savingsRate))}%`;

        // Calculate expense control (lower expenses relative to income is better)
        const expenseRatio = totalIncome > 0 ? (totalExpense / totalIncome) : 1;
        const expenseControl = Math.round((1 - Math.min(1, expenseRatio)) * 100);
        const expenseControlEl = el('expenseControl');
        const expenseProgressEl = el('expenseProgress');
        if (expenseControlEl) expenseControlEl.textContent = `${expenseControl}%`;
        if (expenseProgressEl) expenseProgressEl.style.width = `${expenseControl}%`;

        // Calculate overall health score
        const hasTransactions = transactions.length > 0;
        const hasPositiveBalance = totalBalance > 0;
        const hasRecurring = recurringPayments.length > 0;
        const goodSavingsRate = savingsRate >= 20;
        const goodExpenseControl = expenseControl >= 70;

        let healthScore = 50; // Base score
        if (hasTransactions) healthScore += 10;
        if (hasPositiveBalance) healthScore += 15;
        if (hasRecurring) healthScore += 10;
        if (goodSavingsRate) healthScore += 10;
        if (goodExpenseControl) healthScore += 5;

        const healthScoreEl = el('healthScore');
        if (healthScoreEl) {
            healthScoreEl.textContent = Math.min(100, healthScore);
        }
    };

    // Update recent activity
    const updateRecentActivity = () => {
        const activityListEl = el('recentActivityList');
        if (!activityListEl) return;

        const transactions = getData('transactions') || [];
        const recurringPayments = getData('recurringPayments') || [];

        // Get recent transactions (last 3)
        const recentTx = transactions
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 3);

        // Get recent recurring payment additions (last 1)
        const recentRecurring = recurringPayments
            .sort((a, b) => new Date(b.createdDate || 0) - new Date(a.createdDate || 0))
            .slice(0, 1);

        let activityHtml = '';

        if (recentTx.length === 0 && recentRecurring.length === 0) {
            activityHtml = `
                <div class="activity-item">
                    <div class="activity-icon">💰</div>
                    <div class="activity-content">
                        <div class="activity-title">Welcome to PERA!</div>
                        <div class="activity-desc">Start by adding your first transaction</div>
                    </div>
                </div>
            `;
        } else {
            // Add recent transactions
            recentTx.forEach(tx => {
                const isIncome = tx.type === 'income';
                const sign = isIncome ? '+' : '-';
                const icon = isIncome ? '💰' : '💸';
                activityHtml += `
                    <div class="activity-item">
                        <div class="activity-icon">${icon}</div>
                        <div class="activity-content">
                            <div class="activity-title">${tx.description}</div>
                            <div class="activity-desc">${sign}${window.getCurrencySymbol()}${parseFloat(tx.amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} • ${new Date(tx.date).toLocaleDateString()}</div>
                        </div>
                    </div>
                `;
            });

            // Add recent recurring payment
            if (recentRecurring.length > 0) {
                const rp = recentRecurring[0];
                activityHtml += `
                    <div class="activity-item">
                        <div class="activity-icon">🔁</div>
                        <div class="activity-content">
                            <div class="activity-title">Recurring: ${rp.description}</div>
                            <div class="activity-desc">${window.getCurrencySymbol()}${parseFloat(rp.amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} every ${rp.frequency}</div>
                        </div>
                    </div>
                `;
            }
        }

        activityListEl.innerHTML = activityHtml;
    };

    // Update upcoming payments
    const updateUpcomingPayments = () => {
        const upcomingListEl = el('upcomingPaymentsList');
        if (!upcomingListEl) return;

        const recurringPayments = getData('recurringPayments') || [];
        const now = new Date();

        // Get upcoming payments in the next 7 days
        const upcoming = recurringPayments
            .filter(rp => {
                const nextDate = toDateOnly(rp.nextPaymentDate);
                if (!nextDate) return false;
                const diffTime = nextDate - now;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                return diffDays >= 0 && diffDays <= 7;
            })
            .sort((a, b) => new Date(a.nextPaymentDate) - new Date(b.nextPaymentDate))
            .slice(0, 3);

        let upcomingHtml = '';

        if (upcoming.length === 0) {
            upcomingHtml = `
                <div class="upcoming-item">
                    <div class="upcoming-icon">🔄</div>
                    <div class="upcoming-content">
                        <div class="upcoming-title">No upcoming payments</div>
                        <div class="upcoming-desc">Set up recurring payments to see them here</div>
                    </div>
                </div>
            `;
        } else {
            upcoming.forEach(rp => {
                const nextDate = new Date(rp.nextPaymentDate);
                const diffTime = nextDate - now;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                const dueText = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Tomorrow' : `In ${diffDays} days`;

                upcomingHtml += `
                    <div class="upcoming-item">
                        <div class="upcoming-icon">🔁</div>
                        <div class="upcoming-content">
                            <div class="upcoming-title">${rp.description}</div>
                            <div class="upcoming-desc">${window.getCurrencySymbol()}${parseFloat(rp.amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} • Due ${dueText}</div>
                        </div>
                    </div>
                `;
            });
        }

        upcomingListEl.innerHTML = upcomingHtml;
    };

    // Quick transaction modal
    const showQuickTransactionModal = () => {
        // Create modal for quick transaction
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            backdrop-filter: blur(5px);
        `;

        modal.innerHTML = `
            <div style="
                background: rgba(255, 255, 255, 0.1);
                padding: 30px;
                border-radius: 20px;
                border: 1px solid rgba(255, 255, 255, 0.2);
                backdrop-filter: blur(20px);
                max-width: 400px;
                width: 90%;
                color: white;
            ">
                <h3 style="margin-bottom: 20px; text-align: center;">⚡ Quick Transaction</h3>
                <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                    <button class="quick-type-btn active" data-type="expense">💸 Expense</button>
                    <button class="quick-type-btn" data-type="income">💰 Income</button>
                </div>
                <input type="text" id="quickDesc" placeholder="Description" style="
                    width: 100%;
                    padding: 12px;
                    margin-bottom: 15px;
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    border-radius: 10px;
                    background: rgba(255, 255, 255, 0.1);
                    color: white;
                    font-size: 16px;
                ">
                <input type="number" id="quickAmount" placeholder="Amount" step="0.01" style="
                    width: 100%;
                    padding: 12px;
                    margin-bottom: 15px;
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    border-radius: 10px;
                    background: rgba(255, 255, 255, 0.1);
                    color: white;
                    font-size: 16px;
                ">
                <label for="quickAccount" style="
                    display: block;
                    margin-bottom: 5px;
                    color: rgba(255, 255, 255, 0.8);
                    font-size: 14px;
                    font-weight: 500;
                ">Account:</label>
                <select id="quickAccount" style="
                    width: 100%;
                    padding: 12px;
                    margin-bottom: 20px;
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    border-radius: 10px;
                    background: rgba(255, 255, 255, 0.1);
                    color: white;
                    font-size: 16px;
                ">
                    <option value="">Loading accounts...</option>
                </select>
                <div style="display: flex; gap: 10px;">
                    <button id="quickCancel" style="
                        flex: 1;
                        padding: 12px;
                        border: 1px solid rgba(255, 255, 255, 0.3);
                        border-radius: 10px;
                        background: rgba(255, 255, 255, 0.1);
                        color: white;
                        cursor: pointer;
                    ">Cancel</button>
                    <button id="quickSubmit" style="
                        flex: 1;
                        padding: 12px;
                        border: none;
                        border-radius: 10px;
                        background: #4db8ff;
                        color: white;
                        cursor: pointer;
                        font-weight: 600;
                    ">Add Transaction</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Quick transaction functionality
        let transactionType = 'expense';
        const typeBtns = modal.querySelectorAll('.quick-type-btn');
        const descInput = modal.querySelector('#quickDesc');
        const amountInput = modal.querySelector('#quickAmount');
        const accountSelect = modal.querySelector('#quickAccount');
        const cancelBtn = modal.querySelector('#quickCancel');
        const submitBtn = modal.querySelector('#quickSubmit');

        // Populate account dropdown
        const populateQuickAccounts = () => {
            let accounts = getData("bankAccounts") || [];
            
            // Auto-create Cash account if it doesn't exist
            const cashExists = accounts.find(acc => acc.name === 'Cash');
            if (!cashExists) {
                const defaultCashAccount = {
                    name: 'Cash',
                    balance: '0.00',
                    type: 'Cash'
                };
                accounts.push(defaultCashAccount);
                overwriteData("bankAccounts", accounts);
            }
            
            accountSelect.innerHTML = '';

            if (transactionType === 'income') {
                // For income, default to Cash account
                const cashAccount = accounts.find(acc => acc.name === 'Cash');
                accountSelect.innerHTML = `<option value="Cash" selected>Cash (₱${parseFloat(cashAccount.balance).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})})</option>`;
                // Add other accounts after Cash
                accounts.forEach(account => {
                    if (account.name !== 'Cash') {
                        const displayName = `Bank: ${account.name}`;
                        const option = `<option value="${account.name}">${displayName} (₱${parseFloat(account.balance).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})})</option>`;
                        accountSelect.innerHTML += option;
                    }
                });
            } else {
                // For expenses, show all accounts
                const cashAccount = accounts.find(acc => acc.name === 'Cash');
                accountSelect.innerHTML = `<option value="bank_Cash" selected>Cash (₱${parseFloat(cashAccount.balance).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})})</option>`;
                // Add other bank accounts
                accounts.forEach(account => {
                    if (account.name !== 'Cash') {
                        const displayName = `Bank: ${account.name}`;
                        const option = `<option value="bank_${account.name}">${displayName} (₱${parseFloat(account.balance).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})})</option>`;
                        accountSelect.innerHTML += option;
                    }
                });
            }
        };

        // Initial population
        populateQuickAccounts();

        typeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                typeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                transactionType = btn.dataset.type;
                populateQuickAccounts(); // Repopulate accounts when type changes
            });
        });

        cancelBtn.addEventListener('click', () => {
            modal.remove();
        });

        submitBtn.addEventListener('click', () => {
            const description = descInput.value.trim();
            const amount = parseFloat(amountInput.value);
            const selectedAccount = accountSelect.value;

            if (!description || !amount || amount <= 0) {
                showNotification('Please enter valid description and amount', 'error');
                return;
            }

            if (!selectedAccount) {
                showNotification('Please select an account', 'error');
                return;
            }

            // Handle account balance updates for expenses
            if (transactionType === 'expense') {
                const accounts = getData("bankAccounts") || [];
                let accountFound = false;

                if (selectedAccount.startsWith('bank_')) {
                    const bankName = selectedAccount.replace('bank_', '');
                    const account = accounts.find(acc => acc.name === bankName);

                    if (account && parseFloat(account.balance) >= amount) {
                        account.balance = (parseFloat(account.balance) - amount).toFixed(2);
                        overwriteData('bankAccounts', accounts);
                        accountFound = true;
                    }
                }

                if (!accountFound) {
                    showNotification('Insufficient funds in selected account', 'error');
                    return;
                }
            } else if (transactionType === 'income') {
                // Handle income - add to selected account balance
                const accounts = getData("bankAccounts") || [];
                let accountFound = false;

                if (selectedAccount !== 'income') {
                    const account = accounts.find(acc => acc.name === selectedAccount);
                    if (account) {
                        account.balance = (parseFloat(account.balance) + amount).toFixed(2);
                        overwriteData('bankAccounts', accounts);
                        accountFound = true;
                    }
                }

                // If no specific account selected or account not found, just record the income transaction
                if (!accountFound && selectedAccount === 'income') {
                    // This is fine - income without specific bank allocation
                }
            }

            // Add transaction
            const transaction = {
                id: Date.now(),
                description,
                amount,
                type: transactionType,
                date: dateToLocalString(new Date()),
                category: transactionType === 'expense' ? 'Quick Expense' : 'Quick Income',
                deductionSource: transactionType === 'expense' ? selectedAccount : selectedAccount
            };

            saveData('transactions', transaction);

            // Update UI
            renderBanks();
            renderDashboard();
            showNotification('Transaction added successfully!', 'success');
            modal.remove();
        });

        // Add styles for quick type buttons
        const style = document.createElement('style');
        style.textContent = `
            .quick-type-btn {
                flex: 1;
                padding: 10px;
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 8px;
                background: rgba(255, 255, 255, 0.1);
                color: white;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            .quick-type-btn.active {
                background: #4db8ff;
                border-color: #4db8ff;
            }
            .quick-type-btn:hover {
                background: rgba(255, 255, 255, 0.2);
            }
            #quickAccount option {
                color: black;
                background-color: white;
            }
        `;
        document.head.appendChild(style);
    };

    // Make quick transaction modal globally accessible
    window.showQuickTransactionModal = showQuickTransactionModal;

    // Render subscription (recurring) deductions history table
    const renderSubscriptions = () => {
        const subscriptionTableBody = el('subscriptionTableBody');
        if (!subscriptionTableBody) return;

        const transactions = getData('transactions') || [];
        const recurringTx = transactions.filter(t => t.type === 'recurring');

        subscriptionTableBody.innerHTML = '';

        if (recurringTx.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="3">No subscription deductions recorded yet.</td>`;
            subscriptionTableBody.appendChild(tr);
            return;
        }

        // Sort newest first
        recurringTx.sort((a, b) => new Date(b.date) - new Date(a.date));

        recurringTx.forEach(tx => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(tx.date).toLocaleDateString()}</td>
                <td>${tx.description}</td>
                <td>${window.getCurrencySymbol()}${parseFloat(tx.amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            `;
            subscriptionTableBody.appendChild(tr);
        });
    };

    // Render active recurring payments
    const renderRecurringPayments = () => {
        const recurringListContainer = el('recurringList');
        if (!recurringListContainer) return;

        const recurringPayments = getData('recurringPayments');
        recurringListContainer.innerHTML = '';

        if (!recurringPayments || recurringPayments.length === 0) {
            recurringListContainer.innerHTML = '<p style="text-align: center; color: #888; padding: 30px;">No active subscriptions yet.</p>';
            return;
        }

        // Calculate and update total
        const recurringTotal = recurringPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
        const totalEl = el('recurringTotal');
        if (totalEl) {
            totalEl.textContent = `${window.getCurrencySymbol()}${recurringTotal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        }

        // Render each recurring payment as a card
        recurringPayments.forEach((payment, index) => {
            const card = document.createElement('div');
            card.className = 'card';
            card.style.cssText = 'display: grid; grid-template-columns: 1fr auto; gap: 20px; align-items: center;';
            
            const frequencyLabels = {
                'daily': 'Daily',
                'weekly': 'Weekly (every 7 days)',
                'monthly': 'Monthly',
                'yearly': 'Yearly'
            };

            const failedBadge = payment.lastFailed ? `<span style="color:#f87171; font-weight:700;">Failed ${payment.failedAttempts || 1} times (last: ${payment.lastFailed})</span>` : '<span style="color:#4ade80; font-weight:700;">Active</span>';

            card.innerHTML = `
                <div>
                    <h3 style="margin-bottom: 8px;">${payment.description || 'Recurring Payment'}</h3>
                    <p style="margin: 0 0 8px; font-size: 0.85rem; color: #fff;">${failedBadge}</p>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 0.85rem; color: #aaa;">
                        <div><span style="color: #ddd;">Category:</span> ${payment.category || 'N/A'}</div>
                        <div><span style="color: #ddd;">Amount:</span> ₱${parseFloat(payment.amount || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                        <div><span style="color: #ddd;">Schedule:</span> ${frequencyLabels[payment.frequency] || payment.frequency || 'Unknown'}</div>
                        <div><span style="color: #ddd;">Deduction From:</span> ${(payment.deductionSource || 'N/A').replace('bank_', '')}</div>
                    </div>
                </div>
                <button class="delete-recurring-btn" data-index="${index}" style="background: #f87171; color: #0f2027; padding: 12px 16px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; height: fit-content;">
                    Delete
                </button>
            `;
            recurringListContainer.appendChild(card);
        });

        // Use event delegation for delete recurring buttons (added once, outside renderRecurringPayments)
        if (!window.recurringListenersInitialized) {
            recurringListContainer.addEventListener('click', function(e) {
                if (e.target.classList.contains('delete-recurring-btn')) {
                    const index = parseInt(e.target.getAttribute('data-index'), 10);
                    const recurringPayments = getData('recurringPayments');
                    if (recurringPayments && recurringPayments[index] && confirm('Are you sure you want to delete this recurring payment?')) {
                        recurringPayments.splice(index, 1);
                        overwriteData('recurringPayments', recurringPayments);
                        renderRecurringPayments();
                        populateDeductionSources();
                        renderDashboard();
                        showNotification('Recurring payment deleted successfully!', 'success');
                    }
                }
            });
            window.recurringListenersInitialized = true;
        }
    };

    // Modal functions
    const openBankModal = () => {
        const modal = el('bankModal');
        if (modal) modal.style.display = 'flex';
    };

    const closeBankModal = () => {
        const modal = el('bankModal');
        if (modal) modal.style.display = 'none';
    };

    // Make modal functions globally accessible
    window.openBankModal = openBankModal;
    window.closeBankModal = closeBankModal;

    // Logout function
    const logout = () => {
        if (confirm('Are you sure you want to logout?')) {
            localStorage.removeItem('activePeraUser');
            fetch('logout.php', { method: 'GET', credentials: 'include' })
                .finally(() => {
                    window.location.href = 'login.html';
                });
        }
    };

    // Make logout accessible globally
    window.logout = logout;

    // ========== EVENT LISTENERS ==========

    // Initialize UI enhancements
    initRippleEffect();

    // ========== CLEAR ALL DATA (Clear Data) ==========
    const clearAllData = () => {
        if (!confirm('This will permanently delete ALL data: banks, income, transactions, subscriptions, and history. This cannot be undone. Continue?')) return;

        const userPrefix = getUserPrefix();
        const keysToRemove = [
            `${userPrefix}_bankAccounts`,
            `${userPrefix}_income`,
            `${userPrefix}_transactions`,
            `${userPrefix}_recurringPayments`,
            `${userPrefix}_clearedTotals` // Remove any existing snapshot
        ];

        keysToRemove.forEach(key => localStorage.removeItem(key));

        if (isLoggedIn && typeof overwriteData === 'function') {
            overwriteData('bankAccounts', []);
            overwriteData('income', []);
            overwriteData('transactions', []);
            overwriteData('recurringPayments', []);
            overwriteData('clearedTotals', []);
        }

        showNotification('All data cleared permanently.', 'success');
        // Reload to refresh UI
        window.location.reload();
    };

    const updateClearButton = () => {
        let btn = document.getElementById('clearDataBtn');
        if (btn) {
            // Attach the onclick handler to the Clear Data button
            btn.onclick = clearAllData;
        }
    };

    // Ensure button exists on load
    updateClearButton();

    // Set up export button handler
    const exportBtn = el("exportBtn");
    if (exportBtn) {
        exportBtn.addEventListener("click", exportTransactionsToCSV);
    }

    // Bank management form
    const bankForm = el("bankForm");
    if (bankForm) {
        bankForm.addEventListener("submit", function(e) {
            e.preventDefault();
            const name = el("bankName").value.trim();
            const balance = parseFloat(el("bankBalance").value);

            if (!name || isNaN(balance)) {
                showNotification("Please enter valid bank name and balance.", "error");
                return;
            }

            const account = {
                name,
                balance: balance.toFixed(2),
                initialBalance: balance.toFixed(2), // Store initial balance for reset functionality
                createdAt: dateTimeToLocalString(new Date())
            };

            saveData("bankAccounts", account);

            // Record initial deposit as a transaction so it appears in Financial Summary
            const initialTx = {
                amount: balance.toFixed(2),
                category: 'Bank',
                description: `Initial deposit - ${name}`,
                deductionSource: `bank_${name}`,
                date: dateToLocalString(new Date()),
                type: 'income',
                createdAt: dateTimeToLocalString(new Date())
            };
            saveData('transactions', initialTx);

            renderBanks();
            populateDeductionSources();
            renderTransactions();
            renderSubscriptions();
            renderDashboard();
            showNotification("Bank account added successfully!", "success");

            // Reset form and close modal
            this.reset();
            closeBankModal();
        });
    }

    // Income management form
    const incomeForm = el("incomeForm");
    if (incomeForm) {
        incomeForm.addEventListener("submit", function(e) {
            e.preventDefault();
            const source = el("incomeSource").value.trim();
            const amount = parseFloat(el("incomeAmount").value);
            const bank = el("incomeBank").value;
            const date = el("incomeDate").value;

            // bank is optional: allow 'income' (no bank) or a bank name
            if (!source || isNaN(amount) || !date) {
                showNotification("Please fill in all fields.", "error");
                return;
            }

            const accounts = getData("bankAccounts");
            
            // If "Income (No bank)" is selected, auto-deposit to a "Cash" account
            if (bank === 'income') {
                let cashAccount = accounts.find(acc => acc.name === 'Cash');
                if (!cashAccount) {
                    // Create "Cash" account if it doesn't exist
                    cashAccount = {
                        name: 'Cash',
                        balance: amount.toFixed(2),
                        initialBalance: amount.toFixed(2),
                        createdAt: dateTimeToLocalString(new Date())
                    };
                    accounts.push(cashAccount);
                } else {
                    // Add to existing Cash account
                    cashAccount.balance = (parseFloat(cashAccount.balance) + amount).toFixed(2);
                }
                overwriteData("bankAccounts", accounts);
            } else if (bank) {
                // Deposit to selected bank
                const account = accounts.find(acc => acc.name === bank);
                if (account) {
                    account.balance = (parseFloat(account.balance) + amount).toFixed(2);
                    overwriteData("bankAccounts", accounts);
                }
            }

            // Record income as a transaction so it appears in recent transactions and totals
            const transaction = {
                amount: parseFloat(amount).toFixed(2),
                category: 'Income',
                description: source,
                deductionSource: bank === 'income' ? 'Cash' : (bank || 'income'),
                date: date, // Use date string directly (already in YYYY-MM-DD format)
                type: 'income',
                createdAt: dateTimeToLocalString(new Date())
            };
            saveData("transactions", transaction);

            // Also save to income array for legacy compatibility
            const income = { source, amount: amount.toFixed(2), date };
            saveData("income", income);
            
            renderIncome();
            renderBanks();
            populateDeductionSources();
            renderTransactions();
            renderSubscriptions();
            renderDashboard();
            showNotification("Income added successfully!", "success");

            // Reset form
            this.reset();
        });
    }

    // Expense recording form
    const expenseForm = el("expenseForm");
    if (expenseForm) {
        expenseForm.addEventListener("submit", function(e) {
            e.preventDefault();
            const button = e.target.querySelector('button[type="submit"]');
            setButtonLoading(button, true);

            const expenseData = {
                amount: el("expenseAmount").value,
                category: el("expenseCategory").value,
                description: el("expenseDescription").value.trim(),
                date: el("expenseDate").value,
                deductionSource: el("expenseDeductionSource").value
            };

            // Ask user to confirm deduction source before proceeding
            const dedText = expenseData.deductionSource || 'unspecified';
            if (!confirm(`This expense of ₱${expenseData.amount} will be deducted from: ${dedText}. Continue?`)) {
                setButtonLoading(button, false);
                return;
            }

            if (recordExpense(expenseData)) {
                renderBanks();
                renderTransactions();
                populateDeductionSources();
                renderSubscriptions();
                renderDashboard();
                this.reset();
            }

            setButtonLoading(button, false);
        });
    }

    // Recurring payments form
    const recurringForm = el("recurringForm");
    if (recurringForm) {
        recurringForm.addEventListener("submit", function(e) {
            e.preventDefault();
            const button = e.target.querySelector('button[type="submit"]');
            setButtonLoading(button, true);

            const rawStartDate = el("recStartDate").value;
            // Ensure we have a valid date string in YYYY-MM-DD format
            let startDateString = rawStartDate ? rawStartDate : dateToLocalString(new Date());
            
            // Validate it's in proper format
            if (!/^\d{4}-\d{2}-\d{2}$/.test(startDateString)) {
                showNotification("Invalid start date format. Please use YYYY-MM-DD.", "error");
                setButtonLoading(button, false);
                return;
            }

            const frequency = el("recurringFrequency").value;

            // Calculate nextPaymentDate as start_date + frequency interval
            // This is when the NEXT payment after the start date should occur
            const nextPaymentDateObj = addInterval(startDateString, frequency);
            const nextPaymentDateString = nextPaymentDateObj ? dateToLocalString(nextPaymentDateObj) : startDateString;

            const paymentData = {
                description: el("recurringDescription").value.trim(),
                amount: parseFloat(el("recurringAmount").value),
                category: el("recurringCategory").value,
                frequency: frequency,
                deductionSource: el("recurringDeductionSource").value,
                startDate: startDateString,
                endDate: el("recEndDate").value || null,
                lastProcessed: null,
                createdDate: dateTimeToLocalString(new Date()),
                nextPaymentDate: nextPaymentDateString,
                failedAttempts: 0
            };

            // Ask user to confirm deduction source before saving recurring payment
            const recDed = paymentData.deductionSource || 'unspecified';
            if (!confirm(`This recurring payment of ₱${paymentData.amount} will be deducted from: ${recDed}. Continue?`)) {
                setButtonLoading(button, false);
                return;
            }

            if (!paymentData.description || isNaN(paymentData.amount) || !paymentData.category || !paymentData.frequency || !paymentData.deductionSource || !paymentData.startDate) {
                showNotification("Please fill in all fields (including Start Date).", "error");
                setButtonLoading(button, false);
                return;
            }

            if (paymentData.endDate && new Date(paymentData.endDate) < new Date(paymentData.startDate)) {
                showNotification("End Date cannot be before Start Date.", "error");
                setButtonLoading(button, false);
                return;
            }

            // Validate deduction source has sufficient funds for first payment
            let canDeduct = false;
            if (paymentData.deductionSource.startsWith('bank_')) {
                const bankName = paymentData.deductionSource.replace('bank_', '');
                const accounts = getData("bankAccounts");
                const account = accounts.find(acc => acc.name === bankName);

                if (account && parseFloat(account.balance) >= paymentData.amount) {
                    canDeduct = true;
                }
            }

            if (!canDeduct) {
                showNotification("Insufficient funds in selected deduction source.", "error");
                setButtonLoading(button, false);
                return;
            }

            saveData("recurringPayments", paymentData);
            showNotification("Recurring payment added successfully!", "success");

            // Process recurring deductions immediately if due date has passed
            processRecurringDeductions();

            // Refresh UI
            renderBanks();
            renderRecurringPayments();
            populateDeductionSources();
            renderDashboard();
            renderSubscriptions();

            // Reset form
            this.reset();
            setButtonLoading(button, false);
        });
    }

    // ========== INITIALIZATION ==========

    // Initialize form date fields with today's date
    const initializeFormFields = () => {
        const todayString = dateToLocalString(new Date());
        
        // Set recurring payment start date to today
        const recStartDateField = el("recStartDate");
        if (recStartDateField && !recStartDateField.value) {
            recStartDateField.value = todayString;
        }
        
        // Set expense date to today (if field exists)
        const expenseDateField = el("expenseDate");
        if (expenseDateField && !expenseDateField.value) {
            expenseDateField.value = todayString;
        }
        
        // Set income date to today (if field exists)
        const incomeDateField = el("incomeDate");
        if (incomeDateField && !incomeDateField.value) {
            incomeDateField.value = todayString;
        }
    };

    const initializeData = async () => {
        await loadServerData();

        // Make sure UI has values from server/local cache
        renderBanks();
        renderIncome();
        renderTransactions();
        renderSubscriptions();
        renderRecurringPayments();
        renderDashboard();
        populateDeductionSources();
        initializeFormFields();
    };

    initializeData();

    // Process recurring payments on page load
    processRecurringDeductions();

    // Set up recurring payment processing interval (check every hour)
    setInterval(processRecurringDeductions, 60 * 60 * 1000);

    // Update dashboard widgets every second for live time
    setInterval(updateDashboardWidgets, 1000);
});