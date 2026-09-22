for (const button of document.querySelectorAll('[data-copy]')) {
  button.addEventListener('click', async () => {
    const value = button.getAttribute('data-copy');
    try {
      await navigator.clipboard.writeText(value);
      const original = button.textContent;
      button.textContent = 'copied';
      window.setTimeout(() => { button.textContent = original; }, 1300);
    } catch {
      button.textContent = 'select';
    }
  });
}
