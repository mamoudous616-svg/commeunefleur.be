// Envoi des messages du formulaire par e-mail (SMTP, par ex. Gmail avec un « mot de passe d'application »).
// Sans configuration SMTP, les messages restent consultables dans le tableau de bord /admin.
import nodemailer from 'nodemailer';
import { SUBJECTS } from '@cuf/shared/validation';
import { escapeHtml } from './http.js';

export function createMailer(mail) {
  if (!mail.host) {
    return { enabled: false, async send() { return false; } };
  }
  const transport = nodemailer.createTransport({
    host: mail.host,
    port: mail.port,
    secure: mail.secure,
    auth: mail.user ? { user: mail.user, pass: mail.pass } : undefined,
  });
  return {
    enabled: true,
    async send(message) {
      await transport.sendMail({ from: mail.from, to: mail.to, ...message });
      return true;
    },
    verify: () => transport.verify(),
  };
}

const subjectLabel = (value) => SUBJECTS.find((s) => s.value === value)?.label ?? value;

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** E-mail reçu par la boutique pour chaque message du formulaire. */
export function contactEmail(record, { siteUrl, review = false }) {
  const label = subjectLabel(record.sujet);
  const lines = [
    ['Nom', record.nom],
    ['E-mail', record.email],
    ['Téléphone', record.telephone || '—'],
    ['Demande', label],
    ['Date souhaitée', record.date ? formatDate(record.date) : '—'],
  ];
  const subject = `${review ? '[À vérifier] ' : ''}Nouveau message — ${label} — ${record.nom}`;
  const text = [
    `Nouveau message reçu via ${siteUrl}/contact/`,
    '',
    ...lines.map(([k, v]) => `${k} : ${v}`),
    '',
    record.message,
    '',
    review ? `Filtre anti-spam : message à vérifier (${record.spamReasons.join(', ')}).` : '',
    'Répondez directement à cet e-mail pour écrire à la personne.',
  ]
    .filter((line, i, arr) => line !== '' || arr[i - 1] !== '')
    .join('\n');
  const html = `<!doctype html><html lang="fr"><body style="margin:0;padding:24px;background:#faf8f5;font-family:Arial,sans-serif;color:#271a00">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
    <p style="margin:0 0 4px;font-size:12px;color:#6b6457">Nouveau message · commeunefleur.be</p>
    <h1 style="margin:0 0 24px;font-family:Georgia,serif;font-weight:400;font-size:24px">${escapeHtml(label)}</h1>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${lines.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#6b6457;white-space:nowrap">${escapeHtml(k)}</td><td style="padding:6px 0">${escapeHtml(v)}</td></tr>`).join('')}
    </table>
    <div style="margin-top:24px;padding:16px;border-radius:8px;background:#faf8f5;font-size:15px;line-height:1.6;white-space:pre-wrap">${escapeHtml(record.message)}</div>
    ${review ? `<p style="margin-top:16px;font-size:13px;color:#9b2c1f">Filtre anti-spam : à vérifier (${escapeHtml(record.spamReasons.join(', '))}).</p>` : ''}
    <p style="margin-top:24px;font-size:13px;color:#6b6457">Répondez directement à cet e-mail pour écrire à ${escapeHtml(record.nom)}.</p>
  </div></body></html>`;
  return { subject, text, html, replyTo: { name: record.nom, address: record.email } };
}
