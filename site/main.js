// Mobile menu toggle
const toggle = document.querySelector('.nav__toggle');
const menu = document.getElementById('mobile-menu');
if (toggle && menu) {
  const svg = toggle.querySelector('svg');
  const iconMenu = svg.innerHTML;
  const iconClose = '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>';

  toggle.addEventListener('click', () => {
    const open = menu.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', open);
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    svg.innerHTML = open ? iconClose : iconMenu;
  });
}

// Contact form: submit via API with inline confirmation
const contactForm = document.getElementById('contact-form');
if (contactForm) {
  const isEs = document.documentElement.lang === 'es';
  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = contactForm.querySelector('.contact-form__submit');
    let errorEl = contactForm.querySelector('.contact-form__error');
    if (errorEl) errorEl.remove();
    btn.disabled = true;
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(contactForm)))
      });
      if (!res.ok) throw new Error();
      contactForm.outerHTML = '<p class="contact-form__done">' +
        (isEs ? 'Mensaje enviado. Gracias por escribirnos.' : 'Message sent. Thank you for reaching out.') +
        '</p>';
    } catch {
      btn.disabled = false;
      errorEl = document.createElement('p');
      errorEl.className = 'contact-form__error';
      errorEl.textContent = isEs
        ? 'Algo salió mal. Intenta de nuevo.'
        : 'Something went wrong. Please try again.';
      contactForm.appendChild(errorEl);
    }
  });
}

// Portfolio sub-nav: highlight the section currently in view
const subnavItems = document.querySelectorAll('.subnav__item');
if (subnavItems.length) {
  const sections = [...subnavItems].map(item =>
    document.getElementById(item.getAttribute('href').slice(1))
  );

  const setActive = () => {
    const probe = window.scrollY + window.innerHeight * 0.35;
    let current = 0;
    sections.forEach((section, i) => {
      if (section && section.offsetTop <= probe) current = i;
    });
    subnavItems.forEach((item, i) =>
      item.classList.toggle('is-active', i === current)
    );
  };

  setActive();
  window.addEventListener('scroll', setActive, { passive: true });
}
