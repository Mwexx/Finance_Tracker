const feedbackForm = document.getElementById('feedback-form');
if (feedbackForm) {
    feedbackForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const status = document.getElementById('feedback-status');
        const button = feedbackForm.querySelector('button[type="submit"]');
        setButtonState(button, true, 'Send feedback', 'Sending...');
        try {
            const result = await apiRequest('/feedback', 'POST', {
                subject: document.getElementById('feedback-subject').value,
                message: document.getElementById('feedback-message').value
            });
            status.textContent = result.msg || 'Feedback sent successfully.';
            status.className = 'info-text success';
            feedbackForm.reset();
        } catch (error) {
            status.textContent = error.message || 'Unable to send feedback.';
            status.className = 'info-text error';
        } finally {
            setButtonState(button, false, 'Send feedback', 'Sending...');
        }
    });
}
