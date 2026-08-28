(function () {
  'use strict';
  var root = document.documentElement;
  var form = document.getElementById('contactForm');
  var status = document.getElementById('formStatus');
  var button = form.querySelector('.submit-button');

  requestAnimationFrame(function () {
    requestAnimationFrame(function () { root.classList.add('is-ready'); });
  });

  function isArabic() { return root.getAttribute('lang') === 'ar'; }
  function setStatus(message, error) {
    status.textContent = message;
    status.classList.toggle('is-error', !!error);
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    setStatus('', false);
    if (!form.checkValidity()) {
      form.reportValidity();
      setStatus(isArabic() ? 'يرجى تعبئة جميع الحقول المطلوبة.' : 'Please complete all required fields.', true);
      return;
    }

    var data = new FormData(form);
    var payload = {
      fullName: data.get('fullName'), email: data.get('email'),
      phone: data.get('phone'), projectType: data.get('projectType'),
      location: data.get('location'), budget: data.get('budget'),
      preferredContact: data.get('preferredContact'), message: data.get('message'),
      companyWebsite: data.get('companyWebsite'), consent: data.get('consent') === 'on'
    };

    button.disabled = true;
    setStatus(isArabic() ? 'جارٍ إرسال طلبك…' : 'Sending your inquiry…', false);
    fetch('/api/contact', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        if (!response.ok || !body.ok) throw new Error(body.error || 'Submission failed');
        return body;
      });
    }).then(function () {
      form.reset();
      setStatus(isArabic() ? 'شكرًا لك. استلمنا طلبك وسنتواصل معك قريبًا.' : 'Thank you. We received your inquiry and will be in touch.', false);
    }).catch(function () {
      setStatus(isArabic() ? 'تعذر إرسال الطلب. يرجى المحاولة مرة أخرى.' : 'We could not send your inquiry. Please try again.', true);
    }).finally(function () { button.disabled = false; });
  });
})();
