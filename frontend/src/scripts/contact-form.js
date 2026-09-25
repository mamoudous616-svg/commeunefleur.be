// Formulaire de contact : validation au fil de la saisie, suggestion d'e-mail, envoi à l'API.
import { validateField, validateContact, suggestEmail, SUBJECTS, LIMITS } from '@cuf/shared/validation';
import { zonedDateString } from '@cuf/shared/hours';
import { business } from '@cuf/shared/business';
import { apiUrl } from './config.js';
import { track } from './analytics.js';

const FIELDS = ['nom', 'email', 'telephone', 'sujet', 'date', 'message'];
const LABELS = { nom: 'Nom et prénom', email: 'E-mail', telephone: 'Téléphone', sujet: 'Votre demande', date: 'Date souhaitée', message: 'Message' };

export function initContactForm() {
  const form = document.querySelector('[data-contact-form]');
  if (!form) return;

  const els = Object.fromEntries(FIELDS.map((name) => [name, form.elements.namedItem(name)]));
  const summary = form.querySelector('[data-form-summary]');
  const summaryList = form.querySelector('[data-form-summary-list]');
  const status = form.querySelector('[data-form-status]');
  const submit = form.querySelector('[data-submit]');
  const submitLabel = form.querySelector('[data-submit-label]');
  const fields = form.querySelector('[data-form-fields]');
  const success = form.querySelector('[data-form-success]');
  const tokenInput = form.querySelector('[data-form-token]');
  const counter = form.querySelector('[data-counter]');
  const suggestion = form.querySelector('[data-email-suggestion]');
  const suggestionFix = form.querySelector('[data-email-fix]');
  const touched = new Set();
  let sending = false;

  // Date : pas de date passée dans le calendrier.
  if (els.date) els.date.min = zonedDateString(new Date());

  // Sujet pré-rempli depuis un lien : /contact/?sujet=evenement
  const requested = new URLSearchParams(location.search).get('sujet');
  if (requested && SUBJECTS.some((s) => s.value === requested)) els.sujet.value = requested;

  // Jeton anti-spam horodaté, signé par l'API.
  async function refreshToken() {
    try {
      const res = await fetch(apiUrl('/api/token'), { headers: { accept: 'application/json' } });
      if (res.ok) tokenInput.value = (await res.json()).token || '';
    } catch {
      // API injoignable : l'envoi sera tenté quand même, l'API tranchera.
    }
  }
  refreshToken();

  function showError(name, message) {
    const input = els[name];
    const holder = form.querySelector(`[data-error-for="${name}"]`);
    const field = input.closest('.field');
    if (message) {
      input.setAttribute('aria-invalid', 'true');
      field.classList.remove('is-valid');
    } else {
      input.removeAttribute('aria-invalid');
      field.classList.toggle('is-valid', Boolean(input.value.trim()));
    }
    if (holder.textContent !== message) holder.textContent = message;
  }

  function check(name) {
    const message = validateField(name, els[name].value.trim());
    showError(name, message);
    return message;
  }

  function updateCounter() {
    const length = els.message.value.length;
    counter.textContent = `${length} / ${LIMITS.message.max}`;
    counter.classList.toggle('is-near', length > LIMITS.message.max * 0.9);
  }

  function updateSuggestion() {
    const proposal = suggestEmail(els.email.value.trim());
    suggestion.hidden = !proposal;
    if (proposal) suggestionFix.textContent = proposal;
  }

  for (const name of FIELDS) {
    const input = els[name];
    // On ne signale une erreur qu'après la sortie du champ (pas pendant la première saisie)…
    input.addEventListener('blur', () => {
      if (input.value.trim() || touched.has(name)) {
        touched.add(name);
        check(name);
      }
      if (name === 'email') updateSuggestion();
    });
    // …puis on la retire dès que la saisie devient correcte.
    input.addEventListener('input', () => {
      if (touched.has(name)) check(name);
      if (name === 'message') updateCounter();
    });
    if (input.tagName === 'SELECT') input.addEventListener('change', () => { touched.add(name); check(name); });
  }

  suggestionFix.addEventListener('click', () => {
    els.email.value = suggestionFix.textContent;
    suggestion.hidden = true;
    check('email');
    els.email.focus();
  });

  function showSummary(errors) {
    summaryList.replaceChildren(
      ...Object.entries(errors).map(([name, message]) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = `#${els[name].id}`;
        a.textContent = `${LABELS[name]} : ${message}`;
        a.addEventListener('click', (event) => {
          event.preventDefault();
          els[name].focus();
        });
        li.append(a);
        return li;
      }),
    );
    summary.hidden = false;
    summary.focus();
  }

  function setSending(value) {
    sending = value;
    form.classList.toggle('is-sending', value);
    submit.disabled = value;
    submitLabel.textContent = value ? 'Envoi en cours…' : 'Envoyer le message';
  }

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending) return;
    setStatus('');

    const raw = Object.fromEntries(FIELDS.map((name) => [name, els[name].value]));
    const { valid, errors } = validateContact(raw);
    FIELDS.forEach((name) => {
      touched.add(name);
      showError(name, errors[name] || '');
    });
    if (!valid) {
      showSummary(errors);
      return;
    }
    summary.hidden = true;

    setSending(true);
    try {
      const res = await fetch(apiUrl('/api/contact'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ ...raw, website: form.elements.namedItem('website').value, token: tokenInput.value }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok) {
        fields.hidden = true;
        success.hidden = false;
        success.focus();
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        track('contact_sent', raw.sujet);
        return;
      }
      if (res.status === 422 && data.errors) {
        Object.entries(data.errors).forEach(([name, message]) => els[name] && showError(name, message));
        showSummary(data.errors);
      } else if (res.status === 429) {
        setStatus('Trop d’envois en peu de temps. Réessayez dans quelques minutes, ou appelez-nous.', true);
      } else {
        setStatus(data.message || `L’envoi n’a pas abouti. Réessayez dans un instant, ou écrivez-nous à ${business.email}.`, true);
        refreshToken();
      }
    } catch {
      setStatus(`Connexion impossible. Vérifiez votre connexion internet, ou appelez-nous au ${business.locations[0].phoneDisplay}.`, true);
    } finally {
      setSending(false);
    }
  });

  form.querySelector('[data-form-again]').addEventListener('click', () => {
    form.reset();
    touched.clear();
    FIELDS.forEach((name) => {
      showError(name, '');
      els[name].closest('.field').classList.remove('is-valid');
    });
    updateCounter();
    success.hidden = true;
    fields.hidden = false;
    refreshToken();
    els.nom.focus();
  });

  updateCounter();
}
