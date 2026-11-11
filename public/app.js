const messagesEl = document.getElementById('messages');
const form = document.getElementById('form');
const input = document.getElementById('input');
const send = document.getElementById('send');

const history = [];

function addMessage(role, text) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  const label = document.createElement('strong');
  label.textContent = role === 'user' ? 'Vous' : 'Mistral';
  const body = document.createElement('p');
  body.textContent = text;
  div.append(label, body);
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  send.disabled = true;
  addMessage('user', text);
  history.push({ role: 'user', content: text });

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur inconnue');
    addMessage('assistant', data.reply);
    history.push({ role: 'assistant', content: data.reply });
  } catch (err) {
    addMessage('assistant', `Erreur : ${err.message}`);
  } finally {
    send.disabled = false;
    input.focus();
  }
});
