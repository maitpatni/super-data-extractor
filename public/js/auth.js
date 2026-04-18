const Auth = {
  render(mode = 'login') {
    const isRegister = mode === 'register';
    const container = document.getElementById('content');
    if (!container) return;

    container.innerHTML = `
      <section class="auth-shell">
        <article class="auth-card glass-card">
          <a class="brand auth-brand" href="#/">
            <span class="brand-mark">
              <span class="brand-orb"></span>
            </span>
            <span>
              <strong>SuperDataExtractor</strong>
              <small>Maps + LinkedIn intelligence</small>
            </span>
          </a>
          <div class="section-head auth-head">
            <div>
              <p class="eyebrow">${isRegister ? 'Create account' : 'Welcome back'}</p>
              <h3>${isRegister ? 'Register' : 'Login'}</h3>
              <p>${isRegister ? 'Create your account to persist searches, history, and settings.' : 'Sign in to continue to your saved extraction workspace.'}</p>
            </div>
          </div>
          <form id="authForm" class="settings-stack auth-form">
            ${isRegister ? `
              <div class="field">
                <label for="authFullName">Full Name</label>
                <input id="authFullName" name="fullName" type="text" placeholder="Ava Patel" required>
              </div>
            ` : ''}
            <div class="field">
              <label for="authEmail">Email</label>
              <input id="authEmail" name="email" type="email" placeholder="ava@example.com" required>
            </div>
            <div class="field">
              <label for="authPassword">Password</label>
              <input id="authPassword" name="password" type="password" placeholder="Minimum 8 characters" required>
            </div>
            ${isRegister ? `
              <div class="field">
                <label for="authMobile">Mobile Number</label>
                <input id="authMobile" name="mobile" type="tel" inputmode="numeric" placeholder="10 digit mobile number" required>
              </div>
            ` : ''}
            <div class="form-actions auth-actions">
              <button class="button primary" id="authSubmit" type="submit">${isRegister ? 'Register' : 'Login'}</button>
            </div>
          </form>
          <p class="auth-switch">
            ${isRegister ? 'Already have an account?' : "Don't have an account?"}
            <a class="link" href="#/${isRegister ? 'login' : 'register'}">${isRegister ? 'Login' : 'Register'}</a>
          </p>
        </article>
      </section>
    `;

    document.getElementById('authForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      this.submit(mode);
    });
  },

  async submit(mode) {
    const isRegister = mode === 'register';
    const submitButton = document.getElementById('authSubmit');
    if (submitButton) submitButton.disabled = true;

    const payload = {
      email: document.getElementById('authEmail')?.value.trim() || '',
      password: document.getElementById('authPassword')?.value || '',
    };

    if (isRegister) {
      payload.fullName = document.getElementById('authFullName')?.value.trim() || '';
      payload.mobile = document.getElementById('authMobile')?.value.trim() || '';
    }

    try {
      const response = isRegister ? await Api.register(payload) : await Api.login(payload);
      App.completeLogin(response);
    } catch (error) {
      Utils.showToast(isRegister ? 'Registration failed' : 'Login failed', error.message, 'error');
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  },
};

window.Auth = Auth;
