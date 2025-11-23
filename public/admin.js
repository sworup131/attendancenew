document.addEventListener('DOMContentLoaded', () => {
  const gen = document.getElementById('generateQr')
  if (gen) {
    gen.addEventListener('click', () => {
      // Navigate the browser to the generate-qr route so the server
      // renders and returns the QR page (shows the QR for today's date).
      gen.disabled = true
      gen.textContent = 'Generating...'
      window.location.href = '/generate-qr'
    })
  }
  const sendBtn = document.getElementById('sendNotifications')
  if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
      if (!confirm('Send absence notification emails to students absent 3+ days?')) return
      sendBtn.disabled = true
      sendBtn.textContent = 'Sending...'
      try {
        const res = await fetch('/admin/send-absence-notifications', { method: 'POST' })
        const data = await res.json()
        alert(`Notified: ${data.notified} students. Check server logs for details.`)
      } catch (err) {
        console.error(err)
        alert('Failed to send notifications.')
      } finally {
        sendBtn.disabled = false
        sendBtn.textContent = 'Send Absence Emails'
      }
    })
  }
})
