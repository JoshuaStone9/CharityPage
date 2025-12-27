document.addEventListener('DOMContentLoaded', () => {
  const donateBtn = document.querySelector('.donateBtn');
  if (!donateBtn) {
    return;
  }

  donateBtn.addEventListener('click', async (event) => {
    event.preventDefault();
    donateBtn.setAttribute('aria-busy', 'true');
    const originalText = donateBtn.textContent;
    donateBtn.textContent = 'Redirecting...';

    try {
      const response = await fetch('/api/create-payment', { method: 'POST' });
      if (!response.ok) {
        throw new Error('Failed to create payment');
      }
      const data = await response.json();
      if (!data.payment_url) {
        throw new Error('Missing payment URL');
      }
      window.location.href = data.payment_url;
    } catch (error) {
      donateBtn.textContent = originalText;
      donateBtn.removeAttribute('aria-busy');
      alert('Sorry, something went wrong starting your donation. Please try again.');
    }
  });
});
