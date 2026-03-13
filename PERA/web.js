document.addEventListener("DOMContentLoaded", function () {
    // Helper to safely get element
    const el = (id) => document.getElementById(id);

    // REGISTRATION ELEMENTS
    const name = el("fullName"), email = el("email"), password = el("password"),
          confirmPassword = el("confirmPassword"), registerBtn = el("registerBtn"),
          nameError = el("nameError"), emailError = el("emailError"),
          passwordError = el("passwordError"), confirmError = el("confirmError"),
          successMessage = el("successMessage");

    // LOGIN ELEMENTS
    const loginEmail = el("loginEmail"), loginPassword = el("loginPassword"),
          loginBtn = el("loginBtn"), loginEmailError = el("loginEmailError"),
          loginPasswordError = el("loginPasswordError"), loginFail = el("loginFail");

    // VALIDATION FUNCTIONS
    const validateName = () => {
        const regex = /^[A-Za-z ]{3,}$/;
        const isValid = regex.test(name.value.trim());
        nameError.textContent = isValid ? "" : "At least 3 letters required.";
        return isValid;
    };

    const validateEmail = (field, errorField) => {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const isValid = regex.test(field.value.trim());
        errorField.textContent = isValid ? "" : "Enter a valid email address.";
        return isValid;
    };

    const validatePassword = () => {
        const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
        const isValid = regex.test(password.value);
        passwordError.textContent = isValid ? "" : "Min 8 chars, 1 uppercase, 1 lowercase, 1 number.";
        return isValid;
    };

    const validateConfirm = () => {
        const isValid = confirmPassword.value === password.value && confirmPassword.value !== "";
        confirmError.textContent = isValid ? "" : "Passwords do not match.";
        return isValid;
    };

    // BUTTON STATE HANDLERS
    const checkRegisterButton = () => {
        if (name && email && password && confirmPassword) {
            registerBtn.disabled = !(validateName() && validateEmail(email, emailError) && 
                                     validatePassword() && validateConfirm());
        }
    };

    const checkLoginButton = () => {
        if (loginEmail && loginPassword) {
            loginBtn.disabled = !(loginEmail.value.trim() && loginPassword.value);
        }
    };

    // ATTACH LISTENERS FOR REGISTER
    if (name) {
        [name, email, password, confirmPassword].forEach(input => {
            input.addEventListener("input", checkRegisterButton);
        });
        
        name.addEventListener("blur", validateName);
        email.addEventListener("blur", () => validateEmail(email, emailError));
        password.addEventListener("blur", validatePassword);
        confirmPassword.addEventListener("blur", validateConfirm);

        el("registerForm").addEventListener("submit", (e) => {
            e.preventDefault();
            if (!registerBtn.disabled) {
                successMessage.textContent = "Registration successful! Redirecting...";
                    setTimeout(() => {
                        window.location.href = "index.html";
                            },1500);
            }
        });
    }

    // ATTACH LISTENERS FOR LOGIN
    if (loginEmail) {
        loginEmail.addEventListener("input", checkLoginButton);
        loginPassword.addEventListener("input", checkLoginButton);

        el("loginForm").addEventListener("submit", (e) => {
            e.preventDefault();

            if (!validateEmail(loginEmail, loginEmailError)) return;

            if (!loginPassword.value) {
                loginPasswordError.textContent = "Password required.";
                return;
            }

    // For now just redirect to dashboard
    window.location.href = "home.html";
});

    }

    // TOGGLE PASSWORD VISIBILITY
    const setupToggle = (inputId, toggleId) => {
        const input = el(inputId);
        const toggle = el(toggleId);
        if (input && toggle) {
            toggle.addEventListener("click", () => {
                const isPassword = input.type === "password";
                input.type = isPassword ? "text" : "password";
                toggle.textContent = isPassword ? "Hide" : "Show";
            });
        }
    };

    setupToggle("password", "togglePass");
    setupToggle("confirmPassword", "toggleConfirm");
    setupToggle("loginPassword", "toggleLoginPass");
});

function logout() {
    window.location.href = "index.html";
}