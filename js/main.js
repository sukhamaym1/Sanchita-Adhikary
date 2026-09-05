let SITE_CONFIG = {};
let TESTIMONIALS = [];
let ACHIEVEMENTS = [];

// Safe DOM ready execution
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

async function initApp() {
  try {
    await loadData();
    populateConfigData();
    renderTestimonials();
    renderAchievements();
    setupMobileMenu();
    setupThemeToggle();
    setupBackToTop();
    setupCalculators();
    setupLicLinksFilter();
    setupGoogleSheetsSync();
    setupContactForm();
    initScrollAnimations();
    updateCurrentYear();
    refreshIcons();
  } catch (err) {
    console.error("Error during app initialization:", err);
  }
}

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    try {
      window.lucide.createIcons();
    } catch (e) {
      console.warn("Could not render Lucide icons:", e);
    }
  }
}

async function loadData() {
  // Load config.json
  try {
    let configRes = await fetch('./data/config.json');
    if (!configRes.ok) configRes = await fetch('/data/config.json');
    if (!configRes.ok) configRes = await fetch('./config.json');
    if (!configRes.ok) configRes = await fetch('/config.json');
    if (configRes.ok) {
      SITE_CONFIG = await configRes.json();
    }
  } catch (error) {
    console.warn("Notice: config.json not loaded, using page defaults:", error);
  }

  // Load testimonials.json
  try {
    let testRes = await fetch('./data/testimonials.json');
    if (!testRes.ok) testRes = await fetch('/data/testimonials.json');
    if (!testRes.ok) testRes = await fetch('./testimonials.json');
    if (!testRes.ok) testRes = await fetch('/testimonials.json');
    if (testRes.ok) {
      TESTIMONIALS = await testRes.json();
    }
  } catch (error) {
    console.warn("Notice: testimonials.json not loaded:", error);
  }

  // Load achievements.json
  try {
    let achRes = await fetch('./data/achievements.json');
    if (!achRes.ok) achRes = await fetch('/data/achievements.json');
    if (!achRes.ok) achRes = await fetch('./achievements.json');
    if (!achRes.ok) achRes = await fetch('/achievements.json');
    if (achRes.ok) {
      ACHIEVEMENTS = await achRes.json();
    }
  } catch (error) {
    console.warn("Notice: achievements.json not loaded:", error);
  }
}

// Populate config data into the DOM
function populateConfigData() {
  if (!SITE_CONFIG || typeof SITE_CONFIG !== 'object') return;

  // Texts
  document.querySelectorAll('[data-config]').forEach(el => {
    const key = el.getAttribute('data-config');
    if (SITE_CONFIG[key]) {
      el.textContent = SITE_CONFIG[key];
    }
  });

  // Hrefs (WhatsApp, Phone, Email, Socials)
  document.querySelectorAll('[data-config-href]').forEach(el => {
    const key = el.getAttribute('data-config-href');
    if (key === 'whatsapp' && SITE_CONFIG.whatsapp && !SITE_CONFIG.whatsapp.includes('[ADD')) {
      const message = el.getAttribute('data-wa-msg') || "Hello Sanchita, I would like to know more about insurance planning.";
      el.href = `https://wa.me/${SITE_CONFIG.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
    } else if (key === 'phone' && SITE_CONFIG.phone && !SITE_CONFIG.phone.includes('[ADD')) {
      el.href = `tel:${SITE_CONFIG.phone}`;
    } else if (key === 'email' && SITE_CONFIG.email && !SITE_CONFIG.email.includes('[ADD')) {
      el.href = `mailto:${SITE_CONFIG.email}`;
    } else if (['facebook', 'instagram', 'linkedin', 'twitter'].includes(key)) {
      if (SITE_CONFIG[key] && SITE_CONFIG[key].trim() !== '') {
        el.href = SITE_CONFIG[key];
        el.target = '_blank';
        el.rel = 'noopener noreferrer';
        el.style.display = '';
      } else {
        el.style.display = 'none';
      }
    }
  });

  // Handle Maps
  const mapIframe = document.getElementById('google-map-iframe');
  const mapPlaceholder = document.getElementById('google-map-placeholder');
  
  if (SITE_CONFIG.googleMapsUrl) {
    if (mapIframe) {
      mapIframe.src = SITE_CONFIG.googleMapsUrl;
      mapIframe.classList.remove('hidden');
    }
    if (mapPlaceholder) mapPlaceholder.classList.add('hidden');
  } else {
    if (mapIframe) mapIframe.classList.add('hidden');
    if (mapPlaceholder) mapPlaceholder.classList.remove('hidden');
  }
}

// Mobile Menu
function setupMobileMenu() {
  const menuBtn = document.getElementById('mobile-menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');
  const mobileMenuLinks = document.querySelectorAll('.mobile-menu-link');
  const menuIcon = document.getElementById('menu-icon');
  const closeIcon = document.getElementById('close-icon');

  if (!menuBtn || !mobileMenu) return;

  function toggleMenu() {
    mobileMenu.classList.toggle('hidden');
    if (menuIcon) menuIcon.classList.toggle('hidden');
    if (closeIcon) closeIcon.classList.toggle('hidden');
  }

  menuBtn.addEventListener('click', toggleMenu);

  mobileMenuLinks.forEach(link => {
    link.addEventListener('click', () => {
      mobileMenu.classList.add('hidden');
      if (menuIcon) menuIcon.classList.remove('hidden');
      if (closeIcon) closeIcon.classList.add('hidden');
    });
  });
}

function setupBackToTop() {
  const backToTopBtn = document.getElementById('back-to-top');
  if (!backToTopBtn) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 300) {
      backToTopBtn.classList.add('show');
    } else {
      backToTopBtn.classList.remove('show');
    }
  });

  backToTopBtn.addEventListener('click', () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  });
}

const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxFCNTfFsNL7_1wEYZNi8z-kP8u7-ajsXR1LrppCp1YQ6lQoK1NonU86qml2RkJ9Nay/exec';

// Silent Backend Dispatcher for Google Sheets & Local Backup
async function sendEnquiryToBackend(leadData) {
  // 1. Local storage backup for records
  try {
    const existing = JSON.parse(localStorage.getItem('lic_client_inquiries_log') || '[]');
    existing.unshift(leadData);
    localStorage.setItem('lic_client_inquiries_log', JSON.stringify(existing.slice(0, 200)));
  } catch (err) {
    console.warn('Local storage backup note:', err);
  }

  // 2. Dispatch to Google Apps Script Web App (direct to Google Sheet in background)
  const scriptUrl = (SITE_CONFIG.googleAppsScriptUrl && SITE_CONFIG.googleAppsScriptUrl.trim().startsWith('http'))
    ? SITE_CONFIG.googleAppsScriptUrl.trim()
    : DEFAULT_APPS_SCRIPT_URL;

  if (scriptUrl) {
    try {
      // Send as POST request with text/plain payload to prevent CORS preflight blocking
      await fetch(scriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        cache: 'no-cache',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(leadData)
      });
    } catch (err) {
      console.warn('Backend Google Sheets dispatch note:', err);
    }
  }
}

function setupGoogleSheetsSync() {
  // Silent background handling
}

// Contact Form with Real-Time Validation and Visual Feedback
function setupContactForm() {
  const form = document.getElementById('contact-form');
  const formStatus = document.getElementById('form-status');
  const submitBtn = document.getElementById('submit-btn');
  const submitSpinner = document.getElementById('submit-spinner');
  const submitBtnText = document.getElementById('submit-btn-text');
  const submitArrowIcon = document.getElementById('submit-arrow-icon');
  
  const nameInput = document.getElementById('name');
  const mobileInput = document.getElementById('mobile');
  const emailInput = document.getElementById('email');
  const requirementSelect = document.getElementById('requirement');

  const nameError = document.getElementById('name-error');
  const mobileError = document.getElementById('mobile-error');
  const emailError = document.getElementById('email-error');
  const requirementError = document.getElementById('requirement-error');
  
  if (!form) return;

  // Validation rules & helper state
  const fieldValidation = {
    name: {
      validate: (val) => val.trim().length >= 2,
      errorEl: nameError,
      message: 'Please enter your full name (at least 2 letters).'
    },
    mobile: {
      validate: (val) => /^[6-9]\d{9}$/.test(val.trim()),
      errorEl: mobileError,
      message: 'Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.'
    },
    email: {
      validate: (val) => Boolean(val && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())),
      errorEl: emailError,
      message: 'Please enter a valid email address (e.g. name@domain.com).'
    },
    requirement: {
      validate: (val) => val && val.trim() !== '',
      errorEl: requirementError,
      message: 'Please select a service requirement.'
    }
  };

  function setFieldState(inputEl, isValid, errorEl, customMsg) {
    if (!inputEl) return;
    const parent = inputEl.closest('.form-field-group');
    const feedbackIcon = parent ? parent.querySelector('.field-feedback-icon') : null;

    if (isValid) {
      inputEl.classList.remove('is-invalid');
      inputEl.classList.add('is-valid');
      if (errorEl) errorEl.classList.add('hidden');

      if (feedbackIcon) {
        feedbackIcon.className = 'field-feedback-icon absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-emerald-400';
        if (inputEl.tagName === 'SELECT') {
          feedbackIcon.classList.remove('right-3.5');
          feedbackIcon.classList.add('right-8');
        }
        feedbackIcon.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>`;
        feedbackIcon.classList.remove('hidden');
      }
    } else {
      inputEl.classList.remove('is-valid');
      inputEl.classList.add('is-invalid');
      if (errorEl) {
        if (customMsg) {
          const span = errorEl.querySelector('span');
          if (span) span.textContent = customMsg;
        }
        errorEl.classList.remove('hidden');
      }

      if (feedbackIcon) {
        feedbackIcon.className = 'field-feedback-icon absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-red-400';
        if (inputEl.tagName === 'SELECT') {
          feedbackIcon.classList.remove('right-3.5');
          feedbackIcon.classList.add('right-8');
        }
        feedbackIcon.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="2"></circle><line x1="12" y1="8" x2="12" y2="12" stroke-width="2"></line><line x1="12" y1="16" x2="12.01" y2="16" stroke-width="2"></line></svg>`;
        feedbackIcon.classList.remove('hidden');
      }
    }
  }

  function clearFieldState(inputEl, errorEl) {
    if (!inputEl) return;
    inputEl.classList.remove('is-valid', 'is-invalid');
    if (errorEl) errorEl.classList.add('hidden');
    const parent = inputEl.closest('.form-field-group');
    const feedbackIcon = parent ? parent.querySelector('.field-feedback-icon') : null;
    if (feedbackIcon) {
      feedbackIcon.classList.add('hidden');
      feedbackIcon.innerHTML = '';
    }
  }

  // Real-time Name validation
  if (nameInput) {
    nameInput.addEventListener('input', () => {
      if (nameInput.value.length === 0) {
        clearFieldState(nameInput, nameError);
      } else {
        const isValid = fieldValidation.name.validate(nameInput.value);
        setFieldState(nameInput, isValid, nameError);
      }
    });
    nameInput.addEventListener('blur', () => {
      if (nameInput.value.trim().length > 0 || nameInput.hasAttribute('required')) {
        const isValid = fieldValidation.name.validate(nameInput.value);
        setFieldState(nameInput, isValid, nameError);
      }
    });
  }

  // Real-time Mobile validation (digits only, enforce 10 digits, starts with 6-9)
  if (mobileInput) {
    mobileInput.addEventListener('input', () => {
      mobileInput.value = mobileInput.value.replace(/\D/g, '').substring(0, 10);
      if (mobileInput.value.length === 0) {
        clearFieldState(mobileInput, mobileError);
      } else if (mobileInput.value.length === 10) {
        const isValid = fieldValidation.mobile.validate(mobileInput.value);
        setFieldState(mobileInput, isValid, mobileError);
      } else {
        // In progress typing
        mobileInput.classList.remove('is-valid');
        // Do not show full red until at least 4 digits or blur
        if (mobileInput.value.length > 0 && !['6','7','8','9'].includes(mobileInput.value[0])) {
          setFieldState(mobileInput, false, mobileError, 'Indian mobile numbers start with 6, 7, 8, or 9.');
        } else if (mobileInput.classList.contains('is-invalid')) {
          mobileInput.classList.remove('is-invalid');
          if (mobileError) mobileError.classList.add('hidden');
          const parent = mobileInput.closest('.form-field-group');
          const icon = parent ? parent.querySelector('.field-feedback-icon') : null;
          if (icon) icon.classList.add('hidden');
        }
      }
    });

    mobileInput.addEventListener('blur', () => {
      if (mobileInput.value.length > 0 || mobileInput.hasAttribute('required')) {
        const isValid = fieldValidation.mobile.validate(mobileInput.value);
        setFieldState(mobileInput, isValid, mobileError);
      }
    });
  }

  // Real-time Email validation (required field)
  if (emailInput) {
    emailInput.addEventListener('input', () => {
      if (emailInput.value.trim() === '') {
        clearFieldState(emailInput, emailError);
      } else {
        const isValid = fieldValidation.email.validate(emailInput.value);
        setFieldState(emailInput, isValid, emailError);
      }
    });
    emailInput.addEventListener('blur', () => {
      const isValid = fieldValidation.email.validate(emailInput.value);
      setFieldState(emailInput, isValid, emailError);
    });
  }

  // Requirement select validation
  if (requirementSelect) {
    requirementSelect.addEventListener('change', () => {
      const isValid = fieldValidation.requirement.validate(requirementSelect.value);
      setFieldState(requirementSelect, isValid, requirementError);
    });
    requirementSelect.addEventListener('blur', () => {
      const isValid = fieldValidation.requirement.validate(requirementSelect.value);
      setFieldState(requirementSelect, isValid, requirementError);
    });
  }

  function validateAllFields() {
    let allValid = true;
    let firstInvalidField = null;

    // Validate Name
    const isNameValid = fieldValidation.name.validate(nameInput ? nameInput.value : '');
    setFieldState(nameInput, isNameValid, nameError);
    if (!isNameValid) {
      allValid = false;
      if (!firstInvalidField) firstInvalidField = nameInput;
    }

    // Validate Mobile
    const isMobileValid = fieldValidation.mobile.validate(mobileInput ? mobileInput.value : '');
    setFieldState(mobileInput, isMobileValid, mobileError);
    if (!isMobileValid) {
      allValid = false;
      if (!firstInvalidField) firstInvalidField = mobileInput;
    }

    // Validate Email
    const isEmailValid = fieldValidation.email.validate(emailInput ? emailInput.value : '');
    setFieldState(emailInput, isEmailValid, emailError);
    if (!isEmailValid) {
      allValid = false;
      if (!firstInvalidField) firstInvalidField = emailInput;
    }

    // Validate Requirement
    const isReqValid = fieldValidation.requirement.validate(requirementSelect ? requirementSelect.value : '');
    setFieldState(requirementSelect, isReqValid, requirementError);
    if (!isReqValid) {
      allValid = false;
      if (!firstInvalidField) firstInvalidField = requirementSelect;
    }

    if (firstInvalidField) {
      firstInvalidField.focus();
    }

    return allValid;
  }

  function showStatus(type, title, message) {
    if (!formStatus) return;
    formStatus.className = 'mb-4 p-4 rounded-xl text-base transition-all duration-300';

    if (type === 'success') {
      formStatus.classList.add('form-status-success', 'text-emerald-100');
      formStatus.innerHTML = `
        <div class="flex items-start gap-3">
          <div class="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>
          </div>
          <div>
            <h4 class="font-heading font-bold text-emerald-300 text-base mb-1">${title}</h4>
            <p class="text-sm text-emerald-100 leading-relaxed">${message}</p>
          </div>
        </div>
      `;
    } else if (type === 'error') {
      formStatus.classList.add('form-status-error', 'text-red-100');
      formStatus.innerHTML = `
        <div class="flex items-start gap-3">
          <div class="w-8 h-8 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="2"></circle><line x1="12" y1="8" x2="12" y2="12" stroke-width="2"></line><line x1="12" y1="16" x2="12.01" y2="16" stroke-width="2"></line></svg>
          </div>
          <div>
            <h4 class="font-heading font-bold text-red-300 text-base mb-1">${title}</h4>
            <p class="text-sm text-red-100 leading-relaxed">${message}</p>
          </div>
        </div>
      `;
    } else {
      formStatus.classList.add('form-status-notice', 'text-amber-100');
      formStatus.innerHTML = `
        <div class="flex items-start gap-3">
          <div class="w-8 h-8 rounded-full bg-amber-500/20 text-brand-gold flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="2"></circle><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01"></path></svg>
          </div>
          <div>
            <h4 class="font-heading font-bold text-brand-gold text-base mb-1">${title}</h4>
            <p class="text-sm text-amber-100 leading-relaxed">${message}</p>
          </div>
        </div>
      `;
    }

    formStatus.classList.remove('hidden');
    formStatus.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function setLoading(loading) {
    if (!submitBtn) return;
    submitBtn.disabled = Boolean(loading);
    if (loading) {
      submitBtn.setAttribute('disabled', 'true');
      submitBtn.classList.add('opacity-80', 'cursor-not-allowed');
      if (submitSpinner) {
        submitSpinner.classList.remove('hidden');
        submitSpinner.classList.add('inline-block');
      }
      if (submitBtnText) submitBtnText.textContent = 'Submitting Consultation...';
      if (submitArrowIcon) submitArrowIcon.classList.add('hidden');
    } else {
      submitBtn.removeAttribute('disabled');
      submitBtn.classList.remove('opacity-80', 'cursor-not-allowed');
      if (submitSpinner) {
        submitSpinner.classList.add('hidden');
        submitSpinner.classList.remove('inline-block');
      }
      if (submitBtnText) submitBtnText.textContent = 'Submit Enquiry';
      if (submitArrowIcon) submitArrowIcon.classList.remove('hidden');
    }
  }

  // Form Submit Handler
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Prevent multiple submissions if an API request is already in progress
    if (submitBtn && submitBtn.disabled) return;

    if (formStatus) formStatus.classList.add('hidden');

    const isValid = validateAllFields();
    if (!isValid) {
      showStatus(
        'error',
        'Please Complete Required Fields',
        'Some required fields are missing or entered incorrectly. Please check the highlighted inputs above.'
      );
      return;
    }

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    // Disable submit button and show #submit-spinner during API request
    setLoading(true);

    const submissionId = 'LIC-' + Date.now().toString().slice(-6);
    const now = new Date();
    const formattedTimestamp = now.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    const leadData = {
      id: submissionId,
      timestamp: formattedTimestamp,
      name: (data.name || '').trim(),
      mobile: (data.mobile || '').trim(),
      email: (data.email || '').trim(),
      requirement: data.requirement || 'General Insurance Consultation',
      message: data.message && data.message.trim() ? data.message.trim() : 'No additional message provided',
      status: 'New Enquiry'
    };

    try {
      // Send directly in background to Google Sheets (via Apps Script Web App) & local storage backup
      await sendEnquiryToBackend(leadData);

      showStatus(
        'success',
        'Consultation Request Submitted Successfully!',
        `Thank you <strong>${escapeHTML(leadData.name)}</strong>! Your consultation request has been received. Sanchita Adhikary will review your requirement for <strong>${escapeHTML(leadData.requirement)}</strong> and contact you at <strong>${escapeHTML(leadData.mobile)}</strong> shortly.`
      );

      form.reset();
      [nameInput, mobileInput, emailInput, requirementSelect].forEach(input => {
        clearFieldState(input);
      });
    } catch (err) {
      console.error('Submission request error:', err);
      showStatus(
        'error',
        'Submission Error',
        'There was an unexpected error processing your request. Please try again or contact directly via phone or WhatsApp.'
      );
    } finally {
      // Always re-enable submit button and hide #submit-spinner once request is complete
      setLoading(false);
    }
  });
}

function escapeHTML(str) {
  return String(str).replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// Render Testimonials
function renderTestimonials() {
  const container = document.getElementById('testimonials-container');
  if (!container || !TESTIMONIALS || !TESTIMONIALS.length) return;

  container.innerHTML = '';

  TESTIMONIALS.forEach((t, index) => {
    const hiddenClass = index === 2 ? 'md:hidden lg:block' : '';
    
    let starsHtml = '';
    const rating = t.rating || 5;
    for (let i = 0; i < 5; i++) {
      starsHtml += `<i data-lucide="star" class="w-4 h-4 ${i < rating ? 'fill-brand-gold text-brand-gold' : 'text-gray-300'}"></i>`;
    }

    const initial = t.name ? t.name.charAt(0).toUpperCase() : 'C';

    const card = document.createElement('div');
    card.className = `bg-brand-purewhite dark:bg-slate-900 border border-brand-border dark:border-slate-800 rounded-[20px] p-8 text-left shadow-sm ${hiddenClass}`;
    card.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <i data-lucide="quote" class="w-8 h-8 text-brand-gold opacity-70"></i>
        <div class="flex">${starsHtml}</div>
      </div>
      <p class="text-brand-text dark:text-gray-100 font-medium mb-6 leading-relaxed">"${t.text || ''}"</p>
      <div class="flex items-center">
        <div class="w-10 h-10 rounded-full bg-brand-navy text-brand-gold flex items-center justify-center font-bold mr-3 border border-brand-border dark:border-slate-800">${initial}</div>
        <div>
          <h4 class="font-bold text-brand-navy dark:text-brand-gold text-sm">${t.name || 'Valued Client'}</h4>
          <span class="text-xs text-brand-muted dark:text-gray-400">${t.details || 'Policy Holder'}</span>
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  refreshIcons();
}

function updateCurrentYear() {
  const el = document.getElementById('current-year');
  if (el) {
    el.textContent = new Date().getFullYear();
  }
}

// Theme Toggle with storage exception safety
function setupThemeToggle() {
  const themeToggleDesktop = document.getElementById('theme-toggle-desktop');
  const themeToggleMobile = document.getElementById('theme-toggle-mobile');

  function toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) {
      document.documentElement.classList.remove('dark');
      try { localStorage.setItem('theme', 'light'); } catch (e) {}
    } else {
      document.documentElement.classList.add('dark');
      try { localStorage.setItem('theme', 'dark'); } catch (e) {}
    }
  }

  if (themeToggleDesktop) {
    themeToggleDesktop.addEventListener('click', toggleTheme);
  }
  if (themeToggleMobile) {
    themeToggleMobile.addEventListener('click', toggleTheme);
  }
}

// Format Currency
function formatCurrency(num) {
  if (isNaN(num) || num === null) return '₹ 0';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Math.round(num));
}

// Calculators & Tab Switcher
function setupCalculators() {
  // Tab Switcher
  const tabButtons = document.querySelectorAll('.calc-tab-btn');
  const panels = {
    'life-cover': document.getElementById('calc-panel-life-cover'),
    'child-edu': document.getElementById('calc-panel-child-edu'),
    'retirement': document.getElementById('calc-panel-retirement'),
    'wealth-goal': document.getElementById('calc-panel-wealth-goal')
  };

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-calc-tab');
      
      tabButtons.forEach(b => {
        b.classList.remove('active', 'bg-brand-navy', 'text-brand-gold', 'border-2', 'border-brand-gold');
        b.classList.add('bg-brand-purewhite', 'dark:bg-slate-900', 'text-brand-navy', 'dark:text-gray-200', 'border', 'border-brand-border', 'dark:border-slate-800');
        const icon = b.querySelector('i');
        if (icon) icon.className = 'w-8 h-8 mb-2 text-brand-navy dark:text-brand-gold';
      });

      btn.classList.add('active', 'bg-brand-navy', 'text-brand-gold', 'border-2', 'border-brand-gold');
      btn.classList.remove('bg-brand-purewhite', 'dark:bg-slate-900', 'text-brand-navy', 'dark:text-gray-200', 'border', 'border-brand-border', 'dark:border-slate-800');
      const activeIcon = btn.querySelector('i');
      if (activeIcon) activeIcon.className = 'w-8 h-8 mb-2 text-brand-gold';

      Object.entries(panels).forEach(([key, panel]) => {
        if (panel) {
          if (key === targetTab) {
            panel.classList.remove('hidden');
          } else {
            panel.classList.add('hidden');
          }
        }
      });
      refreshIcons();
    });
  });

  setupLifeCoverCalculator();
  setupChildEducationCalculator();
  setupRetirementCalculator();
  setupSavingsGoalCalculator();
}

// 1. Life Cover Estimator
function setupLifeCoverCalculator() {
  const btn = document.getElementById('calc-life-cover-btn');
  const expenseInput = document.getElementById('monthly-expense');
  const liabilitiesInput = document.getElementById('liabilities');
  const assetsInput = document.getElementById('current-assets');
  const yearsSelect = document.getElementById('support-years');
  const amountEl = document.getElementById('life-cover-amount');

  function calculate() {
    const expense = parseFloat(expenseInput ? expenseInput.value : 50000) || 0;
    const liabilities = parseFloat(liabilitiesInput ? liabilitiesInput.value : 1500000) || 0;
    const assets = parseFloat(assetsInput ? assetsInput.value : 500000) || 0;
    const years = parseFloat(yearsSelect ? yearsSelect.value : 15) || 15;
    
    let coverNeeded = (expense * 12 * years) + liabilities - assets;
    if (coverNeeded < 500000) coverNeeded = 500000;
    
    if (amountEl) {
      amountEl.textContent = formatCurrency(coverNeeded);
    }
  }

  if (btn) btn.addEventListener('click', calculate);
  if (expenseInput) expenseInput.addEventListener('input', calculate);
  if (liabilitiesInput) liabilitiesInput.addEventListener('input', calculate);
  if (assetsInput) assetsInput.addEventListener('input', calculate);
  if (yearsSelect) yearsSelect.addEventListener('change', calculate);

  // Initial calculation
  calculate();
}

// 2. Child Education Calculator
function setupChildEducationCalculator() {
  const btn = document.getElementById('calc-child-edu-btn');
  const costInput = document.getElementById('edu-current-cost');
  const yearsInput = document.getElementById('edu-years');
  const inflationSelect = document.getElementById('edu-inflation');
  const amountEl = document.getElementById('child-edu-amount');

  function calculate() {
    const currentCost = parseFloat(costInput ? costInput.value : 1500000) || 0;
    const years = parseInt(yearsInput ? yearsInput.value : 10, 10) || 0;
    const inflation = (parseFloat(inflationSelect ? inflationSelect.value : 8) || 8) / 100;
    
    const futureCost = currentCost * Math.pow(1 + inflation, years);
    
    if (amountEl) {
      amountEl.textContent = formatCurrency(futureCost);
    }
  }

  if (btn) btn.addEventListener('click', calculate);
  if (costInput) costInput.addEventListener('input', calculate);
  if (yearsInput) yearsInput.addEventListener('input', calculate);
  if (inflationSelect) inflationSelect.addEventListener('change', calculate);

  // Initial calculation
  calculate();
}

// 3. Retirement Calculator
function setupRetirementCalculator() {
  const btn = document.getElementById('calc-retire-btn');
  const expenseInput = document.getElementById('retire-expense');
  const yearsInput = document.getElementById('retire-years');
  const inflationSelect = document.getElementById('retire-inflation');
  const amountEl = document.getElementById('retire-amount');

  function calculate() {
    const currentExpense = parseFloat(expenseInput ? expenseInput.value : 40000) || 0;
    const years = parseInt(yearsInput ? yearsInput.value : 20, 10) || 0;
    const inflation = (parseFloat(inflationSelect ? inflationSelect.value : 6) || 6) / 100;
    
    const futureMonthlyExpense = currentExpense * Math.pow(1 + inflation, years);
    const futureAnnualExpense = futureMonthlyExpense * 12;
    // 25x annual expense for a comfortable lifelong corpus
    const corpusNeeded = futureAnnualExpense * 25;
    
    if (amountEl) {
      amountEl.textContent = formatCurrency(corpusNeeded);
    }
  }

  if (btn) btn.addEventListener('click', calculate);
  if (expenseInput) expenseInput.addEventListener('input', calculate);
  if (yearsInput) yearsInput.addEventListener('input', calculate);
  if (inflationSelect) inflationSelect.addEventListener('change', calculate);

  // Initial calculation
  calculate();
}

// 4. Savings Goal Calculator
function setupSavingsGoalCalculator() {
  const btn = document.getElementById('calc-goal-btn');
  const targetInput = document.getElementById('goal-target');
  const yearsInput = document.getElementById('goal-years');
  const amountEl = document.getElementById('goal-amount');

  function calculate() {
    const target = parseFloat(targetInput ? targetInput.value : 2500000) || 0;
    const years = parseInt(yearsInput ? yearsInput.value : 10, 10) || 1;
    const months = years * 12;
    const annualRate = 0.08; // 8% expected rate
    const monthlyRate = annualRate / 12;
    
    // Monthly SIP/Recurring investment formula: Target * r / ((1+r)^n - 1)
    let monthlySavings = (target * monthlyRate) / (Math.pow(1 + monthlyRate, months) - 1);
    if (isNaN(monthlySavings) || monthlySavings <= 0) {
      monthlySavings = target / months;
    }
    
    if (amountEl) {
      amountEl.textContent = formatCurrency(monthlySavings);
    }
  }

  if (btn) btn.addEventListener('click', calculate);
  if (targetInput) targetInput.addEventListener('input', calculate);
  if (yearsInput) yearsInput.addEventListener('input', calculate);

  // Initial calculation
  calculate();
}

function renderAchievements() {
  const container = document.getElementById('achievements-slider');
  const section = document.getElementById('achievements') || document.getElementById('achievements-section');
  const indicatorsContainer = document.getElementById('slider-indicators');
  const navLinks = document.querySelectorAll('a[href="#achievements"]');
  if (!container || !section) return;

  if (!ACHIEVEMENTS || ACHIEVEMENTS.length === 0) {
    section.classList.add('hidden');
    navLinks.forEach(link => link.classList.add('hidden'));
    return;
  }
  
  section.classList.remove('hidden');
  navLinks.forEach(link => link.classList.remove('hidden'));
  container.innerHTML = '';
  if (indicatorsContainer) indicatorsContainer.innerHTML = '';

  ACHIEVEMENTS.forEach((ach, index) => {
    const slide = document.createElement('div');
    slide.className = 'slide flex-shrink-0 relative w-full h-full';
    slide.innerHTML = `
      <img src="${ach.imagePath || ''}" alt="${ach.title || 'Achievement'}" class="absolute inset-0 w-full h-full object-cover">
      <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent"></div>
      <div class="absolute bottom-0 left-0 right-0 p-6 sm:p-10 text-center">
        <h4 class="text-xl sm:text-2xl font-bold text-white mb-2">${ach.title || ''}</h4>
        <p class="text-sm sm:text-base text-gray-300 max-w-2xl mx-auto">${ach.description || ''}</p>
      </div>
    `;
    container.appendChild(slide);

    if (indicatorsContainer) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = `slider-dot ${index === 0 ? 'active' : ''}`;
      dot.setAttribute('aria-label', `Slide ${index + 1}`);
      dot.addEventListener('click', () => goToSlide(index));
      indicatorsContainer.appendChild(dot);
    }
  });

  let currentSlide = 0;
  let slideInterval;

  function updateSlider() {
    container.style.transform = `translateX(-${currentSlide * 100}%)`;
    if (indicatorsContainer) {
      Array.from(indicatorsContainer.children).forEach((dot, i) => {
        if (i === currentSlide) {
          dot.classList.add('active');
        } else {
          dot.classList.remove('active');
        }
      });
    }
  }

  function goToSlide(index) {
    currentSlide = index;
    updateSlider();
    resetInterval();
  }

  function nextSlide() {
    currentSlide = (currentSlide + 1) % ACHIEVEMENTS.length;
    updateSlider();
  }

  function prevSlide() {
    currentSlide = (currentSlide - 1 + ACHIEVEMENTS.length) % ACHIEVEMENTS.length;
    updateSlider();
  }

  function resetInterval() {
    clearInterval(slideInterval);
    if (ACHIEVEMENTS.length > 1) {
      slideInterval = setInterval(nextSlide, 5000);
    }
  }

  const prevBtn = document.getElementById('prev-slide');
  const nextBtn = document.getElementById('next-slide');
  if (prevBtn) prevBtn.addEventListener('click', () => { prevSlide(); resetInterval(); });
  if (nextBtn) nextBtn.addEventListener('click', () => { nextSlide(); resetInterval(); });

  resetInterval();
}

function initScrollAnimations() {
  if (typeof IntersectionObserver !== 'undefined') {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
        }
      });
    }, { threshold: 0.05, rootMargin: '0px 0px -50px 0px' });
    
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  } else {
    // Fallback if IntersectionObserver is unsupported
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('active'));
  }
}

// LIC Important Links Category Filter
function setupLicLinksFilter() {
  const filterBtns = document.querySelectorAll('.lic-filter-btn');
  const cards = document.querySelectorAll('.lic-link-card');

  if (!filterBtns.length || !cards.length) return;

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.getAttribute('data-link-filter');

      filterBtns.forEach(b => {
        b.classList.remove('active', 'bg-brand-navy', 'text-brand-gold', 'border-brand-gold', 'shadow-sm');
        b.classList.add('bg-brand-purewhite', 'dark:bg-slate-900', 'text-brand-text', 'dark:text-gray-200', 'border-brand-border', 'dark:border-slate-800');
      });

      btn.classList.add('active', 'bg-brand-navy', 'text-brand-gold', 'border-brand-gold', 'shadow-sm');
      btn.classList.remove('bg-brand-purewhite', 'dark:bg-slate-900', 'text-brand-text', 'dark:text-gray-200', 'border-brand-border', 'dark:border-slate-800');

      cards.forEach(card => {
        const cat = card.getAttribute('data-category');
        if (filter === 'all' || cat === filter) {
          card.classList.remove('hidden');
        } else {
          card.classList.add('hidden');
        }
      });
      refreshIcons();
    });
  });
}

